/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react';

interface TooltipRow {
  name: string;
  value: ReactNode;
  color?: string;
}

/** Tooltip padrão dos gráficos (estilo do brand book). */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: readonly any[];
  label?: any;
  formatLabel?: (l: any) => ReactNode;
  formatValue?: (v: any, name: string) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const rows: TooltipRow[] = payload
    .filter((p) => p.value != null)
    .map((p) => ({ name: p.name, value: formatValue ? formatValue(p.value, p.name) : p.value, color: p.color ?? p.fill ?? p.stroke }));
  return (
    <div className="tt">
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--sn-navy)' }}>{formatLabel ? formatLabel(label) : label}</div>
      {rows.map((r) => (
        <div key={r.name} className="row" style={{ gap: 8, justifyContent: 'space-between', minWidth: 150 }}>
          <span className="row" style={{ gap: 6, color: 'var(--sn-text-2)' }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />
            {r.name}
          </span>
          <strong className="num" style={{ color: 'var(--sn-navy)' }}>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: '#64748B', fontSize: 11.5 },
} as const;

export const fmtShortDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
};
