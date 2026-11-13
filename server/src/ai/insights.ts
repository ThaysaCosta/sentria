import { CATEGORIES, OPEN_STATUSES, type CategoryKey, type Status } from '../domain.js';

export interface InsightTicket {
  id: number;
  subject: string;
  category: CategoryKey | null;
  status: Status;
  priority: string;
  sentiment: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_plan: string | null;
  product_version: string | null;
  tags: string[];
  churn_risk: number;
  created_at: string;
  sla_due_at: string | null;
  /** Tela do sistema do cliente em que o chamado foi aberto (widget). */
  page?: string | null;
  /** Erro principal capturado, ex.: "POST /api/boletos → 500". */
  error_signature?: string | null;
}

export interface Insight {
  id: string;
  type: 'spike' | 'recurring_customer' | 'cluster' | 'sla' | 'sentiment';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  headline: string;
  description: string;
  confidence: number;
  metrics: { label: string; value: string }[];
  ticketIds: number[];
  suggestedAction: string;
  category?: CategoryKey;
  customerId?: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SPIKE_ACTIONS: Record<CategoryKey, string> = {
  pagamentos: 'Abrir incidente com o time de Billing e publicar um aviso na central de ajuda.',
  acesso: 'Verificar o provedor de identidade e o serviço de autenticação; avisar os clientes afetados.',
  integracoes: 'Checar a saúde da API e da fila de webhooks e comunicar os integradores.',
  performance: 'Acionar o time de infraestrutura e acompanhar a latência dos serviços.',
  bugs: 'Escalar para o time de produto com os exemplos agrupados e avaliar rollback.',
  duvidas: 'Criar ou atualizar um artigo na base de conhecimento sobre o tema.',
};

const fmtX = (n: number) => n.toFixed(1).replace('.', ',');
const pct = (n: number) => `${Math.round(n * 100)}%`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function mode<T>(values: (T | null | undefined)[]): { value: T | null; share: number } {
  const counts = new Map<T, number>();
  let total = 0;
  for (const v of values) {
    if (v == null) continue;
    total++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null;
  let max = 0;
  for (const [v, c] of counts) if (c > max) [best, max] = [v, c];
  return { value: best, share: values.length ? max / values.length : 0 };
}

/** Picos de volume por categoria: últimas 24h contra a média diária dos 14 dias anteriores. */
export function detectSpikes(tickets: InsightTicket[], now: number): Insight[] {
  const out: Insight[] = [];
  const cats = Object.keys(CATEGORIES) as CategoryKey[];
  for (const cat of cats) {
    const inCat = tickets.filter((t) => t.category === cat);
    const recent = inCat.filter((t) => now - Date.parse(t.created_at) <= DAY);
    const baseline = inCat.filter((t) => {
      const age = now - Date.parse(t.created_at);
      return age > DAY && age <= 15 * DAY;
    });
    const expected = Math.max(baseline.length / 14, 0.5);
    const ratio = recent.length / expected;
    if (recent.length < 8 || ratio < 2.2) continue;

    const plan = mode(recent.map((t) => t.customer_plan));
    const version = mode(recent.map((t) => t.product_version));
    const tag = mode(recent.flatMap((t) => t.tags.filter((g) => !/^v\d/.test(g))));
    const page = mode(recent.map((t) => t.page));
    const signature = mode(recent.map((t) => t.error_signature));
    const earliest = Math.min(...recent.map((t) => Date.parse(t.created_at)));
    const hours = Math.max(1, Math.ceil((now - earliest) / HOUR));
    const topic = tag.value ? `falha relacionada a ${tag.value}` : CATEGORIES[cat].label.toLowerCase();

    const details: string[] = [];
    if (version.value && version.share >= 0.6) details.push(`${pct(version.share)} na versão ${version.value}`);
    if (plan.value && plan.share >= 0.6) details.push(`concentrados no plano ${plan.value}`);
    if (page.value && page.share >= 0.4) details.push(`${pct(page.share)} abertos na tela ${page.value}`);

    const confidence = clamp(0.55 + 0.12 * Math.log2(ratio) + 0.15 * Math.max(plan.share, version.share), 0.5, 0.98);
    out.push({
      id: `spike:${cat}`,
      type: 'spike',
      severity: ratio >= 3 || recent.length >= 20 ? 'critical' : 'warning',
      title: 'Um novo padrão foi identificado',
      headline: `${recent.length} tickets sobre ${topic} nas últimas ${hours} horas`,
      description: `${recent.length} tickets de ${CATEGORIES[cat].label.toLowerCase()} desde ${hours}h atrás${
        details.length ? `, ${details.join(' e ')}` : ''
      }. Volume ${fmtX(ratio)}× acima do normal.`,
      confidence: Math.round(confidence * 100) / 100,
      metrics: [
        { label: 'Últimas 24h', value: String(recent.length) },
        { label: 'Média diária', value: fmtX(baseline.length / 14) },
        { label: 'Variação', value: `${fmtX(ratio)}×` },
      ],
      ticketIds: recent.map((t) => t.id),
      suggestedAction:
        signature.value && signature.share >= 0.4
          ? `${SPIKE_ACTIONS[cat]} Erro em comum capturado pelo widget: ${signature.value}.`
          : SPIKE_ACTIONS[cat],
      category: cat,
      topic: tag.value ?? undefined,
    } as Insight & { topic?: string });
  }
  return mergeSpikesByTopic(out as (Insight & { topic?: string })[]);
}

/**
 * Picos com o mesmo tema em categorias diferentes (ex.: "boleto" em Pagamentos e em Erros)
 * são o mesmo incidente: une no pico maior e registra a divisão.
 */
function mergeSpikesByTopic(spikes: (Insight & { topic?: string })[]): Insight[] {
  const sorted = [...spikes].sort((a, b) => b.ticketIds.length - a.ticketIds.length);
  const result: (Insight & { topic?: string })[] = [];
  for (const s of sorted) {
    const host = s.topic ? result.find((r) => r.topic === s.topic) : undefined;
    if (!host) {
      result.push({ ...s });
      continue;
    }
    host.ticketIds = [...host.ticketIds, ...s.ticketIds];
    const total = host.ticketIds.length;
    host.headline = host.headline.replace(/^\d+/, String(total));
    host.description += ` Inclui ${s.ticketIds.length} chamado(s) classificados como ${CATEGORIES[s.category!].label}.`;
    host.metrics = host.metrics.map((m) => (m.label === 'Últimas 24h' ? { ...m, value: String(total) } : m));
  }
  return result.map(({ topic: _topic, ...rest }) => rest);
}

/**
 * Clientes que abriram muito mais chamados que o seu próprio normal nos últimos 7 dias,
 * um sinal clássico de risco de churn. A base é a média semanal das 3 semanas anteriores.
 */
export function detectRecurringCustomers(tickets: InsightTicket[], now: number, exclude: Set<number> = new Set()): Insight[] {
  const byCustomer = new Map<number, InsightTicket[]>();
  const history = new Map<number, number>();
  for (const t of tickets) {
    // Tickets que já fazem parte de um incidente (pico) são explicados por ele, não pelo cliente.
    if (t.customer_id == null || exclude.has(t.id)) continue;
    const age = now - Date.parse(t.created_at);
    if (age <= 7 * DAY) {
      const list = byCustomer.get(t.customer_id) ?? [];
      list.push(t);
      byCustomer.set(t.customer_id, list);
    } else if (age <= 28 * DAY) {
      history.set(t.customer_id, (history.get(t.customer_id) ?? 0) + 1);
    }
  }
  const out: Insight[] = [];
  for (const [customerId, list] of byCustomer) {
    const weeklyBaseline = (history.get(customerId) ?? 0) / 3;
    if (list.length < 5 || list.length < weeklyBaseline * 2.5) continue;
    const negative = list.filter((t) => t.sentiment === 'negative').length / list.length;
    const avgRisk = list.reduce((s, t) => s + t.churn_risk, 0) / list.length;
    const open = list.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const name = list[0].customer_name ?? `Cliente #${customerId}`;
    const plan = list[0].customer_plan;
    out.push({
      id: `recurring:${customerId}`,
      type: 'recurring_customer',
      severity: negative >= 0.5 || avgRisk >= 55 ? 'critical' : 'warning',
      title: 'Este cliente pode precisar de atenção',
      headline: `${name} abriu ${list.length} chamados em 7 dias`,
      description: `${pct(negative)} das mensagens com sentimento negativo${open === 0 ? ", todos já respondidos" : open === 1 ? " e 1 chamado ainda em aberto" : ` e ${open} chamados ainda em aberto`}${
        plan ? `. Cliente do plano ${plan}` : ''
      }. Risco médio de churn de ${Math.round(avgRisk)}%.`,
      confidence: Math.round(clamp(0.6 + list.length * 0.03 + negative * 0.2, 0.5, 0.97) * 100) / 100,
      metrics: [
        { label: 'Chamados (7d)', value: String(list.length) },
        { label: 'Média semanal', value: fmtX(weeklyBaseline) },
        { label: 'Negativos', value: pct(negative) },
        { label: 'Risco de churn', value: `${Math.round(avgRisk)}%` },
      ],
      ticketIds: list.map((t) => t.id),
      suggestedAction: 'Acionar o Customer Success para um contato proativo e revisar os chamados em conjunto.',
      customerId,
    });
  }
  return out
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.ticketIds.length - a.ticketIds.length)
    .slice(0, 3);
}

/** Agrupa chamados abertos muito parecidos (provável causa comum). */
export function detectClusters(
  tickets: InsightTicket[],
  similarity: (a: number, b: number) => number,
  exclude: Set<number>,
  threshold = 0.42,
): Insight[] {
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status) && !exclude.has(t.id)).slice(0, 400);
  const used = new Set<number>();
  const out: Insight[] = [];
  for (const seed of open) {
    if (used.has(seed.id)) continue;
    const group = [seed];
    for (const other of open) {
      if (other.id === seed.id || used.has(other.id)) continue;
      if (similarity(seed.id, other.id) >= threshold) group.push(other);
    }
    if (group.length < 4) continue;
    group.forEach((t) => used.add(t.id));
    const cat = mode(group.map((t) => t.category)).value;
    const customers = new Set(group.map((t) => t.customer_id)).size;
    out.push({
      id: `cluster:${seed.id}`,
      type: 'cluster',
      severity: group.length >= 8 ? 'warning' : 'info',
      title: 'Encontramos tickets parecidos',
      headline: `${group.length} chamados abertos parecidos com "${seed.subject}"`,
      description: `Chamados de ${customers} cliente(s) diferentes com descrição semelhante${
        cat ? `, categoria ${CATEGORIES[cat].label}` : ''
      }. Tratar em conjunto evita respostas duplicadas.`,
      confidence: Math.round(clamp(0.6 + group.length * 0.03, 0.5, 0.95) * 100) / 100,
      metrics: [
        { label: 'Chamados', value: String(group.length) },
        { label: 'Clientes', value: String(customers) },
      ],
      ticketIds: group.map((t) => t.id),
      suggestedAction: 'Agrupar os chamados e responder com uma comunicação única.',
      category: cat ?? undefined,
    });
  }
  return out.slice(0, 3);
}

/** Chamados abertos com SLA estourado ou vencendo nas próximas 2 horas. */
export function detectSlaRisk(tickets: InsightTicket[], now: number): Insight[] {
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status) && t.sla_due_at);
  const overdue = open.filter((t) => Date.parse(t.sla_due_at!) < now);
  const soon = open.filter((t) => {
    const due = Date.parse(t.sla_due_at!);
    return due >= now && due - now <= 2 * HOUR;
  });
  if (overdue.length + soon.length < 3) return [];
  const critical = [...overdue, ...soon].filter((t) => t.priority === 'critical' || t.priority === 'high').length;
  return [
    {
      id: 'sla:risk',
      type: 'sla',
      severity: overdue.length >= 5 ? 'critical' : 'warning',
      title: 'SLA em risco',
      headline: `${overdue.length} chamados com SLA estourado e ${soon.length} vencendo em até 2 horas`,
      description: `${critical} deles têm prioridade alta ou crítica. Redistribuir a fila agora reduz o impacto no CSAT.`,
      confidence: 0.99,
      metrics: [
        { label: 'Estourados', value: String(overdue.length) },
        { label: 'Vencendo (2h)', value: String(soon.length) },
      ],
      ticketIds: [...overdue, ...soon].map((t) => t.id),
      suggestedAction: 'Priorizar os chamados listados e redistribuir entre os atendentes disponíveis.',
    },
  ];
}

/** Variação da proporção de chamados negativos semana contra semana. */
export function detectSentimentShift(tickets: InsightTicket[], now: number): Insight[] {
  const week = tickets.filter((t) => now - Date.parse(t.created_at) <= 7 * DAY);
  const prev = tickets.filter((t) => {
    const age = now - Date.parse(t.created_at);
    return age > 7 * DAY && age <= 14 * DAY;
  });
  if (week.length < 30 || prev.length < 30) return [];
  const negNow = week.filter((t) => t.sentiment === 'negative').length / week.length;
  const negPrev = prev.filter((t) => t.sentiment === 'negative').length / prev.length;
  const delta = negNow - negPrev;
  if (Math.abs(delta) < 0.06) return [];
  const worse = delta > 0;
  return [
    {
      id: 'sentiment:week',
      type: 'sentiment',
      severity: worse ? 'warning' : 'info',
      title: worse ? 'O sentimento dos clientes piorou' : 'O sentimento dos clientes melhorou',
      headline: `Chamados negativos ${worse ? 'subiram' : 'caíram'} de ${pct(negPrev)} para ${pct(negNow)} na semana`,
      description: worse
        ? 'A piora coincide com o aumento de chamados recentes. Vale revisar as respostas e a comunicação ativa.'
        : 'As ações recentes parecem estar surtindo efeito na percepção dos clientes.',
      confidence: Math.round(clamp(0.7 + Math.abs(delta), 0.5, 0.95) * 100) / 100,
      metrics: [
        { label: 'Semana atual', value: pct(negNow) },
        { label: 'Semana anterior', value: pct(negPrev) },
      ],
      ticketIds: week.filter((t) => t.sentiment === 'negative').map((t) => t.id),
      suggestedAction: worse
        ? 'Revisar os chamados negativos da semana e alinhar o discurso com o time.'
        : 'Registrar o que funcionou e transformar em prática padrão.',
    },
  ];
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

export function detectInsights(
  tickets: InsightTicket[],
  similarity: (a: number, b: number) => number,
  now = Date.now(),
): Insight[] {
  const spikes = detectSpikes(tickets, now);
  const inSpikes = new Set(spikes.flatMap((s) => s.ticketIds));
  const insights = [
    ...spikes,
    ...detectRecurringCustomers(tickets, now, inSpikes),
    ...detectSlaRisk(tickets, now),
    ...detectClusters(tickets, similarity, inSpikes),
    ...detectSentimentShift(tickets, now),
  ];
  return insights.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence - a.confidence,
  );
}
