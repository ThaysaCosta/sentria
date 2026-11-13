import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { z } from 'zod';
import { ai } from '../ai/index.js';
import { TicketContextSchema } from '../context.js';
import { all, get, nowIso, run, tx } from '../db/database.js';
import { CATEGORIES } from '../domain.js';
import { addEvent, addMessage, createTicket, findTicketByProtocol, type TicketRow } from '../services/tickets.js';
import { rateLimit as limiter } from '../utils/security.js';

export const publicRouter = Router();

const rateLimit = (max: number, windowMs: number) => limiter({ max, windowMs });

const Suggest = z.object({ subject: z.string().max(200).default(''), description: z.string().max(10000).default('') });

/** Sugestões de artigos enquanto o cliente descreve o problema (autoatendimento). */
publicRouter.post('/suggest', rateLimit(120, 60_000), (req, res) => {
  const { subject, description } = Suggest.parse(req.body);
  const text = `${subject} ${subject} ${description}`.trim();
  if (text.length < 8) return res.json({ articles: [], category: null });
  const articles = ai.suggestArticles(text, 3);
  const full = articles.length
    ? all<{ id: number; title: string; body: string; category: string }>(
        `SELECT id, title, body, category FROM kb_articles WHERE id IN (${articles.map(() => '?').join(',')})`,
        ...articles.map((a) => a.id),
      )
    : [];
  const analysis = ai.analyzeLocal({ subject, description });
  res.json({
    articles: articles.map((a) => ({ ...a, body: full.find((f) => f.id === a.id)?.body ?? '' })),
    category: { key: analysis.category, label: CATEGORIES[analysis.category].label, confidence: analysis.confidence },
  });
});

const OpenTicket = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: z.string().trim().email('Informe um e-mail válido.'),
  company: z.string().trim().max(120).optional().default(''),
  subject: z.string().trim().min(3, 'Informe um assunto.').max(200),
  description: z.string().trim().min(10, 'Descreva o problema com um pouco mais de detalhe.').max(10000),
  resolvedBySuggestion: z.boolean().optional(),
  articleId: z.number().int().positive().optional(),
  context: TicketContextSchema.optional(),
});

publicRouter.post('/tickets', rateLimit(15, 10 * 60_000), async (req, res) => {
  const body = OpenTicket.parse(req.body);
  const { id, analysis } = await createTicket({
    subject: body.subject,
    description: body.description,
    requesterName: body.name,
    requesterEmail: body.email,
    companyName: body.company || null,
    channel: body.context?.source === 'widget' ? 'widget' : 'portal',
    origin: 'portal',
    context: body.context ?? null,
    status: body.resolvedBySuggestion ? 'resolved' : 'new',
    resolvedByAi: body.resolvedBySuggestion,
    // Chamados resolvidos pelo autoatendimento não precisam de análise com o Claude.
    allowClaude: !body.resolvedBySuggestion,
  });
  if (body.resolvedBySuggestion && body.articleId) {
    run('UPDATE kb_articles SET helpful = helpful + 1 WHERE id = ?', body.articleId);
  }
  const t = get<{ id: number; protocol: string; status: string; requester_email: string }>('SELECT id, protocol, status, requester_email FROM tickets WHERE id = ?', id)!;
  res.status(201).json({
    protocol: t.protocol,
    accessToken: accessToken(t),
    status: t.status,
    category: CATEGORIES[analysis.category].label,
    priority: analysis.priority,
  });
});

/**
 * Acesso do cliente a um chamado: com o e-mail usado na abertura OU com o token do link de acompanhamento.
 * O token é um HMAC (não dá para adivinhar nem derivar outro chamado) e evita colocar o e-mail na URL.
 */
function accessToken(t: Pick<TicketRow, 'id' | 'requester_email'>) {
  return createHmac('sha256', config.jwtSecret).update(`ticket-access:${t.id}:${t.requester_email.toLowerCase()}`).digest('base64url').slice(0, 32);
}

const Credential = z
  .object({ email: z.string().trim().toLowerCase().email().optional(), token: z.string().trim().max(64).optional() })
  .refine((c) => c.email || c.token, 'Informe o e-mail usado na abertura do chamado.');

function findForCustomer(protocol: string, cred: { email?: string; token?: string }) {
  const t = findTicketByProtocol(protocol);
  if (!t) return null;
  if (cred.token) {
    const expected = Buffer.from(accessToken(t));
    const given = Buffer.from(cred.token);
    return expected.length === given.length && timingSafeEqual(expected, given) ? t : null;
  }
  return cred.email && t.requester_email.toLowerCase() === cred.email ? t : null;
}

publicRouter.post('/tickets/:protocol/access', rateLimit(30, 60_000), (req, res) => {
  const cred = Credential.parse(req.body);
  const t = findForCustomer(String(req.params.protocol), cred);
  if (!t) return res.status(404).json({ error: 'Não encontramos um chamado com esse protocolo e e-mail.' });
  const messages = all<{ author_type: string; author_name: string; body: string; created_at: string }>(
    'SELECT author_type, author_name, body, created_at FROM ticket_messages WHERE ticket_id = ? AND internal = 0 ORDER BY created_at, id',
    t.id,
  ).map((m) => ({ ...m, author_name: m.author_type === 'agent' ? `${m.author_name.split(' ')[0]} · Suporte` : m.author_name }));
  res.json({
    protocol: t.protocol,
    subject: t.subject,
    description: t.description,
    status: t.status,
    category: t.category ? CATEGORIES[t.category].label : null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    resolved_at: t.resolved_at,
    csat: t.csat,
    requester_name: t.requester_name,
    resolved_by_ai: Boolean(t.resolved_by_ai),
    accessToken: accessToken(t),
    messages,
  });
});

const CustomerMessage = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  token: z.string().trim().max(64).optional(),
  body: z.string().trim().min(1, 'Escreva uma mensagem.').max(10000),
});

publicRouter.post('/tickets/:protocol/messages', rateLimit(30, 10 * 60_000), (req, res) => {
  const { body, ...cred } = CustomerMessage.parse(req.body);
  const t = findForCustomer(String(req.params.protocol), cred);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const now = nowIso();
  tx(() => {
    addMessage(t.id, 'customer', t.requester_name, body, false, now);
    const reopen = t.status === 'resolved' || t.status === 'closed' || t.status === 'waiting';
    run(
      `UPDATE tickets SET status = ?, resolved_at = CASE WHEN ? THEN NULL ELSE resolved_at END, updated_at = ? WHERE id = ?`,
      reopen ? 'in_progress' : t.status,
      reopen ? 1 : 0,
      now,
      t.id,
    );
    addEvent(t.id, 'customer_reply', t.requester_name, reopen ? { reopened: t.status !== 'waiting' } : null, now);
  });
  res.status(201).json({ ok: true });
});

const Csat = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  token: z.string().trim().max(64).optional(),
  score: z.number().int().min(1).max(5),
});

publicRouter.post('/tickets/:protocol/csat', rateLimit(20, 10 * 60_000), (req, res) => {
  const { score, ...cred } = Csat.parse(req.body);
  const t = findForCustomer(String(req.params.protocol), cred);
  if (!t) return res.status(404).json({ error: 'Chamado não encontrado.' });
  if (t.status !== 'resolved' && t.status !== 'closed') {
    return res.status(400).json({ error: 'A avaliação fica disponível quando o chamado for resolvido.' });
  }
  run('UPDATE tickets SET csat = ?, updated_at = ? WHERE id = ?', score, nowIso(), t.id);
  addEvent(t.id, 'csat', t.requester_name, { score });
  res.json({ ok: true });
});

publicRouter.get('/kb/:id', (req, res) => {
  const a = get('SELECT id, title, category, body, tags FROM kb_articles WHERE id = ?', Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Artigo não encontrado.' });
  run('UPDATE kb_articles SET views = views + 1 WHERE id = ?', Number(req.params.id));
  res.json(a);
});
