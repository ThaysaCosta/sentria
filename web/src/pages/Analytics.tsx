import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, axisProps, fmtShortDate } from '../components/charts';
import { AiLabel, AiMark, Skeleton } from '../components/ui';
import { CATEGORY_COLOR, CATEGORY_KEYS, CATEGORY_LABEL, CATEGORY_SHORT, CHANNEL_LABEL, PRIORITY_LABEL, fmtDuration, fmtNumber, fmtPct } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { CategoryKey, Channel, Priority } from '../lib/types';

interface DetailData {
  days: number;
  total: number;
  daily: Record<string, number | string>[];
  byCategory: { key: CategoryKey; label: string; count: number; avgResolutionHours: number | null; negativeShare: number; csat: number | null }[];
  heatmap: number[][];
  channels: { key: Channel; count: number }[];
  sla: { priority: Priority; targetHours: number; total: number; compliance: number | null }[];
  agents: { id: number; name: string; assigned: number; resolved: number; avgResolutionHours: number | null; csat: number | null; open: number }[];
  ai: {
    reviewed: number;
    accuracy: number | null;
    keys: CategoryKey[];
    matrix: number[][];
    perCategory: { key: CategoryKey; label: string; precision: number | null; recall: number | null; f1: number | null; support: number }[];
    confidence: { range: string; count: number; accuracy: number | null }[];
  };
  customers: { id: number; name: string; plan: string | null; tickets: number; negativeShare: number; churnRisk: number }[];
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CHANNEL_COLORS = ['#3978D5', '#14243B', '#5FA0E8', '#16A47A', '#E6A23C'];

export function Analytics() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const { data } = useApi<DetailData>(`/analytics/detail?days=${days}`);
  const maxHeat = data ? Math.max(1, ...data.heatmap.flat()) : 1;
  const maxMatrix = data ? Math.max(1, ...data.ai.matrix.flat()) : 1;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Inteligência</div>
          <h1>Analytics</h1>
          <p className="muted" style={{ marginTop: 4 }}>{data ? `${fmtNumber(data.total)} tickets no período` : 'Carregando…'}</p>
        </div>
        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d}d</button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="grid grid-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={300} style={{ borderRadius: 14 }} />)}</div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Volume diário por categoria</h2>
                <div className="sub">Horário de Brasília</div>
              </div>
              <div className="legend hide-mobile">
                {CATEGORY_KEYS.map((k) => <span key={k}><i style={{ background: CATEGORY_COLOR[k] }} />{CATEGORY_SHORT[k]}</span>)}
              </div>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E4E9F1" />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={fmtShortDate} minTickGap={20} />
                  <YAxis {...axisProps} width={44} />
                  <Tooltip cursor={{ fill: 'rgb(57 120 213 / 0.06)' }} content={(p) => <ChartTooltip {...p} formatLabel={fmtShortDate} />} />
                  {CATEGORY_KEYS.map((k, i) => (
                    <Bar key={k} dataKey={k} name={CATEGORY_SHORT[k]} stackId="a" fill={CATEGORY_COLOR[k]} radius={i === CATEGORY_KEYS.length - 1 ? [3, 3, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-2">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Sentimento ao longo do tempo</h2>
                  <div className="sub">Classificação da IA por dia</div>
                </div>
                <AiLabel>IA</AiLabel>
              </div>
              <div className="card-body" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="expand">
                    <CartesianGrid vertical={false} stroke="#E4E9F1" />
                    <XAxis dataKey="date" {...axisProps} tickFormatter={fmtShortDate} minTickGap={24} />
                    <YAxis {...axisProps} width={42} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip content={(p) => <ChartTooltip {...p} formatLabel={fmtShortDate} />} />
                    <Area type="monotone" dataKey="negative" name="Negativo" stackId="s" stroke="#D64550" fill="#D64550" fillOpacity={0.75} />
                    <Area type="monotone" dataKey="neutral" name="Neutro" stackId="s" stroke="#CBD5E1" fill="#CBD5E1" fillOpacity={0.7} />
                    <Area type="monotone" dataKey="positive" name="Positivo" stackId="s" stroke="#16A47A" fill="#16A47A" fillOpacity={0.75} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Quando os chamados chegam</h2>
                  <div className="sub">Dia da semana × hora</div>
                </div>
              </div>
              <div className="card-body">
                <div className="heatmap">
                  <span />
                  {Array.from({ length: 24 }, (_, h) => <span key={h} className="hlabel">{h % 3 === 0 ? h : ''}</span>)}
                  {data.heatmap.map((row, d) => (
                    <div key={d} style={{ display: 'contents' }}>
                      <span style={{ alignSelf: 'center' }}>{WEEKDAYS[d]}</span>
                      {row.map((v, h) => (
                        <span
                          key={h}
                          className="cell"
                          title={`${WEEKDAYS[d]}, ${h}h: ${v} tickets`}
                          style={{ background: v === 0 ? '#F1F4F9' : `rgb(57 120 213 / ${0.12 + (v / maxHeat) * 0.88})` }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <p className="tiny muted" style={{ marginTop: 10 }}>Use para dimensionar a escala da equipe nos horários de pico.</p>
              </div>
            </section>
          </div>

          <div className="grid grid-2">
            <section className="card">
              <div className="card-header"><h2>Desempenho por categoria</h2></div>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead>
                    <tr><th>Categoria</th><th>Tickets</th><th>Resolução</th><th>Negativos</th><th>CSAT</th></tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((c) => (
                      <tr key={c.key}>
                        <td><span className="chip"><span className="sw" style={{ background: CATEGORY_COLOR[c.key] }} />{c.label}</span></td>
                        <td className="num">{fmtNumber(c.count)}</td>
                        <td className="num">{fmtDuration(c.avgResolutionHours)}</td>
                        <td className="num">{fmtPct(c.negativeShare, 0)}</td>
                        <td className="num">{fmtPct(c.csat, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-header"><h2>SLA e canais</h2></div>
              <div className="card-body grid grid-2" style={{ gap: 20 }}>
                <div className="stack">
                  {data.sla.map((s) => (
                    <div key={s.priority} className="bar-row">
                      <span className="small"><strong>{PRIORITY_LABEL[s.priority]}</strong> <span className="muted">· meta {s.targetHours}h</span></span>
                      <span className="small num">{fmtPct(s.compliance, 0)}</span>
                      <span className="bar-track">
                        <span style={{ width: `${(s.compliance ?? 0) * 100}%`, background: (s.compliance ?? 0) >= 0.85 ? '#16A47A' : (s.compliance ?? 0) >= 0.7 ? '#E6A23C' : '#D64550' }} />
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.channels} dataKey="count" nameKey="key" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                        {data.channels.map((c, i) => <Cell key={c.key} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={(p) => <ChartTooltip {...p} formatLabel={() => 'Canal'} formatValue={(v) => fmtNumber(v)} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="legend" style={{ justifyContent: 'center' }}>
                    {data.channels.map((c, i) => <span key={c.key}><i style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />{CHANNEL_LABEL[c.key]}</span>)}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ---------------- Qualidade da IA */}
          <section className="card ai-panel">
            <div className="card-header">
              <div>
                <h2 className="row"><AiMark size={18} /> Qualidade da classificação da IA</h2>
                <div className="sub">
                  Comparação entre a categoria prevista e a revisada por pessoas em {fmtNumber(data.ai.reviewed)} tickets · precisão geral{' '}
                  <strong style={{ color: 'var(--sn-lavender-ink)' }}>{fmtPct(data.ai.accuracy)}</strong>
                </div>
              </div>
            </div>
            <div className="card-body grid grid-2" style={{ gap: 24 }}>
              <div className="table-wrap">
                <div className="label" style={{ marginBottom: 6 }}>Matriz de confusão (linhas: real · colunas: IA)</div>
                <table className="matrix">
                  <thead>
                    <tr>
                      <th />
                      {data.ai.keys.map((k) => <th key={k} title={CATEGORY_LABEL[k]}>{CATEGORY_SHORT[k].slice(0, 5)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.ai.matrix.map((row, i) => (
                      <tr key={i}>
                        <th className="rowh">{CATEGORY_SHORT[data.ai.keys[i]]}</th>
                        {row.map((v, j) => (
                          <td
                            key={j}
                            title={`Real: ${CATEGORY_LABEL[data.ai.keys[i]]} · IA: ${CATEGORY_LABEL[data.ai.keys[j]]} · ${v}`}
                            style={{
                              background: v === 0 ? '#F5F7FB' : i === j ? `rgb(140 139 234 / ${0.2 + (v / maxMatrix) * 0.8})` : `rgb(214 69 80 / ${0.15 + Math.min(1, v / 10) * 0.5})`,
                              color: i === j && v / maxMatrix > 0.5 ? '#fff' : 'var(--sn-navy)',
                            }}
                          >
                            {v || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="stack">
                <table className="table">
                  <thead><tr><th>Categoria</th><th>Precisão</th><th>Recall</th><th>F1</th></tr></thead>
                  <tbody>
                    {data.ai.perCategory.map((c) => (
                      <tr key={c.key}>
                        <td className="small">{CATEGORY_SHORT[c.key]}</td>
                        <td className="num small">{fmtPct(c.precision, 0)}</td>
                        <td className="num small">{fmtPct(c.recall, 0)}</td>
                        <td className="num small"><strong>{fmtPct(c.f1, 0)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Calibração: acerto por faixa de confiança</div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {data.ai.confidence.filter((c) => c.count > 0).map((c) => (
                      <div key={c.range} className="signal" title={`${c.count} tickets`}>
                        {c.range}: <strong>{fmtPct(c.accuracy, 0)}</strong> <span className="muted">({c.count})</span>
                      </div>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 6 }}>Quanto maior a confiança, maior deve ser o acerto. Tickets abaixo de 60% aparecem no filtro “Revisar IA”.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-2">
            <section className="card">
              <div className="card-header"><h2>Equipe</h2></div>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>Atendente</th><th>Resolvidos</th><th>Em aberto</th><th>Resolução</th><th>CSAT</th></tr></thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr key={a.id}>
                        <td className="small" style={{ fontWeight: 600 }}>{a.name}</td>
                        <td className="num">{fmtNumber(a.resolved)}</td>
                        <td className="num">{a.open}</td>
                        <td className="num">{fmtDuration(a.avgResolutionHours)}</td>
                        <td className="num">{fmtPct(a.csat, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Clientes com maior risco</h2>
                  <div className="sub">Risco médio de churn estimado pela IA</div>
                </div>
              </div>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>Cliente</th><th>Tickets</th><th>Negativos</th><th>Risco</th></tr></thead>
                  <tbody>
                    {data.customers.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => navigate(`/tickets?customer=${c.id}`)}>
                        <td><div className="small" style={{ fontWeight: 600 }}>{c.name}</div><div className="tiny muted">{c.plan}</div></td>
                        <td className="num">{c.tickets}</td>
                        <td className="num">{fmtPct(c.negativeShare, 0)}</td>
                        <td className="num" style={{ fontWeight: 600, color: c.churnRisk >= 50 ? 'var(--sn-critical)' : c.churnRisk >= 35 ? 'var(--sn-warning-ink)' : 'var(--sn-success)' }}>{c.churnRisk}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
