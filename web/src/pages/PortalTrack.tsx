import { ArrowLeft, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Empty, Logo, Skeleton, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, initials } from '../lib/domain';
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
  accessToken: string;
  messages: { author_type: string; author_name: string; body: string; created_at: string }[];
}

const STEPS: { key: Status[]; label: string }[] = [
  { key: ['new'], label: 'Recebido' },
  { key: ['in_progress', 'waiting'], label: 'Em atendimento' },
  { key: ['resolved', 'closed'], label: 'Resolvido' },
];

/**
 * Acompanhamento do chamado pelo cliente. O acesso é por um token assinado no link
 * (?t=...) ou pelo e-mail digitado aqui: o e-mail nunca vai para a URL.
 */
export function PortalTrack() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const protocol = params.get('protocolo') ?? '';
  const token = params.get('t') ?? '';
  const stateEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [data, setData] = useState<PublicTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(
    async (cred: { token?: string; email?: string }) => {
      if (!protocol) return;
      setLoading(true);
      setError(null);
      try {
        const d = await api<PublicTicket>(`/public/tickets/${encodeURIComponent(protocol)}/access`, { body: cred });
        setData(d);
        // Troca o e-mail pelo token na URL, para recarregar/compartilhar o link sem expor o e-mail.
        if (!token) navigate(`/portal/acompanhar?protocolo=${encodeURIComponent(d.protocol)}&t=${d.accessToken}`, { replace: true });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [protocol, token, navigate],
  );

  useEffect(() => {
    if (token) void load({ token });
    else if (stateEmail) void load({ email: stateEmail });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol, token]);

  async function send() {
    if (!reply.trim() || !data) return;
    setBusy(true);
    try {
      await api(`/public/tickets/${encodeURIComponent(protocol)}/messages`, { body: { token: data.accessToken, body: reply } });
      setReply('');
      setMsg('Mensagem enviada. O time foi notificado.');
      await load({ token: data.accessToken });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rate(score: number) {
    if (!data) return;
    try {
      await api(`/public/tickets/${encodeURIComponent(protocol)}/csat`, { body: { token: data.accessToken, score } });
      setMsg('Obrigado pela avaliação!');
      await load({ token: data.accessToken });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault();
    void load({ email: email.trim() });
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
        {!protocol ? (
          <div className="card"><Empty title="Informe o protocolo">Use o formulário da central de ajuda para consultar um chamado.</Empty></div>
        ) : loading && !data ? (
          <Skeleton h={320} style={{ borderRadius: 14 }} />
        ) : !data ? (
          <form className="card card-pad stack" onSubmit={submitEmail} style={{ maxWidth: 460 }}>
            <h2>Acompanhar chamado</h2>
            <p className="small muted">Protocolo <span className="mono">{protocol}</span>. Para sua segurança, confirme o e-mail usado na abertura.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <input className="input" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" />
            <button className="btn btn-primary">Consultar</button>
          </form>
        ) : (
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
        )}
      </div>
    </div>
  );
}
