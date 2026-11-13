import { fileURLToPath } from 'node:url';
import { ai } from '../ai/index.js';
import { hashPassword } from '../auth.js';
import type { TicketContext } from '../context.js';
import type { CategoryKey, Channel, Priority, Status } from '../domain.js';
import { addEvent, addMessage, buildAnalysisInput, insertTicket } from '../services/tickets.js';
import { db, migrate, nowIso, run, setMeta, tx } from './database.js';
import {
  CUSTOMERS,
  DEMO_PASSWORD,
  FIRST_NAMES,
  KB_ARTICLES,
  LAST_NAMES,
  MODULES,
  SPIKE_TEMPLATES,
  TEMPLATES,
  TONES,
  USERS,
  type TicketTemplate,
} from './seedData.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BRT_OFFSET = 3 * HOUR; // Brasília = UTC-3

/** PRNG determinístico (mulberry32), para o seed ser reproduzível. */
function createRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDatabase(opts: { quiet?: boolean } = {}) {
  const log = (msg: string) => !opts.quiet && console.log(msg);
  const started = Date.now();
  const rand = createRng(20261110);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const weighted = <T extends string>(weights: Record<T, number>): T => {
    const entries = Object.entries(weights) as [T, number][];
    let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) if ((r -= w) <= 0) return k;
    return entries[0][0];
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  migrate();

  tx(() => {
    for (const table of ['ticket_events', 'ticket_messages', 'tickets', 'kb_articles', 'customers', 'users', 'meta']) {
      db.exec(`DELETE FROM ${table}`);
    }
    db.exec(`DELETE FROM sqlite_sequence`);
    // Numeração de chamados começa em #48000, como no brand book.
    db.exec(`INSERT INTO sqlite_sequence(name, seq) VALUES('tickets', 47999)`);

    const now = Date.now();
    const created = new Date(now - 400 * DAY).toISOString();

    // ---- Equipe
    const passwordHash = hashPassword(DEMO_PASSWORD);
    const agents: { id: number; name: string }[] = [];
    for (const u of USERS) {
      const r = run(
        'INSERT INTO users(name, email, password_hash, role, title, created_at) VALUES(?, ?, ?, ?, ?, ?)',
        u.name,
        u.email,
        passwordHash,
        u.role,
        u.title,
        created,
      );
      if (u.role === 'agent') agents.push({ id: Number(r.lastInsertRowid), name: u.name });
    }

    // ---- Clientes
    const customers = CUSTOMERS.map((c) => {
      const r = run(
        'INSERT INTO customers(name, plan, segment, mrr, domain, created_at) VALUES(?, ?, ?, ?, ?, ?)',
        c.name,
        c.plan,
        c.segment,
        c.mrr,
        c.domain,
        created,
      );
      return { ...c, id: Number(r.lastInsertRowid) };
    });

    // ---- Base de conhecimento
    for (const a of KB_ARTICLES) {
      run(
        'INSERT INTO kb_articles(title, category, body, tags, views, helpful, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
        a.title,
        a.category,
        a.body,
        a.tags,
        Math.floor(80 + rand() * 900),
        Math.floor(10 + rand() * 120),
        created,
        created,
      );
    }
    ai.refreshKnowledgeBase();
    ai.retrain();

    // ---- Geração de chamados
    interface Draft {
      at: number;
      category: CategoryKey;
      template: TicketTemplate;
      customer: (typeof customers)[number];
      tone: 'angry' | 'urgent' | 'polite';
      version: string;
      channel: Channel;
      kind: 'normal' | 'spike' | 'recurring';
    }
    const drafts: Draft[] = [];
    const categoryWeights: Record<CategoryKey, number> = {
      pagamentos: 30, acesso: 22, integracoes: 17, performance: 13, bugs: 10, duvidas: 8,
    };
    const channelWeights: Record<Channel, number> = { widget: 28, email: 28, portal: 12, chat: 14, whatsapp: 11, phone: 7 };
    // Distribuição por hora (horário de Brasília): pico entre 9h e 18h.
    const hourWeights = [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 1.2, 3, 5, 6, 5.5, 3.5, 4.5, 5.5, 5.5, 5, 4, 2.5, 1.5, 1, 0.8, 0.5, 0.3];
    const hourTotal = hourWeights.reduce((a, b) => a + b, 0);
    const pickHour = () => {
      let r = rand() * hourTotal;
      for (let h = 0; h < 24; h++) if ((r -= hourWeights[h]) <= 0) return h;
      return 12;
    };
    const versionFor = (daysAgo: number) => (daysAgo > 45 ? '4.0' : daysAgo > 3 ? '4.1' : rand() < 0.7 ? '4.2' : '4.1');

    const nowBrt = new Date(now - BRT_OFFSET);
    for (let d = 89; d >= 0; d--) {
      const local = new Date(Date.UTC(nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate() - d));
      const dayStartUtc = local.getTime() + BRT_OFFSET;
      const weekday = local.getUTCDay();
      const weekdayFactor = weekday === 0 ? 0.3 : weekday === 6 ? 0.4 : 1;
      const volume = Math.round((17 + (89 - d) * 0.1) * weekdayFactor * (0.8 + rand() * 0.4));
      for (let i = 0; i < volume; i++) {
        const at = dayStartUtc + pickHour() * HOUR + Math.floor(rand() * HOUR);
        if (at > now - 5 * 60_000) continue;
        const category = weighted(categoryWeights);
        drafts.push({
          at,
          category,
          template: pick(TEMPLATES[category]),
          customer: pick(customers),
          tone: rand() < 0.22 ? 'angry' : rand() < 0.15 ? 'urgent' : 'polite',
          version: versionFor(d),
          channel: weighted(channelWeights),
          kind: 'normal',
        });
      }
    }

    // Pico planejado: falha de boleto após a versão 4.2, concentrada no plano Pro.
    const proCustomers = customers.filter((c) => c.plan === 'Pro');
    for (let i = 0; i < 38; i++) {
      drafts.push({
        at: now - Math.floor(rand() * 20 * HOUR) - 10 * 60_000,
        category: 'pagamentos',
        template: pick(SPIKE_TEMPLATES),
        customer: rand() < 0.9 ? pick(proCustomers) : pick(customers),
        tone: rand() < 0.35 ? 'angry' : rand() < 0.4 ? 'urgent' : 'polite',
        version: '4.2',
        channel: rand() < 0.8 ? 'widget' : weighted(channelWeights),
        kind: 'spike',
      });
    }

    // Cliente recorrente e insatisfeito.
    const kora = customers.find((c) => c.name === 'Kora Fintech')!;
    for (let i = 0; i < 9; i++) {
      const category = pick(['integracoes', 'integracoes', 'pagamentos', 'performance'] as CategoryKey[]);
      drafts.push({
        at: now - Math.floor(rand() * 6 * DAY) - HOUR,
        category,
        template: pick(TEMPLATES[category]),
        customer: kora,
        tone: rand() < 0.7 ? 'angry' : 'urgent',
        version: rand() < 0.5 ? '4.2' : '4.1',
        channel: weighted(channelWeights),
        kind: 'recurring',
      });
    }

    drafts.sort((a, b) => a.at - b.at);

    const fill = (s: string, c: Draft) =>
      s
        .replace(/\{plano\}/g, c.customer.plan)
        .replace(/\{modulo\}/g, pick(MODULES))
        .replace(/\{versao\}/g, c.version)
        .replace(/\{n\}/g, String(2 + Math.floor(rand() * 8)));

    // Contexto técnico que o widget capturaria dentro do Kairo ERP (sistema fictício que usa a SENTRIA).
    const PAGES: Record<CategoryKey, { path: string; title: string }[]> = {
      pagamentos: [{ path: '/financeiro/faturas', title: 'Faturas' }, { path: '/financeiro/assinatura', title: 'Assinatura e plano' }],
      acesso: [{ path: '/configuracoes/usuarios', title: 'Usuários e permissões' }, { path: '/perfil/seguranca', title: 'Segurança da conta' }],
      integracoes: [{ path: '/integracoes/webhooks', title: 'Webhooks' }, { path: '/integracoes/api', title: 'Chaves de API' }],
      performance: [{ path: '/relatorios/vendas', title: 'Relatório de vendas' }, { path: '/dashboard', title: 'Dashboard' }],
      bugs: [{ path: '/cadastros/clientes', title: 'Cadastro de clientes' }, { path: '/vendas/pedidos', title: 'Pedidos' }],
      duvidas: [{ path: '/relatorios', title: 'Relatórios' }, { path: '/configuracoes/notificacoes', title: 'Notificações' }],
    };
    const BROWSERS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    ];
    const buildContext = (d: Draft, name: string, mail: string): TicketContext => {
      const page = d.kind === 'spike' ? PAGES.pagamentos[0] : pick(PAGES[d.category]);
      const at = new Date(d.at - 40_000).toISOString();
      const errors: NonNullable<TicketContext['errors']> = [];
      if (d.kind === 'spike') {
        errors.push({ type: 'http', method: 'POST', url: '/api/boletos', status: 500, message: 'Falha ao gerar boleto: serviço de cobrança indisponível (BILL-500).', at });
      } else if (d.category === 'integracoes' && rand() < 0.5) {
        errors.push({ type: 'http', method: 'POST', url: '/api/webhooks/test', status: 500, message: 'Internal Server Error', at });
      } else if (d.category === 'performance' && rand() < 0.5) {
        errors.push({ type: 'http', method: 'GET', url: '/api/relatorios/vendas', status: 504, message: 'Gateway Timeout', at });
      } else if (d.category === 'bugs' && rand() < 0.5) {
        errors.push({ type: 'js', message: "TypeError: Cannot read properties of undefined (reading 'id')", at });
      }
      return {
        source: 'widget',
        trigger: errors.length && rand() < 0.65 ? 'error' : 'manual',
        app: { name: 'Kairo ERP', version: d.version },
        page: { path: page.path, title: page.title, url: `https://app.kairo.com.br${page.path}` },
        user: { name, email: mail, company: d.customer.name, plan: d.customer.plan },
        browser: { userAgent: pick(BROWSERS), language: 'pt-BR', screen: pick(['1920x1080', '1366x768', '1536x864', '2560x1440']), timezone: 'America/Sao_Paulo' },
        errors,
        breadcrumbs: [
          { type: 'nav', label: 'Dashboard' },
          { type: 'nav', label: page.title },
          ...(d.kind === 'spike' ? [{ type: 'click' as const, label: 'Gerar boleto' }] : []),
          ...errors.map((e) => ({ type: 'error' as const, label: e.type === 'http' ? `${e.method} ${e.url} → ${e.status}` : e.message })),
        ],
      };
    };

    const resolutionBase: Record<Priority, number> = { critical: 3, high: 7, medium: 16, low: 30 };
    let humanReviewed = 0;

    for (const draft of drafts) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const requesterName = `${first} ${last}`;
      const email = `${first}.${last}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .concat(`@${draft.customer.domain}`);
      const subject = fill(draft.template.subject, draft);
      let body = fill(draft.template.body, draft);
      if (draft.tone === 'angry') body += pick(TONES.angry);
      else if (draft.tone === 'urgent') body += pick(TONES.urgent);
      else body += pick(TONES.polite);
      const description = `${pick(TONES.greeting)}${body}`.trim();
      const createdAt = new Date(draft.at).toISOString();
      const ageHours = (now - draft.at) / HOUR;
      const daysAgo = ageHours / 24;

      const context = draft.channel === 'widget' ? buildContext(draft, requesterName, email) : null;
      const analysis = ai.analyzeLocal(
        buildAnalysisInput({
          subject,
          description,
          requesterName,
          customerId: draft.customer.id,
          productVersion: draft.version,
          context,
        }),
      );

      // Uma parte dos chamados simples do portal é resolvida pela própria IA (artigo sugerido).
      const deflected =
        draft.kind === 'normal' &&
        (draft.channel === 'portal' || draft.channel === 'widget') &&
        (draft.category === 'duvidas' || draft.category === 'acesso') &&
        rand() < 0.35;

      const id = insertTicket(
        {
          subject,
          description,
          requesterName,
          requesterEmail: email,
          customerId: draft.customer.id,
          channel: draft.channel,
          productVersion: draft.version,
          origin: 'seed',
          createdAt,
          status: deflected ? 'resolved' : 'new',
          resolvedByAi: deflected,
          context,
        },
        draft.customer.id,
        analysis,
      );
      if (deflected) continue;

      // ---- Ciclo de vida simulado
      // A operação melhora ao longo do tempo (resolução mais rápida nos dias recentes).
      const trend = 1 + (daysAgo / 90) * 0.45;
      const resolutionHours = Math.max(
        0.4,
        resolutionBase[analysis.priority] * trend * Math.exp(gauss() * 0.55) * (draft.category === 'performance' ? 1.2 : 1),
      );
      const firstResponseHours = Math.min(resolutionHours * 0.4, 0.08 + rand() * 2.5 * trend);

      let status: Status = 'new';
      let resolvedAt: string | null = null;
      let firstResponseAt: string | null = null;
      if (draft.kind === 'spike') {
        status = rand() < 0.65 ? 'new' : 'in_progress';
      } else if (ageHours > resolutionHours) {
        status = ageHours > resolutionHours + 72 && rand() < 0.5 ? 'closed' : 'resolved';
        resolvedAt = new Date(draft.at + resolutionHours * HOUR).toISOString();
      } else if (ageHours > firstResponseHours) {
        status = rand() < 0.2 ? 'waiting' : 'in_progress';
      }
      if (status !== 'new') firstResponseAt = new Date(draft.at + firstResponseHours * HOUR).toISOString();

      const assignee = status === 'new' ? null : pick(agents);
      const slaHours = { critical: 4, high: 8, medium: 24, low: 48 }[analysis.priority];
      const breached = resolvedAt ? resolutionHours > slaHours : false;

      let csat: number | null = null;
      if (resolvedAt && rand() < 0.7) {
        const base = 4.75 - (analysis.sentiment === 'negative' ? 0.7 : 0) - (breached ? 0.9 : 0) + gauss() * 0.45;
        csat = Math.max(1, Math.min(5, Math.round(base)));
      }

      // Parte dos chamados resolvidos teve a categoria revisada por uma pessoa (verdade conhecida).
      const reviewed = resolvedAt !== null && rand() < 0.4;
      if (reviewed) humanReviewed++;

      run(
        `UPDATE tickets SET status = ?, assignee_id = ?, first_response_at = ?, resolved_at = ?, csat = ?,
           category = ?, category_source = ?, updated_at = ?
         WHERE id = ?`,
        status,
        assignee?.id ?? null,
        firstResponseAt,
        resolvedAt,
        csat,
        reviewed ? draft.category : analysis.category,
        reviewed ? 'human' : 'ai',
        resolvedAt ?? firstResponseAt ?? createdAt,
        id,
      );

      // Histórico detalhado só para os últimos 30 dias (mantém o banco leve).
      if (daysAgo <= 30 && assignee && firstResponseAt) {
        addEvent(id, 'assigned', 'Sistema', { assignee: assignee.name }, firstResponseAt);
        // Taxa de aceitação simulada: a maioria usa a sugestão da IA; parte envia sem editar.
        const used = rand() < 0.74;
        const verbatim = used && rand() < 0.48;
        addMessage(
          id,
          'agent',
          assignee.name,
          used ? analysis.suggestedReply + (verbatim ? '' : '\n\nQualquer dúvida, estou à disposição.') : `Olá, ${first}! Estamos verificando o seu caso e retornamos em breve.\n\nEquipe de Suporte`,
          false,
          firstResponseAt,
        );
        addEvent(id, 'reply', assignee.name, { usedSuggestion: used, verbatim }, firstResponseAt);
        if (resolvedAt) {
          addMessage(
            id,
            'agent',
            assignee.name,
            `Olá, ${first}! O ajuste foi concluído e o problema não deve mais ocorrer. Se precisar de algo, é só responder por aqui.\n\nEquipe de Suporte`,
            false,
            resolvedAt,
          );
          addEvent(id, 'status_changed', assignee.name, { from: 'in_progress', to: status }, resolvedAt);
          if (rand() < 0.4) {
            addMessage(id, 'customer', requesterName, 'Funcionou, obrigado pelo retorno rápido!', false, new Date(Date.parse(resolvedAt) + HOUR).toISOString());
          }
        }
      }
    }

    setMeta('seeded_at', nowIso());
    log(
      `✔ ${drafts.length} chamados, ${customers.length} clientes, ${USERS.length} usuários e ${KB_ARTICLES.length} artigos (${humanReviewed} revisados por pessoas).`,
    );
  });

  ai.retrain();
  ai.invalidateTickets();
  log(`✔ Seed concluído em ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

// Execução direta: `npm run seed`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('Gerando dados de demonstração da SENTRIA...');
  seedDatabase();
  console.log(`\nLogin de demonstração: marina@sentria.demo / ${DEMO_PASSWORD}`);
}
