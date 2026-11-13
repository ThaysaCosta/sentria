import { ArrowRight, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { CATEGORY_LABEL, STATUS_LABEL } from '../lib/domain';
import type { Insight, Status } from '../lib/types';
import { AiLabel, AiMark, Confidence, Modal, PerceptionField, useToast } from './ui';

const SEVERITY_LABEL = { critical: 'Prioridade alta', warning: 'Atenção', info: 'Informativo' } as const;
const SEVERITY_COLOR = { critical: '#F08A92', warning: '#F2C27A', info: '#9FB0C8' } as const;

/** Comunicado sugerido para responder todos os tickets de um incidente de uma vez. */
function draftAnnouncement(insight: Insight) {
  const topic = insight.headline.match(/sobre (.+?) nas últimas/)?.[1] ?? (insight.category ? CATEGORY_LABEL[insight.category].toLowerCase() : 'este problema');
  return `Olá, {{nome}}!

Identificamos uma instabilidade relacionada a ${topic} que está afetando alguns clientes, e o seu chamado faz parte desse grupo. Nosso time técnico já está trabalhando na correção.

Vamos atualizar este chamado assim que o serviço for normalizado. Você não precisa abrir um novo chamado.

Pedimos desculpas pelo transtorno.
Equipe de Suporte`;
}

export function InsightCard({ insight, compact = false, onChanged }: { insight: Insight; compact?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const link = `/tickets?ids=${insight.ticketIds.slice(0, 300).join(',')}&title=${encodeURIComponent(insight.headline)}`;
  const canBroadcast = insight.type === 'spike' || insight.type === 'cluster';
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('in_progress');
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const r = await api<{ sent: number }>('/tickets/bulk-reply', { body: { ids: insight.ticketIds.slice(0, 300), body: message, status } });
      toast(`Comunicado enviado para ${r.sent} tickets.`);
      setOpen(false);
      onChanged?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ai-card">
      <PerceptionField />
      <div className="row-between" style={{ marginBottom: 10 }}>
        <AiLabel />
        <span className="tiny" style={{ color: SEVERITY_COLOR[insight.severity], fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {SEVERITY_LABEL[insight.severity]}
        </span>
      </div>
      <h3 style={{ fontSize: compact ? 16 : 18, lineHeight: 1.35 }}>{insight.title}</h3>
      <p style={{ marginTop: 6, color: '#fff', fontWeight: 600 }}>{insight.headline}</p>
      <p className="meta" style={{ marginTop: 6 }}>{insight.description}</p>
      {!compact && insight.metrics.length > 0 && (
        <div className="row wrap" style={{ gap: 18, marginTop: 14 }}>
          {insight.metrics.map((m) => (
            <div key={m.label}>
              <div className="tiny" style={{ color: '#8fa1bb', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{m.label}</div>
              <div className="num" style={{ color: '#fff', fontWeight: 600, fontSize: 17 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="action">
        <strong style={{ color: '#fff' }}>Ação sugerida:</strong> {insight.suggestedAction}
      </div>
      <div className="row-between wrap" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 170, flex: '0 1 220px' }}>
          <Confidence value={insight.confidence} light />
        </div>
        <div className="row wrap">
          {canBroadcast && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setMessage(draftAnnouncement(insight));
                setOpen(true);
              }}
            >
              <Megaphone size={14} /> Responder todos
            </button>
          )}
          <Link to={link} className="btn btn-secondary btn-sm">
            Ver {insight.ticketIds.length} tickets <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {open && (
        <Modal
          title={`Comunicado para ${insight.ticketIds.length} tickets`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={send} disabled={sending || message.trim().length < 10}>
                {sending ? <span className="spinner" /> : <Megaphone size={15} />} Enviar para todos
              </button>
            </>
          }
        >
          <div className="stack" style={{ color: 'var(--sn-text)' }}>
            <div className="alert alert-ai">
              <AiMark />
              <span>Rascunho sugerido pela SENTRIA. <span className="mono">{'{{nome}}'}</span> é trocado pelo primeiro nome de cada cliente.</span>
            </div>
            <textarea className="textarea" style={{ minHeight: 220 }} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Mensagem do comunicado" />
            <label className="prop" style={{ gridTemplateColumns: '160px 1fr' }}>
              <span>Status após o envio</span>
              <select className="select select-sm" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {(['in_progress', 'waiting', 'resolved'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
