import { ai, type Analysis } from '../ai/index.js';
import type { InsightTicket } from '../ai/insights.js';
import { all, get, nowIso, run, SQL_ISO_NOW, tx } from '../db/database.js';
import { describeContext, errorSignature, type TicketContext } from '../context.js';
import { SLA_HOURS, type CategoryKey, type Channel, type Priority, type Status } from '../domain.js';

export interface TicketRow {
  id: number;
  protocol: string;
  subject: string;
  description: string;
  customer_id: number | null;
  requester_name: string;
  requester_email: string;
  channel: Channel;
  status: Status;
  priority: Priority;
  category: CategoryKey | null;
  category_source: 'ai' | 'human';
  ai_category: CategoryKey | null;
  ai_confidence: number | null;
  ai_priority: Priority | null;
  sentiment: string | null;
  sentiment_score: number | null;
  ai_summary: string | null;
  ai_reply: string | null;
  ai_tags: string | null;
  ai_signals: string | null;
  ai_engine: string | null;
  ai_analyzed_at: string | null;
  churn_risk: number;
  assignee_id: number | null;
  product_version: string | null;
  origin: string;
  resolved_by_ai: number;
  csat: number | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  sla_due_at: string | null;
  context: string | null;
  customer_name?: string | null;
  customer_plan?: string | null;
  assignee_name?: string | null;
}

const parseJson = <T>(v: string | null | undefined, fallback: T): T => {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export function serializeTicket(t: TicketRow) {
  return {
    ...t,
    ai_tags: parseJson<string[]>(t.ai_tags, []),
    ai_signals: parseJson<string[]>(t.ai_signals, []),
    context: parseJson<TicketContext | null>(t.context, null),
    resolved_by_ai: Boolean(t.resolved_by_ai),
    sla_breached: isSlaBreached(t),
  };
}

export function isSlaBreached(t: Pick<TicketRow, 'sla_due_at' | 'resolved_at' | 'status'>) {
  if (!t.sla_due_at) return false;
  const end = t.resolved_at ? Date.parse(t.resolved_at) : Date.now();
  return end > Date.parse(t.sla_due_at);
}

export const TICKET_SELECT = `
  SELECT t.*, c.name AS customer_name, c.plan AS customer_plan, u.name AS assignee_name
  FROM tickets t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN users u ON u.id = t.assignee_id`;

export function findTicket(id: number) {
  return get<TicketRow>(`${TICKET_SELECT} WHERE t.id = ?`, id);
}

export function findTicketByProtocol(protocol: string) {
  return get<TicketRow>(`${TICKET_SELECT} WHERE t.protocol = ?`, protocol.trim().toUpperCase());
}

export function addEvent(ticketId: number, type: string, actor: string | null, data: unknown = null, at = nowIso()) {
  run(
    'INSERT INTO ticket_events(ticket_id, type, actor, data, created_at) VALUES(?, ?, ?, ?, ?)',
    ticketId,
    type,
    actor,
    data == null ? null : JSON.stringify(data),
    at,
  );
}

export function addMessage(
  ticketId: number,
  authorType: 'customer' | 'agent' | 'ai' | 'system',
  authorName: string,
  body: string,
  internal = false,
  at = nowIso(),
) {
  const r = run(
    'INSERT INTO ticket_messages(ticket_id, author_type, author_name, body, internal, created_at) VALUES(?, ?, ?, ?, ?, ?)',
    ticketId,
    authorType,
    authorName,
    body,
    internal ? 1 : 0,
    at,
  );
  return Number(r.lastInsertRowid);
}

export function slaDue(createdAt: string, priority: Priority) {
  return new Date(Date.parse(createdAt) + SLA_HOURS[priority] * 3_600_000).toISOString();
}

export function recentTicketsForCustomer(customerId: number | null | undefined, excludeId?: number) {
  if (!customerId) return 0;
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tickets WHERE customer_id = ? AND created_at >= ${SQL_ISO_NOW} AND id != ?`,
      customerId,
      '-7 days',
      excludeId ?? -1,
    )?.n ?? 0
  );
}

export function customerInfo(customerId: number | null | undefined) {
  if (!customerId) return null;
  return get<{ id: number; name: string; plan: string; mrr: number; segment: string | null }>(
    'SELECT id, name, plan, mrr, segment FROM customers WHERE id = ?',
    customerId,
  );
}

/** Encontra cliente pelo nome (ou domínio do e-mail); cria um novo no plano Starter se não existir. */
export function resolveCustomer(companyName?: string | null, email?: string | null): number | null {
  const name = companyName?.trim();
  if (name) {
    const found = get<{ id: number }>('SELECT id FROM customers WHERE lower(name) = lower(?)', name);
    if (found) return found.id;
  }
  const domain = email?.split('@')[1]?.toLowerCase();
  if (domain && !/gmail|hotmail|outlook|yahoo|icloud|live\./.test(domain)) {
    const byDomain = get<{ id: number }>('SELECT id FROM customers WHERE lower(domain) = ?', domain);
    if (byDomain) return byDomain.id;
  }
  if (!name) return null;
  const r = run(
    'INSERT INTO customers(name, plan, segment, mrr, domain, created_at) VALUES(?, ?, ?, ?, ?, ?)',
    name,
    'Starter',
    null,
    0,
    domain ?? null,
    nowIso(),
  );
  return Number(r.lastInsertRowid);
}

export interface NewTicketInput {
  subject: string;
  description: string;
  requesterName: string;
  requesterEmail: string;
  customerId?: number | null;
  companyName?: string | null;
  channel?: Channel;
  productVersion?: string | null;
  origin: 'portal' | 'agent' | 'import' | 'seed';
  createdAt?: string;
  actor?: string;
  /** Status inicial (ex.: portal resolvido por artigo sugerido). */
  status?: Status;
  resolvedByAi?: boolean;
  allowClaude?: boolean;
  /** Contexto técnico capturado pelo widget. */
  context?: TicketContext | null;
}

export function buildAnalysisInput(t: {
  subject: string;
  description: string;
  requesterName?: string | null;
  customerId?: number | null;
  productVersion?: string | null;
  excludeId?: number;
  context?: TicketContext | null;
}) {
  const customer = customerInfo(t.customerId);
  return {
    subject: t.subject,
    description: t.description,
    requesterName: t.requesterName,
    customerName: customer?.name ?? null,
    customerPlan: customer?.plan ?? null,
    customerRecentTickets: recentTicketsForCustomer(t.customerId, t.excludeId),
    productVersion: t.productVersion ?? t.context?.app?.version ?? null,
    technicalContext: describeContext(t.context),
  };
}

export async function createTicket(input: NewTicketInput) {
  const customerId = input.customerId ?? resolveCustomer(input.companyName, input.requesterEmail);
  const analysis = await ai.analyze(
    buildAnalysisInput({
      subject: input.subject,
      description: input.description,
      requesterName: input.requesterName,
      customerId,
      productVersion: input.productVersion,
      context: input.context,
    }),
    { allowClaude: input.allowClaude ?? true },
  );
  const id = insertTicket(input, customerId, analysis);
  ai.invalidateTickets();
  return { id, analysis };
}

/** Insere o chamado já analisado (síncrono; usado também pelo seed e pela importação). */
export function insertTicket(input: NewTicketInput, customerId: number | null, analysis: Analysis) {
  const createdAt = input.createdAt ?? nowIso();
  const status: Status = input.status ?? 'new';
  const resolvedAt = status === 'resolved' || status === 'closed' ? createdAt : null;
  return tx(() => {
    const r = run(
      `INSERT INTO tickets(
        protocol, subject, description, customer_id, requester_name, requester_email, channel, status, priority,
        category, category_source, ai_category, ai_confidence, ai_priority, sentiment, sentiment_score,
        ai_summary, ai_reply, ai_tags, ai_signals, ai_engine, ai_analyzed_at, churn_risk, product_version,
        origin, resolved_by_ai, created_at, updated_at, resolved_at, sla_due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `TMP-${Math.random().toString(36).slice(2)}`,
      input.subject.trim(),
      input.description.trim(),
      customerId,
      input.requesterName.trim(),
      input.requesterEmail.trim().toLowerCase(),
      input.channel ?? 'portal',
      status,
      analysis.priority,
      analysis.category,
      analysis.category,
      analysis.confidence,
      analysis.priority,
      analysis.sentiment,
      analysis.sentimentScore,
      analysis.summary,
      analysis.suggestedReply,
      JSON.stringify(analysis.tags),
      JSON.stringify(analysis.signals),
      analysis.engine === 'claude' ? `claude:${analysis.model}` : 'local',
      createdAt,
      analysis.churnRisk,
      input.productVersion ?? null,
      input.origin,
      input.resolvedByAi ? 1 : 0,
      createdAt,
      createdAt,
      resolvedAt,
      slaDue(createdAt, analysis.priority),
    );
    const id = Number(r.lastInsertRowid);
    const protocol = `SNT${createdAt.slice(0, 4)}${String(id).padStart(6, '0')}`;
    run('UPDATE tickets SET protocol = ?, context = ? WHERE id = ?', protocol, input.context ? JSON.stringify(input.context) : null, id);
    addEvent(id, 'created', input.actor ?? input.requesterName, { origin: input.origin, channel: input.channel }, createdAt);
    addEvent(
      id,
      'ai_analysis',
      'SENTRIA Intelligence',
      {
        engine: analysis.engine,
        model: analysis.model,
        category: analysis.category,
        confidence: analysis.confidence,
        priority: analysis.priority,
        sentiment: analysis.sentiment,
        fallbackReason: analysis.fallbackReason,
      },
      createdAt,
    );
    if (input.resolvedByAi) addEvent(id, 'resolved_by_ai', 'SENTRIA Intelligence', null, createdAt);
    return id;
  });
}

/** Aplica uma nova análise a um chamado existente (reprocessamento). */
export function applyAnalysis(id: number, analysis: Analysis, actor: string) {
  const t = findTicket(id);
  if (!t) return;
  const keepHumanCategory = t.category_source === 'human';
  run(
    `UPDATE tickets SET
      ai_category = ?, ai_confidence = ?, ai_priority = ?, sentiment = ?, sentiment_score = ?, ai_summary = ?,
      ai_reply = ?, ai_tags = ?, ai_signals = ?, ai_engine = ?, ai_analyzed_at = ?, churn_risk = ?,
      category = CASE WHEN ? THEN category ELSE ? END, updated_at = ?
     WHERE id = ?`,
    analysis.category,
    analysis.confidence,
    analysis.priority,
    analysis.sentiment,
    analysis.sentimentScore,
    analysis.summary,
    analysis.suggestedReply,
    JSON.stringify(analysis.tags),
    JSON.stringify(analysis.signals),
    analysis.engine === 'claude' ? `claude:${analysis.model}` : 'local',
    nowIso(),
    analysis.churnRisk,
    keepHumanCategory ? 1 : 0,
    analysis.category,
    nowIso(),
    id,
  );
  addEvent(id, 'ai_analysis', actor, {
    engine: analysis.engine,
    model: analysis.model,
    category: analysis.category,
    confidence: analysis.confidence,
    priority: analysis.priority,
    sentiment: analysis.sentiment,
    fallbackReason: analysis.fallbackReason,
    reprocessed: true,
  });
}

/** Chamados no formato usado pela detecção de padrões. */
export function loadInsightTickets(days = 30): InsightTicket[] {
  return all<TicketRow>(
    `${TICKET_SELECT} WHERE t.created_at >= ${SQL_ISO_NOW} ORDER BY t.created_at DESC`,
    `-${days} days`,
  ).map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    sentiment: t.sentiment,
    customer_id: t.customer_id,
    customer_name: t.customer_name ?? null,
    customer_plan: t.customer_plan ?? null,
    product_version: t.product_version,
    tags: parseJson<string[]>(t.ai_tags, []),
    churn_risk: t.churn_risk,
    created_at: t.created_at,
    sla_due_at: t.sla_due_at,
    page: parseJson<TicketContext | null>(t.context, null)?.page?.path ?? null,
    error_signature: errorSignature(parseJson<TicketContext | null>(t.context, null)),
  }));
}
