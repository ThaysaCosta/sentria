import type { CategoryKey } from '../domain.js';

/** Todos os nomes de empresas e pessoas são fictícios. */

export const DEMO_PASSWORD = 'sentria123';

export const USERS = [
  { name: 'Marina Alves', email: 'marina@sentria.demo', role: 'admin', title: 'Head de Suporte' },
  { name: 'Rafael Costa', email: 'rafael@sentria.demo', role: 'agent', title: 'Analista de Suporte N2' },
  { name: 'Juliana Prado', email: 'juliana@sentria.demo', role: 'agent', title: 'Analista de Suporte N1' },
  { name: 'Diego Martins', email: 'diego@sentria.demo', role: 'agent', title: 'Especialista em Integrações' },
  { name: 'Camila Rocha', email: 'camila@sentria.demo', role: 'agent', title: 'Analista de Suporte N1' },
  { name: 'Bruno Lima', email: 'bruno@sentria.demo', role: 'agent', title: 'Analista de Billing' },
] as const;

export const CUSTOMERS: { name: string; plan: string; segment: string; mrr: number; domain: string }[] = [
  { name: 'Lumen Tech', plan: 'Pro', segment: 'Tecnologia', mrr: 2490, domain: 'lumentech.com.br' },
  { name: 'Orbe Pay', plan: 'Enterprise', segment: 'Fintech', mrr: 18900, domain: 'orbepay.com.br' },
  { name: 'Vértice Engenharia', plan: 'Business', segment: 'Construção', mrr: 6900, domain: 'verticeeng.com.br' },
  { name: 'Nuvia Saúde', plan: 'Business', segment: 'Saúde', mrr: 7400, domain: 'nuviasaude.com.br' },
  { name: 'Kora Fintech', plan: 'Enterprise', segment: 'Fintech', mrr: 22500, domain: 'korafintech.com.br' },
  { name: 'Grupo Aurora', plan: 'Enterprise', segment: 'Varejo', mrr: 15800, domain: 'grupoaurora.com.br' },
  { name: 'Pinhal Engenharia', plan: 'Pro', segment: 'Construção', mrr: 1990, domain: 'pinhaleng.com.br' },
  { name: 'Maré Logística', plan: 'Business', segment: 'Logística', mrr: 5600, domain: 'marelog.com.br' },
  { name: 'Cia. Solar', plan: 'Pro', segment: 'Energia', mrr: 2190, domain: 'ciasolar.com.br' },
  { name: 'Floripa Dev', plan: 'Starter', segment: 'Tecnologia', mrr: 490, domain: 'floripadev.com.br' },
  { name: 'Tríade Advocacia', plan: 'Pro', segment: 'Jurídico', mrr: 2890, domain: 'triadeadv.com.br' },
  { name: 'Horizonte Clínicas', plan: 'Pro', segment: 'Saúde', mrr: 2390, domain: 'horizonteclinicas.com.br' },
  { name: 'Nexo Varejo', plan: 'Business', segment: 'Varejo', mrr: 6200, domain: 'nexovarejo.com.br' },
  { name: 'Brisa Educação', plan: 'Pro', segment: 'Educação', mrr: 1790, domain: 'brisaedu.com.br' },
  { name: 'Quanta Contábil', plan: 'Pro', segment: 'Contabilidade', mrr: 1590, domain: 'quantacontabil.com.br' },
  { name: 'Rota Sul Transportes', plan: 'Business', segment: 'Logística', mrr: 5100, domain: 'rotasul.com.br' },
  { name: 'Alto Vale Agro', plan: 'Pro', segment: 'Agronegócio', mrr: 2690, domain: 'altovaleagro.com.br' },
  { name: 'Ípsilon Seguros', plan: 'Enterprise', segment: 'Seguros', mrr: 19700, domain: 'ipsilonseguros.com.br' },
  { name: 'Marfim Imóveis', plan: 'Starter', segment: 'Imobiliário', mrr: 590, domain: 'marfimimoveis.com.br' },
  { name: 'Prisma Labs', plan: 'Pro', segment: 'Tecnologia', mrr: 2290, domain: 'prismalabs.com.br' },
  { name: 'Selva Digital', plan: 'Starter', segment: 'Marketing', mrr: 390, domain: 'selvadigital.com.br' },
  { name: 'Duna Energia', plan: 'Business', segment: 'Energia', mrr: 7900, domain: 'dunaenergia.com.br' },
  { name: 'Âncora Jurídico', plan: 'Pro', segment: 'Jurídico', mrr: 2090, domain: 'ancorajuridico.com.br' },
  { name: 'Vela Turismo', plan: 'Starter', segment: 'Turismo', mrr: 690, domain: 'velaturismo.com.br' },
  { name: 'Pampa Foods', plan: 'Business', segment: 'Alimentos', mrr: 6600, domain: 'pampafoods.com.br' },
  { name: 'Cobalto Sistemas', plan: 'Pro', segment: 'Tecnologia', mrr: 2590, domain: 'cobalto.com.br' },
  { name: 'Ponto Norte Atacado', plan: 'Pro', segment: 'Varejo', mrr: 1890, domain: 'pontonorte.com.br' },
  { name: 'Lince Segurança', plan: 'Business', segment: 'Serviços', mrr: 4900, domain: 'lincesec.com.br' },
  { name: 'Granito Construções', plan: 'Pro', segment: 'Construção', mrr: 2490, domain: 'granitoconst.com.br' },
  { name: 'Faro Analytics', plan: 'Starter', segment: 'Tecnologia', mrr: 790, domain: 'faroanalytics.com.br' },
  { name: 'Oásis Clínicas', plan: 'Pro', segment: 'Saúde', mrr: 2190, domain: 'oasisclinicas.com.br' },
  { name: 'Zênite Telecom', plan: 'Enterprise', segment: 'Telecom', mrr: 16400, domain: 'zenitetelecom.com.br' },
  { name: 'Coral Hotéis', plan: 'Business', segment: 'Hotelaria', mrr: 5300, domain: 'coralhoteis.com.br' },
  { name: 'Mirante Imobiliária', plan: 'Pro', segment: 'Imobiliário', mrr: 1690, domain: 'mirante.com.br' },
  { name: 'Trilha Outdoor', plan: 'Starter', segment: 'Varejo', mrr: 490, domain: 'trilhaoutdoor.com.br' },
  { name: 'Fóton Solar', plan: 'Pro', segment: 'Energia', mrr: 1990, domain: 'fotonsolar.com.br' },
];

export const FIRST_NAMES = [
  'Ana', 'Bruna', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Isabela', 'João',
  'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Patrícia', 'Pedro', 'Renata', 'Rodrigo',
  'Sabrina', 'Thiago', 'Vanessa', 'Vinícius', 'Letícia', 'André', 'Beatriz', 'Felipe', 'Gustavo',
];
export const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Ribeiro', 'Almeida', 'Gomes',
  'Martins', 'Araújo', 'Barbosa', 'Rocha', 'Dias', 'Teixeira', 'Moreira', 'Cardoso', 'Nunes', 'Mendes',
];

export const MODULES = ['Financeiro', 'Vendas', 'Estoque', 'Compras', 'Contratos', 'Relatórios', 'Agenda', 'Projetos'];

export interface TicketTemplate {
  subject: string;
  body: string;
}

export const TEMPLATES: Record<CategoryKey, TicketTemplate[]> = {
  pagamentos: [
    { subject: 'Boleto não gerado após upgrade de plano', body: 'Fizemos o upgrade para o plano {plano} e desde então o boleto da mensalidade não é gerado. A tela de faturas fica apenas carregando.' },
    { subject: 'Cobrança duplicada na fatura', body: 'Identificamos duas cobranças de mesmo valor na fatura deste mês. Nosso financeiro precisa do ajuste antes do fechamento.' },
    { subject: 'Nota fiscal com dados incorretos', body: 'A NFS-e emitida saiu com a razão social antiga. Precisamos de uma nova nota com os dados atualizados do cadastro.' },
    { subject: 'Pagamento via Pix não reconhecido', body: 'Pagamos a fatura por Pix há {n} dias e o painel continua mostrando pagamento pendente. Já enviei o comprovante por e-mail.' },
    { subject: 'Segunda via de boleto vencido', body: 'O boleto venceu durante o feriado. Como consigo emitir uma segunda via com a data atualizada?' },
    { subject: 'Valor cobrado diferente do contratado', body: 'A fatura veio com valor maior que o acordado na proposta comercial. Não recebemos nenhum aviso de reajuste.' },
    { subject: 'Cartão recusado na renovação', body: 'A renovação automática falhou e recebemos aviso de suspensão da conta. O cartão está válido e com limite.' },
    { subject: 'Solicitação de estorno proporcional', body: 'Removemos os usuários extras no início do mês, mas a cobrança continuou cheia. Gostaríamos do estorno proporcional.' },
  ],
  acesso: [
    { subject: 'Usuários sem acesso via SSO Azure', body: 'Desde esta manhã nenhum usuário consegue entrar pelo SSO do Azure. Aparece assinatura inválida após o redirecionamento.' },
    { subject: 'Conta bloqueada após tentativas de login', body: 'Minha conta foi bloqueada depois de errar a senha algumas vezes. Preciso liberar o acesso para fechar os relatórios de hoje.' },
    { subject: 'Código de dois fatores não chega', body: 'O código de verificação por SMS não está chegando no meu celular. Já tentei reenviar várias vezes.' },
    { subject: 'Convite de usuário expirado', body: 'Enviamos convite para {n} novos colaboradores, mas o link aparece como expirado ao clicar.' },
    { subject: 'Permissão negada no módulo {modulo}', body: 'Um usuário com perfil de gestor recebe acesso negado ao abrir o módulo {modulo}. Antes funcionava normalmente.' },
    { subject: 'E-mail de redefinição de senha não chega', body: 'Cliquei em esqueci a senha, mas o e-mail de redefinição não chega, nem na caixa de spam.' },
    { subject: 'Sessão expirando muito rápido', body: 'O sistema desconecta a cada poucos minutos e perdemos o que estava sendo preenchido no formulário.' },
    { subject: 'Transferir administrador da conta', body: 'A antiga administradora saiu da empresa. Como transferimos a administração da conta para outra pessoa?' },
  ],
  integracoes: [
    { subject: 'Webhook retornando erro 502 intermitente', body: 'Nosso endpoint está recebendo erro 502 de forma intermitente nas chamadas de webhook de pedidos. Algumas notificações não chegam.' },
    { subject: 'API retornando 401 com token válido', body: 'As chamadas para a API passaram a retornar 401 mesmo com o token recém-gerado. Nada mudou do nosso lado.' },
    { subject: 'Integração com ERP parou de sincronizar', body: 'A sincronização com o nosso ERP parou ontem à noite. Os pedidos novos não aparecem no sistema.' },
    { subject: 'Erro 429 de limite de requisições', body: 'Estamos recebendo erro 429 ao chamar o endpoint de clientes, mesmo com volume baixo de requisições.' },
    { subject: 'Eventos de webhook duplicados', body: 'Cada evento de pagamento chega duas ou três vezes no nosso servidor, gerando lançamentos duplicados.' },
    { subject: 'Campo personalizado não aparece na API', body: 'Criamos um campo personalizado no cadastro, mas ele não é retornado no JSON da API de clientes.' },
    { subject: 'Timeout no endpoint de exportação', body: 'A chamada ao endpoint de exportação demora mais de {n}0 segundos e termina em timeout.' },
    { subject: 'Exemplo de autenticação da API não funciona', body: 'O exemplo de autenticação na documentação não corresponde ao comportamento atual da API de integração.' },
  ],
  performance: [
    { subject: 'Relatório mensal demorando para carregar', body: 'O relatório mensal de vendas leva vários minutos para abrir e muitas vezes não termina de carregar.' },
    { subject: 'Sistema muito lento hoje', body: 'Desde cedo todas as telas estão muito lentas. A equipe inteira está com dificuldade para trabalhar.' },
    { subject: 'Dashboard não carrega os indicadores', body: 'O dashboard principal fica girando e não exibe os indicadores. Já testamos em outros navegadores.' },
    { subject: 'Plataforma fora do ar', body: 'Não conseguimos acessar a plataforma, aparece erro 503. Nossa operação está parada.' },
    { subject: 'Lentidão ao salvar cadastros', body: 'Salvar um cadastro simples está levando quase um minuto. Antes era instantâneo.' },
    { subject: 'Importação de planilha travada', body: 'Importamos uma planilha com {n}000 linhas há horas e o processamento continua em andamento.' },
    { subject: 'Busca de clientes muito demorada', body: 'A busca de clientes demora demais para retornar qualquer resultado, mesmo com poucos filtros.' },
    { subject: 'Aplicativo mobile lento para sincronizar', body: 'O aplicativo no celular está demorando muito para sincronizar os dados da equipe de campo.' },
  ],
  bugs: [
    { subject: 'Botão de salvar não responde em {modulo}', body: 'No formulário de {modulo} o botão salvar não faz nada desde a última atualização.' },
    { subject: 'Valores errados no relatório de {modulo}', body: 'O relatório de {modulo} está somando valores errados. Conferimos manualmente e há diferença nos totais.' },
    { subject: 'Erro inesperado ao abrir cadastro', body: 'Ao abrir o cadastro de clientes aparece a mensagem "Erro inesperado, tente novamente".' },
    { subject: 'Filtros por data pararam de funcionar', body: 'Depois da versão {versao}, os filtros por data não retornam nenhum resultado.' },
    { subject: 'Anexos não aparecem na listagem', body: 'Os anexos enviados nos registros não aparecem na listagem, mas o upload diz que foi concluído.' },
    { subject: 'Datas no formato americano nos documentos', body: 'As datas estão aparecendo no formato mês/dia nos documentos gerados, mesmo com idioma português.' },
    { subject: 'Tela em branco no menu de configurações', body: 'Ao clicar em configurações a tela fica totalmente em branco e nada carrega.' },
    { subject: 'E-mails de notificação com acentos quebrados', body: 'Os e-mails de notificação chegam com caracteres estranhos no lugar dos acentos.' },
  ],
  duvidas: [
    { subject: 'Como exportar clientes para o Excel', body: 'Gostaria de saber como exportar a lista de clientes com os campos personalizados para o Excel.' },
    { subject: 'Treinamento para novos usuários', body: 'Vamos receber {n} novos colaboradores. Vocês oferecem algum treinamento ou material de onboarding?' },
    { subject: 'Configurar notificações por e-mail', body: 'Onde configuro quais notificações por e-mail cada usuário recebe?' },
    { subject: 'Diferença entre os planos', body: 'Quais recursos a mais teríamos ao migrar do plano {plano} para o Business?' },
    { subject: 'Sugestão: modo escuro na interface', body: 'Seria ótimo ter um modo escuro na interface, a equipe passa o dia todo no sistema.' },
    { subject: 'Agendar envio automático de relatórios', body: 'É possível agendar o envio automático do relatório semanal para a diretoria?' },
    { subject: 'Como criar um painel personalizado', body: 'Como monto um painel com os indicadores que a minha área acompanha?' },
    { subject: 'Previsão de integração com o Teams', body: 'Vocês têm previsão de integração com o Microsoft Teams para receber alertas?' },
  ],
};

export const SPIKE_TEMPLATES: TicketTemplate[] = [
  { subject: 'Boleto não gerado após atualização', body: 'Desde a atualização 4.2 o boleto não é gerado quando mudamos de plano. A tela de faturas mostra erro ao emitir.' },
  { subject: 'Erro ao emitir boleto na versão 4.2', body: 'Ao tentar emitir o boleto da fatura aparece "falha ao gerar documento". Começou depois da versão 4.2.' },
  { subject: 'Boleto não aparece depois do upgrade', body: 'Fizemos upgrade do plano hoje e o boleto não aparece para pagamento. O vencimento é amanhã.' },
  { subject: 'Falha na geração de boleto', body: 'Nenhum boleto está sendo gerado na conta desde ontem. Nossos clientes também não recebem a cobrança.' },
  { subject: 'Boleto com erro após atualização do sistema', body: 'Após a atualização do sistema o boleto não é gerado e o botão de segunda via retorna erro.' },
];

export const TONES = {
  greeting: ['Olá, ', 'Bom dia, pessoal. ', 'Boa tarde! ', '', '', 'Oi, tudo bem? '],
  angry: [
    ' Isso é inaceitável, já é a segunda vez este mês!',
    ' Estamos perdendo dinheiro com isso. Preciso de uma solução urgente.',
    ' Se não resolverem logo vamos avaliar o cancelamento do contrato.',
    ' Ninguém respondeu o último chamado, um absurdo.',
    ' Muito frustrante, já abri chamado sobre isso antes.',
  ],
  urgent: [
    ' É urgente, toda a equipe está parada.',
    ' Precisamos resolver hoje por causa do fechamento do mês.',
    ' Isso está impedindo o faturamento da empresa.',
  ],
  polite: [' Obrigado desde já!', ' Agradeço a ajuda de vocês.', '', '', ' Fico no aguardo.'],
};

export const KB_ARTICLES: { title: string; category: CategoryKey; tags: string; body: string }[] = [
  {
    title: 'Como emitir a segunda via do boleto',
    category: 'pagamentos',
    tags: 'boleto, segunda via, fatura, vencimento',
    body: 'Acesse Configurações > Financeiro > Faturas, localize a fatura desejada e clique em "Segunda via". O novo boleto é gerado com a data de vencimento atualizada e enviado para o e-mail do financeiro. Boletos pagos após o vencimento podem levar até 3 dias úteis para compensar.',
  },
  {
    title: 'Boleto não gerado após mudança de plano',
    category: 'pagamentos',
    tags: 'boleto, upgrade, mudança de plano, erro',
    body: 'Ao trocar de plano, a fatura proporcional é recalculada. Se o boleto não aparecer em até 15 minutos, verifique se o CNPJ e o endereço de cobrança estão completos em Configurações > Financeiro. Persistindo, abra um chamado informando o número da fatura.',
  },
  {
    title: 'Pagamentos via Pix: prazo de confirmação',
    category: 'pagamentos',
    tags: 'pix, pagamento pendente, comprovante',
    body: 'Pagamentos via Pix são confirmados automaticamente em até 30 minutos. Se o status continuar pendente depois de 24 horas, envie o comprovante com o ID da transação (E2E) pelo portal de suporte.',
  },
  {
    title: 'Como corrigir dados da nota fiscal',
    category: 'pagamentos',
    tags: 'nota fiscal, nfs-e, razão social, cnpj',
    body: 'As notas fiscais usam os dados do cadastro financeiro no momento da emissão. Atualize razão social e CNPJ em Configurações > Financeiro e solicite a reemissão da nota em Faturas > Ações > Reemitir NFS-e.',
  },
  {
    title: 'Configurando SSO com Azure AD',
    category: 'acesso',
    tags: 'sso, azure ad, saml, login único',
    body: 'Em Configurações > Segurança > SSO, informe a URL de metadados do Azure AD e baixe o certificado da SENTRIA para cadastrar no Azure. Erros de "assinatura inválida" normalmente indicam certificado expirado ou renovado no provedor: faça o upload do novo certificado e teste com um usuário administrador.',
  },
  {
    title: 'Redefinir senha e desbloquear conta',
    category: 'acesso',
    tags: 'senha, conta bloqueada, esqueci a senha, login',
    body: 'Após 5 tentativas incorretas a conta fica bloqueada por 15 minutos. Use "Esqueci a senha" na tela de login para receber um link válido por 1 hora. Administradores também podem desbloquear usuários em Configurações > Usuários.',
  },
  {
    title: 'Autenticação em dois fatores (2FA)',
    category: 'acesso',
    tags: '2fa, dois fatores, código sms, autenticador',
    body: 'Recomendamos usar um aplicativo autenticador em vez de SMS. Se você trocou de celular, use um dos códigos de recuperação gerados na ativação ou peça ao administrador para redefinir o 2FA do seu usuário.',
  },
  {
    title: 'Webhooks: códigos de erro e reenvio',
    category: 'integracoes',
    tags: 'webhook, erro 502, reenvio, duplicado, idempotência',
    body: 'A SENTRIA reenvia webhooks com falha até 8 vezes com intervalo crescente. Erros 502 e 504 indicam que o seu endpoint não respondeu a tempo (limite de 10 segundos). Use o cabeçalho "x-event-id" para tratar eventos duplicados de forma idempotente.',
  },
  {
    title: 'Limites de requisição da API (rate limit)',
    category: 'integracoes',
    tags: 'api, 429, rate limit, limite',
    body: 'O limite padrão é de 120 requisições por minuto por token. Respostas 429 trazem o cabeçalho "retry-after" com o tempo de espera. Para cargas grandes, prefira os endpoints de exportação em lote.',
  },
  {
    title: 'Gerar e renovar tokens da API',
    category: 'integracoes',
    tags: 'api, token, 401, autenticação',
    body: 'Tokens são gerados em Configurações > Integrações > Tokens e expiram em 90 dias. Um erro 401 com token recém-criado geralmente indica uso do token de sandbox em produção ou ausência do prefixo "Bearer" no cabeçalho Authorization.',
  },
  {
    title: 'Relatórios lentos: boas práticas de filtro',
    category: 'performance',
    tags: 'relatório, lentidão, filtros, desempenho',
    body: 'Relatórios com mais de 12 meses de dados são processados em segundo plano. Use filtros de período menores, salve visões frequentes e agende relatórios pesados para envio por e-mail fora do horário comercial.',
  },
  {
    title: 'Status da plataforma e incidentes',
    category: 'performance',
    tags: 'fora do ar, instabilidade, status, incidente',
    body: 'Acompanhe a disponibilidade em tempo real na página de status. Durante incidentes, publicamos atualizações a cada 30 minutos e enviamos um relatório pós-incidente em até 5 dias úteis.',
  },
  {
    title: 'Como reportar um erro com eficiência',
    category: 'bugs',
    tags: 'erro, bug, print, passos',
    body: 'Inclua os passos realizados, o resultado esperado, o resultado obtido, um print da tela e o texto completo da mensagem de erro. Isso permite reproduzir o problema e reduz o tempo de solução pela metade.',
  },
  {
    title: 'Exportar dados para Excel',
    category: 'duvidas',
    tags: 'exportar, excel, csv, planilha',
    body: 'Em qualquer listagem, clique em "Exportar" e escolha CSV ou Excel. Campos personalizados entram na exportação quando estiverem visíveis nas colunas da tabela.',
  },
  {
    title: 'Configurar notificações por e-mail',
    category: 'duvidas',
    tags: 'notificações, e-mail, alertas',
    body: 'Cada usuário escolhe suas notificações em Perfil > Notificações. Administradores podem definir padrões por equipe em Configurações > Notificações.',
  },
  {
    title: 'Primeiros passos para novos usuários',
    category: 'duvidas',
    tags: 'treinamento, onboarding, tutorial',
    body: 'Disponibilizamos uma trilha de onboarding com vídeos curtos e um webinar semanal ao vivo. Equipes com mais de 10 novos usuários podem agendar uma sessão dedicada com o time de sucesso do cliente.',
  },
];
