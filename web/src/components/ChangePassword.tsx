import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Modal, useToast } from './ui';

/** Regras exibidas e verificadas também no servidor. */
function problem(pw: string) {
  if (pw.length < 8) return 'Pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letras e números.';
  return null;
}

/**
 * Troca da própria senha. Com `forced`, é o primeiro acesso de quem recebeu uma senha temporária
 * e o modal não pode ser fechado sem trocar (só sair da conta).
 */
export function ChangePasswordModal({ onClose, forced = false }: { onClose: () => void; forced?: boolean }) {
  const { setSession, logout, user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rule = next ? problem(next) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (rule) return setError(rule);
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
    setSaving(true);
    try {
      const r = await api<{ token: string; user: User }>('/auth/change-password', { body: { current, next } });
      setSession(r.token, r.user);
      toast('Senha alterada. As outras sessões foram encerradas.');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={forced ? 'Crie a sua senha' : 'Minha conta'}
      onClose={onClose}
      dismissable={!forced}
      width={460}
      footer={
        <>
          {forced ? (
            <button type="button" className="btn btn-secondary" onClick={logout}>Sair</button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          )}
          <button className="btn btn-primary" form="change-password" disabled={saving || !current || !next || !confirm}>
            {saving ? <span className="spinner" /> : <KeyRound size={15} />} Salvar nova senha
          </button>
        </>
      }
    >
      <form id="change-password" className="stack" onSubmit={submit}>
        {forced ? (
          <div className="alert alert-info">Você entrou com uma senha temporária. Defina uma senha pessoal para continuar.</div>
        ) : (
          <div className="small muted">
            {user?.name} · {user?.email}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>{forced ? 'Senha temporária' : 'Senha atual'}</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>Nova senha</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="pw-rule" />
          <span id="pw-rule" className={`tiny ${rule ? 'error-text' : 'muted'}`} style={{ fontWeight: 400 }}>
            {rule ?? 'Mínimo de 8 caracteres, com letras e números.'}
          </span>
        </label>
        <label className="field">
          <span>Confirmar nova senha</span>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
