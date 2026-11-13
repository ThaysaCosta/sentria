import { Copy, FileText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { InsightCard } from '../components/InsightCard';
import { AiLabel, AiMark, Empty, Skeleton, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/domain';
import { useApi } from '../lib/hooks';
import type { Insight } from '../lib/types';

interface Summary {
  text: string;
  engine: 'claude' | 'local';
  model?: string;
  fallbackReason?: string;
  generatedAt: string;
}

const TYPE_LABEL: Record<Insight['type'], string> = {
  spike: 'Pico de volume',
  recurring_customer: 'Cliente em risco',
  cluster: 'Tickets parecidos',
  sla: 'SLA',
  sentiment: 'Sentimento',
};

export function Insights() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ insights: Insight[]; generatedAt: string }>('/insights');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<Insight['type'] | 'all'>('all');

  async function generate() {
    setGenerating(true);
    try {
      setSummary(await api<Summary>('/insights/summary', { method: 'POST' }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  const insights = data?.insights ?? [];
  const types = [...new Set(insights.map((i) => i.type))];
  const visible = filter === 'all' ? insights : insights.filter((i) => i.type === filter);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow"><AiLabel /></div>
          <h1>AI Insights</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Padrões, recorrências e riscos encontrados nos chamados dos últimos 30 dias.
            {data && <> Atualizado em {fmtDateTime(data.generatedAt)}.</>}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn btn-secondary" onClick={reload} disabled={loading}>
            <RefreshCw size={15} /> Atualizar
          </button>
          <button className="btn btn-ai" onClick={generate} disabled={generating}>
            {generating ? <span className="spinner" /> : <FileText size={15} />} Gerar resumo executivo
          </button>
        </div>
      </div>

      {summary && (
        <section className="card ai-panel" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="row"><AiMark size={18} /> Resumo executivo · últimos 7 dias</h2>
              <div className="sub">
                Gerado por {summary.engine === 'claude' ? `Claude (${summary.model})` : 'motor local da SENTRIA'} em {fmtDateTime(summary.generatedAt)}
                {summary.fallbackReason ? ` · Claude indisponível: ${summary.fallbackReason}` : ''}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(summary.text).then(() => toast('Resumo copiado.'), () => toast('Não foi possível copiar.', 'error'));
              }}
            >
              <Copy size={14} /> Copiar
            </button>
          </div>
          <div className="card-body">
            <div className="prose" style={{ fontSize: 14.5, maxWidth: 900 }}>{summary.text}</div>
          </div>
        </section>
      )}

      {types.length > 1 && (
        <div className="segmented" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos ({insights.length})</button>
          {types.map((t) => (
            <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
              {TYPE_LABEL[t]} ({insights.filter((i) => i.type === t).length})
            </button>
          ))}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={260} style={{ borderRadius: 14 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <Empty icon={<AiMark size={22} />} title="Nenhum padrão fora do normal">
            A SENTRIA continua monitorando os chamados. Novos padrões aparecem aqui automaticamente.
          </Empty>
        </div>
      ) : (
        <div className="grid grid-2">
          {visible.map((i) => <InsightCard key={i.id} insight={i} onChanged={reload} />)}
        </div>
      )}

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Como a SENTRIA detecta padrões</h3>
        <div className="grid grid-3" style={{ marginTop: 12, gap: 20 }}>
          <div className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Picos de volume.</strong> Compara as últimas 24 horas de cada categoria com a média diária dos 14 dias anteriores e descreve o que os tickets têm em comum (versão, plano, tema).</div>
          <div className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Clientes em risco.</strong> Detecta clientes que abriram muito mais chamados que o seu próprio normal, combinando sentimento e risco de churn.</div>
          <div className="small muted"><strong style={{ color: 'var(--sn-navy)' }}>Tickets parecidos.</strong> Agrupa chamados abertos por similaridade de texto (TF-IDF + cosseno) para responder em conjunto.</div>
        </div>
      </section>
    </main>
  );
}
