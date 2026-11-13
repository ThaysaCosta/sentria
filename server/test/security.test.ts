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
