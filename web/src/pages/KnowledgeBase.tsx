import { BookOpen, Eye, Pencil, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategoryChip, Empty, Modal, Skeleton, useToast } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_KEYS, CATEGORY_LABEL, fmtDate } from '../lib/domain';
import { useApi, useDebounced } from '../lib/hooks';
import type { Article, CategoryKey } from '../lib/types';

const EMPTY = { title: '', category: 'duvidas' as CategoryKey, body: '', tags: '' };

export function KnowledgeBase() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const { data, loading, reload } = useApi<Article[]>(`/kb${q ? `?search=${encodeURIComponent(q)}` : ''}`);
  const [viewing, setViewing] = useState<Article | null>(null);
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: number }) | null>(null);
  const [saving, setSaving] = useState(false);

  const articleParam = params.get('article');
  useEffect(() => {
    if (!articleParam) return;
    api<Article>(`/kb/${articleParam}`).then(setViewing).catch(() => {});
  }, [articleParam]);

  function closeView() {
    setViewing(null);
    if (articleParam) setParams({}, { replace: true });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { title: editing.title, category: editing.category, body: editing.body, tags: editing.tags };
      if (editing.id) await api(`/kb/${editing.id}`, { method: 'PUT', body });
      else await api('/kb', { body });
      toast(editing.id ? 'Artigo atualizado. A IA já usa a nova versão.' : 'Artigo publicado. A IA passará a sugeri-lo.');
      setEditing(null);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Article) {
    if (!window.confirm(`Excluir o artigo "${a.title}"?`)) return;
    try {
      await api(`/kb/${a.id}`, { method: 'DELETE' });
      toast('Artigo excluído.');
      setViewing(null);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Autoatendimento</div>
          <h1>Base de conhecimento</h1>
          <p className="muted" style={{ marginTop: 4 }}>Artigos usados pela IA para sugerir respostas e resolver chamados no portal.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          <Plus size={16} /> Novo artigo
        </button>
      </div>

      <input className="input" style={{ maxWidth: 420, marginBottom: 16 }} placeholder="Busca semântica: descreva o problema…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading && !data ? (
        <div className="grid grid-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={150} style={{ borderRadius: 14 }} />)}</div>
      ) : data && data.length === 0 ? (
        <div className="card"><Empty icon={<BookOpen size={22} />} title="Não encontramos informações confiáveis na base de conhecimento." /></div>
      ) : (
        <div className="grid grid-3">
          {data?.map((a) => (
            <button key={a.id} className="card card-pad stack" style={{ textAlign: 'left', cursor: 'pointer', gap: 8 }} onClick={() => setViewing(a)}>
              <CategoryChip category={a.category} short />
              <h3>{a.title}</h3>
              <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.body}</p>
              <div className="row tiny muted" style={{ gap: 12, marginTop: 'auto' }}>
                <span className="row" style={{ gap: 4 }}><Eye size={12} /> {a.views}</span>
                <span className="row" style={{ gap: 4 }}><ThumbsUp size={12} /> {a.helpful} resolveram</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <Modal
          title={viewing.title}
          onClose={closeView}
          footer={
            <>
              <button className="btn btn-danger" onClick={() => remove(viewing)}><Trash2 size={14} /> Excluir</button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditing({ id: viewing.id, title: viewing.title, category: viewing.category, body: viewing.body, tags: viewing.tags ?? '' });
                  closeView();
                }}
              >
                <Pencil size={14} /> Editar
              </button>
            </>
          }
        >
          <div className="row wrap" style={{ marginBottom: 12, gap: 12 }}>
            <CategoryChip category={viewing.category} />
            <span className="small muted">Atualizado em {fmtDate(viewing.updated_at)}</span>
          </div>
          <p className="prose">{viewing.body}</p>
          {viewing.tags && (
            <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>
              {viewing.tags.split(',').map((t) => <span key={t} className="tag">{t.trim()}</span>)}
            </div>
          )}
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.id ? 'Editar artigo' : 'Novo artigo'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || editing.title.length < 5 || editing.body.length < 20}>
                {saving ? <span className="spinner" /> : null} Publicar
              </button>
            </>
          }
        >
          <div className="stack">
            <label className="field">
              <span>Título</span>
              <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select className="select" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as CategoryKey })}>
                {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Conteúdo</span>
              <textarea className="textarea" style={{ minHeight: 180 }} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </label>
            <label className="field">
              <span>Palavras-chave (separadas por vírgula)</span>
              <input className="input" value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}
    </main>
  );
}
