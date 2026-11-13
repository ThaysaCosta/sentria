import { all, SQL_ISO_NOW } from '../db/database.js';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  CHANNELS,
  OPEN_STATUSES,
  PRIORITIES,
  SLA_HOURS,
  type CategoryKey,
  type Priority,
  type Status,
} from '../domain.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BRT = 3 * HOUR;

interface Row {
  id: number;
  created_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
  status: Status;
  category: CategoryKey | null;
  category_source: string;
  ai_category: CategoryKey | null;
  ai_confidence: number | null;
  priority: Priority;
  sentiment: string | null;
  csat: number | null;
  resolved_by_ai: number;
  sla_due_at: string | null;
  channel: string;
  assignee_id: number | null;
  assignee_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_plan: string | null;
  churn_risk: number;
}

function load(days: number): Row[] {
  return all<Row>(
    `SELECT t.id, t.created_at, t.resolved_at, t.first_response_at, t.status, t.category, t.category_source,
            t.ai_category, t.ai_confidence, t.priority, t.sentiment, t.csat, t.resolved_by_ai, t.sla_due_at,
            t.channel, t.assignee_id, u.name AS assignee_name, t.customer_id, c.name AS customer_name,
            c.plan AS customer_plan, t.churn_risk
     FROM tickets t
     LEFT JOIN users u ON u.id = t.assignee_id
     LEFT JOIN customers c ON c.id = t.customer_id
     WHERE t.created_at >= ${SQL_ISO_NOW}`,
    `-${days} days`,
  );
}

const ts = (s: string) => Date.parse(s);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (n: number | null, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const delta = (cur: number | null, prev: number | null) =>
  cur == null || prev == null || prev === 0 ? null : round(((cur - prev) / prev) * 100, 1);
const deltaPp = (cur: number | null, prev: number | null) => (cur == null || prev == null ? null : round((cur - prev) * 100, 1));

function resolutionHours(t: Row) {
  return t.resolved_at ? (ts(t.resolved_at) - ts(t.created_at)) / HOUR : null;
}

function windowStats(rows: Row[], from: number, to: number) {
  const created = rows.filter((t) => ts(t.created_at) >= from && ts(t.created_at) < to);
  const resolved = rows.filter((t) => t.resolved_at && !t.resolved_by_ai && ts(t.resolved_at) >= from && ts(t.resolved_at) < to);
  const rated = resolved.filter((t) => t.csat != null);
  const reviewed = created.filter((t) => t.category_source === 'human' && t.ai_category);
  const autoOk = created.filter((t) => t.category_source === 'ai' || t.category === t.ai_category);
  const withSla = resolved.filter((t) => t.sla_due_at);
  return {
    received: created.length,
    avgResolutionHours: avg(resolved.map((t) => resolutionHours(t)!)),
    avgFirstResponseHours: avg(
      created.filter((t) => t.first_response_at).map((t) => (ts(t.first_response_at!) - ts(t.created_at)) / HOUR),
    ),
    csat: rated.length ? rated.filter((t) => t.csat! >= 4).length / rated.length : null,
    aiAutoRate: created.length ? autoOk.length / created.length : null,
    aiAccuracy: reviewed.length ? reviewed.filter((t) => t.category === t.ai_category).length / reviewed.length : null,
    slaCompliance: withSla.length ? withSla.filter((t) => ts(t.resolved_at!) <= ts(t.sla_due_at!)).length / withSla.length : null,
    resolvedByAi: created.filter((t) => t.resolved_by_ai).length,
  };
}

export function overview(days: number) {
  const now = Date.now();
  const rows = load(Math.max(days * 2, 84) + 1);
  const cur = windowStats(rows, now - days * DAY, now + 1);
  const prev = windowStats(rows, now - 2 * days * DAY, now - days * DAY);

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = (s: string | null) => s != null && ts(s) >= start && ts(s) < end;
    return {
      week: new Date(start + DAY).toISOString().slice(0, 10),
      received: rows.filter((t) => inWeek(t.created_at)).length,
      resolved: rows.filter((t) => inWeek(t.resolved_at) && !t.resolved_by_ai).length,
      resolvedByAi: rows.filter((t) => t.resolved_by_ai && inWeek(t.created_at)).length,
    };
  });

  const inWindow = rows.filter((t) => ts(t.created_at) >= now - days * DAY);
  const categories = CATEGORY_KEYS.map((key) => {
    const count = inWindow.filter((t) => t.category === key).length;
    return { key, label: CATEGORIES[key].label, count, share: inWindow.length ? count / inWindow.length : 0 };
  }).sort((a, b) => b.count - a.count);

  const open = all<{ n: number }>(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('new','in_progress','waiting')`)[0].n;

  return {
    days,
    kpis: {
      received: { value: cur.received, delta: delta(cur.received, prev.received) },
      avgResolutionHours: { value: round(cur.avgResolutionHours, 2), delta: delta(cur.avgResolutionHours, prev.avgResolutionHours) },
      aiAutoRate: { value: round(cur.aiAutoRate, 3), deltaPp: deltaPp(cur.aiAutoRate, prev.aiAutoRate), accuracy: round(cur.aiAccuracy, 3) },
      csat: { value: round(cur.csat, 3), deltaPp: deltaPp(cur.csat, prev.csat) },
      slaCompliance: { value: round(cur.slaCompliance, 3), deltaPp: deltaPp(cur.slaCompliance, prev.slaCompliance) },
      avgFirstResponseHours: { value: round(cur.avgFirstResponseHours, 2), delta: delta(cur.avgFirstResponseHours, prev.avgFirstResponseHours) },
      resolvedByAi: { value: cur.resolvedByAi, delta: delta(cur.resolvedByAi, prev.resolvedByAi) },
      open: { value: open },
    },
    weekly: weeks,
    categories,
  };
}

export function detail(days: number) {
  const now = Date.now();
  const from = now - days * DAY;
  const rows = load(days + 1).filter((t) => ts(t.created_at) >= from);

  // Série diária por categoria (horário de Brasília).
  const dayKey = (s: string) => new Date(ts(s) - BRT).toISOString().slice(0, 10);
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayKeys.push(new Date(now - BRT - i * DAY).toISOString().slice(0, 10));
  const daily = dayKeys.map((date) => {
    const inDay = rows.filter((t) => dayKey(t.created_at) === date);
    const entry: Record<string, number | string> = { date, total: inDay.length };
    for (const k of CATEGORY_KEYS) entry[k] = inDay.filter((t) => t.category === k).length;
    entry.negative = inDay.filter((t) => t.sentiment === 'negative').length;
    entry.neutral = inDay.filter((t) => t.sentiment === 'neutral').length;
    entry.positive = inDay.filter((t) => t.sentiment === 'positive').length;
    return entry;
  });

  const byCategory = CATEGORY_KEYS.map((key) => {
    const list = rows.filter((t) => t.category === key);
    const resolved = list.filter((t) => t.resolved_at && !t.resolved_by_ai);
    const rated = resolved.filter((t) => t.csat != null);
    return {
      key,
      label: CATEGORIES[key].label,
      count: list.length,
      avgResolutionHours: round(avg(resolved.map((t) => resolutionHours(t)!)), 1),
      negativeShare: list.length ? round(list.filter((t) => t.sentiment === 'negative').length / list.length, 3) : 0,
      csat: rated.length ? round(rated.filter((t) => t.csat! >= 4).length / rated.length, 3) : null,
    };
  });

  // Mapa de calor dia da semana × hora (Brasília).
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const t of rows) {
    const d = new Date(ts(t.created_at) - BRT);
    heatmap[d.getUTCDay()][d.getUTCHours()]++;
  }

  const channels = CHANNELS.map((c) => ({ key: c, count: rows.filter((t) => t.channel === c).length }));

  const sla = PRIORITIES.map((p) => {
    const list = rows.filter((t) => t.priority === p && t.resolved_at && t.sla_due_at && !t.resolved_by_ai);
    const ok = list.filter((t) => ts(t.resolved_at!) <= ts(t.sla_due_at!)).length;
    return { priority: p, targetHours: SLA_HOURS[p], total: list.length, compliance: list.length ? round(ok / list.length, 3) : null };
  });

  const agentsMap = new Map<number, { name: string; assigned: number; resolved: number; hours: number[]; ratings: number[] }>();
  for (const t of rows) {
    if (!t.assignee_id) continue;
    const a = agentsMap.get(t.assignee_id) ?? { name: t.assignee_name ?? '—', assigned: 0, resolved: 0, hours: [], ratings: [] };
    a.assigned++;
    if (t.resolved_at) {
      a.resolved++;
      a.hours.push(resolutionHours(t)!);
    }
    if (t.csat != null) a.ratings.push(t.csat);
    agentsMap.set(t.assignee_id, a);
  }
  const agents = [...agentsMap.entries()]
    .map(([id, a]) => ({
      id,
      name: a.name,
      assigned: a.assigned,
      resolved: a.resolved,
      avgResolutionHours: round(avg(a.hours), 1),
      csat: a.ratings.length ? round(a.ratings.filter((r) => r >= 4).length / a.ratings.length, 3) : null,
      open: rows.filter((t) => t.assignee_id === id && OPEN_STATUSES.includes(t.status)).length,
    }))
    .sort((a, b) => b.resolved - a.resolved);

  // Matriz de confusão: categoria revisada por pessoa (linhas) × categoria prevista pela IA (colunas).
  const reviewed = rows.filter((t) => t.category_source === 'human' && t.category && t.ai_category);
  const matrix = CATEGORY_KEYS.map((truth) => CATEGORY_KEYS.map((pred) => reviewed.filter((t) => t.category === truth && t.ai_category === pred).length));
  const perCategory = CATEGORY_KEYS.map((k, i) => {
    const tp = matrix[i][i];
    const actual = matrix[i].reduce((a, b) => a + b, 0);
    const predicted = matrix.reduce((s, row) => s + row[i], 0);
    const precision = predicted ? tp / predicted : null;
    const recall = actual ? tp / actual : null;
    const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    return { key: k, label: CATEGORIES[k].label, precision: round(precision, 3), recall: round(recall, 3), f1: round(f1, 3), support: actual };
  });
  const correct = reviewed.filter((t) => t.category === t.ai_category).length;

  const buckets = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
  const confidence = buckets.map((upper, i) => {
    const lower = i === 0 ? 0 : buckets[i - 1];
    const inBucket = reviewed.filter((t) => (t.ai_confidence ?? 0) >= lower && (t.ai_confidence ?? 0) < upper);
    return {
      range: i === 0 ? '< 50%' : `${Math.round(lower * 100)}–${Math.min(100, Math.round(upper * 100))}%`,
      count: inBucket.length,
      accuracy: inBucket.length ? round(inBucket.filter((t) => t.category === t.ai_category).length / inBucket.length, 3) : null,
    };
  });

  const customersMap = new Map<number, { name: string; plan: string | null; count: number; negative: number; risk: number[] }>();
  for (const t of rows) {
    if (!t.customer_id) continue;
    const c = customersMap.get(t.customer_id) ?? { name: t.customer_name ?? '—', plan: t.customer_plan, count: 0, negative: 0, risk: [] };
    c.count++;
    if (t.sentiment === 'negative') c.negative++;
    c.risk.push(t.churn_risk);
    customersMap.set(t.customer_id, c);
  }
  const customers = [...customersMap.entries()]
    .map(([id, c]) => ({ id, name: c.name, plan: c.plan, tickets: c.count, negativeShare: round(c.negative / c.count, 3), churnRisk: Math.round(avg(c.risk) ?? 0) }))
    .sort((a, b) => b.churnRisk - a.churnRisk || b.tickets - a.tickets)
    .slice(0, 8);

  // Taxa de aceitação das respostas sugeridas pela IA (respostas individuais, sem as em massa).
  const replies = all<{ data: string | null }>(
    `SELECT data FROM ticket_events WHERE type = 'reply' AND created_at >= ${SQL_ISO_NOW}`,
    `-${days} days`,
  )
    .map((r) => (r.data ? (JSON.parse(r.data) as { usedSuggestion?: boolean; verbatim?: boolean; bulk?: boolean }) : {}))
    .filter((d) => !d.bulk);
  const used = replies.filter((d) => d.usedSuggestion).length;
  const verbatim = replies.filter((d) => d.verbatim).length;

  return {
    days,
    total: rows.length,
    daily,
    byCategory,
    heatmap,
    channels,
    sla,
    agents,
    ai: {
      reviewed: reviewed.length,
      accuracy: reviewed.length ? round(correct / reviewed.length, 3) : null,
      labels: CATEGORY_KEYS.map((k) => CATEGORIES[k].label),
      keys: CATEGORY_KEYS,
      matrix,
      perCategory,
      confidence,
      replies: {
        total: replies.length,
        usedSuggestion: replies.length ? round(used / replies.length, 3) : null,
        verbatim: replies.length ? round(verbatim / replies.length, 3) : null,
        editedBeforeSending: used ? round((used - verbatim) / used, 3) : null,
      },
    },
    customers,
  };
}
