import { CheckCircle2, Download, FileJson, FileSpreadsheet, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AiLabel, AiMark, CategoryChip, PriorityBadge, SentimentText, useToast } from '../components/ui';
import { api, download } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY_COLOR, fmtNumber } from '../lib/domain';
import type { CategoryKey, Priority, Sentiment } from '../lib/types';

interface PreviewData {
  headers: string[];
  mapping: Record<string, string | null>;
  total: number;
  validCount: number;
  errors: { line: number; message: string }[];
  errorCount: number;
  preview: { line: number; subject: string; companyName: string | null; category: CategoryKey; confidence: number; priority: Priority; sentiment: Sentiment }[];
  categories: { key: CategoryKey; label: string; count: number }[];
  sampled: boolean;
}

const FIELD_LABEL: Record<string, string> = {
  subject: 'Assunto',
  description: 'Descrição',
  requesterName: 'Solicitante',
  requesterEmail: 'E-mail',
  companyName: 'Empresa',
  channel: 'Canal',
  createdAt: 'Data',
  productVersion: 'Versão',
};

export function DataHub() {
  const toast = useToast();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; ms: number; ids: number[] } | null>(null);

  async function loadFile(file: File) {
    if (file.size > 8_000_000) return toast('Arquivo muito grande (máx. 8 MB).', 'error');
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
    setBusy('preview');
    try {
      setPreview(await api<PreviewData>('/data/import/preview', { body: { csv: text } }));
    } catch (e) {
      toast((e as Error).message, 'error');
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!csv) return;
    setBusy('import');
    try {
      const r = await api<{ imported: number; skipped: number; ms: number; ids: number[] }>('/data/import', { body: { csv } });
      setResult(r);
      setPreview(null);
      setCsv(null);
      toast(`${r.imported} chamados importados e analisados pela IA.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reprocess(scope: 'open' | 'all' | 'low_confidence') {
    setBusy(`reprocess-${scope}`);
    try {
      const r = await api<{ processed: number; categoryChanges: number; ms: number }>('/data/reprocess', { body: { scope } });
      toast(`${fmtNumber(r.processed)} tickets reanalisados em ${(r.ms / 1000).toFixed(1)}s · ${r.categoryChanges} mudanças de categoria.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm('Restaurar os dados de demonstração? Todos os tickets atuais serão substituídos.')) return;
    setBusy('reset');
    try {
      await api('/data/reset', { method: 'POST' });
      toast('Dados de demonstração restaurados.');
      setTimeout(() => window.location.assign('/'), 600);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const exp = async (format: 'csv' | 'json') => {
    try {
      await download(`/tickets/export?format=${format}`, `sentria-chamados.${format}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Workspace</div>
          <h1>Dados</h1>
          <p className="muted" style={{ marginTop: 4 }}>Importe chamados de outras ferramentas, exporte para análise e reprocesse com a IA.</p>
        </div>
      </div>

      <div className="grid grid-main">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Importar chamados (CSV)</h2>
              <div className="sub">Cada linha é categorizada, priorizada e analisada pela IA na importação.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => download('/data/template.csv', 'modelo.csv').catch(() => {})}>
              <Download size={14} /> Baixar modelo
            </button>
          </div>
          <div className="card-body stack">
            <div
              className={`dropzone ${over ? 'over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files[0];
                if (f) void loadFile(f);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            >
              <Upload size={22} color="var(--sn-blue)" />
              <div style={{ marginTop: 8, fontWeight: 600 }}>{fileName || 'Arraste um arquivo CSV ou clique para escolher'}</div>
              <div className="small muted">Separador ; ou , · colunas reconhecidas automaticamente (assunto, descrição, empresa, e-mail, canal, data…)</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f);
                  e.target.value = '';
                }}
              />
            </div>

            {busy === 'preview' && <div className="row muted"><span className="spinner" /> Lendo e analisando o arquivo…</div>}

            {preview && (
              <div className="stack">
                <div className="row wrap" style={{ gap: 8 }}>
                  {Object.entries(preview.mapping).map(([field, col]) => (
                    <span key={field} className="signal" style={col ? undefined : { opacity: 0.5 }}>
                      {FIELD_LABEL[field]}: <strong>{col ?? 'não encontrado'}</strong>
                    </span>
                  ))}
                </div>
                <div className="grid grid-3" style={{ gap: 12 }}>
                  <div className="card card-pad"><div className="label">Linhas</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtNumber(preview.total)}</div></div>
                  <div className="card card-pad"><div className="label">Válidas</div><div className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--sn-success)' }}>{fmtNumber(preview.validCount)}</div></div>
                  <div className="card card-pad"><div className="label">Com erro</div><div className="num" style={{ fontSize: 22, fontWeight: 600, color: preview.errorCount ? 'var(--sn-critical)' : undefined }}>{fmtNumber(preview.errorCount)}</div></div>
                </div>
                {preview.errors.length > 0 && (
                  <div className="alert alert-warn" style={{ flexDirection: 'column', gap: 2 }}>
                    {preview.errors.slice(0, 6).map((e) => <span key={e.line}>Linha {e.line}: {e.message}</span>)}
                    {preview.errorCount > 6 && <span>… e mais {preview.errorCount - 6}</span>}
                  </div>
                )}
                {preview.categories.length > 0 && (
                  <div>
                    <AiLabel>Categorias previstas{preview.sampled ? ' (amostra de 200)' : ''}</AiLabel>
                    <div className="row wrap" style={{ gap: 12, marginTop: 8 }}>
                      {preview.categories.map((c) => (
                        <span key={c.key} className="chip"><span className="sw" style={{ background: CATEGORY_COLOR[c.key] }} />{c.label} <strong>{c.count}</strong></span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="table-wrap card">
                  <table className="table">
                    <thead><tr><th>Linha</th><th>Assunto</th><th>Categoria (IA)</th><th>Prioridade</th><th>Sentimento</th></tr></thead>
                    <tbody>
                      {preview.preview.slice(0, 10).map((r) => (
                        <tr key={r.line}>
                          <td className="id">{r.line}</td>
                          <td className="small" style={{ maxWidth: 260 }}><div className="truncate">{r.subject}</div><div className="tiny muted">{r.companyName}</div></td>
                          <td><CategoryChip category={r.category} short /> <span className="tiny muted">{Math.round(r.confidence * 100)}%</span></td>
                          <td><PriorityBadge priority={r.priority} /></td>
                          <td><SentimentText sentiment={r.sentiment} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { setPreview(null); setCsv(null); setFileName(''); }}>Cancelar</button>
                  <button className="btn btn-primary" onClick={runImport} disabled={busy === 'import' || preview.validCount === 0}>
                    {busy === 'import' ? <span className="spinner" /> : <Upload size={15} />} Importar {fmtNumber(preview.validCount)} chamados
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="alert alert-info" style={{ alignItems: 'center' }}>
                <CheckCircle2 size={18} color="var(--sn-success)" />
                <span className="grow">
                  <strong>{fmtNumber(result.imported)} chamados importados</strong> em {(result.ms / 1000).toFixed(1)}s{result.skipped ? ` · ${result.skipped} linhas ignoradas` : ''}.
                </span>
                <Link to={`/tickets?ids=${result.ids.slice(0, 300).join(',')}&title=${encodeURIComponent('Chamados importados')}`} className="btn btn-secondary btn-sm">Ver chamados</Link>
              </div>
            )}
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card card-pad stack">
            <h3>Exportar</h3>
            <p className="small muted">Todos os tickets com as análises da IA (categoria, confiança, sentimento, risco, resumo e tags).</p>
            <div className="row wrap">
              <button className="btn btn-secondary" onClick={() => exp('csv')}><FileSpreadsheet size={15} /> CSV (Excel)</button>
              <button className="btn btn-secondary" onClick={() => exp('json')}><FileJson size={15} /> JSON</button>
            </div>
            <p className="tiny muted">Para exportar um recorte, use os filtros da tela de Tickets e clique em “Exportar CSV”.</p>
          </section>

          <section className="card card-pad stack ai-panel">
            <h3 className="row"><AiMark size={16} /> Reprocessar com a IA</h3>
            <p className="small muted">Retreina o classificador com as correções feitas pela equipe e reanalisa os tickets. Categorias revisadas por pessoas são mantidas.</p>
            <div className="stack-sm">
              <button className="btn btn-ai" onClick={() => reprocess('open')} disabled={!!busy}>
                {busy === 'reprocess-open' ? <span className="spinner" /> : <RefreshCw size={14} />} Tickets em aberto
              </button>
              <button className="btn btn-ai" onClick={() => reprocess('low_confidence')} disabled={!!busy}>
                {busy === 'reprocess-low_confidence' ? <span className="spinner" /> : <RefreshCw size={14} />} Tickets com baixa confiança
              </button>
              <button className="btn btn-ai" onClick={() => reprocess('all')} disabled={!!busy}>
                {busy === 'reprocess-all' ? <span className="spinner" /> : <RefreshCw size={14} />} Todos os tickets
              </button>
            </div>
          </section>

          {user?.role === 'admin' && (
            <section className="card card-pad stack">
              <h3>Dados de demonstração</h3>
              <p className="small muted">Gera novamente 90 dias de histórico fictício, incluindo um pico de chamados nas últimas horas para demonstrar os insights.</p>
              <button className="btn btn-danger" onClick={reset} disabled={!!busy}>
                {busy === 'reset' ? <span className="spinner" /> : <RotateCcw size={14} />} Restaurar dados de demonstração
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
