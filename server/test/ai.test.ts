import { describe, expect, it } from 'vitest';
import { NaiveBayesClassifier } from '../src/ai/classifier.js';
import { analyzeLocal, analyzeSentiment, extractTags, summarize } from '../src/ai/localEngine.js';
import { TfIdfIndex, stem, tokenize } from '../src/ai/text.js';
import { TRAINING_DATA } from '../src/ai/trainingData.js';
import { CATEGORY_KEYS, type CategoryKey } from '../src/domain.js';

function trained() {
  const c = new NaiveBayesClassifier<CategoryKey>(CATEGORY_KEYS);
  c.train(CATEGORY_KEYS.flatMap((label) => TRAINING_DATA[label].map((text) => ({ text, label }))));
  return c;
}

describe('text', () => {
  it('normaliza acentos, remove stopwords e reduz plurais', () => {
    expect(tokenize('As integrações não funcionam')).toEqual(['integracao', 'funcionam']);
    expect(stem('boletos')).toBe('boleto');
    expect(stem('notificacoes')).toBe('notificacao');
  });

  it('TF-IDF encontra o documento mais parecido', () => {
    const index = new TfIdfIndex([
      { id: 1, text: 'boleto não gerado após upgrade de plano', meta: null },
      { id: 2, text: 'webhook retornando erro 502', meta: null },
      { id: 3, text: 'login com SSO do Azure falhando', meta: null },
    ]);
    expect(index.search('meu boleto não foi gerado', 1)[0].id).toBe(1);
    expect(index.search('erro no webhook', 1)[0].id).toBe(2);
  });
});

describe('classificador Naive Bayes', () => {
  const classifier = trained();

  it.each([
    ['Cobraram duas vezes a mensalidade no meu cartão', 'pagamentos'],
    ['Não consigo fazer login, a senha não é aceita', 'acesso'],
    ['A API está devolvendo erro 401 no endpoint de pedidos', 'integracoes'],
    ['O painel está extremamente lento e trava ao carregar', 'performance'],
    ['O botão de salvar some depois da atualização', 'bugs'],
    ['Como faço para exportar meus dados para planilha?', 'duvidas'],
  ])('"%s" → %s', (text, expected) => {
    expect(classifier.predict(text).label).toBe(expected);
  });

  it('retorna probabilidades que somam 1 e confiança calibrada', () => {
    const p = classifier.predict('Boleto da fatura não chegou');
    const sum = p.ranking.reduce((s, r) => s + r.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(p.confidence).toBeGreaterThan(0.5);
    expect(p.confidence).toBeLessThan(1);
  });

  it('aprende com correções humanas', () => {
    const c = trained();
    const text = 'Integração do módulo Zylo com o portal parceiro';
    for (let i = 0; i < 4; i++) c.learn(text, 'duvidas', 2);
    expect(c.predict(text).label).toBe('duvidas');
  });

  it('tem confiança baixa quando não conhece nenhum termo', () => {
    expect(classifier.predict('xyzzy qwerty').confidence).toBeLessThanOrEqual(0.3);
  });
});

describe('sentimento', () => {
  it('detecta frustração, negação e tipografia', () => {
    expect(analyzeSentiment('Isso é um absurdo, inaceitável!!').sentiment).toBe('negative');
    expect(analyzeSentiment('Muito obrigado, ficou excelente').sentiment).toBe('positive');
    expect(analyzeSentiment('Gostaria de alterar o e-mail do financeiro').sentiment).toBe('neutral');
    expect(analyzeSentiment('Não foi nada bom, PÉSSIMO ATENDIMENTO').score).toBeLessThan(-0.2);
  });
});

describe('análise completa local', () => {
  const classifier = trained();

  it('prioriza operação parada de cliente Enterprise como crítica e explica o motivo', () => {
    const a = analyzeLocal(
      {
        subject: 'Plataforma fora do ar',
        description: 'Urgente! Ninguém consegue acessar, toda a equipe está parada e estamos com prejuízo.',
        customerPlan: 'Enterprise',
        requesterName: 'Paula Reis',
      },
      classifier,
      [],
    );
    expect(a.priority).toBe('critical');
    expect(a.signals).toContain('Operação parada ou indisponível');
    expect(a.signals).toContain('Cliente do plano Enterprise');
    expect(a.suggestedReply).toContain('Olá, Paula!');
    expect(a.churnRisk).toBeGreaterThan(40);
  });

  it('trata dúvida simples como prioridade baixa', () => {
    const a = analyzeLocal({ subject: 'Dúvida', description: 'Como configuro as notificações por e-mail?' }, classifier, []);
    expect(a.category).toBe('duvidas');
    expect(a.priority).toBe('low');
  });

  it('eleva o risco de churn quando o cliente menciona cancelamento', () => {
    const calm = analyzeLocal({ subject: 'Fatura', description: 'O valor da fatura veio diferente.' }, classifier, []);
    const angry = analyzeLocal(
      { subject: 'Fatura', description: 'O valor da fatura veio diferente de novo. Vamos cancelar o contrato.' },
      classifier,
      [],
    );
    expect(angry.churnRisk).toBeGreaterThan(calm.churnRisk + 25);
    expect(angry.signals).toContain('Menciona cancelamento');
  });

  it('extrai tags e versão, e resume sem saudação', () => {
    expect(extractTags('Webhook com erro 502 após a versão 4.2')).toEqual(expect.arrayContaining(['webhook', 'erro 5xx', 'v4.2']));
    expect(summarize('Boleto', 'Olá, bom dia. O boleto não foi gerado após o upgrade.', 'Ana Lima')).toBe(
      'Ana relata: O boleto não foi gerado após o upgrade.',
    );
  });
});
