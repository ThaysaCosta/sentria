import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects, parseDate, toCsv } from '../src/utils/csv.js';

describe('CSV', () => {
  it('detecta ponto e vírgula e respeita aspas com quebras de linha', () => {
    const rows = parseCsv('a;b\n"linha 1\nlinha 2";"com ""aspas"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['linha 1\nlinha 2', 'com "aspas"'],
    ]);
  });

  it('aceita vírgula, BOM e CRLF', () => {
    const { headers, rows } = parseCsvObjects('﻿assunto,email\r\nTeste,ana@x.com\r\n');
    expect(headers).toEqual(['assunto', 'email']);
    expect(rows[0]).toEqual({ assunto: 'Teste', email: 'ana@x.com' });
  });

  it('gera CSV compatível com Excel e faz o caminho de volta', () => {
    const csv = toCsv([{ a: 'x;y', b: ['t1', 't2'] }], [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(parseCsvObjects(csv).rows[0]).toEqual({ A: 'x;y', B: 't1, t2' });
  });

  it('interpreta datas brasileiras no fuso de Brasília', () => {
    expect(parseDate('05/11/2026 14:30')).toBe('2026-11-05T17:30:00.000Z');
    expect(parseDate('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00.000Z');
    expect(parseDate('ontem')).toBeNull();
  });
});
