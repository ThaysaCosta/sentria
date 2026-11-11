import { Router } from 'express';
import { z } from 'zod';
import { ai } from '../ai/index.js';
import { detectInsights } from '../ai/insights.js';
import { requireAuth, signToken, verifyPassword, type AuthUser } from '../auth.js';
import { all, get } from '../db/database.js';
import { CATEGORIES } from '../domain.js';
import { detail, overview } from '../services/analytics.js';
import { buildAnalysisInput, loadInsightTickets } from '../services/tickets.js';

// ------------------------------------------------------------------ Auth

export const authRouter = Router();

const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

authRouter.post('/login', (req, res) => {
  const { email, password } = Login.parse(req.body);
  const user = get<AuthUser & { password_hash: string; title: string }>(
    'SELECT id, name, email, role, title, password_hash FROM users WHERE email = ?',
    email,
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  const { password_hash: _ignored, ...publicUser } = user;
  res.json({ token: signToken(publicUser), user: publicUser });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = get('SELECT id, name, email, role, title FROM users WHERE id = ?', req.user!.id);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  res.json({ user });
});

// ------------------------------------------------------------------ Metadados e IA

export const metaRouter = Router();

metaRouter.get('/users', (_req, res) => {
  res.json(
    all(
      `SELECT u.id, u.name, u.email, u.role, u.title,
         (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = u.id AND t.status IN ('new','in_progress','waiting')) AS open_tickets
       FROM users u ORDER BY u.name`,
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

kbRouter.delete('/:id', (req, res) => {
  get('DELETE FROM kb_articles WHERE id = ? RETURNING id', Number(req.params.id));
  ai.refreshKnowledgeBase();
  res.status(204).end();
});
