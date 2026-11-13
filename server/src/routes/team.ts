import { Router } from 'express';
import { z } from 'zod';
import { demoMode, hashPassword, requireAdmin, temporaryPassword } from '../auth.js';
import { all, get, nowIso, run, tx } from '../db/database.js';
import { addEvent } from '../services/tickets.js';
import { rateLimit } from '../utils/security.js';

/**
 * Gestão da equipe de atendimento. Atendentes não se cadastram sozinhos:
 * o administrador convida e recebe uma senha temporária, que deve ser trocada no primeiro acesso.
 */
export const teamRouter = Router();

interface Member {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  title: string | null;
  active: number;
  protected: number;
  must_change_password: number;
  last_login_at: string | null;
  created_at: string;
}

const activeAdmins = () => get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1`)!.n;

teamRouter.get('/', (_req, res) => {
  const rows = all<Member & { open_tickets: number; resolved_30d: number }>(
    `SELECT u.id, u.name, u.email, u.role, u.title, u.active, u.protected, u.must_change_password, u.last_login_at, u.created_at,
       (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = u.id AND t.status IN ('new','in_progress','waiting')) AS open_tickets,
       (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = u.id AND t.resolved_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) AS resolved_30d
     FROM users u ORDER BY u.active DESC, u.role, u.name`,
  );
  res.json({
    demoMode: demoMode(),
    members: rows.map((r) => ({
      ...r,
      active: Boolean(r.active),
      protected: Boolean(r.protected),
      must_change_password: Boolean(r.must_change_password),
    })),
  });
});

const Invite = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(160),
  role: z.enum(['admin', 'agent']).default('agent'),
  title: z.string().trim().max(80).optional(),
});

// Limita convites (evita criação de contas em massa, principalmente na demo pública).
const inviteLimiter = rateLimit({ max: 20, windowMs: 60 * 60_000, key: (req) => `invite:${req.user?.id}`, message: 'Muitos convites em pouco tempo. Tente novamente mais tarde.' });

teamRouter.post('/', requireAdmin, inviteLimiter, (req, res) => {
  const body = Invite.parse(req.body);
  if (get('SELECT id FROM users WHERE email = ?', body.email)) {
    return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' });
  }
  const password = temporaryPassword();
  const r = run(
    `INSERT INTO users(name, email, password_hash, role, title, created_at, must_change_password) VALUES(?, ?, ?, ?, ?, ?, 1)`,
    body.name,
    body.email,
    hashPassword(password),
    body.role,
    body.title || null,
    nowIso(),
  );
  // A senha temporária é devolvida uma única vez e nunca fica salva em texto puro.
  res.status(201).json({ id: Number(r.lastInsertRowid), temporaryPassword: password });
});

const Update = z.object({
  role: z.enum(['admin', 'agent']).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  active: z.boolean().optional(),
});

teamRouter.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const patch = Update.parse(req.body);
  const member = get<Member>('SELECT * FROM users WHERE id = ?', id);
  if (!member) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const isSelf = id === req.user!.id;
  const losesAdmin = member.role === 'admin' && member.active && (patch.role === 'agent' || patch.active === false);
  if (isSelf && (patch.active === false || patch.role === 'agent')) {
    return res.status(400).json({ error: 'Você não pode desativar nem rebaixar a sua própria conta.' });
  }
  if (losesAdmin && activeAdmins() <= 1) {
    return res.status(400).json({ error: 'A equipe precisa de pelo menos um administrador ativo.' });
  }
  if (demoMode() && member.protected && (patch.active === false || patch.role !== undefined)) {
    return res.status(403).json({ error: 'Na demonstração pública, as contas de exemplo não podem ser desativadas nem ter o papel alterado.' });
  }

  let unassigned = 0;
  tx(() => {
    if (patch.role !== undefined || patch.title !== undefined) {
      run('UPDATE users SET role = ?, title = ? WHERE id = ?', patch.role ?? member.role, patch.title === undefined ? member.title : patch.title, id);
    }
    if (patch.active === false && member.active) {
      // Desativar encerra as sessões e devolve os tickets abertos para a fila.
      run('UPDATE users SET active = 0, token_version = token_version + 1 WHERE id = ?', id);
      const open = all<{ id: number }>(`SELECT id FROM tickets WHERE assignee_id = ? AND status IN ('new','in_progress','waiting')`, id);
      for (const t of open) {
        run('UPDATE tickets SET assignee_id = NULL, updated_at = ? WHERE id = ?', nowIso(), t.id);
        addEvent(t.id, 'assigned', req.user!.name, { assignee: null, reason: `${member.name} foi desativado(a)` });
      }
      unassigned = open.length;
    } else if (patch.active === true && !member.active) {
      run('UPDATE users SET active = 1 WHERE id = ?', id);
    }
    if (patch.role !== undefined && patch.role !== member.role) {
      // Mudança de papel vale na hora: as sessões antigas são encerradas.
      run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', id);
    }
  });
  res.json({ ok: true, unassigned });
});

teamRouter.post('/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const member = get<Member>('SELECT * FROM users WHERE id = ?', id);
  if (!member) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (demoMode() && member.protected) {
    return res.status(403).json({ error: 'Na demonstração pública, a senha das contas de exemplo não pode ser alterada.' });
  }
  if (id === req.user!.id) return res.status(400).json({ error: 'Para trocar a sua própria senha, use "Minha conta".' });
  const password = temporaryPassword();
  run('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', hashPassword(password), id);
  res.json({ temporaryPassword: password });
});
