import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

if (config.dbPath !== ':memory:') mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'agent',
  title         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'Starter',
  segment    TEXT,
  mrr        REAL NOT NULL DEFAULT 0,
  domain     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol          TEXT NOT NULL UNIQUE,
  subject           TEXT NOT NULL,
  description       TEXT NOT NULL,
  customer_id       INTEGER REFERENCES customers(id),
  requester_name    TEXT NOT NULL,
  requester_email   TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'portal',
  status            TEXT NOT NULL DEFAULT 'new',
  priority          TEXT NOT NULL DEFAULT 'medium',
  category          TEXT,
  category_source   TEXT NOT NULL DEFAULT 'ai',
  ai_category       TEXT,
  ai_confidence     REAL,
  ai_priority       TEXT,
  sentiment         TEXT,
  sentiment_score   REAL,
  ai_summary        TEXT,
  ai_reply          TEXT,
  ai_tags           TEXT,
  ai_signals        TEXT,
  ai_engine         TEXT,
  ai_analyzed_at    TEXT,
  churn_risk        INTEGER NOT NULL DEFAULT 0,
  assignee_id       INTEGER REFERENCES users(id),
  product_version   TEXT,
  origin            TEXT NOT NULL DEFAULT 'agent',
  resolved_by_ai    INTEGER NOT NULL DEFAULT 0,
  csat              INTEGER,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  first_response_at TEXT,
  resolved_at       TEXT,
  sla_due_at        TEXT,
  context           TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_created  ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  internal    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  actor      TEXT,
  data       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);

CREATE TABLE IF NOT EXISTS kb_articles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,
  body       TEXT NOT NULL,
  tags       TEXT,
  views      INTEGER NOT NULL DEFAULT 0,
  helpful    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function migrate(): void {
  db.exec(SCHEMA);
  // Migrações incrementais para bancos criados por versões anteriores.
  const columns = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('context')) db.exec('ALTER TABLE tickets ADD COLUMN context TEXT');

  // Gestão de equipe: desativação, senha temporária, último acesso e revogação de sessões.
  const userColumns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  const addUserColumn = (name: string, ddl: string) => {
    if (!userColumns.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
  };
  addUserColumn('active', 'active INTEGER NOT NULL DEFAULT 1');
  addUserColumn('must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  addUserColumn('last_login_at', 'last_login_at TEXT');
  addUserColumn('token_version', 'token_version INTEGER NOT NULL DEFAULT 0');
  addUserColumn('protected', 'protected INTEGER NOT NULL DEFAULT 0');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = any[];

export function all<T = Record<string, unknown>>(sql: string, ...params: Params): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: Params): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Params) {
  return db.prepare(sql).run(...params);
}

let txDepth = 0;

/** Executa `fn` dentro de uma transação (chamadas aninhadas reutilizam a transação externa). */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) {
    txDepth++;
    try {
      return fn();
    } finally {
      txDepth--;
    }
  }
  db.exec('BEGIN');
  txDepth = 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth = 0;
  }
}

export function getMeta(key: string): string | null {
  return get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  run('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

export const nowIso = () => new Date().toISOString();

/**
 * Expressão SQL para "agora + deslocamento" no mesmo formato ISO usado nas colunas de data
 * (permite comparar strings diretamente). Passe o deslocamento como parâmetro, ex.: '-30 days'.
 */
export const SQL_ISO_NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`;
