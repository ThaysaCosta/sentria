import { Router } from 'express';
import { z } from 'zod';
import { ai } from '../ai/index.js';
import { detectInsights } from '../ai/insights.js';
import { DUMMY_HASH, demoMode, hashPassword, passwordProblem, requireAdmin, requireAuth, signToken, verifyPassword, type AuthUser } from '../auth.js';
import { all, get, nowIso, run } from '../db/database.js';
import { CATEGORIES } from '../domain.js';
import { detail, overview } from '../services/analytics.js';
import { rateLimit } from '../utils/security.js';
import { buildAnalysisInput, loadInsightTickets } from '../services/tickets.js';

// ------------------------------------------------------------------ Auth

export const authRouter = Router();

const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// Proteção contra tentativa de senhas em massa: 10 tentativas a cada 15 minutos por IP.
const loginLimiter = rateLimit({ max: 10, windowMs: 15 * 60_000, message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' });

interface LoginRecord extends AuthUser {
  password_hash: string;
  title: string | null;
  active: number;
  must_change_password: number;
  token_version: number;
}

const publicUser = (u: LoginRecord) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  title: u.title,
  mustChangePassword: Boolean(u.must_change_password),
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const { email, password } = Login.parse(req.body);
  const user = get<LoginRecord>(
    'SELECT id, name, email, role, title, password_hash, active, must_change_password, token_version FROM users WHERE email = ?',
    email,
  );
  // Sempre verifica um hash (mesmo sem usuário) para o tempo de resposta não revelar quais e-mails existem.
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  if (!user.active) return res.status(403).json({ error: 'Este usuário foi desativado. Fale com o administrador da sua equipe.' });
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = get<LoginRecord>('SELECT * FROM users WHERE id = ?', req.user!.id);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  res.json({ user: publicUser(user) });
});

const ChangePassword = z.object({ current: z.string().min(1, 'Informe a senha atual.'), next: z.string() });

/** Troca da própria senha. Encerra as outras sessões e devolve um token novo. */
authRouter.post('/change-password', requireAuth, loginLimiter, (req, res) => {
  const { current, next } = ChangePassword.parse(req.body);
  const user = get<LoginRecord & { protected: number }>('SELECT * FROM users WHERE id = ?', req.user!.id)!;
  if (!verifyPassword(current, user.password_hash)) return res.status(400).json({ error: 'A senha atual está incorreta.' });
  if (demoMode() && user.protected) {
    return res.status(403).json({ error: 'Na demonstração pública, a senha das contas de exemplo não pode ser alterada.' });
  }
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  if (verifyPassword(next, user.password_hash)) return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' });
  run(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
    hashPassword(next),
    user.id,
  );
  const updated = get<LoginRecord>('SELECT * FROM users WHERE id = ?', user.id)!;
  res.json({ token: signToken(updated), user: publicUser(updated) });
});

// ------------------------------------------------------------------ Metadados e IA

export const metaRouter = Router();

metaRouter.get('/users', (_req, res) => {
  // Lista usada para atribuir tickets: só usuários ativos.
  res.json(
    all(
      `SELECT u.id, u.name, u.email, u.role, u.title,
         (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = u.id AND t.status IN ('new','in_progress','waiting')) AS open_tickets
       FROM users u WHERE u.active = 1 ORDER BY u.name`,
    ),
  );
});

metaRouter.get('/customers', (_req, res) => {
  res.json(all('SELECT id, name, plan, segment, mrr FROM customers ORDER BY name'));
});

metaRouter.get('/ai/status', (_req, res) => {
  res.json(ai.status());
});

const Preview = z.object({
  subject: z.string().max(200).default(''),
  description: z.string().max(10000).default(''),
  customerId: z.number().int().positive().nullable().optional(),
  requesterName: z.string().max(120).optional(),
});

/** Prévia instantânea (motor local) enquanto o atendente digita. */
metaRouter.post('/ai/preview', (req, res) => {
  const body = Preview.parse(req.body);
  if (body.subject.trim().length + body.description.trim().length < 8) return res.json({ analysis: null, similar: [] });
  const analysis = ai.analyzeLocal(
    buildAnalysisInput({ subject: body.subject, description: body.description, requesterName: body.requesterName, customerId: body.customerId }),
  );
  const similar = ai.similarTickets(`${body.subject} ${body.subject} ${body.description}`, 3);
  res.json({ analysis, similar });
});

// ------------------------------------------------------------------ Analytics e insights

export const analyticsRouter = Router();

const days = (v: unknown) => {
  const n = Number(v);
  return [7, 30, 90].includes(n) ? n : 30;
};

analyticsRouter.get('/overview', (req, res) => {
  const d = days(req.query.days);
  const data = overview(d);
  const priorityTickets = all(
    `SELECT t.id, t.protocol, t.subject, t.category, t.status, t.priority, t.churn_risk, t.sentiment, t.created_at, t.sla_due_at,
            c.name AS customer_name, c.plan AS customer_plan
     FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id
     WHERE t.status IN ('new','in_progress','waiting')
     ORDER BY t.churn_risk DESC, CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
     LIMIT 6`,
  );
  const insights = currentInsights();
  res.json({ ...data, priorityTickets, insights: insights.slice(0, 2), insightCount: insights.length });
});

analyticsRouter.get('/detail', (req, res) => {
  res.json(detail(days(req.query.days)));
});

export function currentInsights() {
  const index = ai.ticketVectors();
  return detectInsights(loadInsightTickets(30), (a, b) => index.similarity(a, b));
}

export const insightsRouter = Router();

insightsRouter.get('/', (_req, res) => {
  res.json({ insights: currentInsights(), generatedAt: new Date().toISOString() });
});

insightsRouter.post('/summary', async (_req, res) => {
  const ov = overview(7);
  const insights = currentInsights();
  const k = ov.kpis;
  const pct = (v: number | null | undefined) => (v == null ? 'n/d' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
  const hrs = (v: number | null | undefined) => (v == null ? 'n/d' : `${v.toFixed(1).replace('.', ',')}h`);
  const topCats = ov.categories.slice(0, 3).map((c) => `${c.label} (${c.count})`).join(', ');

  const context = `Indicadores dos últimos 7 dias:
- Chamados recebidos: ${k.received.value} (variação ${k.received.delta ?? 'n/d'}% vs. semana anterior)
- Tempo médio de resolução: ${hrs(k.avgResolutionHours.value)} (variação ${k.avgResolutionHours.delta ?? 'n/d'}%)
- CSAT: ${pct(k.csat.value)} (variação ${k.csat.deltaPp ?? 'n/d'} p.p.)
- Cumprimento de SLA: ${pct(k.slaCompliance.value)}
- Categorização automática sem correção: ${pct(k.aiAutoRate.value)}; precisão medida da IA: ${pct(k.aiAutoRate.accuracy)}
- Resolvidos pela IA no portal: ${k.resolvedByAi.value}
- Chamados em aberto agora: ${k.open.value}
- Categorias com mais volume: ${topCats}

Padrões detectados pela SENTRIA:
${insights.length ? insights.map((i) => `- [${i.severity}] ${i.headline}. ${i.description} Ação sugerida: ${i.suggestedAction}`).join('\n') : '- Nenhum padrão relevante.'}`;

  const fallback = () => {
    const lines = [
      `Na última semana a operação recebeu ${k.received.value} chamados${
        k.received.delta != null ? ` (${k.received.delta > 0 ? '+' : ''}${String(k.received.delta).replace('.', ',')}% vs. semana anterior)` : ''
      }, com tempo médio de resolução de ${hrs(k.avgResolutionHours.value)} e CSAT de ${pct(k.csat.value)}. As categorias com mais volume foram ${topCats}.`,
      '',
      ...insights.slice(0, 4).map((i) => `- ${i.headline}. ${i.suggestedAction}`),
      ...(insights.length === 0 ? ['- Nenhum padrão fora do normal foi identificado no período.'] : []),
      `- A IA categorizou ${pct(k.aiAutoRate.value)} dos chamados sem necessidade de correção, com precisão medida de ${pct(k.aiAutoRate.accuracy)}.`,
      '',
      `Recomendação: ${insights[0]?.suggestedAction ?? 'manter o acompanhamento diário dos indicadores e revisar os chamados com baixa confiança da IA.'}`,
    ];
    return lines.join('\n');
  };

  const result = await ai.executiveSummary(context, fallback);
  res.json({ ...result, generatedAt: new Date().toISOString() });
});

// ------------------------------------------------------------------ Base de conhecimento

export const kbRouter = Router();

const Article = z.object({
  title: z.string().trim().min(5).max(160),
  category: z.enum(Object.keys(CATEGORIES) as [string, ...string[]]),
  body: z.string().trim().min(20).max(20000),
  tags: z.string().trim().max(300).default(''),
});

kbRouter.get('/', (req, res) => {
  const q = String(req.query.search ?? '').trim();
  if (q) {
    const hits = ai.suggestArticles(q, 20);
    const ids = hits.map((h) => h.id);
    if (!ids.length) return res.json([]);
    const rows = all<{ id: number }>(`SELECT * FROM kb_articles WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
    return res.json(ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean));
  }
  res.json(all('SELECT * FROM kb_articles ORDER BY category, title'));
});

kbRouter.get('/:id', (req, res) => {
  const a = get('SELECT * FROM kb_articles WHERE id = ?', Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Artigo não encontrado.' });
  res.json(a);
});

kbRouter.post('/', (req, res) => {
  const a = Article.parse(req.body);
  const now = new Date().toISOString();
  const r = get<{ id: number }>(
    'INSERT INTO kb_articles(title, category, body, tags, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?) RETURNING id',
    a.title,
    a.category,
    a.body,
    a.tags,
    now,
    now,
  )!;
  ai.refreshKnowledgeBase();
  res.status(201).json(get('SELECT * FROM kb_articles WHERE id = ?', r.id));
});

kbRouter.put('/:id', (req, res) => {
  const a = Article.parse(req.body);
  const id = Number(req.params.id);
  const existing = get('SELECT id FROM kb_articles WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Artigo não encontrado.' });
  get(
    'UPDATE kb_articles SET title = ?, category = ?, body = ?, tags = ?, updated_at = ? WHERE id = ? RETURNING id',
    a.title,
    a.category,
    a.body,
    a.tags,
    new Date().toISOString(),
    id,
  );
  ai.refreshKnowledgeBase();
  res.json(get('SELECT * FROM kb_articles WHERE id = ?', id));
});

kbRouter.delete('/:id', requireAdmin, (req, res) => {
  get('DELETE FROM kb_articles WHERE id = ? RETURNING id', Number(req.params.id));
  ai.refreshKnowledgeBase();
  res.status(204).end();
});
