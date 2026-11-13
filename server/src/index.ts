import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { ai } from './ai/index.js';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { get, getMeta, migrate } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { analyticsRouter, authRouter, insightsRouter, kbRouter, metaRouter } from './routes/core.js';
import { dataRouter } from './routes/data.js';
import { publicRouter } from './routes/public.js';
import { ticketsRouter } from './routes/tickets.js';
import { securityHeaders } from './utils/security.js';

// ---------------------------------------------------------------- Banco e IA

migrate();

const users = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
if (users === 0) {
  console.log('Banco vazio: gerando dados de demonstração...');
  seedDatabase();
} else {
  // Os dados de demonstração são relativos à data do seed. Se ninguém criou chamados reais
  // e o seed tem mais de 36 horas, renova para que os padrões "das últimas horas" continuem atuais.
  const seededAt = getMeta('seeded_at');
  const realTickets = get<{ n: number }>(`SELECT COUNT(*) AS n FROM tickets WHERE origin != 'seed'`)!.n;
  if (seededAt && realTickets === 0 && Date.now() - Date.parse(seededAt) > 36 * 3_600_000) {
    console.log('Renovando dados de demonstração (seed com mais de 36h)...');
    seedDatabase({ quiet: true });
  }
}
ai.refreshKnowledgeBase();
ai.retrain();

// ---------------------------------------------------------------- HTTP

const app = express();
app.disable('x-powered-by');
// Atrás de um proxy (Render, Docker + Nginx), use TRUST_PROXY=1 para o rate limit ver o IP real.
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 'loopback');
const LOCAL_ORIGINS = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
// Rotas públicas aceitam qualquer origem: o widget roda dentro do sistema de outras empresas.
app.use(
  cors((req, cb) => {
    const open = req.url?.startsWith('/api/public') || req.url?.startsWith('/api/demo');
    cb(null, { origin: open ? true : LOCAL_ORIGINS });
  }),
);
app.use(securityHeaders);
// Só a importação de CSV precisa de corpo grande; o resto (inclusive rotas públicas) fica em 200 KB.
app.use('/api/data', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: ai.status().activeEngine, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);

// Endpoint do sistema de demonstração (Kairo ERP): falha de propósito para mostrar
// o widget capturando o erro e oferecendo ajuda.
app.post('/api/demo/boletos', (_req, res) => {
  res.status(500).json({ error: 'Falha ao gerar boleto: serviço de cobrança indisponível (BILL-500).' });
});
app.use('/api/tickets', requireAuth, ticketsRouter);
app.use('/api/analytics', requireAuth, analyticsRouter);
app.use('/api/insights', requireAuth, insightsRouter);
app.use('/api/kb', requireAuth, kbRouter);
app.use('/api/data', requireAuth, dataRouter);
app.use('/api', requireAuth, metaRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Em produção (`npm start`), o próprio servidor entrega o frontend compilado.
if (existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.get('/demo', (_req, res) => res.sendFile(path.join(config.webDist, 'demo.html')));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    // Só a mensagem e o campo: detalhes internos de validação não são expostos.
    return res.status(400).json({ error: first?.message ?? 'Dados inválidos.', field: first?.path?.join('.') || undefined });
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo grande demais.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

const server = app.listen(config.port, () => {
  const status = ai.status();
  const engine = status.claudeConfigured ? `Claude (${status.claudeModel}) + motor local` : 'motor local (sem chave da Anthropic)';
  const web = existsSync(config.webDist) ? `http://localhost:${config.port}` : 'http://localhost:5173 (Vite)';
  console.log(`\n  SENTRIA · See beyond the ticket.\n`);
  console.log(`  API     http://localhost:${config.port}/api`);
  console.log(`  App     ${web}`);
  console.log(`  IA      ${engine}`);
  console.log(`  Login   marina@sentria.demo / sentria123\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${config.port} já está em uso. Feche a outra instância da SENTRIA ou defina PORT no arquivo .env.\n`);
    process.exit(1);
  }
  throw err;
});
