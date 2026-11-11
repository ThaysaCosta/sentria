import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, Logo, Skeleton, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, initials } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { Status } from '../lib/types';

interface PublicTicket {
  protocol: string;
  subject: string;
  description: string;
  status: Status;
  category: string | null;
  created_at: string;
  resolved_at: string | null;
  csat: number | null;
  requester_name: string;
  resolved_by_ai: boolean;
  messages: { author_type: string; author_name: string; body: string; created_at: string }[];
}

const STEPS: { key: Status[]; label: string }[] = [
  { key: ['new'], label: 'Recebido' },
  { key: ['in_progress', 'waiting'], label: 'Em atendimento' },
  { key: ['resolved', 'closed'], label: 'Resolvido' },
];

export function PortalTrack() {
  const [params] = useSearchParams();
  const protocol = params.get('protocolo') ?? '';
  const email = params.get('email') ?? '';
  const path = protocol && email ? `/public/tickets/${encodeURIComponent(protocol)}?email=${encodeURIComponent(email)}` : null;
  const { data, error, loading, reload } = useApi<PublicTicket>(path);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`/public/tickets/${encodeURIComponent(protocol)}/messages`, { body: { email, body: reply } });
      setReply('');
      setMsg('Mensagem enviada. O time foi notificado.');
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rate(score: number) {
    try {
      await api(`/public/tickets/${encodeURIComponent(protocol)}/csat`, { body: { email, score } });
      setMsg('Obrigado pela avaliação!');
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const stepIndex = data ? STEPS.findIndex((s) => s.key.includes(data.status)) : 0;

  return (
    <div className="portal">
      <header className="portal-top">
        <div className="inner">
          <Logo height={24} />
          <Link to="/portal" className="small" style={{ color: '#c9d4e5' }}>Central de ajuda</Link>
        </div>
      </header>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px 56px' }}>
        <Link to="/portal" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={15} /> Voltar
        </Link>
        {!path ? (
          <div className="card"><Empty title="Informe o protocolo e o e-mail">Use o formulário da central de ajuda para consultar um chamado.</Empty></div>
        ) : loading && !data ? (
          <Skeleton h={320} style={{ borderRadius: 14 }} />
        ) : error ? (
          <div className="card"><Empty title="Chamado não encontrado">{error}</Empty></div>
        ) : data ? (
          <div className="stack" style={{ gap: 16 }}>
            <section className="card card-pad stack">
              <div className="row-between wrap">
                <span className="mono muted">{data.protocol}</span>
                <StatusBadge status={data.status} />
              </div>
              <h1 style={{ fontSize: 24 }}>{data.subject}</h1>
              <p className="small muted">Aberto em {fmtDateTime(data.created_at)}{data.category ? ` · ${data.category}` : ''}</p>
              <div className="row" style={{ gap: 0, marginTop: 6 }}>
                {STEPS.map((s, i) => (
                  <div key={s.label} className="grow" style={{ textAlign: 'center' }}>
                    <div style={{ height: 4, borderRadius: 99, margin: '0 3px', background: i <= stepIndex ? 'var(--sn-blue)' : 'var(--sn-border)' }} />
                    <div className="tiny" style={{ marginTop: 6, fontWeight: i === stepIndex ? 700 : 500, color: i <= stepIndex ? 'var(--sn-navy)' : 'var(--sn-text-3)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="thread">
              <div className="msg">
                <div className="avatar neutral">{initials(data.requester_name)}</div>
                <div className="bubble">
                  <div className="meta"><strong>{data.requester_name}</strong> · {fmtDateTime(data.created_at)}</div>
                  <div className="body">{data.description}</div>
                </div>
              </div>
              {data.messages.map((m, i) => (
                <div key={i} className={`msg ${m.author_type === 'agent' ? 'agent' : ''}`}>
                  <div className={`avatar ${m.author_type === 'customer' ? 'neutral' : ''}`}>{initials(m.author_name)}</div>
                  <div className="bubble">
                    <div className="meta"><strong>{m.author_name}</strong> · {fmtDateTime(m.created_at)}</div>
                    <div className="body">{m.body}</div>
                  </div>
                </div>
              ))}
            </section>

            {msg && <div className="alert alert-info">{msg}</div>}

            {(data.status === 'resolved' || data.status === 'closed') && data.csat == null && !data.resolved_by_ai && (
              <section className="card card-pad stack" style={{ alignItems: 'flex-start' }}>
                <h3>Como foi o atendimento?</h3>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => rate(n)} aria-label={`${n} de 5`}>{['😞', '🙁', '😐', '🙂', '😄'][n - 1]}</button>
                  ))}
                </div>
              </section>
            )}

            <section className="composer">
              <textarea className="textarea" placeholder="Escreva uma mensagem para o time de suporte…" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Mensagem" />
              <div className="composer-bar">
                <span className="tiny muted">{data.status === 'resolved' || data.status === 'closed' ? 'Responder reabre o chamado.' : ''}</span>
                <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || !reply.trim()}>
                  {busy ? <span className="spinner" /> : <Send size={14} />} Enviar
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
