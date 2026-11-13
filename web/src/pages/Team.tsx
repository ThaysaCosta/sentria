import { Copy, KeyRound, Lock, ShieldCheck, UserMinus, UserPlus, UserRoundCheck, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Empty, Modal, Skeleton, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtNumber, fmtRelative, initials } from '../lib/domain';
import { useApi } from '../lib/hooks';

interface Member {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  title: string | null;
  active: boolean;
  protected: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  open_tickets: number;
  resolved_30d: number;
}

const ROLE_LABEL = { admin: 'Administrador', agent: 'Atendente' } as const;

export function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const { data, loading, reload } = useApi<{ members: Member[]; demoMode: boolean }>('/team');
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', title: '', role: 'agent' as 'agent' | 'admin' });
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ temporaryPassword: string }>('/team', { body: form });
      setInviting(false);
      setSecret({ name: form.name, email: form.email, password: r.temporaryPassword });
      setForm({ name: '', email: '', title: '', role: 'agent' });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function update(m: Member, patch: Partial<Pick<Member, 'role' | 'active'>>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(m.id);
    try {
      const r = await api<{ unassigned: number }>(`/team/${m.id}`, { method: 'PATCH', body: patch });
      toast(
        patch.active === false
          ? `${m.name} foi desativado(a).${r.unassigned ? ` ${r.unassigned} ticket(s) voltaram para a fila.` : ''}`
          : patch.active === true
            ? `${m.name} foi reativado(a).`
            : 'Papel atualizado. A mudança vale a partir do próximo acesso.',
      );
      reload();
    } catch (err) {
      toast((err as Error).message, 'error');
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(m: Member) {
    if (!window.confirm(`Gerar uma nova senha temporária para ${m.name}? As sessões abertas dessa pessoa serão encerradas.`)) return;
    setBusy(m.id);
    try {
      const r = await api<{ temporaryPassword: string }>(`/team/${m.id}/reset-password`, { method: 'POST' });
      setSecret({ name: m.name, email: m.email, password: r.temporaryPassword });
      reload();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const members = data?.members ?? [];
  const active = members.filter((m) => m.active);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Workspace</div>
          <h1>Equipe</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {data ? `${active.length} pessoa(s) ativa(s) · ${active.filter((m) => m.role === 'admin').length} administrador(es)` : 'Carregando…'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setError(null); setInviting(true); }}>
            <UserPlus size={16} /> Convidar pessoa
          </button>
        )}
      </div>

      {data?.demoMode && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <Lock size={16} />
          <span>Demonstração pública: as contas de exemplo estão protegidas e não podem ser desativadas nem ter a senha trocada. Você pode convidar novas pessoas para testar.</span>
        </div>
      )}
      {!isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <ShieldCheck size={16} />
          <span>Somente administradores podem convidar pessoas ou alterar acessos.</span>
        </div>
      )}

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Papel</th>
                <th className="hide-mobile">Tickets abertos</th>
                <th className="hide-mobile">Resolvidos (30d)</th>
                <th className="hide-mobile">Último acesso</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}><td colSpan={7}><Skeleton h={22} /></td></tr>
                  ))
                : members.map((m) => {
                    const self = m.id === user?.id;
                    const locked = Boolean(data?.demoMode && m.protected);
                    return (
                      <tr key={m.id} style={m.active ? undefined : { opacity: 0.6 }}>
                        <td>
                          <div className="row" style={{ gap: 10 }}>
                            <div className="avatar sm">{initials(m.name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="small" style={{ fontWeight: 600 }}>
                                {m.name} {self && <span className="tiny muted">(você)</span>} {locked && <Lock size={11} aria-label="Conta de demonstração protegida" />}
                              </div>
                              <div className="tiny muted truncate">{m.email}{m.title ? ` · ${m.title}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isAdmin && !self && !locked && m.active ? (
                            <select
                              className="select select-sm"
                              style={{ width: 'auto' }}
                              value={m.role}
                              disabled={busy === m.id}
                              onChange={(e) => update(m, { role: e.target.value as Member['role'] })}
                              aria-label={`Papel de ${m.name}`}
                            >
                              <option value="agent">Atendente</option>
                              <option value="admin">Administrador</option>
                            </select>
                          ) : (
                            <span className={`badge ${m.role === 'admin' ? 'st-new' : 'st-waiting'}`}>{ROLE_LABEL[m.role]}</span>
                          )}
                        </td>
                        <td className="num hide-mobile">{fmtNumber(m.open_tickets)}</td>
                        <td className="num hide-mobile">{fmtNumber(m.resolved_30d)}</td>
                        <td className="small muted hide-mobile">{m.last_login_at ? fmtRelative(m.last_login_at) : 'Nunca entrou'}</td>
                        <td>
                          {!m.active ? (
                            <span className="badge st-closed">Desativado</span>
                          ) : m.must_change_password ? (
                            <span className="badge st-in_progress" title="Ainda não trocou a senha temporária">Convite pendente</span>
                          ) : (
                            <span className="badge st-resolved">Ativo</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {!self && !locked && (
                              <>
                                {m.active && (
                                  <button className="btn btn-ghost btn-sm" disabled={busy === m.id} onClick={() => resetPassword(m)} title="Gerar nova senha temporária">
                                    <KeyRound size={14} /> <span className="hide-mobile">Nova senha</span>
                                  </button>
                                )}
                                {m.active ? (
                                  <button
                                    className="btn btn-danger btn-sm"
                                    disabled={busy === m.id}
                                    onClick={() => update(m, { active: false }, `Desativar ${m.name}? A pessoa perde o acesso na hora e os tickets abertos dela voltam para a fila.`)}
                                  >
                                    <UserMinus size={14} /> <span className="hide-mobile">Desativar</span>
                                  </button>
                                ) : (
                                  <button className="btn btn-secondary btn-sm" disabled={busy === m.id} onClick={() => update(m, { active: true })}>
                                    <UserRoundCheck size={14} /> Reativar
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {data && members.length === 0 && <Empty icon={<Users size={22} />} title="Nenhuma pessoa na equipe" />}
        </div>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h3>Como funciona o acesso</h3>
        <div className="grid grid-3" style={{ marginTop: 10, gap: 20 }}>
          <p className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Convite.</strong> Atendentes não se cadastram sozinhos: o administrador convida e recebe uma senha temporária, exibida uma única vez, que deve ser trocada no primeiro acesso.</p>
          <p className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Desativação.</strong> Quem sai da empresa perde o acesso na hora (as sessões abertas são encerradas) e os tickets dessa pessoa voltam para a fila.</p>
          <p className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Clientes.</strong> Quem abre chamados não precisa de conta: entra pelo widget dentro do sistema que já usa ou pelo portal, identificado por e-mail e protocolo.</p>
        </div>
      </section>

      {inviting && (
        <Modal
          title="Convidar pessoa"
          onClose={() => setInviting(false)}
          width={480}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setInviting(false)}>Cancelar</button>
              <button className="btn btn-primary" form="invite-form"><UserPlus size={15} /> Convidar</button>
            </>
          }
        >
          <form id="invite-form" className="stack" onSubmit={invite}>
            {error && <div className="alert alert-error">{error}</div>}
            <label className="field"><span>Nome</span><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>E-mail corporativo</span><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field"><span>Cargo (opcional)</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Analista de Suporte N1" /></label>
            <label className="field">
              <span>Papel</span>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'agent' | 'admin' })}>
                <option value="agent">Atendente: atende tickets e usa a IA</option>
                <option value="admin">Administrador: também gerencia equipe e dados</option>
              </select>
            </label>
          </form>
        </Modal>
      )}

      {secret && (
        <Modal
          title="Senha temporária gerada"
          onClose={() => setSecret(null)}
          width={480}
          footer={<button className="btn btn-primary" onClick={() => setSecret(null)}>Entendi</button>}
        >
          <div className="stack">
            <p className="small">Envie estes dados para <strong>{secret.name}</strong> por um canal seguro. A senha aparece <strong>só agora</strong> e deve ser trocada no primeiro acesso.</p>
            <div className="card card-pad" style={{ background: 'var(--sn-bg)', boxShadow: 'none' }}>
              <div className="label">E-mail</div>
              <div className="mono">{secret.email}</div>
              <div className="label" style={{ marginTop: 10 }}>Senha temporária</div>
              <div className="row-between">
                <span className="mono" style={{ fontSize: 18, color: 'var(--sn-navy)' }}>{secret.password}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigator.clipboard?.writeText(secret.password).then(() => toast('Senha copiada.'), () => toast('Não foi possível copiar.', 'error'))}
                >
                  <Copy size={14} /> Copiar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
