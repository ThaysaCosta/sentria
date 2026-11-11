import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config.js';
import { CATEGORIES, CATEGORY_KEYS, PRIORITIES, SENTIMENTS } from '../domain.js';
import type { Analysis, AnalysisInput, KbRef } from './localEngine.js';

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 60_000 });
  return client;
}

export const claudeConfigured = () => Boolean(config.anthropicKey) && config.aiEngine !== 'local';

const ClaudeAnalysis = z.object({
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
  confidence: z.number(),
  priority: z.enum(PRIORITIES),
  sentiment: z.enum(SENTIMENTS),
  sentiment_score: z.number(),
  summary: z.string(),
  suggested_reply: z.string(),
  tags: z.array(z.string()),
  signals: z.array(z.string()),
});

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'confidence', 'priority', 'sentiment', 'sentiment_score', 'summary', 'suggested_reply', 'tags', 'signals'],
  properties: {
    category: { type: 'string', enum: CATEGORY_KEYS },
    confidence: { type: 'number', description: 'Confiança na categoria, de 0 a 1.' },
    priority: { type: 'string', enum: [...PRIORITIES] },
    sentiment: { type: 'string', enum: [...SENTIMENTS] },
    sentiment_score: { type: 'number', description: 'De -1 (muito negativo) a 1 (muito positivo).' },
    summary: { type: 'string', description: 'Resumo objetivo do problema em uma frase, em português.' },
    suggested_reply: { type: 'string', description: 'Resposta pronta para revisão do atendente, em português.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Até 6 palavras-chave curtas.' },
    signals: {
      type: 'array',
      items: { type: 'string' },
      description: 'Motivos curtos que justificam a prioridade (ex.: "Operação parada", "Cliente Enterprise").',
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é o motor de análise da SENTRIA, uma plataforma de Customer Intelligence que recebe chamados de suporte de empresas de software B2B no Brasil.

Para cada chamado, você classifica, prioriza e prepara uma resposta que um atendente humano vai revisar antes de enviar.

Categorias disponíveis:
${CATEGORY_KEYS.map((k) => `- ${k}: ${CATEGORIES[k].label}. ${CATEGORIES[k].description}`).join('\n')}

Prioridades:
- critical: operação do cliente parada, muitos usuários afetados, risco de segurança/dados ou prejuízo financeiro imediato.
- high: impede uma tarefa importante sem alternativa razoável, ou cliente de plano alto muito insatisfeito.
- medium: problema real com alternativa disponível ou impacto limitado.
- low: dúvidas, sugestões e pedidos sem urgência.

Tom da resposta sugerida: fale como uma analista experiente. Direta, humana e respeitosa; nunca arrogante, fria ou técnica demais. Cumprimente pelo primeiro nome, reconheça o impacto quando houver frustração, diga o próximo passo concreto e peça só as informações realmente necessárias. Se houver um artigo da base de conhecimento relevante, cite o título. Nunca prometa prazos ou reembolsos. Assine como "Equipe de Suporte".

O resumo deve ter uma frase, sem saudações. Os "signals" explicam, em poucas palavras, por que a prioridade foi escolhida.`;

function buildUserMessage(input: AnalysisInput, kb: KbRef[]) {
  const kbText = kb.length
    ? kb.map((a) => `- "${a.title}" (categoria: ${a.category})`).join('\n')
    : '- (nenhum artigo relevante encontrado)';
  return `<chamado>
Assunto: ${input.subject}
Solicitante: ${input.requesterName ?? 'não informado'}
Empresa: ${input.customerName ?? 'não informada'} · Plano: ${input.customerPlan ?? 'não informado'}
Chamados da empresa nos últimos 7 dias: ${input.customerRecentTickets ?? 0}
Versão do produto: ${input.productVersion ?? 'não informada'}

Descrição:
${input.description}
</chamado>

<artigos_relacionados>
${kbText}
</artigos_relacionados>

Analise o chamado.`;
}

export type ClaudeResult = Pick<
  Analysis,
  'category' | 'confidence' | 'priority' | 'sentiment' | 'sentimentScore' | 'summary' | 'suggestedReply' | 'tags' | 'signals'
>;

/** Analisa um chamado com o Claude. Lança erro em qualquer falha para que o chamador use o motor local. */
export async function analyzeWithClaude(input: AnalysisInput, kb: KbRef[]): Promise<ClaudeResult> {
  const response = await getClient().beta.messages.create({
    model: config.claudeModel,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{ role: 'user', content: buildUserMessage(input, kb) }],
  });

  if (response.stop_reason === 'refusal') throw new Error('O modelo recusou a análise deste chamado.');
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta do modelo truncada (max_tokens).');

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Resposta do modelo sem conteúdo de texto.');

  const parsed = ClaudeAnalysis.parse(JSON.parse(text.text));
  return {
    category: parsed.category as ClaudeResult['category'],
    confidence: clamp(parsed.confidence, 0, 1),
    priority: parsed.priority,
    sentiment: parsed.sentiment,
    sentimentScore: clamp(parsed.sentiment_score, -1, 1),
    summary: parsed.summary.trim(),
    suggestedReply: parsed.suggested_reply.trim(),
    tags: parsed.tags.slice(0, 6),
    signals: parsed.signals.slice(0, 5),
  };
}

/** Gera um resumo executivo em texto a partir de indicadores agregados. */
export async function executiveSummaryWithClaude(context: string): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: config.claudeModel,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system:
      'Você é a analista de Customer Intelligence da SENTRIA. Escreva em português do Brasil, com tom objetivo e humano, para a liderança de suporte. Use apenas os dados fornecidos; não invente números.',
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: `${context}\n\nEscreva um resumo executivo com: um parágrafo de visão geral (2 a 3 frases), depois de 3 a 5 tópicos começando com "- " com os pontos de atenção, e por fim uma linha "Recomendação:" com a ação mais importante. Sem títulos em markdown.`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('O modelo recusou gerar o resumo.');
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('Resumo vazio.');
  return text;
}

export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Chave da API inválida (401).';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Sem permissão para usar o modelo (403).';
  if (err instanceof Anthropic.NotFoundError) return `Modelo "${config.claudeModel}" não encontrado (404).`;
  if (err instanceof Anthropic.RateLimitError) return 'Limite de uso da API atingido (429).';
  if (err instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API da Anthropic.';
  if (err instanceof Anthropic.APIError) return `Erro da API (${err.status ?? '?'}): ${err.message}`;
  if (err instanceof z.ZodError) return 'Resposta do modelo fora do formato esperado.';
  return err instanceof Error ? err.message : String(err);
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
