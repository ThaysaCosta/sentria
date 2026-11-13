import { AlertTriangle, Globe, Monitor, MousePointerClick, Navigation, PanelsTopLeft } from 'lucide-react';
import type { TicketContext } from '../lib/types';

/** Navegador e sistema operacional legíveis a partir do user agent. */
function describeBrowser(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const version = ua.match(/(?:Edg|Chrome|Firefox|Version)\/(\d+)/)?.[1];
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${version ? ` ${version}` : ''}${os ? ` · ${os}` : ''}`;
}

const CRUMB_ICON = { nav: Navigation, click: MousePointerClick, http: Globe, error: AlertTriangle } as const;

/** Contexto técnico capturado pelo widget dentro do sistema do cliente. */
export function TechContext({ context }: { context: TicketContext }) {
  const errors = context.errors ?? [];
  const crumbs = context.breadcrumbs ?? [];
  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between">
        <h3 className="row"><PanelsTopLeft size={16} /> Contexto capturado pelo widget</h3>
        {context.trigger === 'error' && <span className="badge pr-critical">Aberto a partir de um erro</span>}
      </div>
      <div className="grid grid-2" style={{ gap: 10 }}>
        <div>
          <div className="label">Sistema</div>
          <div className="small">{context.app?.name ?? '—'}{context.app?.version ? ` · v${context.app.version}` : ''}</div>
        </div>
        <div>
          <div className="label">Tela</div>
          <div className="small truncate" title={context.page?.url}>{context.page?.title ?? '—'} <span className="mono muted">{context.page?.path}</span></div>
        </div>
        <div>
          <div className="label">Navegador</div>
          <div className="small row" style={{ gap: 6 }}><Monitor size={13} /> {describeBrowser(context.browser?.userAgent)}</div>
        </div>
        <div>
          <div className="label">Tela do usuário</div>
          <div className="small">{context.browser?.screen ?? '—'} · {context.browser?.language ?? ''}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="stack-sm">
          <div className="label">Erros capturados</div>
          {errors.map((e, i) => (
            <div key={i} className="mono" style={{ background: 'var(--sn-critical-soft)', color: '#9f2b35', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-word' }}>
              {e.type === 'http' ? `${e.method ?? ''} ${e.url ?? ''} → ${e.status ?? ''}` : e.type.toUpperCase()}
              <div style={{ opacity: 0.85 }}>{e.message}</div>
            </div>
          ))}
        </div>
      )}

      {crumbs.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Últimas ações do usuário</div>
          <ol className="timeline" style={{ gap: 8 }}>
            {crumbs.map((c, i) => {
              const Icon = CRUMB_ICON[c.type] ?? Navigation;
              return (
                <li key={i}>
                  <span className="tl-dot" style={c.type === 'error' ? { color: 'var(--sn-critical)', borderColor: '#f2cdd0', background: 'var(--sn-critical-soft)' } : undefined}>
                    <Icon size={11} />
                  </span>
                  <span className="small" style={{ alignSelf: 'center' }}>{c.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
