import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './lib/auth';
import { Analytics } from './pages/Analytics';
import { DataHub } from './pages/DataHub';
import { Insights } from './pages/Insights';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Login } from './pages/Login';
import { NewTicket } from './pages/NewTicket';
import { Overview } from './pages/Overview';
import { Portal } from './pages/Portal';
import { PortalTrack } from './pages/PortalTrack';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { TicketDetail } from './pages/TicketDetail';
import { Tickets } from './pages/Tickets';

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/portal/acompanhar" element={<PortalTrack />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="tickets/novo" element={<NewTicket />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="insights" element={<Insights />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="kb" element={<KnowledgeBase />} />
        <Route path="dados" element={<DataHub />} />
        <Route path="equipe" element={<Team />} />
        <Route path="configuracoes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
