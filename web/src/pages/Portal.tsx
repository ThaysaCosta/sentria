import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Search, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AiLabel, AiMark, Logo, PerceptionField } from '../components/ui';
import { api } from '../lib/api';
import { useDebounced } from '../lib/hooks';

interface Suggestion {
  articles: { id: number; title: string; body: string; score: number }[];
  category: { key: string; label: string; confidence: number } | null;
}

export function Portal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', company: '', subject: '', description: '' });
  const [suggest, setSuggest] = useState<Suggestion | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ protocol: string; resolved: boolean } | null>(null);
  const [track, setTrack] = useState({ protocol: '', email: '' });
  const key = useDebounced(`${form.subject}\n${form.description}`, 450);

  useEffect(() => {
    const [subject, description] = key.split('\n');
    if ((subject + description).trim().length < 10) {
      setSuggest(null);
      return;
    }
    const ctrl = new AbortController();
    api<Suggestion>('/public/suggest', { body: { subject, description }, signal: ctrl.signal })
      .then(setSuggest)
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e?: FormEvent, resolvedBy?: number) {
    e?.preventDefault();
    setError(null);
    if (resolvedBy && (!form.name || !form.email)) {
      setError('Preencha nome e e-mail para registrarmos o atendimento.');
      return;
    }
    setSending(true);
    try {
      const r = await api<{ protocol: string; status: string }>('/public/tickets', {
        body: { ...form, resolvedBySuggestion: Boolean(resolvedBy), articleId: resolvedBy },
      });
      setDone({ protocol: r.protocol, resolved: Boolean(resolvedBy) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="portal">
      <header className="portal-top">
        <div className="inner">
          <Logo height={24} />
          <Link to="/login" className="small" style={{ color: '#c9d4e5' }}>Acesso da equipe</Link>
        </div>
      </header>
      <section className="portal-hero">
        <PerceptionField className="field-bg" />
        <div className="inner">
          <div className="label" style={{ color: '#9fb0c8' }}>Central de ajuda</div>
          <h1>Como podemos ajudar?</h1>
          <p>Descreva o que está acontecendo. Enquanto você escreve, buscamos respostas na nossa base de conhecimento.</p>
        </div>
      </section>

      <div className="portal-body">
        {done ? (
          <div className="card card-pad stack" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', alignItems: 'center', padding: 36 }}>
            <CheckCircle2 size={40} color="var(--sn-success)" />
            <h2 style={{ fontSize: 22 }}>{done.resolved ? 'Que bom que conseguimos ajudar!' : 'Recebemos o seu chamado'}</h2>
            <p className="muted">
              {done.resolved
                ? 'Registramos o atendimento como resolvido pelo autoatendimento. Se o problema voltar, responda pelo acompanhamento.'
                : 'Seu chamado foi analisado e encaminhado para o time responsável. Você receberá as atualizações por aqui.'}
            </p>
            <div className="card card-pad" style={{ background: 'var(--sn-bg)', boxShadow: 'none' }}>
              <div className="label">Protocolo</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: 'var(--sn-navy)' }}>{done.protocol}</div>
            </div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/portal/acompanhar?protocolo=${done.protocol}&email=${encodeURIComponent(form.email)}`)}>
                Acompanhar chamado <ArrowRight size={15} />
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setDone(null);
                  setForm((f) => ({ ...f, subject: '', description: '' }));
                }}
              >
                Abrir outro chamado
              </button>
            </div>
          </div>
        ) : (
          <div className="portal-grid">
            <form className="card card-pad stack" onSubmit={submit} style={{ gap: 14 }}>
              <h2>Abrir um chamado</h2>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="grid grid-2" style={{ gap: 14 }}>
                <label className="field"><span>Seu nome</span><input className="input" required value={form.name} onChange={set('name')} autoComplete="name" /></label>
                <label className="field"><span>E-mail</span><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></label>
              </div>
              <label className="field"><span>Empresa</span><input className="input" value={form.company} onChange={set('company')} autoComplete="organization" placeholder="Opcional" /></label>
              <label className="field"><span>Assunto</span><input className="input" required minLength={3} value={form.subject} onChange={set('subject')} placeholder="Ex.: Boleto não foi gerado" /></label>
              <label className="field">
                <span>Descreva o problema</span>
                <textarea className="textarea" required minLength={10} style={{ minHeight: 150 }} value={form.description} onChange={set('description')} placeholder="O que aconteceu, desde quando e quem é afetado." />
              </label>
              <div className="row-between wrap">
                <span className="tiny muted">Seus dados são usados apenas para responder a este chamado.</span>
                <button className="btn btn-primary" disabled={sending}>
                  {sending ? <span className="spinner" /> : <Send size={15} />} Enviar chamado
                </button>
              </div>
            </form>

            <div className="stack" style={{ gap: 16 }}>
              <section className="card card-pad stack">
                <AiLabel>Talvez isso resolva</AiLabel>
                {!suggest || suggest.articles.length === 0 ? (
                  <p className="small muted">
                    {suggest ? 'Não encontramos um artigo para este caso. Envie o chamado que o nosso time responde.' : 'Comece a descrever o problema para ver sugestões.'}
                  </p>
                ) : (
                  suggest.articles.map((a) => (
                    <div key={a.id} className="article-card">
                      <button
                        type="button"
                        className="row-between"
                        style={{ width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      >
                        <strong className="small" style={{ color: 'var(--sn-navy)' }}>{a.title}</strong>
                        {expanded === a.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {expanded === a.id && (
                        <>
                          <p className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>{a.body}</p>
                          <button type="button" className="btn btn-ai btn-sm" style={{ marginTop: 10 }} disabled={sending} onClick={() => submit(undefined, a.id)}>
                            <AiMark size={13} /> Isso resolveu meu problema
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
                {suggest?.category && <p className="tiny muted">Assunto identificado: {suggest.category.label}</p>}
              </section>

              <form
                className="card card-pad stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(`/portal/acompanhar?protocolo=${encodeURIComponent(track.protocol.trim())}&email=${encodeURIComponent(track.email.trim())}`);
                }}
              >
                <h3 className="row"><Search size={16} /> Acompanhar um chamado</h3>
                <input className="input mono" placeholder="Protocolo (ex.: SNT2026049213)" required value={track.protocol} onChange={(e) => setTrack({ ...track, protocol: e.target.value })} />
                <input className="input" type="email" placeholder="E-mail usado na abertura" required value={track.email} onChange={(e) => setTrack({ ...track, email: e.target.value })} />
                <button className="btn btn-secondary">Consultar</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
