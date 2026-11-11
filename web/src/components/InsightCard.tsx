import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Insight } from '../lib/types';
import { AiLabel, Confidence, PerceptionField } from './ui';

const SEVERITY_LABEL = { critical: 'Prioridade alta', warning: 'Atenção', info: 'Informativo' } as const;
const SEVERITY_COLOR = { critical: '#F08A92', warning: '#F2C27A', info: '#9FB0C8' } as const;

export function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const link = `/tickets?ids=${insight.ticketIds.slice(0, 300).join(',')}&title=${encodeURIComponent(insight.headline)}`;
  return (
    <div className="ai-card">
      <PerceptionField />
      <div className="row-between" style={{ marginBottom: 10 }}>
        <AiLabel />
        <span className="tiny" style={{ color: SEVERITY_COLOR[insight.severity], fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {SEVERITY_LABEL[insight.severity]}
        </span>
      </div>
      <h3 style={{ fontSize: compact ? 16 : 18, lineHeight: 1.35 }}>{insight.title}</h3>
      <p style={{ marginTop: 6, color: '#fff', fontWeight: 600 }}>{insight.headline}</p>
      <p className="meta" style={{ marginTop: 6 }}>{insight.description}</p>
      {!compact && insight.metrics.length > 0 && (
        <div className="row wrap" style={{ gap: 18, marginTop: 14 }}>
          {insight.metrics.map((m) => (
            <div key={m.label}>
              <div className="tiny" style={{ color: '#8fa1bb', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{m.label}</div>
              <div className="num" style={{ color: '#fff', fontWeight: 600, fontSize: 17 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="action">
        <strong style={{ color: '#fff' }}>Ação sugerida:</strong> {insight.suggestedAction}
      </div>
      <div className="row-between wrap" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 170, flex: '0 1 220px' }}>
          <Confidence value={insight.confidence} light />
        </div>
        <Link to={link} className="btn btn-secondary btn-sm">
          Ver {insight.ticketIds.length} tickets <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
