import { ArrowDown, ArrowUp, Download, Filter, Inbox, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AiMark, CategoryChip, Empty, PriorityBadge, RiskMeter, Skeleton, StatusBadge, useToast } from '../components/ui';
import { api, download } from '../lib/api';
import {
  CATEGORY_KEYS,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  PRIORITY_KEYS,
  PRIORITY_LABEL,
  STATUS_KEYS,
  STATUS_LABEL,
  fmtNumber,
  fmtRelative,
} from '../lib/domain';
import { useApi, useDebounced } from '../lib/hooks';
import type { Status, Ticket, User } from '../lib/types';

interface ListResponse {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

const FILTER_KEYS = ['search', 'status', 'priority', 'category', 'channel', 'assignee', 'open', 'ids', 'sort', 'order', 'page', 'days', 'slaBreached', 'lowConfidence', 'customer'];

export function Tickets() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebounced(search, 350);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data: users } = useApi<User[]>('/users');

  useEffect(() => {
    setSearch(params.get('search') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('search')]);

  useEffect(() => {
    if ((params.get('search') ?? '') !== debouncedSearch) update({ search: debouncedSearch || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) q.set(key, v);
    }
    q.set('pageSize', '25');
    return q.toString();
  }, [params]);

  const { data, loading, reload } = useApi<ListResponse>(`/tickets?${query}`);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
    setSelected(new Set());
  }

  const sort = params.get('sort') ?? 'created_at';
  const order = params.get('order') ?? 'desc';
  const toggleSort = (key: string) => update({ sort: key, order: sort === key && order === 'desc' ? 'asc' : 'desc', page: null });
  const SortIcon = ({ k }: { k: string }) => (sort === k ? order === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : null);

  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const activeFilters = FILTER_KEYS.filter((k) => !['sort', 'order', 'page', 'search'].includes(k) && params.get(k));
  const title = params.get('title');

  async function bulk(patch: { status?: Status; assignee_id?: number | null }) {
    try {
      const r = await api<{ updated: number }>('/tickets/bulk', { body: { ids: [...selected], ...patch } });
      toast(`${r.updated} ticket(s) atualizados.`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function exportCsv() {
    const q = new URLSearchParams(query);
    q.delete('page');
    q.delete('pageSize');
    try {
      await download(`/tickets/export?${q.toString()}`, 'sentria-chamados.csv');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const allOnPage = data?.items.map((t) => t.id) ?? [];
  const allSelected = allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="label eyebrow">Atendimento</div>
          <h1>Tickets</h1>
          {title && (
            <div className="alert alert-ai" style={{ marginTop: 10 }}>
              <AiMark />
              <span>
                Filtrado pelo insight: <strong>{title}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="row wrap">
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Download size={15} /> Exportar CSV
          </button>
          <Link to="/tickets/novo" className="btn btn-primary">Novo ticket</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 14 }}>
          <div className="filters">
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Buscar assunto, cliente, #ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar tickets"
            />
            <select className="select select-sm" value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || null, open: null, page: null })} aria-label="Status">
              <option value="">Todos os status</option>
              <option value="new,in_progress,waiting">Em aberto</option>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select className="select select-sm" value={params.get('priority') ?? ''} onChange={(e) => update({ priority: e.target.value || null, page: null })} aria-label="Prioridade">
              <option value="">Todas as prioridades</option>
              {PRIORITY_KEYS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
            <select className="select select-sm" value={params.get('category') ?? ''} onChange={(e) => update({ category: e.target.value || null, page: null })} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <select className="select select-sm" value={params.get('assignee') ?? ''} onChange={(e) => update({ assignee: e.target.value || null, page: null })} aria-label="Responsável">
              <option value="">Qualquer responsável</option>
              <option value="me">Atribuídos a mim</option>
              <option value="none">Sem responsável</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select className="select select-sm hide-mobile" value={params.get('channel') ?? ''} onChange={(e) => update({ channel: e.target.value || null, page: null })} aria-label="Canal">
              <option value="">Todos os canais</option>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button
              className={`btn btn-sm ${params.get('lowConfidence') ? 'btn-ai' : 'btn-secondary'}`}
              onClick={() => update({ lowConfidence: params.get('lowConfidence') ? null : 'true', page: null })}
              title="Tickets em que a IA teve baixa confiança e vale revisão humana"
            >
              <AiMark size={13} /> Revisar IA
            </button>
            <button
              className={`btn btn-sm ${params.get('slaBreached') ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => update({ slaBreached: params.get('slaBreached') ? null : 'true', page: null })}
            >
              SLA estourado
            </button>
            {activeFilters.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                <X size={14} /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <strong className="small">{selected.size} selecionado(s)</strong>
            <select className="select select-sm" style={{ width: 'auto' }} defaultValue="" onChange={(e) => e.target.value && bulk({ status: e.target.value as Status })}>
              <option value="" disabled>Alterar status…</option>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select
              className="select select-sm"
              style={{ width: 'auto' }}
              defaultValue=""
              onChange={(e) => e.target.value && bulk({ assignee_id: e.target.value === 'none' ? null : Number(e.target.value) })}
            >
              <option value="" disabled>Atribuir a…</option>
              <option value="none">Ninguém</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Cancelar</button>
          </div>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(allOnPage))}
                  />
                </th>
                <th><button onClick={() => toggleSort('id')}>ID <SortIcon k="id" /></button></th>
                <th>Assunto</th>
                <th className="hide-mobile">Categoria</th>
                <th><button onClick={() => toggleSort('priority')}>Prioridade <SortIcon k="priority" /></button></th>
                <th className="hide-mobile"><button onClick={() => toggleSort('churn_risk')}>Risco <SortIcon k="churn_risk" /></button></th>
                <th>Status</th>
                <th className="hide-mobile">Responsável</th>
                <th><button onClick={() => toggleSort('created_at')}>Criado <SortIcon k="created_at" /></button></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={9}><Skeleton h={20} /></td>
                    </tr>
                  ))
                : data?.items.map((t) => (
                    <tr key={t.id} className={`clickable ${selected.has(t.id) ? 'selected' : ''}`} onClick={() => navigate(`/tickets/${t.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar #${t.id}`}
                          checked={selected.has(t.id)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="id">#{t.id}</td>
                      <td style={{ maxWidth: 340 }}>
                        <div className="subject truncate" title={t.ai_summary ?? undefined}>{t.subject}</div>
                        <div className="tiny muted truncate">
                          {t.customer_name ?? t.requester_name} · {CHANNEL_LABEL[t.channel]}
                          {t.sla_breached && t.status !== 'resolved' && t.status !== 'closed' ? <span style={{ color: 'var(--sn-critical)', fontWeight: 600 }}> · SLA estourado</span> : null}
                        </div>
                      </td>
                      <td className="hide-mobile">
                        <div className="row" style={{ gap: 6 }}>
                          <CategoryChip category={t.category} short />
                          {t.category_source === 'ai' ? (
                            <span title={`Categorizado pela IA · ${Math.round((t.ai_confidence ?? 0) * 100)}% de confiança`}>
                              <AiMark size={12} className={(t.ai_confidence ?? 1) < 0.6 ? 'low' : ''} />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td className="hide-mobile"><RiskMeter value={t.churn_risk} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="hide-mobile small">{t.assignee_name ?? <span className="muted">—</span>}</td>
                      <td className="small muted" title={new Date(t.created_at).toLocaleString('pt-BR')}>{fmtRelative(t.created_at)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <Empty icon={<Inbox size={24} />} title="Nenhum ticket encontrado">
              Ajuste os filtros ou <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams())}><Filter size={13} /> limpe a busca</button>
            </Empty>
          )}
        </div>
        {data && data.total > 0 && (
          <div className="pagination">
            <span>
              {fmtNumber((page - 1) * data.pageSize + 1)}–{fmtNumber(Math.min(page * data.pageSize, data.total))} de <strong>{fmtNumber(data.total)}</strong>
            </span>
            <div className="row">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Anterior</button>
              <span className="num">{page} / {pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>Próxima</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
