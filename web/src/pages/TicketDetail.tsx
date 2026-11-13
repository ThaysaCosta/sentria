import {
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  History,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  Star,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TechContext } from '../components/TechContext';
import { AiLabel, AiMark, CategoryChip, Confidence, Empty, PriorityBadge, RiskMeter, Skeleton, StatusBadge, useToast } from '../components/ui';
import { api } from '../lib/api';
import {
  CATEGORY_KEYS,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  PRIORITY_KEYS,
  PRIORITY_LABEL,
  SENTIMENT_LABEL,
  STATUS_KEYS,
  STATUS_LABEL,
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  fmtRelative,
  initials,
} from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { CategoryKey, KbRef, Priority, Status, Ticket, User } from '../lib/types';

interface Message {
  id: number;
  author_type: 'customer' | 'agent' | 'ai' | 'system';
  author_name: string;
  body: string;
  internal: boolean;
  created_at: string;
}
interface Event {
  id: number;
  type: string;
  actor: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}
interface Detail {
  ticket: Ticket;
  messages: Message[];
  events: Event[];
  customer: {
    id: number;
    name: string;
    plan: string;
    segment: string | null;
    mrr: number;
    total_tickets: number;
    open_tickets: number;
    tickets_30d: number;
    avg_csat: number | null;
  } | null;
  similar: { id: number; subject: string; status: Status; category: CategoryKey | null; score: number; created_at: string }[];
  kbArticles: KbRef[];
}

function describeEvent(e: Event): string {
  const d = e.data ?? {};
  switch (e.type) {
    case 'created':
      return `Chamado aberto via ${CHANNEL_LABEL[(d.channel as keyof typeof CHANNEL_LABEL) ?? 'portal'] ?? d.origin}`;
    case 'ai_analysis':
      return `${d.reprocessed ? 'Reanalisado' : 'Analisado'} pela IA (${d.engine === 'claude' ? `Claude · ${d.model}` : 'motor local'}): ${CATEGORY_LABEL[d.category as CategoryKey] ?? d.category}, ${Math.round(Number(d.confidence) * 100)}% de confiança${d.fallbackReason ? ` · Claude indisponível: ${d.fallbackReason}` : ''}`;
    case 'status_changed':
      return `Status: ${STATUS_LABEL[d.from as Status] ?? d.from} → ${STATUS_LABEL[d.to as Status] ?? d.to}`;
    case 'priority_changed':
      return `Prioridade: ${PRIORITY_LABEL[d.from as Priority]} → ${PRIORITY_LABEL[d.to as Priority]}`;
    case 'category_corrected':
      return `Categoria corrigida: ${CATEGORY_LABEL[d.ai as CategoryKey] ?? '—'} → ${CATEGORY_LABEL[d.to as CategoryKey]} (a IA aprendeu com isso)`;
    case 'category_confirmed':
      return `Categoria da IA confirmada: ${CATEGORY_LABEL[d.to as CategoryKey]}`;
    case 'assigned':
      return d.assignee ? `Atribuído a ${d.assignee}` : 'Responsável removido';
    case 'reply':
      return d.usedSuggestion ? 'Resposta enviada (baseada na sugestão da IA)' : 'Resposta enviada ao cliente';
    case 'note':
      return 'Nota interna adicionada';
    case 'customer_reply':
      return d.reopened ? 'Cliente respondeu e o chamado foi reaberto' : 'Cliente respondeu';
    case 'csat':
      return `Cliente avaliou o atendimento: ${d.score}/5`;
    case 'resolved_by_ai':
      return 'Resolvido no autoatendimento com artigo sugerido pela IA';
    default:
      return e.type;
  }
}

export function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi<Detail>(`/tickets/${id}`);
  const { data: users } = useApi<User[]>('/users');
  const [reply, setReply] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [usedSuggestion, setUsedSuggestion] = useState(false);
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  if (error) {
    return (
      <main className="page">
        <Empty title="Não foi possível abrir este ticket">{error}</Empty>
      </main>
    );
  }
  if (loading && !data) {
    return (
      <main className="page stack">
        <Skeleton h={22} w={240} />
        <Skeleton h={36} w="60%" />
        <div className="ticket-layout">
          <Skeleton h={420} style={{ borderRadius: 14 }} />
          <Skeleton h={420} style={{ borderRadius: 14 }} />
        </div>
      </main>
    );
  }
  if (!data) return null;
  const t = data.ticket;
  const open = t.status === 'new' || t.status === 'in_progress' || t.status === 'waiting';
  const slaMs = t.sla_due_at ? Date.parse(t.sla_due_at) - Date.now() : null;

  async function patch(body: Partial<{ status: Status; priority: Priority; category: CategoryKey; assignee_id: number | null }>, message?: string) {
    try {
      const r = await api<{ ticket: Ticket }>(`/tickets/${t.id}`, { method: 'PATCH', body });
      setData((d) => (d ? { ...d, ticket: r.ticket } : d));
      if (message) toast(message);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function send(setStatus?: Status) {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api(`/tickets/${t.id}/messages`, { body: { body: reply, internal: mode === 'note', setStatus, usedSuggestion } });
      setReply('');
      setUsedSuggestion(false);
      toast(mode === 'note' ? 'Nota interna salva.' : setStatus === 'resolved' ? 'Resposta enviada e chamado resolvido.' : 'Resposta enviada ao cliente.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function reanalyze() {
    setAnalyzing(true);
    try {
      const r = await api<{ analysis: { engine: string; fallbackReason?: string } }>(`/tickets/${t.id}/reanalyze`, { method: 'POST' });
      toast(r.analysis.fallbackReason ? `Claude indisponível (${r.analysis.fallbackReason}). Análise refeita com o motor local.` : `Análise atualizada (${r.analysis.engine === 'claude' ? 'Claude' : 'motor local'}).`);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  const engineLabel = t.ai_engine?.startsWith('claude') ? `Claude · ${t.ai_engine.split(':')[1]}` : 'Motor local';

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Voltar
        </button>
        <span className="mono muted">#{t.id} · {t.protocol}</span>
      </div>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h1 style={{ maxWidth: 900 }}>{t.subject}</h1>
          <div className="row wrap" style={{ marginTop: 10, gap: 10 }}>
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <CategoryChip category={t.category} />
            <span className="small muted">
              {t.requester_name} · {t.requester_email} · {CHANNEL_LABEL[t.channel]} · aberto {fmtRelative(t.created_at)}
            </span>
          </div>
        </div>
        {open && slaMs != null && (
          <div className={`alert ${slaMs < 0 ? 'alert-error' : slaMs < 2 * 3600_000 ? 'alert-warn' : 'alert-info'}`} style={{ alignItems: 'center' }}>
            <Clock size={16} />
            <span>
              {slaMs < 0 ? <>SLA estourado há <strong>{fmtDuration(-slaMs / 3600_000)}</strong></> : <>SLA vence em <strong>{fmtDuration(slaMs / 3600_000)}</strong></>}
            </span>
          </div>
        )}
      </div>

      <div className="ticket-layout">
        <div className="stack" style={{ gap: 16 }}>
          {/* ---------------- Análise da IA */}
          <section className="card ai-panel">
            <div className="card-header">
              <h3>
                <AiMark size={16} /> Seu chamado foi analisado
              </h3>
              <button className="btn btn-ai btn-sm" onClick={reanalyze} disabled={analyzing}>
                {analyzing ? <span className="spinner" /> : <RefreshCw size={14} />} Reanalisar
              </button>
            </div>
            <div className="card-body stack">
              <p style={{ fontSize: 15 }}>{t.ai_summary}</p>
              <div className="grid grid-3" style={{ gap: 12 }}>
                <div>
                  <div className="label">Categoria sugerida</div>
                  <div style={{ marginTop: 4 }}><CategoryChip category={t.ai_category} /></div>
                  <div style={{ marginTop: 6 }}><Confidence value={t.ai_confidence} /></div>
                </div>
                <div>
                  <div className="label">Sentimento</div>
                  <div style={{ marginTop: 4 }} className={`sent-${t.sentiment}`}>
                    <strong>{t.sentiment ? SENTIMENT_LABEL[t.sentiment] : '—'}</strong>{' '}
                    <span className="small muted num">({t.sentiment_score?.toLocaleString('pt-BR')})</span>
                  </div>
                </div>
                <div>
                  <div className="label">Risco de churn</div>
                  <div style={{ marginTop: 6 }}><RiskMeter value={t.churn_risk} /></div>
                </div>
              </div>
              {t.ai_signals.length > 0 && (
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Por que prioridade {PRIORITY_LABEL[t.ai_priority ?? t.priority].toLowerCase()}?
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {t.ai_signals.map((s) => <span key={s} className="signal">{s}</span>)}
                  </div>
                </div>
              )}
              {t.ai_tags.length > 0 && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {t.ai_tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                </div>
              )}
              <div className="tiny muted">
                {engineLabel} · analisado {fmtRelative(t.ai_analyzed_at)}
                {t.ai_priority && t.ai_priority !== t.priority ? ` · a IA sugeriu prioridade ${PRIORITY_LABEL[t.ai_priority].toLowerCase()}` : ''}
              </div>
            </div>
          </section>

          {t.context && <TechContext context={t.context} />}

          {/* ---------------- Conversa */}
          <section className="thread" aria-label="Conversa">
            <div className="msg">
              <div className="avatar neutral">{initials(t.requester_name)}</div>
              <div className="bubble">
                <div className="meta"><strong>{t.requester_name}</strong> {t.customer_name ? `· ${t.customer_name}` : ''} · {fmtDateTime(t.created_at)}</div>
                <div className="body">{t.description}</div>
              </div>
            </div>
            {data.messages.map((m) => (
              <div key={m.id} className={`msg ${m.author_type === 'agent' ? 'agent' : ''} ${m.internal ? 'internal' : ''}`}>
                <div className={`avatar ${m.author_type === 'customer' ? 'neutral' : ''}`}>{initials(m.author_name)}</div>
                <div className="bubble">
                  <div className="meta">
                    <strong>{m.author_name}</strong>
                    {m.internal && <span className="row" style={{ gap: 4, color: 'var(--sn-warning-ink)' }}><Lock size={12} /> Nota interna</span>}
                    · {fmtDateTime(m.created_at)}
                  </div>
                  <div className="body">{m.body}</div>
                </div>
              </div>
            ))}
          </section>

          {/* ---------------- Resposta */}
          <section className="composer">
            <div className="tabs">
              <button className={mode === 'reply' ? 'active' : ''} onClick={() => setMode('reply')}>
                <MessageSquare size={14} style={{ verticalAlign: -2 }} /> Responder ao cliente
              </button>
              <button className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')}>
                <Lock size={14} style={{ verticalAlign: -2 }} /> Nota interna
              </button>
            </div>
            <textarea
              className="textarea"
              placeholder={mode === 'reply' ? 'Escreva a resposta para o cliente…' : 'Anotação visível apenas para a equipe…'}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                if (!e.target.value) setUsedSuggestion(false);
              }}
              aria-label="Mensagem"
            />
            <div className="composer-bar">
              {mode === 'reply' && t.ai_reply ? (
                <button
                  className="btn btn-ai btn-sm"
                  onClick={() => {
                    setReply(t.ai_reply ?? '');
                    setUsedSuggestion(true);
                  }}
                >
                  <AiMark size={13} /> Usar resposta sugerida
                </button>
              ) : (
                <span />
              )}
              <div className="row wrap">
                {mode === 'reply' && (
                  <button className="btn btn-secondary btn-sm" disabled={sending || !reply.trim()} onClick={() => send('resolved')}>
                    <CheckCircle2 size={14} /> Enviar e resolver
                  </button>
                )}
                <button className="btn btn-primary btn-sm" disabled={sending || !reply.trim()} onClick={() => send()}>
                  {sending ? <span className="spinner" /> : <Send size={14} />} {mode === 'reply' ? 'Enviar' : 'Salvar nota'}
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <button
              className="card-header"
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', paddingBottom: showTimeline ? 0 : 18 }}
              onClick={() => setShowTimeline((v) => !v)}
            >
              <h3 className="row"><History size={16} /> Histórico ({data.events.length})</h3>
              <span className="small muted">{showTimeline ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {showTimeline && (
              <div className="card-body">
                <ul className="timeline">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <span className={`tl-dot ${e.type === 'ai_analysis' || e.type === 'resolved_by_ai' ? 'ai' : ''}`}>
                        {e.type === 'ai_analysis' || e.type === 'resolved_by_ai' ? <AiMark size={11} /> : <UserRound size={11} />}
                      </span>
                      <div>
                        <div>{describeEvent(e)}</div>
                        <div className="tiny muted">{e.actor} · {fmtDateTime(e.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Coluna lateral */}
        <aside className="stack" style={{ gap: 16 }}>
          <section className="card card-pad stack" style={{ gap: 8 }}>
            <h3 style={{ marginBottom: 4 }}>Propriedades</h3>
            <label className="prop">
              <span>Status</span>
              <select className="select select-sm" value={t.status} onChange={(e) => patch({ status: e.target.value as Status }, 'Status atualizado.')}>
                {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Prioridade</span>
              <select className="select select-sm" value={t.priority} onChange={(e) => patch({ priority: e.target.value as Priority }, 'Prioridade atualizada. O SLA foi recalculado.')}>
                {PRIORITY_KEYS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Categoria</span>
              <select
                className="select select-sm"
                value={t.category ?? ''}
                onChange={(e) => {
                  const c = e.target.value as CategoryKey;
                  patch({ category: c }, c === t.ai_category ? 'Categoria confirmada.' : 'Categoria corrigida. A IA aprendeu com essa correção.');
                }}
              >
                {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <div className="prop">
              <span />
              {t.category_source === 'ai' ? (
                <div className="row-between">
                  <span className="ai-label tiny"><AiMark size={12} /> Categorizado por IA</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => t.category && patch({ category: t.category }, 'Categoria confirmada. Obrigado pelo feedback!')}>
                    Confirmar
                  </button>
                </div>
              ) : (
                <span className="tiny muted">Revisado por pessoa</span>
              )}
            </div>
            <label className="prop">
              <span>Responsável</span>
              <select
                className="select select-sm"
                value={t.assignee_id ?? ''}
                onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null }, 'Responsável atualizado.')}
              >
                <option value="">Ninguém</option>
                {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <div className="divider" />
            <div className="prop"><span>Canal</span><span className="small">{CHANNEL_LABEL[t.channel]}</span></div>
            <div className="prop"><span>Versão</span><span className="small">{t.product_version ?? '—'}</span></div>
            <div className="prop"><span>1ª resposta</span><span className="small">{t.first_response_at ? fmtDuration((Date.parse(t.first_response_at) - Date.parse(t.created_at)) / 3600_000) : 'Aguardando'}</span></div>
            {t.resolved_at && (
              <div className="prop"><span>Resolução</span><span className="small">{fmtDuration((Date.parse(t.resolved_at) - Date.parse(t.created_at)) / 3600_000)}</span></div>
            )}
            {t.csat != null && (
              <div className="prop">
                <span>CSAT</span>
                <span className="row" style={{ gap: 2 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={14} fill={i < t.csat! ? '#E6A23C' : 'none'} color={i < t.csat! ? '#E6A23C' : '#cbd5e1'} />
                  ))}
                </span>
              </div>
            )}
          </section>

          {data.customer && (
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row-between">
                <h3 className="row"><Building2 size={16} /> {data.customer.name}</h3>
                <span className="badge st-new">{data.customer.plan}</span>
              </div>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div><div className="label">MRR</div><div className="num" style={{ fontWeight: 600 }}>{fmtMoney(data.customer.mrr)}</div></div>
                <div><div className="label">Segmento</div><div className="small">{data.customer.segment ?? '—'}</div></div>
                <div><div className="label">Tickets (30d)</div><div className="num" style={{ fontWeight: 600 }}>{data.customer.tickets_30d}</div></div>
                <div><div className="label">Em aberto</div><div className="num" style={{ fontWeight: 600 }}>{data.customer.open_tickets}</div></div>
              </div>
              <Link to={`/tickets?customer=${data.customer.id}`} className="btn btn-secondary btn-sm">Ver todos os {data.customer.total_tickets} tickets</Link>
            </section>
          )}

          <section className="card card-pad">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <h3>Tickets parecidos</h3>
              <AiLabel>IA</AiLabel>
            </div>
            {data.similar.length === 0 && <p className="small muted">Nenhum ticket semelhante encontrado.</p>}
            {data.similar.map((s) => (
              <Link key={s.id} to={`/tickets/${s.id}`} className="list-link">
                <span className="small" style={{ fontWeight: 600, color: 'var(--sn-navy)' }}>{s.subject}</span>
                <span className="row tiny muted" style={{ gap: 8 }}>
                  #{s.id} · {STATUS_LABEL[s.status]} · {Math.round(s.score * 100)}% similar
                </span>
              </Link>
            ))}
          </section>

          <section className="card card-pad">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <h3 className="row"><BookOpen size={16} /> Artigos sugeridos</h3>
            </div>
            {data.kbArticles.length === 0 && <p className="small muted">Não encontramos informações confiáveis na base de conhecimento.</p>}
            {data.kbArticles.map((a) => (
              <Link key={a.id} to={`/kb?article=${a.id}`} className="list-link">
                <span className="small" style={{ fontWeight: 600, color: 'var(--sn-navy)' }}>{a.title}</span>
                <span className="tiny muted">{CATEGORY_LABEL[a.category as CategoryKey]} · relevância {Math.round(a.score * 100)}%</span>
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
