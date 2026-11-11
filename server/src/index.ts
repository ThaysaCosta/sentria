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
app.set('trust proxy', 'loopback');
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: ai.status().activeEngine, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
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
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Dados inválidos.', issues: err.issues });
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
