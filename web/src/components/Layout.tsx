import {
  BarChart3,
  BookOpen,
  Database,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { AiStatus } from '../lib/types';
import { AiMark, Logo } from './ui';

interface NavCounts {
  open: number;
  insights: number;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: status } = useApi<AiStatus>('/ai/status');
  const { data: counts } = useApi<{ kpis: { open: { value: number } }; insightCount: number }>('/analytics/overview?days=7');
  const nav: NavCounts = { open: counts?.kpis.open.value ?? 0, insights: counts?.insightCount ?? 0 };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/tickets', label: 'Tickets', icon: Inbox, count: nav.open },
    { to: '/insights', label: 'AI Insights', icon: null, count: nav.insights, ai: true },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/kb', label: 'Base de conhecimento', icon: BookOpen },
  ];
  const workspace = [
    { to: '/dados', label: 'Dados', icon: Database },
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Logo />
        </div>
        <nav aria-label="Principal">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {l.icon ? <l.icon size={18} strokeWidth={1.75} /> : <AiMark size={18} />}
              {l.label}
              {l.count ? <span className={`count ${l.ai ? 'ai' : ''}`}>{l.count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="nav-section">
          <div className="label">Workspace</div>
          {workspace.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <l.icon size={18} strokeWidth={1.75} />
              {l.label}
            </NavLink>
          ))}
          <a className="nav-link" href="/portal" target="_blank" rel="noreferrer">
            <ExternalLink size={18} strokeWidth={1.75} />
            Portal do cliente
          </a>
        </div>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials(user?.name ?? '')}</div>
            <div className="grow">
              <div className="name truncate">{user?.name}</div>
              <div className="role truncate">{user?.title}</div>
            </div>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <nav className="mobile-nav" aria-label="Principal (mobile)">
          {[...links, ...workspace].map((l) => (
            <NavLink key={l.to} to={l.to} end={'end' in l ? l.end : false} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <header className="topbar">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/tickets?search=${encodeURIComponent(query.trim())}`);
            }}
          >
            <Search size={16} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tickets, clientes, protocolos…"
              aria-label="Buscar"
            />
            <span className="kbd hide-mobile">Ctrl K</span>
          </form>
          <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
            {status && (
              <Link to="/configuracoes" className="engine-pill" title="Motor de IA ativo" style={{ textDecoration: 'none' }}>
                <AiMark size={13} />
                <span className="txt">{status.activeEngine === 'claude' ? `Claude · ${status.claudeModel}` : 'IA local ativa'}</span>
              </Link>
            )}
            <Link to="/tickets/novo" className="btn btn-primary">
              <Plus size={16} /> <span className="hide-mobile">Novo ticket</span>
            </Link>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
