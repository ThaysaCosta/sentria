import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  PRIORITY_LABEL,
  SENTIMENT_LABEL,
  STATUS_LABEL,
  fmtPct,
  riskColor,
} from '../lib/domain';
import type { CategoryKey, Priority, Sentiment, Status } from '../lib/types';

/** Marcador de IA do brand book: brilho de quatro pontas com um sinal satélite. */
export function AiMark({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`ai-mark ${className}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7 1.5c.35 2.9 1.6 4.15 4.5 4.5-2.9.35-4.15 1.6-4.5 4.5C6.65 7.6 5.4 6.35 2.5 6 5.4 5.65 6.65 4.4 7 1.5Z" fill="currentColor" />
      <circle cx="12.6" cy="12.4" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function AiLabel({ children = 'SENTRIA Intelligence' }: { children?: ReactNode }) {
  return (
    <span className="ai-label">
      <AiMark size={14} />
      {children}
    </span>
  );
}

/** Grafismo "Campo de Percepção": órbitas concêntricas e rede de sinais. */
export function PerceptionField({ className = 'pf', dense = false }: { className?: string; dense?: boolean }) {
  const nodes = [
    [210, 90], [255, 150], [180, 205], [120, 140], [290, 60], [235, 250], [95, 230], [160, 60], [300, 205],
  ];
  const links = [[0, 1], [1, 2], [2, 3], [0, 3], [0, 4], [1, 5], [2, 6], [3, 7], [1, 8], [5, 8]];
  return (
    <svg className={className} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="pf-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8C8BEA" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8C8BEA" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="150" r="120" fill="url(#pf-core)" />
      {[40, 80, 120, 160, 200, 240].map((r, i) => (
        <circle key={r} cx="200" cy="150" r={r} fill="none" stroke={i % 2 ? '#8C8BEA' : '#3978D5'} strokeOpacity={dense ? 0.32 : 0.22} strokeWidth="1" />
      ))}
      {links.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="#B9B8F7" strokeOpacity="0.35" strokeWidth="0.8" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3 : 2} fill={i % 2 ? '#8C8BEA' : '#6FA2EC'} fillOpacity="0.85" />
      ))}
    </svg>
  );
}

export function Logo({ variant = 'on-dark', height = 26 }: { variant?: 'on-dark' | 'on-light'; height?: number }) {
  return <img src={`/brand/sentria-logo-horizontal-${variant}.svg`} alt="SENTRIA" style={{ height, display: 'block', alignSelf: 'flex-start' }} />;
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge st-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge pr-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function CategoryChip({ category, short = false }: { category: CategoryKey | null; short?: boolean }) {
  if (!category) return <span className="muted">—</span>;
  return (
    <span className="chip">
      <span className="sw" style={{ background: CATEGORY_COLOR[category] }} />
      {short ? CATEGORY_SHORT[category] : CATEGORY_LABEL[category]}
    </span>
  );
}

export function SentimentText({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return <span className="muted">—</span>;
  return <span className={`sent-${sentiment} small`} style={{ fontWeight: 600 }}>{SENTIMENT_LABEL[sentiment]}</span>;
}

export function RiskMeter({ value }: { value: number }) {
  return (
    <span className="risk" title="Risco de churn estimado pela IA">
      <span className="meter">
        <span style={{ width: `${value}%`, background: riskColor(value) }} />
      </span>
      {value}%
    </span>
  );
}

export function Confidence({ value, light = false }: { value: number | null; light?: boolean }) {
  if (value == null) return null;
  return (
    <div className={`confidence ${value < 0.6 ? 'low' : ''}`} style={light ? { color: '#c9c8fa' } : undefined}>
      <span>confiança</span>
      <span className="bar">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <strong className="num">{Math.round(value * 100)}%</strong>
    </div>
  );
}

export function Delta({ value, unit = '%', invert = false, suffix }: { value: number | null | undefined; unit?: string; invert?: boolean; suffix?: string }) {
  if (value == null) return <span className="delta flat">—</span>;
  const good = invert ? value < 0 : value > 0;
  const cls = Math.abs(value) < 0.05 ? 'flat' : good ? 'good' : 'bad';
  const Icon = Math.abs(value) < 0.05 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${cls}`}>
      <Icon size={14} strokeWidth={2.2} />
      {value > 0 ? '+' : ''}
      {value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
      {unit}
      {suffix ? <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>{suffix}</span> : null}
    </span>
  );
}

export function KpiCard({ label, value, foot, ai = false }: { label: string; value: ReactNode; foot?: ReactNode; ai?: boolean }) {
  return (
    <div className="card kpi">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        {ai && <AiMark size={14} />}
      </div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong style={{ color: 'var(--sn-navy)' }}>{title}</strong>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Toasts

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export const pct = fmtPct;
