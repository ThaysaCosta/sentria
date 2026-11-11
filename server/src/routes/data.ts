import { Router } from 'express';
import { z } from 'zod';
import { ai } from '../ai/index.js';
import { requireAdmin } from '../auth.js';
import { all, tx } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { CATEGORIES, isChannel, type CategoryKey } from '../domain.js';
import { applyAnalysis, buildAnalysisInput, insertTicket, resolveCustomer } from '../services/tickets.js';
import { parseCsvObjects, parseDate, toCsv } from '../utils/csv.js';

export const dataRouter = Router();

/** Sinônimos aceitos nos cabeçalhos do CSV (comparados sem acento e em minúsculas). */
const FIELD_ALIASES: Record<string, string[]> = {
  subject: ['assunto', 'subject', 'titulo', 'title', 'resumo'],
  description: ['descricao', 'description', 'mensagem', 'message', 'detalhes', 'texto', 'body'],
  requesterName: ['nome', 'solicitante', 'requester', 'requester_name', 'cliente_nome', 'contato', 'name'],
  requesterEmail: ['email', 'e-mail', 'requester_email', 'email_solicitante'],
  companyName: ['empresa', 'cliente', 'company', 'customer', 'organizacao', 'conta'],
  channel: ['canal', 'channel', 'origem'],
  createdAt: ['data', 'criado_em', 'created_at', 'data_abertura', 'abertura', 'date'],
  productVersion: ['versao', 'version', 'product_version'],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .trim();

function mapHeaders(headers: string[]) {
  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    mapping[field] = headers.find((h) => aliases.includes(norm(h))) ?? null;
  }
  return mapping;
}

const CHANNEL_ALIASES: Record<string, string> = { 'e-mail': 'email', telefone: 'phone', zap: 'whatsapp', site: 'portal', web: 'portal' };

function prepareRows(csv: string) {
  const { headers, rows } = parseCsvObjects(csv);
  const mapping = mapHeaders(headers);
  const errors: { line: number; message: string }[] = [];
  const valid: {
    line: number;
    subject: string;
    description: string;
    requesterName: string;
    requesterEmail: string;
    companyName: string | null;
    channel: string;
    createdAt: string | null;
    productVersion: string | null;
  }[] = [];

  if (!mapping.subject && !mapping.description) {
    return { headers, mapping, valid, errors: [{ line: 1, message: 'Não encontramos uma coluna de assunto ou descrição.' }], total: rows.length };
  }

  rows.forEach((r, i) => {
    const line = i + 2;
    const val = (field: string) => (mapping[field] ? (r[mapping[field]!] ?? '').trim() : '');
    const subject = val('subject') || val('description').slice(0, 80);
    const description = val('description') || val('subject');
    if (subject.length < 3) return errors.push({ line, message: 'Assunto vazio ou muito curto.' });
    const email = val('requesterEmail');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errors.push({ line, message: `E-mail inválido: ${email}` });
    const rawChannel = norm(val('channel'));
    const channel = isChannel(rawChannel) ? rawChannel : (CHANNEL_ALIASES[rawChannel] ?? 'email');
    const createdRaw = val('createdAt');
    const createdAt = createdRaw ? parseDate(createdRaw) : null;
    if (createdRaw && !createdAt) return errors.push({ line, message: `Data não reconhecida: ${createdRaw}` });
    if (createdAt && Date.parse(createdAt) > Date.now() + 60_000) return errors.push({ line, message: 'Data no futuro.' });
    valid.push({
      line,
      subject: subject.slice(0, 200),
      description: description.slice(0, 10000),
      requesterName: val('requesterName') || 'Não informado',
      requesterEmail: email || 'nao-informado@importacao.local',
      companyName: val('companyName') || null,
      channel,
      createdAt,
      productVersion: val('productVersion') || null,
    });
  });
  return { headers, mapping, valid, errors, total: rows.length };
}

const CsvBody = z.object({ csv: z.string().min(1, 'Arquivo vazio.').max(8_000_000, 'Arquivo muito grande (máx. 8 MB).') });

dataRouter.post('/import/preview', (req, res) => {
  const { csv } = CsvBody.parse(req.body);
  const prepared = prepareRows(csv);
  const categories: Record<string, number> = {};
  const preview = prepared.valid.slice(0, 200).map((r) => {
    const a = ai.analyzeLocal({ subject: r.subject, description: r.description, requesterName: r.requesterName });
    categories[a.category] = (categories[a.category] ?? 0) + 1;
    return { ...r, category: a.category, confidence: a.confidence, priority: a.priority, sentiment: a.sentiment };
  });
  res.json({
    headers: prepared.headers,
    mapping: prepared.mapping,
    total: prepared.total,
    validCount: prepared.valid.length,
    errors: prepared.errors.slice(0, 50),
    errorCount: prepared.errors.length,
    preview: preview.slice(0, 25),
    categories: Object.entries(categories)
      .map(([key, count]) => ({ key, label: CATEGORIES[key as CategoryKey].label, count }))
      .sort((a, b) => b.count - a.count),
    sampled: prepared.valid.length > 200,
  });
});

dataRouter.post('/import', (req, res) => {
  const { csv } = CsvBody.parse(req.body);
  const prepared = prepareRows(csv);
  if (prepared.valid.length > 5000) return res.status(400).json({ error: 'Importe no máximo 5.000 chamados por vez.' });
  const started = Date.now();
  const ids: number[] = [];
  tx(() => {
    for (const r of prepared.valid) {
      const customerId = resolveCustomer(r.companyName, r.requesterEmail === 'nao-informado@importacao.local' ? null : r.requesterEmail);
      const analysis = ai.analyzeLocal(
        buildAnalysisInput({ subject: r.subject, description: r.description, requesterName: r.requesterName, customerId, productVersion: r.productVersion }),
      );
      ids.push(
        insertTicket(
          {
            subject: r.subject,
            description: r.description,
            requesterName: r.requesterName,
            requesterEmail: r.requesterEmail,
            channel: r.channel as never,
            productVersion: r.productVersion,
            createdAt: r.createdAt ?? undefined,
            origin: 'import',
            actor: req.user!.name,
          },
          customerId,
          analysis,
        ),
      );
    }
  });
  ai.invalidateTickets();
  res.json({ imported: ids.length, skipped: prepared.errors.length, errors: prepared.errors.slice(0, 50), ms: Date.now() - started, ids });
});

dataRouter.get('/template.csv', (_req, res) => {
  const csv = toCsv(
    [
      {
        assunto: 'Boleto não chegou no e-mail',
        descricao: 'O boleto da mensalidade deste mês não foi enviado para o financeiro.',
        empresa: 'Minha Empresa Ltda',
        nome: 'Maria Souza',
        email: 'maria@minhaempresa.com.br',
        canal: 'email',
        data: '05/11/2026 14:30',
      },
      {
        assunto: 'Sistema lento ao gerar relatório',
        descricao: 'O relatório de vendas está demorando mais de 5 minutos para carregar. Toda a equipe está parada.',
        empresa: 'Minha Empresa Ltda',
        nome: 'João Lima',
        email: 'joao@minhaempresa.com.br',
        canal: 'chat',
        data: '06/11/2026 09:10',
      },
    ],
    ['assunto', 'descricao', 'empresa', 'nome', 'email', 'canal', 'data'].map((k) => ({ key: k, label: k })),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-sentria.csv"');
  res.send(csv);
});

const Reprocess = z.object({ scope: z.enum(['open', 'all', 'low_confidence']).default('open') });

/** Reanalisa chamados com o motor local (rápido e sem custo). Categorias definidas por pessoas são mantidas. */
dataRouter.post('/reprocess', (req, res) => {
  const { scope } = Reprocess.parse(req.body);
  const where =
    scope === 'open'
      ? `WHERE status IN ('new','in_progress','waiting')`
      : scope === 'low_confidence'
        ? `WHERE ai_confidence < 0.6 AND category_source = 'ai'`
        : '';
  const rows = all<{ id: number; subject: string; description: string; requester_name: string; customer_id: number | null; product_version: string | null; category: string | null }>(
    `SELECT id, subject, description, requester_name, customer_id, product_version, category FROM tickets ${where} LIMIT 5000`,
  );
  const started = Date.now();
  let changed = 0;
  ai.retrain();
  tx(() => {
    for (const r of rows) {
      const a = ai.analyzeLocal(
        buildAnalysisInput({ subject: r.subject, description: r.description, requesterName: r.requester_name, customerId: r.customer_id, productVersion: r.product_version, excludeId: r.id }),
      );
      if (a.category !== r.category) changed++;
      applyAnalysis(r.id, a, `${req.user!.name} (reprocessamento)`);
    }
  });
  ai.invalidateTickets();
  res.json({ processed: rows.length, categoryChanges: changed, ms: Date.now() - started });
});

dataRouter.post('/reset', requireAdmin, (_req, res) => {
  seedDatabase({ quiet: true });
  ai.refreshKnowledgeBase();
  res.json({ ok: true });
});
