import type { CategoryKey, Channel, Priority, Sentiment, Status } from './types';

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  pagamentos: 'Pagamentos e cobrança',
  acesso: 'Acesso e login',
  integracoes: 'Integrações e API',
  performance: 'Performance',
  bugs: 'Erros no sistema',
  duvidas: 'Dúvidas de uso',
};
export const CATEGORY_SHORT: Record<CategoryKey, string> = {
  pagamentos: 'Pagamentos',
  acesso: 'Acesso',
  integracoes: 'Integrações',
  performance: 'Performance',
  bugs: 'Erros',
  duvidas: 'Dúvidas',
};
/** Paleta categórica derivada do brand book (azuis e navy; lavanda fica reservada à IA). */
export const CATEGORY_COLOR: Record<CategoryKey, string> = {
  pagamentos: '#3978D5',
  acesso: '#14243B',
  integracoes: '#5FA0E8',
  performance: '#16A47A',
  bugs: '#D64550',
  duvidas: '#E6A23C',
};
export const CATEGORY_KEYS = Object.keys(CATEGORY_LABEL) as CategoryKey[];

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Novo',
  in_progress: 'Em andamento',
  waiting: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
};
export const STATUS_KEYS = Object.keys(STATUS_LABEL) as Status[];

export const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
export const PRIORITY_KEYS: Priority[] = ['critical', 'high', 'medium', 'low'];

export const SENTIMENT_LABEL: Record<Sentiment, string> = { negative: 'Negativo', neutral: 'Neutro', positive: 'Positivo' };

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'E-mail',
  portal: 'Portal',
  chat: 'Chat',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
};

const nf = new Intl.NumberFormat('pt-BR');
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function fmtDuration(hours: number | null | undefined) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  }
  return `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso);
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60000);
  let txt: string;
  if (min < 1) return 'agora';
  if (min < 60) txt = `${min} min`;
  else if (min < 60 * 24) txt = `${Math.round(min / 60)} h`;
  else if (min < 60 * 24 * 30) txt = `${Math.round(min / 1440)} d`;
  else return fmtDate(iso);
  return future ? `em ${txt}` : `há ${txt}`;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function riskColor(risk: number) {
  return risk >= 60 ? 'var(--sn-critical)' : risk >= 35 ? 'var(--sn-warning)' : 'var(--sn-success)';
}
