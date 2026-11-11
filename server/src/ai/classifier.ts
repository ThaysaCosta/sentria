import { features } from './text.js';

export interface Prediction<L extends string> {
  label: L;
  confidence: number;
  ranking: { label: L; probability: number }[];
}

/**
 * Naive Bayes multinomial com suavização de Laplace.
 * As probabilidades são calibradas com uma "temperatura" proporcional ao tamanho
 * do texto, para evitar a confiança de 100% típica do Naive Bayes puro.
 */
export class NaiveBayesClassifier<L extends string> {
  private docsPerLabel = new Map<L, number>();
  private tokensPerLabel = new Map<L, Map<string, number>>();
  private totalTokensPerLabel = new Map<L, number>();
  private vocabulary = new Set<string>();
  private totalDocs = 0;

  constructor(private readonly labels: readonly L[]) {
    this.reset();
  }

  reset() {
    this.docsPerLabel.clear();
    this.tokensPerLabel.clear();
    this.totalTokensPerLabel.clear();
    this.vocabulary.clear();
    this.totalDocs = 0;
    for (const l of this.labels) {
      this.docsPerLabel.set(l, 0);
      this.tokensPerLabel.set(l, new Map());
      this.totalTokensPerLabel.set(l, 0);
    }
  }

  get size() {
    return this.totalDocs;
  }

  learn(text: string, label: L, weight = 1) {
    if (!this.docsPerLabel.has(label)) return;
    this.totalDocs += weight;
    this.docsPerLabel.set(label, this.docsPerLabel.get(label)! + weight);
    const counts = this.tokensPerLabel.get(label)!;
    for (const f of features(text)) {
      this.vocabulary.add(f);
      counts.set(f, (counts.get(f) ?? 0) + weight);
      this.totalTokensPerLabel.set(label, this.totalTokensPerLabel.get(label)! + weight);
    }
  }

  train(examples: { text: string; label: L; weight?: number }[]) {
    this.reset();
    for (const e of examples) this.learn(e.text, e.label, e.weight ?? 1);
  }

  predict(text: string): Prediction<L> {
    const feats = features(text).filter((f) => this.vocabulary.has(f));
    const V = this.vocabulary.size || 1;
    const logScores = this.labels.map((label) => {
      const prior = Math.log((this.docsPerLabel.get(label)! + 1) / (this.totalDocs + this.labels.length));
      const counts = this.tokensPerLabel.get(label)!;
      const total = this.totalTokensPerLabel.get(label)!;
      let score = prior;
      for (const f of feats) score += Math.log(((counts.get(f) ?? 0) + 1) / (total + V));
      return score;
    });

    // Calibração: textos longos acumulam evidência demais; suaviza com temperatura.
    const temperature = Math.max(1, Math.sqrt(feats.length) * 0.45);
    const scaled = logScores.map((s) => s / temperature);
    const max = Math.max(...scaled);
    const exps = scaled.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);

    const ranking = this.labels
      .map((label, i) => ({ label, probability: exps[i] / sum }))
      .sort((a, b) => b.probability - a.probability);

    // Sem nenhum termo conhecido, a confiança é baixa por definição.
    const confidence = feats.length === 0 ? 0.3 : ranking[0].probability;
    return { label: ranking[0].label, confidence, ranking };
  }
}
