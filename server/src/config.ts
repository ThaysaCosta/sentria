import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório (pasta que contém /server e /web). */
export const ROOT = path.resolve(here, '../..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Em produção nunca usa o segredo padrão: sem JWT_SECRET, gera um aleatório a cada inicialização. */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv !== 'troque-este-segredo') return fromEnv;
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    console.warn('[segurança] JWT_SECRET não definido: usando um segredo aleatório (sessões expiram ao reiniciar).');
    return randomBytes(32).toString('hex');
  }
  return 'sentria-dev-secret-change-me';
}

export const config = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: resolveJwtSecret(),
  dbPath: process.env.DB_PATH?.trim() || path.join(ROOT, 'server', 'data', 'sentria.db'),
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  claudeModel: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-5-5',
  /** "local" força o motor local mesmo com chave configurada. */
  aiEngine: (process.env.AI_ENGINE?.trim() || 'auto') as 'auto' | 'local',
  webDist: path.join(ROOT, 'web', 'dist'),
};
