import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { get } from './db/database.js';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

/** Hash fixo usado para gastar o mesmo tempo quando o e-mail não existe (evita descobrir e-mails pelo tempo de resposta). */
export const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

/** Política de senha: mínimo de 8 caracteres, com letras e números. Retorna a mensagem de erro ou null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (password.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use letras e números na senha.';
  return null;
}

/** Senha temporária legível (sem caracteres ambíguos como 0/O e 1/l), com letras e números garantidos. */
export function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function signToken(user: AuthUser & { token_version: number }): string {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role, ver: user.token_version },
    config.jwtSecret,
    { expiresIn: '12h', algorithm: 'HS256' },
  );
}

interface UserRecord extends AuthUser {
  active: number;
  token_version: number;
}

/**
 * Valida o token e confere o usuário no banco a cada requisição: um usuário desativado,
 * com senha trocada ou com papel alterado perde o acesso antigo na hora.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
  const user = get<UserRecord>('SELECT id, name, email, role, active, token_version FROM users WHERE id = ?', Number(payload.sub));
  if (!user || !user.active || user.token_version !== Number(payload.ver ?? 0)) {
    return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
  }
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem fazer isso.' });
  next();
}

/** Na demo pública (DEMO_MODE=1), as contas de demonstração não podem ser bloqueadas por visitantes. */
export const demoMode = () => process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';
