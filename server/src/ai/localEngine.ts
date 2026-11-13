import { CATEGORIES, type CategoryKey, type Priority, type Sentiment } from '../domain.js';
import type { NaiveBayesClassifier } from './classifier.js';
import { normalize, sentences, tokenize, words } from './text.js';

export interface AnalysisInput {
  subject: string;
  description: string;
  requesterName?: string | null;
  customerName?: string | null;
  customerPlan?: string | null;
  /** Chamados do mesmo cliente nos últimos 7 dias (sem contar este). */
  customerRecentTickets?: number;
  productVersion?: string | null;
  /** Resumo do contexto técnico capturado pelo widget (tela, erros). */
  technicalContext?: string | null;
}

export interface KbRef {
  id: number;
  title: string;
  category: string;
  score: number;
}

export interface Analysis {
  category: CategoryKey;
  confidence: number;
  ranking: { category: CategoryKey; probability: number }[];
  priority: Priority;
  sentiment: Sentiment;
  sentimentScore: number;
  summary: string;
  suggestedReply: string;
  tags: string[];
  /** Motivos legíveis que explicam a prioridade e o risco (IA explicável). */
  signals: string[];
  churnRisk: number;
  kbArticles: KbRef[];
  engine: 'local' | 'claude';
  model: string;
  /** Preenchido quando o Claude foi tentado e o sistema voltou ao motor local. */
  fallbackReason?: string;
}

// ---------------------------------------------------------------- Sentimento

const NEGATIVE: Record<string, number> = {
  absurdo: 2.5, absurda: 2.5, inaceitavel: 3, pessimo: 3, pessima: 3, horrivel: 3, ridiculo: 2.5, vergonha: 2.5,
  descaso: 2.5, revoltado: 3, revoltante: 3, indignado: 3, frustrado: 2, frustrante: 2, decepcionado: 2,
  decepcao: 2, insatisfeito: 2, cansado: 1.5, raiva: 2.5, prejuizo: 2, prejuizos: 2, perdendo: 1.5, perdemos: 1.5,
  parado: 1.5, parada: 1.5, travado: 1.2, travando: 1.2, caiu: 1.2, urgente: 1.2, urgencia: 1.2, grave: 1.5,
  critico: 1.5, demora: 1, demorando: 1, lento: 0.8, lenta: 0.8, nunca: 1, ninguem: 1.2, cancelar: 2,
  cancelamento: 2, multa: 1.5, erro: 0.5, falha: 0.6, problema: 0.5, problemas: 0.5, impossivel: 1.5,
  novamente: 0.6, denovo: 0.8, piorou: 1.5, ruim: 1.5, desrespeito: 2.5, procon: 3, processo: 0.5,
};

const POSITIVE: Record<string, number> = {
  obrigado: 1, obrigada: 1, agradeco: 1.2, agradecemos: 1.2, otimo: 1.5, otima: 1.5, excelente: 2, parabens: 2,
  perfeito: 1.5, maravilha: 1.5, adorei: 2, adoramos: 2, gostamos: 1, rapido: 0.8, rapida: 0.8, eficiente: 1.2,
  resolvido: 1, resolveu: 1, funcionou: 1, bom: 0.6, boa: 0.6, satisfeito: 1.5, top: 1, show: 1, elogio: 2,
  sugestao: 0.4, gentileza: 0.6,
};

const NEGATORS = new Set(['nao', 'nem', 'nunca', 'jamais', 'sem']);
const INTENSIFIERS = new Set(['muito', 'super', 'extremamente', 'totalmente', 'completamente', 'demais']);

export function analyzeSentiment(text: string): { sentiment: Sentiment; score: number } {
  const ws = words(text);
  let score = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const neg = NEGATIVE[w];
    const pos = POSITIVE[w];
    if (!neg && !pos) continue;
    const prev = ws.slice(Math.max(0, i - 2), i);
    const negated = prev.some((p) => NEGATORS.has(p));
    const boost = prev.some((p) => INTENSIFIERS.has(p)) ? 1.5 : 1;
    if (pos) score += (negated ? -0.8 * pos : pos) * boost;
    if (neg) score -= neg * boost;
  }
  // Sinais tipográficos de frustração.
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations >= 2) score -= Math.min(2, exclamations * 0.4);
  const capsWords = text.split(/\s+/).filter((w) => w.length > 3 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]+$/.test(w)).length;
  if (capsWords >= 2) score -= Math.min(2, capsWords * 0.5);

  // Normaliza para [-1, 1] considerando o tamanho do texto.
  const normalized = Math.max(-1, Math.min(1, score / Math.max(3, Math.sqrt(ws.length) * 1.4)));
  const rounded = Math.round(normalized * 100) / 100;
  const sentiment: Sentiment = rounded <= -0.2 ? 'negative' : rounded >= 0.2 ? 'positive' : 'neutral';
  return { sentiment, score: rounded };
}

// ---------------------------------------------------------------- Prioridade e risco

const URGENCY_PATTERNS: { re: RegExp; weight: number; signal: string }[] = [
  { re: /\b(urgente|urgencia|emergencia|asap)\b/, weight: 1.5, signal: 'Linguagem de urgência' },
  { re: /\b(parad[oa]|fora do ar|caiu|indisponivel|nao abre|nao carrega)\b/, weight: 2, signal: 'Operação parada ou indisponível' },
  { re: /\b(producao|todos os usuarios|toda a equipe|ninguem consegue|nenhum usuario|empresa inteira)\b/, weight: 2, signal: 'Impacto amplo (vários usuários)' },
  { re: /\b(prejuizo|multa|prazo|fechamento|folha de pagamento|auditoria|faturamento|vencimento|vence (hoje|amanha))\b/, weight: 1.5, signal: 'Risco financeiro ou de prazo' },
  { re: /\b(nao consigo|impossivel|bloquead[oa]|impedid[oa]|suspens[aã]o)\b/, weight: 1, signal: 'Cliente bloqueado na tarefa' },
  { re: /\b(erro|falha|nao funciona|parou|nao (e|esta) (gerad|enviad|salv)|nao aparece|nao chega)\w*/, weight: 0.8, signal: 'Falha funcional relatada' },
  { re: /\b(vazamento|dados de outro|seguranca|invadid|lgpd)\b/, weight: 2.5, signal: 'Possível incidente de segurança/dados' },
];

const CHURN_PATTERNS: { re: RegExp; weight: number; signal: string }[] = [
  { re: /\b(cancelar|cancelamento|rescindir|rescisao|encerrar o contrato)\b/, weight: 30, signal: 'Menciona cancelamento' },
  { re: /\b(concorrente|outro fornecedor|trocar de sistema|migrar para outra)\b/, weight: 20, signal: 'Avalia concorrentes' },
  { re: /\b(procon|advogado|juridico|processo judicial|reclame aqui)\b/, weight: 25, signal: 'Ameaça de escalonamento externo' },
  { re: /\b(de novo|novamente|mais uma vez|outra vez|sempre a mesma|ja abri)\b/, weight: 10, signal: 'Problema recorrente' },
];

const PLAN_WEIGHT: Record<string, number> = { Enterprise: 1.5, Business: 1, Pro: 0.5, Starter: 0 };
const CATEGORY_WEIGHT: Record<CategoryKey, number> = {
  performance: 0.8, integracoes: 0.6, acesso: 0.6, pagamentos: 0.5, bugs: 0.5, duvidas: -0.8,
};

function scorePriority(text: string, category: CategoryKey, sentimentScore: number, plan?: string | null, technicalError = false) {
  const norm = normalize(text);
  const signals: string[] = [];
  let points = CATEGORY_WEIGHT[category];
  if (technicalError) {
    points += 1.2;
    signals.push('Erro técnico capturado automaticamente');
  }
  for (const p of URGENCY_PATTERNS) {
    if (p.re.test(norm)) {
      points += p.weight;
      signals.push(p.signal);
    }
  }
  if (sentimentScore <= -0.5) {
    points += 1.2;
    signals.push('Sentimento muito negativo');
  } else if (sentimentScore <= -0.2) {
    points += 0.5;
  }
  if (plan && PLAN_WEIGHT[plan]) {
    points += PLAN_WEIGHT[plan];
    if (PLAN_WEIGHT[plan] >= 1) signals.push(`Cliente do plano ${plan}`);
  }
  const priority: Priority = points >= 5 ? 'critical' : points >= 3 ? 'high' : points >= 1.2 ? 'medium' : 'low';
  return { priority, signals, points };
}

function scoreChurn(text: string, sentimentScore: number, priority: Priority, recent = 0, plan?: string | null) {
  const norm = normalize(text);
  const signals: string[] = [];
  let risk = 8;
  for (const p of CHURN_PATTERNS) {
    if (p.re.test(norm)) {
      risk += p.weight;
      signals.push(p.signal);
    }
  }
  risk += Math.max(0, -sentimentScore) * 30;
  risk += { low: 0, medium: 5, high: 12, critical: 20 }[priority];
  if (recent >= 7) {
    risk += Math.min(25, (recent - 4) * 3);
    signals.push(`${recent} chamados do cliente nos últimos 7 dias`);
  }
  if (plan === 'Enterprise' || plan === 'Business') risk += 5;
  return { churnRisk: Math.round(Math.max(0, Math.min(98, risk))), signals };
}

// ---------------------------------------------------------------- Tags e resumo

const TAG_DICTIONARY: { re: RegExp; tag: string }[] = [
  { re: /\bboleto/, tag: 'boleto' }, { re: /\bpix\b/, tag: 'pix' }, { re: /cartao/, tag: 'cartão' },
  { re: /nota fiscal|\bnfs?-?e?\b/, tag: 'nota fiscal' }, { re: /\bfaturas?\b/, tag: 'fatura' }, { re: /reembolso|estorno/, tag: 'reembolso' },
  { re: /upgrade|mudanca de plano|troca de plano/, tag: 'mudança de plano' }, { re: /\bsso\b|saml|azure ad|okta/, tag: 'SSO' },
  { re: /senha/, tag: 'senha' }, { re: /dois fatores|2fa|autenticador/, tag: '2FA' }, { re: /permiss/, tag: 'permissões' },
  { re: /webhook/, tag: 'webhook' }, { re: /\bapi\b/, tag: 'API' }, { re: /\berp\b/, tag: 'ERP' }, { re: /token/, tag: 'token' },
  { re: /\b(429|rate limit|limite de requisi)/, tag: 'rate limit' }, { re: /\b5\d\d\b/, tag: 'erro 5xx' },
  { re: /lent[oa]|lentidao|demor/, tag: 'lentidão' }, { re: /timeout|504/, tag: 'timeout' }, { re: /relatorio/, tag: 'relatório' },
  { re: /dashboard|painel/, tag: 'dashboard' }, { re: /export/, tag: 'exportação' }, { re: /import/, tag: 'importação' },
  { re: /aplicativo|\bapp\b|celular|mobile/, tag: 'mobile' }, { re: /atualizacao|nova versao/, tag: 'pós-atualização' },
  { re: /treinamento|tutorial/, tag: 'treinamento' }, { re: /sugest|funcionalidade/, tag: 'sugestão' },
];

export function extractTags(text: string, version?: string | null): string[] {
  const norm = normalize(text);
  const tags = TAG_DICTIONARY.filter((t) => t.re.test(norm)).map((t) => t.tag);
  const v = version ?? text.match(/\b(?:v(?:ers[aã]o)?\s?)?(\d+\.\d+(?:\.\d+)?)\b/i)?.[1];
  if (v && /^\d+\.\d+/.test(v)) tags.push(`v${v}`);
  return [...new Set(tags)].slice(0, 6);
}

export function summarize(subject: string, description: string, requester?: string | null): string {
  const sents = sentences(description);
  const subjectTokens = new Set(tokenize(subject));
  let best = sents[0] ?? subject;
  let bestScore = -1;
  sents.forEach((s, i) => {
    const toks = tokenize(s);
    if (toks.length < 3) return;
    const overlap = toks.filter((t) => subjectTokens.has(t)).length;
    const informative = /erro|nao|desde|apos|todos|sempre|falha/i.test(normalize(s)) ? 0.5 : 0;
    const score = overlap * 2 + informative + (i === 0 ? 1.5 : 0) - Math.max(0, toks.length - 30) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  });
  const clean = best.replace(/\s+/g, ' ').replace(/^(ol[aá]|oi|bom dia|boa tarde|boa noite)[,!.\s]*/i, '').trim();
  const clipped = clean.length > 180 ? `${clean.slice(0, 177).trimEnd()}…` : clean;
  const who = requester?.split(' ')[0];
  return who ? `${who} relata: ${clipped}` : clipped;
}

// ---------------------------------------------------------------- Resposta sugerida

const REPLY_BODY: Record<CategoryKey, string> = {
  pagamentos:
    'Já verificamos o histórico financeiro da sua conta. Para agilizar, confirme por favor o número da fatura ou o CNPJ cadastrado. Assim que a conferência terminar, enviamos o documento corrigido ou a nova via para o e-mail do financeiro.',
  acesso:
    'Por segurança, não alteramos credenciais por este canal. Você pode redefinir o acesso pelo link "Esqueci a senha" na tela de login. Se a conta usa SSO, peça ao administrador da sua empresa para confirmar se o seu usuário está ativo no provedor de identidade.',
  integracoes:
    'Para investigar, precisamos do horário aproximado das falhas, do endpoint chamado e do ID de requisição retornado no cabeçalho "x-request-id". Com isso conseguimos localizar as chamadas nos nossos registros e identificar a causa.',
  performance:
    'Nosso time técnico já está analisando o tempo de resposta do seu ambiente. Enquanto isso, filtros com períodos menores e a limpeza do cache do navegador costumam reduzir a lentidão. Avisaremos por aqui assim que houver uma atualização.',
  bugs:
    'Conseguimos registrar o comportamento descrito. Para reproduzir o erro, envie por favor um print da tela e os passos realizados até ele aparecer. Se houver uma mensagem de erro, copie o texto completo.',
  duvidas:
    'Separamos abaixo o material que explica o passo a passo. Se preferir, podemos agendar uma conversa rápida com o nosso time de sucesso do cliente para configurar junto com você.',
};

export function buildReply(
  category: CategoryKey,
  sentiment: Sentiment,
  priority: Priority,
  requester?: string | null,
  article?: KbRef | null,
): string {
  const first = requester?.trim().split(/\s+/)[0];
  const greeting = first ? `Olá, ${first}!` : 'Olá!';
  const empathy =
    sentiment === 'negative'
      ? 'Sentimos muito pelo transtorno e entendemos o impacto que isso causa na sua rotina.'
      : sentiment === 'positive'
        ? 'Obrigado pelo contato e pela confiança.'
        : 'Obrigado por entrar em contato.';
  const urgency =
    priority === 'critical' || priority === 'high'
      ? 'Seu chamado foi classificado como prioritário e já está com o nosso time.'
      : 'Seu chamado foi analisado e encaminhado para o time responsável.';
  const kb = article ? `\n\nEste artigo da nossa base de conhecimento pode ajudar: "${article.title}".` : '';
  return `${greeting}\n\n${empathy} ${urgency}\n\n${REPLY_BODY[category]}${kb}\n\nFicamos à disposição.\nEquipe de Suporte`;
}

// ---------------------------------------------------------------- Orquestração

export function analyzeLocal(
  input: AnalysisInput,
  classifier: NaiveBayesClassifier<CategoryKey>,
  kbArticles: KbRef[],
): Analysis {
  // Assunto com peso dobrado; a tela de origem (capturada pelo widget) também é evidência de categoria.
  const screen = input.technicalContext?.match(/^Tela: (.*)$/m)?.[1] ?? '';
  const text = `${input.subject}. ${input.subject}. ${input.description} ${screen}`;
  const prediction = classifier.predict(text);
  const category = prediction.label;
  const full = `${input.subject}. ${input.description}`;
  const { sentiment, score } = analyzeSentiment(full);
  const technicalError = /^Erro /m.test(input.technicalContext ?? '');
  const prio = scorePriority(full, category, score, input.customerPlan, technicalError);
  const churn = scoreChurn(full, score, prio.priority, input.customerRecentTickets ?? 0, input.customerPlan);
  const article = kbArticles.find((a) => a.category === category) ?? kbArticles[0] ?? null;

  return {
    category,
    confidence: Math.round(prediction.confidence * 1000) / 1000,
    ranking: prediction.ranking.map((r) => ({ category: r.label, probability: Math.round(r.probability * 1000) / 1000 })),
    priority: prio.priority,
    sentiment,
    sentimentScore: score,
    summary: summarize(input.subject, input.description, input.requesterName),
    suggestedReply: buildReply(category, sentiment, prio.priority, input.requesterName, article),
    tags: extractTags(full, input.productVersion),
    signals: [...new Set([...prio.signals, ...churn.signals])],
    churnRisk: churn.churnRisk,
    kbArticles,
    engine: 'local',
    model: 'sentria-local-nb-v1',
  };
}

export const categoryLabel = (c: CategoryKey) => CATEGORIES[c].label;
