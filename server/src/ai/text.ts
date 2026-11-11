/**
 * Utilitários de PLN para português: normalização, tokenização,
 * stemming leve e índice TF-IDF com similaridade de cosseno.
 */

const STOPWORDS = new Set(
  `a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro com sem sob sobre ao aos à às
  e ou mas que se como quando onde porque pois ja tambem muito muita muitos muitas mais menos bem so ainda
  eu tu ele ela nos vos eles elas me te lhe nos vos lhes meu minha meus minhas seu sua seus suas nosso nossa
  este esta isto esse essa isso aquele aquela aquilo aqui ali la ha foi ser sao era estao esta estou estamos
  tem ter temos tinha tenho fazer feito faz fiz pode podem poder vai vou vamos sendo sido estava estavam
  ola oi bom boa dia tarde noite favor obrigado obrigada att atenciosamente prezados prezado prezada pessoal
  equipe suporte cliente gostaria preciso precisamos alguem algum alguma alguns algumas todo toda todos todas
  hoje ontem agora depois antes entao assim qual quais quem cada outro outra outros outras mesmo mesma
  sistema plataforma voces voce senhor senhora nao sim`.split(/\s+/).filter(Boolean),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Stemmer leve: reduz plurais e sufixos comuns sem destruir termos técnicos. */
export function stem(token: string): string {
  if (token.length <= 4 || /\d/.test(token)) return token;
  let t = token;
  if (t.endsWith('coes')) t = t.slice(0, -4) + 'cao';
  else if (t.endsWith('oes') || t.endsWith('aes')) t = t.slice(0, -3) + 'ao';
  else if (t.endsWith('ais')) t = t.slice(0, -3) + 'al';
  else if (t.endsWith('eis')) t = t.slice(0, -3) + 'el';
  else if (t.endsWith('ns')) t = t.slice(0, -2) + 'm';
  else if (t.endsWith('es') && t.length > 6) t = t.slice(0, -2);
  else if (t.endsWith('s')) t = t.slice(0, -1);
  if (t.endsWith('mente') && t.length > 8) t = t.slice(0, -5);
  return t;
}

export function words(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return words(text)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

/** Tokens + bigramas, para capturar expressões como "nao_consigo" ou "boleto_gerado". */
export function features(text: string): string[] {
  const base = words(text).filter((w) => w.length > 1);
  const toks = tokenize(text);
  const bigrams: string[] = [];
  for (let i = 0; i < base.length - 1; i++) {
    const a = base[i];
    const b = base[i + 1];
    if (a === 'nao' || (!STOPWORDS.has(a) && !STOPWORDS.has(b) && a.length > 2 && b.length > 2)) {
      bigrams.push(`${stem(a)}_${stem(b)}`);
    }
  }
  return [...toks, ...bigrams];
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type Vector = Map<string, number>;

export interface IndexedDoc<M = unknown> {
  id: number;
  meta: M;
  vector: Vector;
  norm: number;
}

/** Índice TF-IDF simples, em memória. */
export class TfIdfIndex<M = unknown> {
  private df = new Map<string, number>();
  private docs: IndexedDoc<M>[] = [];

  constructor(items: { id: number; text: string; meta: M }[] = []) {
    this.build(items);
  }

  get size() {
    return this.docs.length;
  }

  build(items: { id: number; text: string; meta: M }[]) {
    this.df.clear();
    const tokenized = items.map((it) => ({ ...it, tokens: tokenize(it.text) }));
    for (const it of tokenized) {
      for (const t of new Set(it.tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.docs = tokenized.map((it) => {
      const vector = this.weigh(it.tokens);
      return { id: it.id, meta: it.meta, vector, norm: vecNorm(vector) };
    });
  }

  private idf(term: string) {
    const n = this.docs.length || 1;
    return Math.log(1 + n / (1 + (this.df.get(term) ?? 0)));
  }

  private weigh(tokens: string[]): Vector {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    for (const [t, f] of tf) v.set(t, (1 + Math.log(f)) * this.idf(t));
    return v;
  }

  vectorize(text: string): { vector: Vector; norm: number } {
    const vector = this.weigh(tokenize(text));
    return { vector, norm: vecNorm(vector) };
  }

  search(text: string, k = 5, opts: { exclude?: number; minScore?: number; filter?: (m: M) => boolean } = {}) {
    const q = this.vectorize(text);
    if (q.norm === 0) return [];
    const scored: { id: number; meta: M; score: number }[] = [];
    for (const d of this.docs) {
      if (d.id === opts.exclude) continue;
      if (opts.filter && !opts.filter(d.meta)) continue;
      const score = cosine(q.vector, q.norm, d.vector, d.norm);
      if (score >= (opts.minScore ?? 0.05)) scored.push({ id: d.id, meta: d.meta, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /** Similaridade entre dois documentos já indexados. */
  similarity(idA: number, idB: number): number {
    const a = this.docs.find((d) => d.id === idA);
    const b = this.docs.find((d) => d.id === idB);
    if (!a || !b) return 0;
    return cosine(a.vector, a.norm, b.vector, b.norm);
  }

  entries() {
    return this.docs;
  }
}

function vecNorm(v: Vector) {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

export function cosine(a: Vector, na: number, b: Vector, nb: number) {
  if (na === 0 || nb === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) dot += w * o;
  }
  return dot / (na * nb);
}
