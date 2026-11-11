import { ArrowRight, Inbox } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, axisProps, fmtShortDate } from '../components/charts';
import { InsightCard } from '../components/InsightCard';
import { AiLabel, CategoryChip, Delta, Empty, KpiCard, PriorityBadge, RiskMeter, Skeleton, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';
import { CATEGORY_COLOR, fmtDuration, fmtNumber, fmtPct, greeting } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { CategoryKey, Insight, Priority, Status } from '../lib/types';

interface OverviewData {
  days: number;
  kpis: {
    received: { value: number; delta: number | null };
    avgResolutionHours: { value: number | null; delta: number | null };
    aiAutoRate: { value: number | null; deltaPp: number | null; accuracy: number | null };
    csat: { value: number | null; deltaPp: number | null };
    slaCompliance: { value: number | null; deltaPp: number | null };
    avgFirstResponseHours: { value: number | null; delta: number | null };
    resolvedByAi: { value: number; delta: number | null };
    open: { value: number };
  };
  weekly: { week: string; received: number; resolved: number; resolvedByAi: number }[];
  categories: { key: CategoryKey; label: string; count: number; share: number }[];
  priorityTickets: {
    id: number;
    subject: string;
    category: CategoryKey | null;
    status: Status;
    priority: Priority;
    churn_risk: number;
    customer_name: string | null;
    customer_plan: string | null;
  }[];
  insights: Insight[];
  insightCount: number;
}

const PERIODS = [7, 30, 90] as const;

export function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data, loading, error } = useApi<OverviewData>(`/analytics/overview?days=${days}`);
  const k = data?.kpis;
  const vs = days === 7 ? 'vs. semana anterior' : `vs. ${days} dias anteriores`;
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Workspace demo · {today}</div>
          <h1>
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
        </div>
        <div className="segmented" role="tablist" aria-label="Período">
          {PERIODS.map((p) => (
            <button key={p} className={days === p ? 'active' : ''} onClick={() => setDays(p)} role="tab" aria-selected={days === p}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="grid grid-kpi" style={{ marginBottom: 16 }}>
        {!k ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card kpi">
              <Skeleton h={12} w={120} />
              <Skeleton h={30} w={100} style={{ margin: '12px 0' }} />
              <Skeleton h={12} w={140} />
            </div>
          ))
        ) : (
          <>
            <KpiCard label="Tickets recebidos" value={fmtNumber(k.received.value)} foot={<><Delta value={k.received.delta} /> {vs}</>} />
            <KpiCard
              label="Tempo médio de resolução"
              value={fmtDuration(k.avgResolutionHours.value)}
              foot={<><Delta value={k.avgResolutionHours.delta} invert /> {vs}</>}
            />
            <KpiCard
              ai
              label="Categorizados pela IA"
              value={fmtPct(k.aiAutoRate.value)}
              foot={
                <>
                  <Delta value={k.aiAutoRate.deltaPp} unit=" pp" /> precisão {fmtPct(k.aiAutoRate.accuracy, 0)}
                </>
              }
            />
            <KpiCard label="CSAT" value={fmtPct(k.csat.value)} foot={<><Delta value={k.csat.deltaPp} unit=" pp" /> {vs}</>} />
          </>
        )}
      </section>

      <section className="grid grid-main" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Volume de tickets</h2>
              <div className="sub">Por semana · últimas 12 semanas</div>
            </div>
            <div className="legend">
              <span><i style={{ background: '#3978D5' }} />Recebidos</span>
              <span><i style={{ background: '#14243B' }} />Resolvidos</span>
              <span><i style={{ background: '#8C8BEA' }} />Resolvidos pela IA</span>
            </div>
          </div>
          <div className="card-body" style={{ height: 300 }}>
            {loading && !data ? (
              <Skeleton h={260} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data?.weekly ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#3978D5" stopOpacity={0.28} />
                      <stop offset="1" stopColor="#3978D5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#E4E9F1" />
                  <XAxis dataKey="week" {...axisProps} tickFormatter={fmtShortDate} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axisProps} width={44} />
                  <Tooltip content={(p) => <ChartTooltip {...p} formatLabel={(l) => `Semana de ${fmtShortDate(l)}`} />} />
                  <Bar dataKey="resolvedByAi" name="Resolvidos pela IA" fill="#8C8BEA" radius={[4, 4, 0, 0]} barSize={14} />
                  <Area type="monotone" dataKey="received" name="Recebidos" stroke="#3978D5" strokeWidth={2.2} fill="url(#gReceived)" />
                  <Line type="monotone" dataKey="resolved" name="Resolvidos" stroke="#14243B" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2>Categorias detectadas</h2>
              <div className="sub">Classificação automática · {days} dias</div>
            </div>
            <AiLabel>IA</AiLabel>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            {(data?.categories ?? []).map((c) => (
              <button
                key={c.key}
                className="bar-row"
                onClick={() => navigate(`/tickets?category=${c.key}&days=${days}`)}
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <span className="small" style={{ fontWeight: 600, color: 'var(--sn-navy)' }}>{c.label}</span>
                <span className="small num muted">
                  <strong style={{ color: 'var(--sn-navy)' }}>{fmtNumber(c.count)}</strong> · {Math.round(c.share * 100)}%
                </span>
                <span className="bar-track">
                  <span style={{ width: `${Math.max(2, c.share * 100)}%`, background: CATEGORY_COLOR[c.key] }} />
                </span>
              </button>
            ))}
            {!data && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={28} />)}
          </div>
        </div>
      </section>

      <section className="grid grid-main">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Tickets prioritários</h2>
              <div className="sub">Ordenados por risco de churn</div>
            </div>
            <Link to="/tickets?open=true&sort=churn_risk" className="btn btn-ghost btn-sm">
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Assunto</th>
                  <th className="hide-mobile">Categoria</th>
                  <th>Risco</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.priorityTickets.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/tickets/${t.id}`)}>
                    <td className="id">#{t.id}</td>
                    <td style={{ maxWidth: 300 }}>
                      <div className="subject truncate">{t.subject}</div>
                      <div className="row" style={{ marginTop: 4, gap: 8 }}>
                        <PriorityBadge priority={t.priority} />
                        <span className="tiny muted truncate">{t.customer_name} · {t.customer_plan}</span>
                      </div>
                    </td>
                    <td className="hide-mobile"><CategoryChip category={t.category} short /></td>
                    <td style={{ whiteSpace: 'nowrap' }}><RiskMeter value={t.churn_risk} /></td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.priorityTickets.length === 0 && <Empty icon={<Inbox size={22} />} title="Nenhum ticket em aberto" />}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {data?.insights.length ? (
            <>
              <InsightCard insight={data.insights.find((i) => i.type === 'spike') ?? data.insights[0]} compact />
              {data.insightCount > 1 && (
                <Link to="/insights" className="btn btn-ai">
                  Ver os {data.insightCount} padrões identificados <ArrowRight size={14} />
                </Link>
              )}
            </>
          ) : data ? (
            <div className="card card-pad">
              <AiLabel />
              <p className="muted" style={{ marginTop: 8 }}>Nenhum padrão fora do normal nas últimas horas.</p>
            </div>
          ) : (
            <Skeleton h={260} style={{ borderRadius: 14 }} />
          )}
          {k && (
            <div className="card card-pad grid grid-2" style={{ gap: 14 }}>
              <div>
                <div className="label">Em aberto agora</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtNumber(k.open.value)}</div>
              </div>
              <div>
                <div className="label">SLA cumprido</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtPct(k.slaCompliance.value, 0)}</div>
              </div>
              <div>
                <div className="label">1ª resposta</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtDuration(k.avgFirstResponseHours.value)}</div>
              </div>
              <div>
                <div className="label">Resolvidos pela IA</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--sn-lavender-ink)' }}>{fmtNumber(k.resolvedByAi.value)}</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
