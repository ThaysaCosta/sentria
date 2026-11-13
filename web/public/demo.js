// Kairo ERP (demonstração): navegação e o botão que falha de propósito.
// Arquivo separado do HTML para respeitar a Content-Security-Policy (sem scripts inline).
const VIEWS = {
  dashboard: { title: 'Dashboard', crumbs: 'Início' },
  faturas: { title: 'Faturas', crumbs: 'Financeiro › Faturas' },
  assinatura: { title: 'Assinatura e plano', crumbs: 'Financeiro › Assinatura' },
  clientes: { title: 'Clientes', crumbs: 'Cadastros › Clientes' },
};
const ROUTES = { '#/dashboard': 'dashboard', '#/financeiro/faturas': 'faturas', '#/financeiro/assinatura': 'assinatura', '#/cadastros/clientes': 'clientes' };

function route() {
  const v = ROUTES[location.hash] || 'faturas';
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.dataset.view === v));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === v));
  document.getElementById('title').textContent = VIEWS[v].title;
  document.getElementById('crumbs').textContent = VIEWS[v].crumbs;
  document.title = VIEWS[v].title + ' · Kairo ERP';
}
window.addEventListener('hashchange', route);
route();

// O sistema informa à SENTRIA quem é o usuário logado (não precisa preencher nome e e-mail).
window.addEventListener('load', () => {
  window.Sentria?.identify({ name: 'Paula Reis', email: 'paula.reis@lumentech.com.br', company: 'Lumen Tech', plan: 'Pro' });
});

const toast = document.getElementById('toast');
document.querySelectorAll('button.boleto').forEach((btn) => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    try {
      const res = await fetch('/api/demo/boletos', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.textContent = body.error || 'Não foi possível gerar o boleto.';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gerar boleto';
    }
  });
});
