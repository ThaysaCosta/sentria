import { describe, expect, it } from 'vitest';
import { detectClusters, detectInsights, detectRecurringCustomers, detectSlaRisk, detectSpikes, type InsightTicket } from '../src/ai/insights.js';
import type { CategoryKey } from '../src/domain.js';

const NOW = Date.parse('2026-11-10T15:00:00.000Z');
const HOUR = 3_600_000;
let nextId = 1;

function ticket(partial: Partial<InsightTicket> & { hoursAgo: number }): InsightTicket {
  const { hoursAgo, ...rest } = partial;
  return {
    id: nextId++,
    subject: 'Chamado',
    category: 'pagamentos',
    status: 'resolved',
    priority: 'medium',
    sentiment: 'neutral',
    customer_id: 1,
    customer_name: 'Cliente',
    customer_plan: 'Pro',
    product_version: '4.1',
    tags: [],
    churn_risk: 20,
    created_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    sla_due_at: null,
    ...rest,
  };
}

/** 14 dias de volume normal: 2 chamados por dia em cada categoria. */
function baseline(categories: CategoryKey[] = ['pagamentos', 'acesso']) {
  const out: InsightTicket[] = [];
  for (let day = 2; day <= 15; day++) {
    for (const category of categories) {
      out.push(ticket({ hoursAgo: day * 24, category, customer_id: 100 + day }));
      out.push(ticket({ hoursAgo: day * 24 + 3, category, customer_id: 200 + day }));
    }
  }
  return out;
}

describe('detecção de picos', () => {
  it('identifica pico de boleto concentrado em uma versão e plano', () => {
    const spike = Array.from({ length: 20 }, (_, i) =>
      ticket({ hoursAgo: i * 0.8, product_version: '4.2', tags: ['boleto'], status: 'new', customer_id: 300 + i }),
    );
    const [insight] = detectSpikes([...baseline(), ...spike], NOW);
    expect(insight.type).toBe('spike');
    expect(insight.category).toBe('pagamentos');
    expect(insight.ticketIds).toHaveLength(20);
    expect(insight.headline).toContain('boleto');
    expect(insight.description).toContain('versão 4.2');
    expect(insight.description).toContain('plano Pro');
  });

  it('não alarma com volume normal', () => {
    const today = Array.from({ length: 2 }, (_, i) => ticket({ hoursAgo: i + 1 }));
    expect(detectSpikes([...baseline(), ...today], NOW)).toHaveLength(0);
  });

  it('une picos do mesmo tema em categorias diferentes', () => {
    const a = Array.from({ length: 15 }, (_, i) => ticket({ hoursAgo: i, tags: ['boleto'], customer_id: 400 + i }));
    const b = Array.from({ length: 9 }, (_, i) => ticket({ hoursAgo: i, category: 'bugs', tags: ['boleto'], customer_id: 500 + i }));
    const spikes = detectSpikes([...baseline(['pagamentos', 'bugs']), ...a, ...b], NOW);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].ticketIds).toHaveLength(24);
    expect(spikes[0].description).toContain('Erros no sistema');
  });
});

describe('cliente recorrente', () => {
  it('alerta quando o cliente foge muito do próprio normal', () => {
    const history = Array.from({ length: 3 }, (_, i) => ticket({ hoursAgo: (8 + i * 5) * 24, customer_id: 7 }));
    const burst = Array.from({ length: 8 }, (_, i) => ticket({ hoursAgo: i * 12, customer_id: 7, sentiment: 'negative', customer_name: 'Kora' }));
    const [insight] = detectRecurringCustomers([...history, ...burst], NOW);
    expect(insight.customerId).toBe(7);
    expect(insight.severity).toBe('critical');
  });

  it('não conta tickets que já fazem parte de um incidente detectado', () => {
    const burst = Array.from({ length: 8 }, (_, i) => ticket({ hoursAgo: i * 12, customer_id: 8 }));
    expect(detectRecurringCustomers(burst, NOW)).toHaveLength(1);
    expect(detectRecurringCustomers(burst, NOW, new Set(burst.map((t) => t.id)))).toHaveLength(0);
  });

  it('ignora cliente que sempre teve volume alto', () => {
    const history = Array.from({ length: 30 }, (_, i) => ticket({ hoursAgo: (7.5 + i * 0.6) * 24, customer_id: 9 }));
    const week = Array.from({ length: 9 }, (_, i) => ticket({ hoursAgo: i * 12, customer_id: 9 }));
    expect(detectRecurringCustomers([...history, ...week], NOW)).toHaveLength(0);
  });
});

describe('SLA e grupos', () => {
  it('conta chamados estourados e vencendo', () => {
    const tickets = [
      ticket({ hoursAgo: 10, status: 'new', sla_due_at: new Date(NOW - 2 * HOUR).toISOString(), priority: 'critical' }),
      ticket({ hoursAgo: 10, status: 'in_progress', sla_due_at: new Date(NOW - HOUR).toISOString() }),
      ticket({ hoursAgo: 3, status: 'new', sla_due_at: new Date(NOW + HOUR).toISOString() }),
      ticket({ hoursAgo: 3, status: 'resolved', sla_due_at: new Date(NOW - HOUR).toISOString() }),
    ];
    const [insight] = detectSlaRisk(tickets, NOW);
    expect(insight.metrics[0].value).toBe('2');
    expect(insight.metrics[1].value).toBe('1');
  });

  it('agrupa chamados abertos semelhantes', () => {
    const open = Array.from({ length: 5 }, (_, i) => ticket({ hoursAgo: i, status: 'new', customer_id: i }));
    const other = ticket({ hoursAgo: 1, status: 'new' });
    const similar = (a: number, b: number) => (a === other.id || b === other.id ? 0.1 : 0.8);
    const [cluster] = detectClusters([...open, other], similar, new Set());
    expect(cluster.ticketIds).toHaveLength(5);
    expect(cluster.ticketIds).not.toContain(other.id);
  });

  it('ordena insights por severidade', () => {
    const spike = Array.from({ length: 25 }, (_, i) => ticket({ hoursAgo: i * 0.5, tags: ['boleto'], customer_id: 600 + i }));
    const insights = detectInsights([...baseline(), ...spike], () => 0, NOW);
    expect(insights[0].severity).toBe('critical');
  });
});
