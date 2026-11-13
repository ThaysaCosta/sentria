import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/utils/csv.js';
import { rateLimit } from '../src/utils/security.js';

describe('segurança', () => {
  it('neutraliza fórmulas na exportação CSV (CSV injection)', () => {
    const csv = toCsv([{ a: '=HYPERLINK("http://mal.example","clique")' }, { a: '+1+1' }, { a: '-2' }, { a: '@SUM(A1)' }, { a: 'normal' }], [
      { key: 'a', label: 'A' },
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n').slice(1);
    expect(lines[0].startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(lines.slice(1, 4).every((l) => l.startsWith("'"))).toBe(true);
    expect(lines[4]).toBe('normal');
  });

  it('bloqueia excesso de tentativas com 429 e Retry-After', () => {
    const limiter = rateLimit({ max: 2, windowMs: 60_000 });
    const req = { ip: '1.2.3.4' } as never;
    const results: number[] = [];
    for (let i = 0; i < 3; i++) {
      let status = 200;
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => (headers[k] = v),
        status: (s: number) => ((status = s), { json: () => undefined }),
      } as never;
      limiter(req, res, () => undefined);
      results.push(status);
      if (i === 2) expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    }
    expect(results).toEqual([200, 200, 429]);
  });
});

describe('senhas', async () => {
  const { passwordProblem, temporaryPassword, hashPassword, verifyPassword } = await import('../src/auth.js');

  it('exige 8+ caracteres com letras e números', () => {
    expect(passwordProblem('curta1')).toMatch(/8 caracteres/);
    expect(passwordProblem('somenteletras')).toMatch(/letras e números/);
    expect(passwordProblem('12345678')).toMatch(/letras e números/);
    expect(passwordProblem('Senha2026')).toBeNull();
  });

  it('gera senhas temporárias fortes, únicas e sem caracteres ambíguos', () => {
    const all = new Set(Array.from({ length: 200 }, () => temporaryPassword()));
    expect(all.size).toBe(200);
    for (const p of all) {
      expect(p).toHaveLength(12);
      expect(passwordProblem(p)).toBeNull();
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it('armazena senhas com hash e sal (nunca em texto puro)', () => {
    const a = hashPassword('Senha2026');
    const b = hashPassword('Senha2026');
    expect(a).not.toContain('Senha2026');
    expect(a).not.toBe(b);
    expect(verifyPassword('Senha2026', a)).toBe(true);
    expect(verifyPassword('senha2026', a)).toBe(false);
  });
});
