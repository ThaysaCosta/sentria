import { Router, type Request } from 'express';
import { z } from 'zod';
import { ai } from '../ai/index.js';
import { all, get, nowIso, run, tx } from '../db/database.js';
import { CATEGORIES, CHANNELS, PRIORITIES, STATUSES, isCategory, type CategoryKey } from '../domain.js';
import {
  addEvent,
  addMessage,
  applyAnalysis,
  buildAnalysisInput,
  createTicket,
  findTicket,
  serializeTicket,
  slaDue,
  TICKET_SELECT,
  type TicketRow,
} from '../services/tickets.js';
import { toCsv } from '../utils/csv.js';
import { HttpError } from '../utils/http.js';

export const ticketsRouter = Router();

const PRIORITY_ORDER = `CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;
const SORTS: Record<string, string> = {
  created_at: 't.created_at',
  updated_at: 't.updated_at',
  priority: PRIORITY_ORDER,
  churn_risk: 't.churn_risk',
  sla_due_at: 't.sla_due_at',
  id: 't.id',
};

/** Monta o WHERE a partir dos filtros da query string (reutilizado pela exportação). */
export function buildTicketFilter(q: Request['query'], userId?: number) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const list = (v: unknown) =>
    String(v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const search = String(q.search ?? '').trim();
  if (search) {
    const idMatch = search.replace(/^#/, '');
    where.push(`(t.subject LIKE ? OR t.description LIKE ? OR t.requester_name LIKE ? OR t.requester_email LIKE ? OR c.name LIKE ? OR t.protocol LIKE ? OR CAST(t.id AS TEXT) = ?)`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, idMatch);
  }
  const filters: [string, string, readonly string[] | null][] = [
    ['status', 't.status', STATUSES],
    ['priority', 't.priority', PRIORITIES],
    ['category', 't.category', Object.keys(CATEGORIES)],
    ['channel', 't.channel', CHANNELS],
    ['sentiment', 't.sentiment', ['negative', 'neutral', 'positive']],
  ];
  for (const [key, column, allowed] of filters) {
    const values = list(q[key]).filter((v) => !allowed || allowed.includes(v));
    if (values.length) {
      where.push(`${column} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    }
  }
  if (q.open === 'true') where.push(`t.status IN ('new','in_progress','waiting')`);
  if (q.assignee === 'me' && userId) {
    where.push('t.assignee_id = ?');
    params.push(userId);
  } else if (q.assignee === 'none') where.push('t.assignee_id IS NULL');
  else if (q.assignee && /^\d+$/.test(String(q.assignee))) {
    where.push('t.assignee_id = ?');
    params.push(Number(q.assignee));
  }
  if (q.customer && /^\d+$/.test(String(q.customer))) {
    where.push('t.customer_id = ?');
    params.push(Number(q.customer));
  }
  const ids = list(q.ids).filter((v) => /^\d+$/.test(v)).slice(0, 500);
  if (ids.length) {
    where.push(`t.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids.map(Number));
  }
  if (q.slaBreached === 'true') {
    where.push(`t.sla_due_at IS NOT NULL AND COALESCE(t.resolved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) > t.sla_due_at`);
  }
  if (q.lowConfidence === 'true') where.push(`t.ai_confidence < 0.6 AND t.category_source = 'ai'`);
  if (q.days && /^\d+$/.test(String(q.days))) {
    where.push(`t.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`);
    params.push(`-${Number(q.days)} days`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

ticketsRouter.get('/', (req, res) => {
  const { sql, params } = buildTicketFilter(req.query, req.user!.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
  const sortKey = SORTS[String(req.query.sort)] ? String(req.query.sort) : 'created_at';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id ${sql}`, ...params)!.n;
  const rows = all<TicketRow>(
    `${TICKET_SELECT} ${sql} ORDER BY ${SORTS[sortKey]} ${order}, t.id DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  res.json({
    items: rows.map((r) => {
      const { description, ai_reply, ...rest } = serializeTicket(r);
      return { ...rest, excerpt: description.slice(0, 140) };
    }),
    total,
    page,
    pageSize,
  });
});

ticketsRouter.get('/export', (req, res) => {
  const { sql, params } = buildTicketFilter(req.query, req.user!.id);
  const rows = all<TicketRow>(`${TICKET_SELECT} ${sql} ORDER BY t.created_at DESC LIMIT 20000`, ...params).map(serializeTicket);
  const format = req.query.format === 'json' ? 'json' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="sentria-chamados-${stamp}.json"`);
    return res.json(rows);
  }
  const csv = toCsv(
    rows.map((r) => ({ ...r, category_label: r.category ? CATEGORIES[r.category].label : '' })),
    [
      { key: 'id', label: 'ID' },
      { key: 'protocol', label: 'Protocolo' },
      { key: 'created_at', label: 'Criado em' },
      { key: 'subject', label: 'Assunto' },
      { key: 'description', label: 'Descrição' },
      { key: 'customer_name', label: 'Cliente' },
      { key: 'customer_plan', label: 'Plano' },
      { key: 'requester_name', label: 'Solicitante' },
      { key: 'requester_email', label: 'E-mail' },
      { key: 'channel', label: 'Canal' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Prioridade' },
      { key: 'category_label', label: 'Categoria' },
      { key: 'category_source', label: 'Origem da categoria' },
      { key: 'ai_confidence', label: 'Confiança IA' },
      { key: 'sentiment', label: 'Sentimento' },
      { key: 'churn_risk', label: 'Risco de churn' },
      { key: 'ai_tags', label: 'Tags' },
      { key: 'ai_summary', label: 'Resumo IA' },
      { key: 'assignee_name', label: 'Responsável' },
      { key: 'resolved_at', label: 'Resolvido em' },
      { key: 'csat', label: 'CSAT' },
      { key: 'sla_breached', label: 'SLA estourado' },
    ],
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sentria-chamados-${stamp}.csv"`);
  res.send(csv);
});

ticketsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const t = findTicket(id);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });

  const messages = all('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at, id', id).map((m) => ({
    ...m,
    internal: Boolean(m.internal),
  }));
  const events = all<{ data: string | null }>('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at, id', id).map((e) => ({
    ...e,
    data: e.data ? JSON.parse(e.data) : null,
  }));
  const customer = t.customer_id
    ? get(
        `SELECT c.*,
           (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id) AS total_tickets,
           (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id AND status IN ('new','in_progress','waiting')) AS open_tickets,
           (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) AS tickets_30d,
           (SELECT ROUND(AVG(csat), 2) FROM tickets WHERE customer_id = c.id AND csat IS NOT NULL) AS avg_csat
         FROM customers c WHERE c.id = ?`,
        t.customer_id,
      )
    : null;
  const similar = ai.similarTickets(`${t.subject} ${t.subject} ${t.description}`, 5, id);
  const kbArticles = ai.suggestArticles(`${t.subject} ${t.description}`, 3);

  res.json({ ticket: serializeTicket(t), messages, events, customer, similar, kbArticles });
});

const CreateTicket = z.object({
  subject: z.string().trim().min(3, 'Informe um assunto.').max(200),
  description: z.string().trim().min(10, 'Descreva o problema com um pouco mais de detalhe.').max(10000),
  requesterName: z.string().trim().min(2).max(120),
  requesterEmail: z.string().trim().email('E-mail inválido.'),
  customerId: z.number().int().positive().nullable().optional(),
  companyName: z.string().trim().max(120).optional(),
  channel: z.enum(CHANNELS).default('email'),
  productVersion: z.string().trim().max(20).optional(),
});

ticketsRouter.post('/', async (req, res) => {
  const body = CreateTicket.parse(req.body);
  if (body.customerId && !get('SELECT id FROM customers WHERE id = ?', body.customerId)) {
    throw new HttpError(400, 'Cliente não encontrado.');
  }
  const { id, analysis } = await createTicket({ ...body, origin: 'agent', actor: req.user!.name });
  res.status(201).json({ ticket: serializeTicket(findTicket(id)!), analysis });
});

const PatchTicket = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.string().refine(isCategory, 'Categoria inválida.').optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
});

function patchTicket(id: number, patch: z.infer<typeof PatchTicket>, actor: string) {
  const t = findTicket(id);
  if (!t) return null;
  const now = nowIso();
  tx(() => {
    if (patch.status && patch.status !== t.status) {
      const resolving = patch.status === 'resolved' || patch.status === 'closed';
      run(
        `UPDATE tickets SET status = ?, resolved_at = ?, first_response_at = COALESCE(first_response_at, ?), updated_at = ? WHERE id = ?`,
        patch.status,
        resolving ? (t.resolved_at ?? now) : null,
        patch.status === 'new' ? null : now,
        now,
        id,
      );
      addEvent(id, 'status_changed', actor, { from: t.status, to: patch.status });
    }
    if (patch.priority && patch.priority !== t.priority) {
      run('UPDATE tickets SET priority = ?, sla_due_at = ?, updated_at = ? WHERE id = ?', patch.priority, slaDue(t.created_at, patch.priority), now, id);
      addEvent(id, 'priority_changed', actor, { from: t.priority, to: patch.priority, ai: t.ai_priority });
    }
    if (patch.category && (patch.category !== t.category || t.category_source !== 'human')) {
      run(`UPDATE tickets SET category = ?, category_source = 'human', updated_at = ? WHERE id = ?`, patch.category, now, id);
      addEvent(id, patch.category === t.ai_category ? 'category_confirmed' : 'category_corrected', actor, {
        from: t.category,
        to: patch.category,
        ai: t.ai_category,
      });
      ai.learnCorrection(t.subject, t.description, patch.category as CategoryKey);
    }
    if (patch.assignee_id !== undefined && patch.assignee_id !== t.assignee_id) {
      const user = patch.assignee_id ? get<{ name: string }>('SELECT name FROM users WHERE id = ? AND active = 1', patch.assignee_id) : null;
      if (patch.assignee_id && !user) throw new HttpError(400, 'Responsável inválido ou desativado.');
      run('UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?', patch.assignee_id, now, id);
      addEvent(id, 'assigned', actor, { assignee: user?.name ?? null });
    }
  });
  ai.invalidateTickets();
  return findTicket(id)!;
}

ticketsRouter.patch('/:id', (req, res) => {
  const patch = PatchTicket.parse(req.body);
  const t = patchTicket(Number(req.params.id), patch, req.user!.name);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });
  res.json({ ticket: serializeTicket(t) });
});

const Bulk = PatchTicket.extend({ ids: z.array(z.number().int().positive()).min(1).max(200) });

ticketsRouter.post('/bulk', (req, res) => {
  const { ids, ...patch } = Bulk.parse(req.body);
  let updated = 0;
  for (const id of ids) if (patchTicket(id, patch, req.user!.name)) updated++;
  res.json({ updated });
});

const NewMessage = z.object({
  body: z.string().trim().min(1, 'Escreva uma mensagem.').max(10000),
  internal: z.boolean().default(false),
  setStatus: z.enum(STATUSES).optional(),
  usedSuggestion: z.boolean().optional(),
});

ticketsRouter.post('/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  const t = findTicket(id);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const body = NewMessage.parse(req.body);
  const now = nowIso();
  tx(() => {
    addMessage(id, 'agent', req.user!.name, body.body, body.internal, now);
    if (!body.internal) {
      const next = body.setStatus ?? (t.status === 'new' ? 'in_progress' : t.status);
      const resolving = next === 'resolved' || next === 'closed';
      run(
        `UPDATE tickets SET first_response_at = COALESCE(first_response_at, ?), status = ?, assignee_id = COALESCE(assignee_id, ?),
           resolved_at = CASE WHEN ? THEN COALESCE(resolved_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?`,
        now,
        next,
        req.user!.id,
        resolving ? 1 : 0,
        now,
        now,
        id,
      );
      // Taxa de aceitação da IA: usou a sugestão? Enviou sem editar?
      const usedSuggestion = Boolean(body.usedSuggestion);
      const verbatim = usedSuggestion && normalizeText(body.body) === normalizeText(t.ai_reply ?? '');
      addEvent(id, 'reply', req.user!.name, { usedSuggestion, verbatim });
      if (next !== t.status) addEvent(id, 'status_changed', req.user!.name, { from: t.status, to: next });
    } else {
      addEvent(id, 'note', req.user!.name, null);
    }
  });
  res.status(201).json({ ok: true });
});

const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim();

const BulkReply = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(300),
  body: z.string().trim().min(10, 'Escreva a mensagem.').max(10000),
  status: z.enum(STATUSES).optional(),
});

/**
 * Resposta em massa (ex.: comunicado de incidente para todos os tickets de um pico).
 * "{{nome}}" no texto é trocado pelo primeiro nome de cada solicitante.
 */
ticketsRouter.post('/bulk-reply', (req, res) => {
  const { ids, body, status } = BulkReply.parse(req.body);
  const now = nowIso();
  let sent = 0;
  tx(() => {
    for (const id of ids) {
      const t = findTicket(id);
      if (!t) continue;
      const text = body.replace(/\{\{\s*nome\s*\}\}/gi, t.requester_name.split(' ')[0]);
      addMessage(id, 'agent', req.user!.name, text, false, now);
      const next = status ?? (t.status === 'new' ? 'in_progress' : t.status);
      const resolving = next === 'resolved' || next === 'closed';
      run(
        `UPDATE tickets SET first_response_at = COALESCE(first_response_at, ?), status = ?, assignee_id = COALESCE(assignee_id, ?),
           resolved_at = CASE WHEN ? THEN COALESCE(resolved_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?`,
        now,
        next,
        req.user!.id,
        resolving ? 1 : 0,
        now,
        now,
        id,
      );
      addEvent(id, 'reply', req.user!.name, { bulk: true, count: ids.length });
      if (next !== t.status) addEvent(id, 'status_changed', req.user!.name, { from: t.status, to: next });
      sent++;
    }
  });
  ai.invalidateTickets();
  res.json({ sent });
});

ticketsRouter.post('/:id/reanalyze', async (req, res) => {
  const id = Number(req.params.id);
  const t = findTicket(id);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const analysis = await ai.analyze(
    buildAnalysisInput({
      subject: t.subject,
      description: t.description,
      requesterName: t.requester_name,
      customerId: t.customer_id,
      productVersion: t.product_version,
      excludeId: id,
    }),
    { allowClaude: true },
  );
  applyAnalysis(id, analysis, req.user!.name);
  res.json({ ticket: serializeTicket(findTicket(id)!), analysis });
});
