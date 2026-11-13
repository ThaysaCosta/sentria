import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AiMark, Logo, PerceptionField } from '../components/ui';
import { useAuth } from '../lib/auth';

const DEMO = { email: 'marina@sentria.demo', password: 'sentria123' };

export function Login() {
  const { user, login, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Só mostra o acesso de exemplo quando o servidor tem contas de demonstração.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { demo?: boolean }) => setDemo(Boolean(d.demo)))
      .catch(() => setDemo(false));
  }, []);

  if (ready && user) return <Navigate to={from} replace />;

  async function submit(e?: FormEvent, creds = { email, password }) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(creds.email, creds.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <PerceptionField className="field-bg" dense />
        <Logo height={30} />
        <div style={{ marginTop: 'auto', marginBottom: 32 }}>
          <div className="label" style={{ color: '#9fb0c8', marginBottom: 14 }}>Customer Intelligence Platform</div>
          <h1>Every interaction tells a story.</h1>
          <p className="lead">
            Entre para ver o que seus clientes estão dizendo, mesmo quando não dizem com todas as palavras.
          </p>
        </div>
        <div className="stat">
          <AiMark size={16} />
          <span>
            A SENTRIA lê cada chamado, categoriza, prioriza, sugere respostas e encontra padrões antes que virem crise.
          </span>
        </div>
      </section>

      <section className="login-form">
        <form onSubmit={submit}>
          <div>
            <h1 style={{ fontSize: 28 }}>Entrar na SENTRIA</h1>
            <p className="muted" style={{ marginTop: 6 }}>Use o e-mail corporativo da sua equipe.</p>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </label>
          <button className="btn btn-primary btn-lg btn-block" disabled={loading}>
            {loading ? <span className="spinner" /> : null} Entrar <ArrowRight size={16} />
          </button>
          {demo && (
            <div className="demo-box">
              <div className="row" style={{ marginBottom: 6 }}>
                <Sparkles size={15} color="var(--sn-blue)" />
                <strong>Ambiente de demonstração</strong>
              </div>
              <p className="muted small" style={{ marginBottom: 10 }}>
                Dados fictícios com 90 dias de histórico. Acesso: <span className="mono">{DEMO.email}</span> · <span className="mono">{DEMO.password}</span>
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading}
                onClick={() => {
                  setEmail(DEMO.email);
                  setPassword(DEMO.password);
                  void submit(undefined, DEMO);
                }}
              >
                Entrar como Marina (Head de Suporte)
              </button>
            </div>
          )}
          <p className="small muted" style={{ textAlign: 'center' }}>
            É cliente? <Link to="/portal">Abra ou acompanhe um chamado no portal</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
