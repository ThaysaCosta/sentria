import { all, SQL_ISO_NOW } from '../db/database.js';
import { CATEGORY_KEYS, type CategoryKey } from '../domain.js';
import { config } from '../config.js';
import { NaiveBayesClassifier } from './classifier.js';
import { analyzeWithClaude, claudeConfigured, describeClaudeError, executiveSummaryWithClaude } from './claudeEngine.js';
import { analyzeLocal, type Analysis, type AnalysisInput, type KbRef } from './localEngine.js';
import { TfIdfIndex } from './text.js';
import { TRAINING_DATA } from './trainingData.js';

export type { Analysis, AnalysisInput, KbRef } from './localEngine.js';

interface TicketMeta {
  subject: string;
  status: string;
  category: string | null;
  created_at: string;
}

/**
 * Fachada de IA da SENTRIA. Mantém o classificador treinado, os índices de
 * similaridade e decide entre o motor local e o Claude.
 */
class AiService {
  private classifier = new NaiveBayesClassifier<CategoryKey>(CATEGORY_KEYS);
  private kbIndex = new TfIdfIndex<{ title: string; category: string }>();
  private ticketIndex: TfIdfIndex<TicketMeta> | null = null;
  private humanExamples = 0;
  private lastClaudeError: { message: string; at: string } | null = null;
  private claudeCalls = 0;

  constructor() {
    this.trainBase();
  }

  private trainBase() {
    const examples = CATEGORY_KEYS.flatMap((label) => TRAINING_DATA[label].map((text) => ({ text, label })));
    this.classifier.train(examples);
  }

  /**
   * Retreina com o corpus base + chamados cuja categoria foi definida/corrigida
   * por uma pessoa. Correções humanas pesam mais (peso 2).
   */
  retrain() {
    const base = CATEGORY_KEYS.flatMap((label) => TRAINING_DATA[label].map((text) => ({ text, label, weight: 1 })));
    const human = all<{ subject: string; description: string; category: CategoryKey }>(
      `SELECT subject, description, category FROM tickets
       WHERE category_source = 'human' AND category IS NOT NULL
       ORDER BY updated_at DESC LIMIT 3000`,
    ).map((t) => ({ text: `${t.subject}. ${t.subject}. ${t.description}`, label: t.category, weight: 2 }));
    this.humanExamples = human.length;
    this.classifier.train([...base, ...human]);
  }

  /** Aprendizado incremental imediato quando um atendente corrige a categoria. */
  learnCorrection(subject: string, description: string, category: CategoryKey) {
    this.classifier.learn(`${subject}. ${subject}. ${description}`, category, 2);
    this.humanExamples += 1;
  }

  refreshKnowledgeBase() {
    const articles = all<{ id: number; title: string; category: string; body: string; tags: string | null }>(
      'SELECT id, title, category, body, tags FROM kb_articles',
    );
    this.kbIndex.build(
      articles.map((a) => ({
        id: a.id,
        text: `${a.title} ${a.title} ${a.tags ?? ''} ${a.body}`,
        meta: { title: a.title, category: a.category },
      })),
    );
  }

  suggestArticles(text: string, k = 3): KbRef[] {
    return this.kbIndex.search(text, k, { minScore: 0.08 }).map((r) => ({
      id: r.id,
      title: r.meta.title,
      category: r.meta.category,
      score: Math.round(r.score * 100) / 100,
    }));
  }

  invalidateTickets() {
    this.ticketIndex = null;
  }

  private getTicketIndex() {
    if (!this.ticketIndex) {
      const rows = all<{ id: number; subject: string; description: string } & TicketMeta>(
        `SELECT id, subject, description, status, category, created_at FROM tickets
         WHERE created_at >= ${SQL_ISO_NOW} ORDER BY id DESC LIMIT 5000`,
        '-120 days',
      );
      this.ticketIndex = new TfIdfIndex(
        rows.map((r) => ({
          id: r.id,
          text: `${r.subject} ${r.subject} ${r.description}`,
          meta: { subject: r.subject, status: r.status, category: r.category, created_at: r.created_at },
        })),
      );
    }
    return this.ticketIndex;
  }

  similarTickets(text: string, k = 5, excludeId?: number) {
    return this.getTicketIndex()
      .search(text, k, { exclude: excludeId, minScore: 0.25 })
      .map((r) => ({ id: r.id, ...r.meta, score: Math.round(r.score * 100) / 100 }));
  }

  /** Índice completo (usado pela detecção de grupos de chamados parecidos). */
  ticketVectors() {
    return this.getTicketIndex();
  }

  analyzeLocal(input: AnalysisInput): Analysis {
    const kb = this.suggestArticles(`${input.subject} ${input.description}`);
    return analyzeLocal(input, this.classifier, kb);
  }

  /**
   * Análise completa. Usa o Claude quando configurado e permitido; o motor local
   * sempre roda (é instantâneo) e serve de base e de plano B.
   */
  async analyze(input: AnalysisInput, opts: { allowClaude?: boolean } = {}): Promise<Analysis> {
    const local = this.analyzeLocal(input);
    if (!opts.allowClaude || !claudeConfigured()) return local;
    try {
      this.claudeCalls += 1;
      const c = await analyzeWithClaude(input, local.kbArticles);
      this.lastClaudeError = null;
      return {
        ...local,
        ...c,
        // Risco de churn continua determinístico (usa histórico do cliente).
        churnRisk: Math.round((local.churnRisk + riskFrom(c.priority, c.sentimentScore)) / 2),
        signals: [...new Set([...c.signals, ...local.signals])].slice(0, 6),
        ranking: local.ranking,
        engine: 'claude',
        model: config.claudeModel,
      };
    } catch (err) {
      const message = describeClaudeError(err);
      this.lastClaudeError = { message, at: new Date().toISOString() };
      console.warn(`[ai] Claude indisponível, usando motor local: ${message}`);
      return { ...local, fallbackReason: message };
    }
  }

  async executiveSummary(context: string, fallback: () => string) {
    if (!claudeConfigured()) return { text: fallback(), engine: 'local' as const };
    try {
      const text = await executiveSummaryWithClaude(context);
      return { text, engine: 'claude' as const, model: config.claudeModel };
    } catch (err) {
      const message = describeClaudeError(err);
      this.lastClaudeError = { message, at: new Date().toISOString() };
      return { text: fallback(), engine: 'local' as const, fallbackReason: message };
    }
  }

  status() {
    return {
      activeEngine: claudeConfigured() ? 'claude' : 'local',
      claudeConfigured: claudeConfigured(),
      claudeModel: config.claudeModel,
      localModel: 'sentria-local-nb-v1',
      trainingExamples: this.classifier.size,
      humanFeedbackExamples: this.humanExamples,
      knowledgeBaseArticles: this.kbIndex.size,
      claudeCalls: this.claudeCalls,
      lastClaudeError: this.lastClaudeError,
    };
  }
}

function riskFrom(priority: string, sentimentScore: number) {
  const p = { low: 5, medium: 15, high: 30, critical: 45 }[priority] ?? 10;
  return Math.round(8 + p + Math.max(0, -sentimentScore) * 30);
}

export const ai = new AiService();
