import { ArrowLeft, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AiLabel, AiMark, CategoryChip, PriorityBadge, RiskMeter, useToast } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_COLOR, CATEGORY_LABEL, CHANNEL_LABEL, SENTIMENT_LABEL, STATUS_LABEL } from '../lib/domain';
import { useApi, useDebounced } from '../lib/hooks';
import type { Analysis, Channel, Customer, Status, Ticket } from '../lib/types';

const EXAMPLES = [
  {
    label: 'Operação parada',
    subject: 'Ninguém consegue acessar a plataforma',
    description: 'Urgente! Desde as 8h toda a equipe está sem acesso, o login com SSO do Azure retorna erro de assinatura. Estamos com o faturamento parado.',
  },
  {
    label: 'Cobrança',
    subject: 'Cobrança em duplicidade',
    description: 'Fomos cobrados duas vezes na fatura de novembro. É a segunda vez que isso acontece, se continuar vamos avaliar o cancelamento.',
  },
  {
    label: 'Dúvida',
    subject: 'Como agendar relatórios',
    description: 'Olá! Gostaria de saber se é possível agendar o envio automático do relatório semanal para a diretoria. Obrigado!',
  },
];

interface Preview {
  analysis: Analysis | null;
  similar: { id: number; subject: string; status: Status; score: number }[];
}

export function NewTicket() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: customers } = useApi<Customer[]>('/customers');
  const [form, setForm] = useState({
    subject: '',
    description: '',
    requesterName: '',
    requesterEmail: '',
    customerId: '' as string,
    channel: 'email' as Channel,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Debounce sobre uma string estável (um objeto novo a cada render reiniciaria o timer em loop).
  const debouncedKey = useDebounced(JSON.stringify([form.subject, form.description, form.customerId]), 300);

  useEffect(() => {
    const [subject, description, customerId] = JSON.parse(debouncedKey) as [string, string, string];
    const debounced = { subject, description, customerId };
    if (debounced.subject.length + debounced.description.length < 8) {
      setPreview(null);
      return;
    }
    const ctrl = new AbortController();
    setPreviewing(true);
    api<Preview>('/ai/preview', {
      body: { subject: debounced.subject, description: debounced.description, customerId: debounced.customerId ? Number(debounced.customerId) : null },
      signal: ctrl.signal,
    })
      .then(setPreview)
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setPreviewing(false));
    return () => ctrl.abort();
  }, [debouncedKey]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await api<{ ticket: Ticket; analysis: Analysis }>('/tickets', {
        body: { ...form, customerId: form.customerId ? Number(form.customerId) : null },
      });
      toast(`Ticket #${r.ticket.id} criado e analisado pela IA.`);
      navigate(`/tickets/${r.ticket.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const a = preview?.analysis;

  return (
    <main className="page">
      <Link to="/tickets" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}>
        <ArrowLeft size={15} /> Tickets
      </Link>
      <div className="page-header">
        <div>
          <h1>Novo ticket</h1>
          <p className="muted" style={{ marginTop: 4 }}>A IA analisa o chamado enquanto você digita.</p>
        </div>
        <div className="row wrap">
          <span className="small muted">Exemplos:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  subject: ex.subject,
                  description: ex.description,
                  requesterName: f.requesterName || 'Carla Mendes',
                  requesterEmail: f.requesterEmail || 'carla.mendes@orbepay.com.br',
                  customerId: f.customerId || String(customers?.find((c) => c.name === 'Orbe Pay')?.id ?? ''),
                }))
              }
            >
              <Wand2 size={13} /> {ex.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ticket-layout">
        <form className="card card-pad stack" onSubmit={submit} style={{ gap: 14 }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="grid grid-2" style={{ gap: 14 }}>
            <label className="field">
              <span>Cliente</span>
              <select className="select" value={form.customerId} onChange={set('customerId')}>
                <option value="">Selecione…</option>
                {customers?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.plan}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Canal</span>
              <select className="select" value={form.channel} onChange={set('channel')}>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Nome do solicitante</span>
              <input className="input" required value={form.requesterName} onChange={set('requesterName')} />
            </label>
            <label className="field">
              <span>E-mail do solicitante</span>
              <input className="input" type="email" required value={form.requesterEmail} onChange={set('requesterEmail')} />
            </label>
          </div>
          <label className="field">
            <span>Assunto</span>
            <input className="input" required minLength={3} value={form.subject} onChange={set('subject')} placeholder="Resumo curto do problema" />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea className="textarea" required minLength={10} style={{ minHeight: 180 }} value={form.description} onChange={set('description')} placeholder="O que aconteceu, desde quando, quem é afetado…" />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : null} Criar ticket
            </button>
          </div>
        </form>

        <aside className="stack" style={{ gap: 16 }}>
          <section className="card ai-panel">
            <div className="card-header">
              <AiLabel>Prévia da análise</AiLabel>
              {previewing && <span className="spinner" style={{ color: 'var(--sn-lavender)' }} />}
            </div>
            <div className="card-body stack">
              {!a ? (
                <p className="small muted">Comece a escrever o assunto e a descrição para ver a categoria, a prioridade e o sentimento sugeridos.</p>
              ) : (
                <>
                  <div className="row-between">
                    <CategoryChip category={a.category} />
                    <PriorityBadge priority={a.priority} />
                  </div>
                  <div className="stack-sm">
                    {a.ranking.slice(0, 3).map((r) => (
                      <div key={r.category} className="bar-row">
                        <span className="small">{CATEGORY_LABEL[r.category]}</span>
                        <span className="small num muted">{Math.round(r.probability * 100)}%</span>
                        <span className="bar-track"><span style={{ width: `${r.probability * 100}%`, background: CATEGORY_COLOR[r.category] }} /></span>
                      </div>
                    ))}
                  </div>
                  <div className="row-between">
                    <span className="small">Sentimento: <strong className={`sent-${a.sentiment}`}>{SENTIMENT_LABEL[a.sentiment]}</strong></span>
                    <RiskMeter value={a.churnRisk} />
                  </div>
                  {a.signals.length > 0 && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {a.signals.map((s) => <span key={s} className="signal">{s}</span>)}
                    </div>
                  )}
                  {a.tags.length > 0 && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {a.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  )}
                  <p className="tiny muted">Prévia instantânea do motor local. Ao salvar, a análise completa é registrada no ticket.</p>
                </>
              )}
            </div>
          </section>

          {preview && preview.similar.length > 0 && (
            <section className="card card-pad">
              <div className="alert alert-ai" style={{ marginBottom: 10 }}>
                <AiMark />
                <span>Encontramos {preview.similar.length} tickets parecidos. Vale conferir antes de abrir um novo.</span>
              </div>
              {preview.similar.map((s) => (
                <Link key={s.id} to={`/tickets/${s.id}`} className="list-link" target="_blank">
                  <span className="small" style={{ fontWeight: 600, color: 'var(--sn-navy)' }}>{s.subject}</span>
                  <span className="tiny muted">#{s.id} · {STATUS_LABEL[s.status]} · {Math.round(s.score * 100)}% similar</span>
                </Link>
              ))}
            </section>
          )}

          {a && a.kbArticles.length > 0 && (
            <section className="card card-pad">
              <h3 style={{ marginBottom: 6 }}>Artigos relacionados</h3>
              {a.kbArticles.map((k) => (
                <Link key={k.id} to={`/kb?article=${k.id}`} className="list-link" target="_blank">
                  <span className="small" style={{ fontWeight: 600, color: 'var(--sn-navy)' }}>{k.title}</span>
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
