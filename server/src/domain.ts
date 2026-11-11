/** Vocabulário de domínio compartilhado por API, IA e seed. */

export const CATEGORIES = {
  pagamentos: {
    label: 'Pagamentos e cobrança',
    description: 'Boletos, Pix, cartão, faturas, notas fiscais, cobranças indevidas, mudança de plano e reembolsos.',
  },
  acesso: {
    label: 'Acesso e login',
    description: 'Login, senha, SSO, autenticação em dois fatores, bloqueio de conta, permissões e convites de usuários.',
  },
  integracoes: {
    label: 'Integrações e API',
    description: 'API REST, webhooks, tokens de integração, ERPs, conectores, limites de requisição e sincronização.',
  },
  performance: {
    label: 'Performance',
    description: 'Lentidão, telas demorando para carregar, timeouts, relatórios pesados, sistema fora do ar ou instável.',
  },
  bugs: {
    label: 'Erros no sistema',
    description: 'Comportamento incorreto, mensagens de erro, botões que não funcionam, dados exibidos errados, falhas após atualização.',
  },
  duvidas: {
    label: 'Dúvidas de uso',
    description: 'Como fazer algo no produto, configuração, treinamento, sugestões de melhoria e pedidos de funcionalidade.',
  },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export type Status = (typeof STATUSES)[number];
export const OPEN_STATUSES: Status[] = ['new', 'in_progress', 'waiting'];

export const CHANNELS = ['email', 'portal', 'chat', 'phone', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];

export const SENTIMENTS = ['negative', 'neutral', 'positive'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/** Horas até o SLA de resolução, por prioridade. */
export const SLA_HOURS: Record<Priority, number> = { critical: 4, high: 8, medium: 24, low: 48 };

export const PLANS = ['Starter', 'Pro', 'Business', 'Enterprise'] as const;

export const isCategory = (v: unknown): v is CategoryKey => typeof v === 'string' && v in CATEGORIES;
export const isPriority = (v: unknown): v is Priority => PRIORITIES.includes(v as Priority);
export const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
export const isChannel = (v: unknown): v is Channel => CHANNELS.includes(v as Channel);
