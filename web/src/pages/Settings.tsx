import { CheckCircle2, CircleAlert, Cpu, KeyRound, Users } from 'lucide-react';
import { AiMark, Skeleton } from '../components/ui';
import { Link } from 'react-router-dom';
import { PRIORITY_LABEL, fmtDateTime, fmtNumber } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { AiStatus, Priority, User } from '../lib/types';

const SLA: Record<Priority, number> = { critical: 4, high: 8, medium: 24, low: 48 };

export function Settings() {
  const { data: status } = useApi<AiStatus>('/ai/status');
  const { data: users } = useApi<User[]>('/users');

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Workspace</div>
          <h1>Configurações</h1>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card ai-panel">
          <div className="card-header">
            <h2 className="row"><AiMark size={18} /> Motor de IA</h2>
          </div>
          <div className="card-body stack">
            {!status ? (
              <Skeleton h={160} />
            ) : (
              <>
                <div className={`alert ${status.claudeConfigured ? 'alert-ai' : 'alert-info'}`}>
                  {status.claudeConfigured ? <CheckCircle2 size={18} /> : <Cpu size={18} />}
                  <div>
                    <strong>{status.claudeConfigured ? `Claude conectado (${status.claudeModel})` : 'Motor local ativo'}</strong>
                    <div className="small" style={{ marginTop: 2 }}>
                      {status.claudeConfigured
                        ? 'Novos chamados, reanálises e resumos executivos usam o Claude. O motor local roda junto como base instantânea e plano B.'
                        : 'Classificação, prioridade, sentimento, risco e sugestões rodam 100% localmente, sem custo e sem enviar dados para fora.'}
                    </div>
                  </div>
                </div>
                {status.lastClaudeError && (
                  <div className="alert alert-warn">
                    <CircleAlert size={18} />
                    <span>Última falha do Claude ({fmtDateTime(status.lastClaudeError.at)}): {status.lastClaudeError.message} A SENTRIA usou o motor local automaticamente.</span>
                  </div>
                )}
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <div><div className="label">Modelo local</div><div className="mono">{status.localModel}</div></div>
                  <div><div className="label">Exemplos de treino</div><div className="num" style={{ fontWeight: 600 }}>{fmtNumber(status.trainingExamples)}</div></div>
                  <div><div className="label">Correções humanas aprendidas</div><div className="num" style={{ fontWeight: 600 }}>{fmtNumber(status.humanFeedbackExamples)}</div></div>
                  <div><div className="label">Artigos indexados</div><div className="num" style={{ fontWeight: 600 }}>{status.knowledgeBaseArticles}</div></div>
                </div>
                {!status.claudeConfigured && (
                  <div className="card card-pad" style={{ background: 'var(--sn-bg)', boxShadow: 'none' }}>
                    <div className="row" style={{ marginBottom: 6 }}><KeyRound size={16} /> <strong>Ativar o Claude</strong></div>
                    <ol className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Crie uma chave em console.anthropic.com.</li>
                      <li>Copie <span className="mono">.env.example</span> para <span className="mono">.env</span> na raiz do projeto.</li>
                      <li>Preencha <span className="mono">ANTHROPIC_API_KEY=</span> e reinicie o servidor.</li>
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Metas de SLA</h2>
            <table className="table">
              <thead><tr><th>Prioridade</th><th>Prazo de resolução</th></tr></thead>
              <tbody>
                {(Object.keys(SLA) as Priority[]).map((p) => (
                  <tr key={p}><td><span className={`badge pr-${p}`}>{PRIORITY_LABEL[p]}</span></td><td className="num">{SLA[p]} horas</td></tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 8 }}>Ao mudar a prioridade de um ticket, o prazo é recalculado a partir da abertura.</p>
          </section>

          <section className="card card-pad">
            <h2 className="row" style={{ marginBottom: 8 }}><Users size={18} /> Equipe</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>{users ? `${users.length} pessoa(s) ativa(s).` : ''} Convide atendentes, defina papéis e desative acessos.</p>
            <Link to="/equipe" className="btn btn-secondary btn-sm">Gerenciar equipe</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
