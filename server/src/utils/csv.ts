/** CSV sem dependências: detecta ; ou , e respeita aspas, quebras de linha e aspas escapadas. */

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ';': 0, ',': 0, '\t': 0 } as Record<string, number>;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) return '\t';
  return counts[';'] >= counts[','] && counts[';'] > 0 ? ';' : ',';
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseCsvObjects(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headerRow, ...data] = parseCsv(input);
  if (!headerRow) return { headers: [], rows: [] };
  const headers = headerRow.map((h) => h.trim());
  const rows = data.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

/** Gera CSV com ; e BOM (abre corretamente no Excel em português). */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(';');
  const lines = rows.map((r) => columns.map((c) => escape(r[c.key])).join(';'));
  return `﻿${[header, ...lines].join('\r\n')}`;
}

/** Aceita ISO, "dd/mm/aaaa" e "dd/mm/aaaa hh:mm". Retorna ISO ou null. */
export function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, y, hh = '9', mm = '0', ss = '0'] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    // Interpreta como horário de Brasília (UTC-3).
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d), Number(hh) + 3, Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
