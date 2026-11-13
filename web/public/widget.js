/*!
 * SENTRIA Widget · See beyond the ticket.
 *
 * Incorpore no seu sistema com uma linha:
 *   <script src="https://SEU-DOMINIO/widget.js" data-app="Meu Sistema" data-version="4.2" defer></script>
 *
 * API opcional:
 *   Sentria.identify({ name, email, company, plan })  // usuário logado
 *   Sentria.open()                                    // abre o painel
 *   Sentria.captureError(error)                       // registra um erro manualmente
 *
 * O widget captura (e mostra ao usuário antes de enviar): tela atual, versão do sistema,
 * navegador, erros de JavaScript, falhas de requisição (HTTP 5xx) e as últimas ações.
 * Nada é enviado sem o usuário clicar em "Enviar".
 */
(function () {
  'use strict';
  if (window.Sentria && window.Sentria.__loaded) return;

  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var ds = (script && script.dataset) || {};
  var API = (ds.api || (script ? new URL(script.src, location.href).origin : location.origin)).replace(/\/$/, '');
  var APP = { name: ds.app || document.title || 'Sistema', version: ds.version || undefined };
  var user = {
    name: ds.userName || undefined,
    email: ds.userEmail || undefined,
    company: ds.company || undefined,
    plan: ds.plan || undefined,
  };

  var errors = [];
  var breadcrumbs = [];
  var lastNudge = 0;
  var internalRequest = false;

  function now() {
    return new Date().toISOString();
  }
  function crumb(type, label) {
    breadcrumbs.push({ type: type, label: String(label).slice(0, 200), at: now() });
    if (breadcrumbs.length > 20) breadcrumbs.shift();
  }
  function pushError(err) {
    err.at = now();
    errors.push(err);
    if (errors.length > 10) errors.shift();
    crumb('error', err.type === 'http' ? err.method + ' ' + err.url + ' → ' + err.status : err.message);
    nudge(err);
  }

  // ------------------------------------------------------------------ Captura de contexto

  window.addEventListener('error', function (e) {
    if (!e.message) return;
    pushError({ type: 'js', message: String(e.message).slice(0, 500) });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    pushError({ type: 'promise', message: String((r && r.message) || r || 'Promise rejeitada').slice(0, 500) });
  });

  if (window.fetch) {
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var mine = internalRequest;
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      return nativeFetch(input, init).then(
        function (res) {
          if (!mine && res.status >= 500) {
            res
              .clone()
              .json()
              .catch(function () {
                return {};
              })
              .then(function (body) {
                pushError({ type: 'http', method: method, url: url, status: res.status, message: (body && body.error) || res.statusText || 'Erro no servidor' });
              });
          }
          return res;
        },
        function (err) {
          if (!mine) pushError({ type: 'http', method: method, url: url, status: 0, message: 'Falha de rede: ' + (err && err.message) });
          throw err;
        },
      );
    };
  }

  document.addEventListener(
    'click',
    function (e) {
      var el = e.target && e.target.closest && e.target.closest('button, a, [role="button"], input[type="submit"]');
      if (!el || (host && host.contains(el))) return;
      var label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ');
      if (label) crumb('click', label.slice(0, 80));
    },
    true,
  );

  function trackNav() {
    crumb('nav', document.title || location.pathname);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(trackNav, 0);
      return r;
    };
  });
  window.addEventListener('popstate', trackNav);
  window.addEventListener('hashchange', trackNav);
  trackNav();

  function context(trigger) {
    return {
      source: 'widget',
      trigger: trigger,
      app: APP,
      page: { url: location.href.slice(0, 500), path: (location.pathname + location.hash).slice(0, 300), title: document.title.slice(0, 200) },
      user: user,
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: screen.width + 'x' + screen.height,
        timezone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone,
      },
      errors: errors.slice(-5),
      breadcrumbs: breadcrumbs.slice(-12),
    };
  }

  // ------------------------------------------------------------------ Interface

  var host = document.createElement('div');
  host.id = 'sentria-widget';
  var root = host.attachShadow({ mode: 'open' });
  var color = ds.color || '#3978D5';

  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:Inter,"Segoe UI",system-ui,sans-serif}' +
    '.fab{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:#14243B;box-shadow:0 10px 30px -8px rgba(20,36,59,.55);display:grid;place-items:center;transition:transform .15s}' +
    '.fab:hover{transform:scale(1.06)}' +
    '.fab .dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#D64550;border:2px solid #fff;display:none}' +
    '.fab.alert .dot{display:block}' +
    '.nudge{position:fixed;right:22px;bottom:90px;z-index:2147483000;width:310px;background:#fff;border:1px solid #E4E9F1;border-radius:14px;box-shadow:0 24px 48px -16px rgba(20,36,59,.35);padding:14px 16px;display:none;animation:in .2s ease-out}' +
    '.nudge.show{display:block}' +
    '.nudge p{margin:6px 0 12px;font-size:13.5px;line-height:1.5;color:#14243B}' +
    '.nudge .err{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#9f2b35;background:#fbe9ea;padding:6px 8px;border-radius:8px;margin-bottom:12px;word-break:break-word}' +
    '.panel{position:fixed;right:22px;bottom:90px;z-index:2147483000;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 120px);background:#F5F7FB;border-radius:18px;box-shadow:0 30px 60px -18px rgba(20,36,59,.45);display:none;flex-direction:column;overflow:hidden;animation:in .2s ease-out}' +
    '.panel.open{display:flex}' +
    '@keyframes in{from{opacity:0;transform:translateY(8px)}}' +
    '.head{background:#14243B;color:#fff;padding:18px 18px 16px;position:relative;overflow:hidden}' +
    '.head h2{margin:8px 0 2px;font-family:"Plus Jakarta Sans",Inter,sans-serif;font-size:18px;font-weight:700}' +
    '.head p{margin:0;color:#b5c3d8;font-size:12.5px}' +
    '.head .close{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.08);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:18px}' +
    '.brand{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.14em;font-weight:700;color:#c9d4e5}' +
    '.body{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}' +
    '.card{background:#fff;border:1px solid #E4E9F1;border-radius:12px;padding:12px}' +
    'label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:#14243B}' +
    'input,textarea{width:100%;border:1px solid #E4E9F1;border-radius:9px;padding:9px 11px;font-size:13.5px;color:#14243B;background:#fff;outline:none}' +
    'textarea{min-height:96px;resize:vertical;line-height:1.5}' +
    'input:focus,textarea:focus{border-color:' + color + ';box-shadow:0 0 0 3px rgba(57,120,213,.15)}' +
    '.row{display:flex;gap:8px}.row>*{flex:1}' +
    '.btn{border:none;border-radius:9px;padding:10px 14px;font-weight:600;font-size:13.5px;cursor:pointer;background:' + color + ';color:#fff}' +
    '.btn:disabled{opacity:.55;cursor:not-allowed}' +
    '.btn.ghost{background:transparent;color:#64748B}' +
    '.btn.ai{background:#EEEEFC;color:#5B5AC9}' +
    '.ai-label{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#5B5AC9}' +
    '.art{border:1px solid #e2e1fa;border-radius:10px;padding:10px;background:#fdfdff;margin-top:8px}' +
    '.art button.t{all:unset;cursor:pointer;font-size:13px;font-weight:600;color:#14243B;display:block}' +
    '.art p{font-size:12.5px;line-height:1.55;color:#334155;margin:8px 0}' +
    '.ctx summary{cursor:pointer;font-size:12px;font-weight:600;color:#14243B;list-style:none}' +
    '.ctx summary::-webkit-details-marker{display:none}' +
    '.ctx ul{margin:8px 0 0;padding-left:16px;font-size:12px;color:#64748B;line-height:1.6}' +
    '.ctx .e{color:#9f2b35}' +
    '.muted{color:#64748B;font-size:12px;line-height:1.5}' +
    '.ok{text-align:center;padding:24px 8px}' +
    '.ok .p{font-family:ui-monospace,Consolas,monospace;font-size:17px;color:#14243B;background:#fff;border:1px solid #E4E9F1;border-radius:10px;padding:10px;margin:12px 0}' +
    '.err-msg{background:#fbe9ea;color:#9f2b35;border-radius:9px;padding:8px 10px;font-size:12.5px}' +
    '.foot{padding:8px 16px 12px;text-align:center;font-size:11px;color:#94a3b8}' +
    '@media (max-width:480px){.panel{right:8px;left:8px;width:auto;bottom:84px}.nudge{right:8px;left:8px;width:auto}}' +
    '</style>' +
    '<div class="nudge" role="alertdialog" aria-live="assertive"></div>' +
    '<div class="panel" role="dialog" aria-label="Suporte"></div>' +
    '<button class="fab" aria-label="Abrir suporte">' +
    symbol(26) +
    '<span class="dot"></span></button>';

  function symbol(size) {
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path d="M54.55 23.79A24 24 0 1 1 36.17 8.36" fill="none" stroke="#3978D5" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M19.78 36.45A13 13 0 1 1 29.74 44.8" fill="none" stroke="#8C8BEA" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="32" cy="32" r="5.2" fill="#fff"/><circle cx="45.4" cy="11.8" r="3.3" fill="#8C8BEA"/></svg>'
    );
  }
  var spark =
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="#8C8BEA" d="M7 1.5c.35 2.9 1.6 4.15 4.5 4.5-2.9.35-4.15 1.6-4.5 4.5C6.65 7.6 5.4 6.35 2.5 6 5.4 5.65 6.65 4.4 7 1.5Z"/><circle cx="12.6" cy="12.4" r="1.9" fill="#8C8BEA"/></svg>';

  var fab = root.querySelector('.fab');
  var panel = root.querySelector('.panel');
  var nudgeEl = root.querySelector('.nudge');
  var state = { trigger: 'manual', subject: '', description: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function lastClick() {
    for (var i = breadcrumbs.length - 1; i >= 0; i--) if (breadcrumbs[i].type === 'click') return breadcrumbs[i].label;
    return null;
  }

  function nudge(err) {
    if (panel.classList.contains('open') || Date.now() - lastNudge < 30000) return;
    lastNudge = Date.now();
    fab.classList.add('alert');
    var action = lastClick();
    nudgeEl.innerHTML =
      '<div class="ai-label">' + spark + ' SENTRIA Intelligence</div>' +
      '<p><strong>Parece que algo deu errado' + (action ? ' ao clicar em “' + esc(action) + '”' : '') + '.</strong> Quer que o suporte veja isso? Já anexamos os detalhes técnicos.</p>' +
      '<div class="err">' + esc(err.type === 'http' ? err.method + ' ' + err.url + ' → ' + err.status + ' · ' + err.message : err.message) + '</div>' +
      '<div class="row"><button class="btn ghost" data-a="dismiss">Agora não</button><button class="btn" data-a="report">Reportar problema</button></div>';
    nudgeEl.classList.add('show');
    nudgeEl.querySelector('[data-a="dismiss"]').onclick = function () {
      nudgeEl.classList.remove('show');
    };
    nudgeEl.querySelector('[data-a="report"]').onclick = function () {
      nudgeEl.classList.remove('show');
      var subj = action ? 'Erro ao ' + action.toLowerCase().replace(/^\w/, function (c) { return c; }) : 'Erro na tela ' + (document.title || location.pathname);
      open({
        trigger: 'error',
        subject: subj.slice(0, 120),
        description:
          'Tentei ' + (action ? '“' + action + '”' : 'usar a tela') + ' e apareceu um erro' + (err.message ? ': "' + err.message + '"' : '.') + '\n\n',
      });
    };
  }

  function open(prefill) {
    nudgeEl.classList.remove('show');
    fab.classList.remove('alert');
    state = Object.assign({ trigger: 'manual', subject: '', description: '' }, prefill || {});
    renderForm();
    panel.classList.add('open');
    setTimeout(function () {
      var f = panel.querySelector(state.subject ? 'textarea' : 'input[name="subject"]');
      if (f) {
        f.focus();
        if (f.tagName === 'TEXTAREA') f.setSelectionRange(f.value.length, f.value.length);
      }
    }, 50);
  }
  function close() {
    panel.classList.remove('open');
  }

  fab.onclick = function () {
    panel.classList.contains('open') ? close() : open();
  };

  function header(title, sub) {
    return (
      '<div class="head"><div class="brand">' + symbol(16) + ' SENTRIA</div>' +
      '<h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p>' +
      '<button class="close" aria-label="Fechar">×</button></div>'
    );
  }

  function ctxSummary() {
    var c = context(state.trigger);
    var items = [
      'Tela: ' + esc(c.page.title || c.page.path),
      'Sistema: ' + esc(APP.name) + (APP.version ? ' v' + esc(APP.version) : ''),
      'Navegador e resolução de tela',
      c.breadcrumbs.length + ' ações recentes nesta sessão',
    ];
    c.errors.forEach(function (e) {
      items.push('<span class="e">Erro: ' + esc(e.type === 'http' ? e.method + ' ' + e.url + ' → ' + e.status : e.message) + '</span>');
    });
    return '<details class="ctx card"><summary>📎 Detalhes técnicos anexados (' + items.length + ')</summary><ul><li>' + items.join('</li><li>') + '</li></ul>' +
      '<p class="muted" style="margin:8px 0 0">Isso ajuda o time a resolver sem precisar perguntar. Nenhuma senha ou dado digitado em formulários é coletado.</p></details>';
  }

  var suggestTimer = null;
  function renderForm(errorMsg) {
    var needsIdentity = !user.email;
    panel.innerHTML =
      header('Como podemos ajudar?', 'Suporte ' + APP.name + ' · respondemos por e-mail') +
      '<form class="body" novalidate>' +
      (errorMsg ? '<div class="err-msg">' + esc(errorMsg) + '</div>' : '') +
      (needsIdentity
        ? '<div class="row"><label>Nome<input name="name" required value="' + esc(user.name || '') + '"></label><label>E-mail<input name="email" type="email" required value="' + esc(user.email || '') + '"></label></div>'
        : '<div class="muted">Enviando como <strong style="color:#14243B">' + esc(user.name || user.email) + '</strong>' + (user.company ? ' · ' + esc(user.company) : '') + '</div>') +
      '<label>Assunto<input name="subject" required maxlength="200" placeholder="Ex.: Não consigo gerar o boleto" value="' + esc(state.subject) + '"></label>' +
      '<label>O que aconteceu?<textarea name="description" required placeholder="Descreva o problema">' + esc(state.description) + '</textarea></label>' +
      '<div class="suggest"></div>' +
      ctxSummary() +
      '<button class="btn" type="submit">Enviar para o suporte</button>' +
      '</form><div class="foot">Protegido pela SENTRIA · See beyond the ticket</div>';

    panel.querySelector('.close').onclick = close;
    var form = panel.querySelector('form');
    form.addEventListener('input', function () {
      state.subject = form.subject.value;
      state.description = form.description.value;
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(suggest, 450);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(form);
    });
    if (state.subject || state.description) suggest();
  }

  function api(path, body) {
    internalRequest = true;
    var p = fetch(API + '/api/public' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    internalRequest = false;
    return p.then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Não foi possível enviar agora.');
        return d;
      });
    });
  }

  function suggest() {
    var box = panel.querySelector('.suggest');
    if (!box) return;
    var text = (state.subject + ' ' + state.description).trim();
    if (text.length < 10) {
      box.innerHTML = '';
      return;
    }
    api('/suggest', { subject: state.subject, description: state.description })
      .then(function (d) {
        if (!d.articles || !d.articles.length) {
          box.innerHTML = '';
          return;
        }
        box.innerHTML =
          '<div class="card"><div class="ai-label">' + spark + ' Talvez isso resolva</div>' +
          d.articles
            .map(function (a) {
              return '<div class="art"><button type="button" class="t" data-id="' + a.id + '">' + esc(a.title) + '</button><div class="b" hidden><p>' + esc(a.body) + '</p><button type="button" class="btn ai" data-ok="' + a.id + '">✓ Isso resolveu</button></div></div>';
            })
            .join('') +
          '</div>';
        box.querySelectorAll('button.t').forEach(function (b) {
          b.onclick = function () {
            var body = b.nextElementSibling;
            body.hidden = !body.hidden;
          };
        });
        box.querySelectorAll('[data-ok]').forEach(function (b) {
          b.onclick = function () {
            submit(panel.querySelector('form'), Number(b.getAttribute('data-ok')));
          };
        });
      })
      .catch(function () {});
  }

  function submit(form, resolvedBy) {
    var name = form.name ? form.name.value.trim() : user.name || user.email;
    var email = form.email ? form.email.value.trim() : user.email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return renderForm('Informe um e-mail válido para receber a resposta.');
    if (!state.subject.trim() || state.description.trim().length < 10) return renderForm('Preencha o assunto e descreva o problema com um pouco mais de detalhe.');
    user.name = user.name || name;
    user.email = email;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    api('/tickets', {
      name: name || email,
      email: email,
      company: user.company || '',
      subject: state.subject.trim(),
      description: state.description.trim(),
      resolvedBySuggestion: Boolean(resolvedBy),
      articleId: resolvedBy || undefined,
      context: context(state.trigger),
    })
      .then(function (d) {
        errors = [];
        var track = API + '/portal/acompanhar?protocolo=' + encodeURIComponent(d.protocol) + '&email=' + encodeURIComponent(email);
        panel.innerHTML =
          header(resolvedBy ? 'Que bom que resolveu!' : 'Recebemos seu chamado', resolvedBy ? 'Registramos o atendimento.' : 'O time já está com todos os detalhes.') +
          '<div class="body"><div class="ok">' +
          '<div class="ai-label" style="justify-content:center">' + spark + ' Analisado pela SENTRIA Intelligence</div>' +
          (resolvedBy ? '' : '<p class="muted">Categoria identificada: <strong style="color:#14243B">' + esc(d.category) + '</strong></p>') +
          '<div class="p">' + esc(d.protocol) + '</div>' +
          '<p class="muted">Você recebe as atualizações por e-mail e pode acompanhar pelo link abaixo.</p>' +
          '<p><a href="' + esc(track) + '" target="_blank" rel="noopener" style="color:' + color + ';font-weight:600;font-size:13.5px">Acompanhar chamado →</a></p>' +
          '<button class="btn ghost" data-a="new">Abrir outro chamado</button></div></div>';
        panel.querySelector('.close').onclick = close;
        panel.querySelector('[data-a="new"]').onclick = function () {
          open();
        };
      })
      .catch(function (e) {
        renderForm(e.message);
      });
  }

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.Sentria = {
    __loaded: true,
    open: function (prefill) {
      open(prefill);
    },
    close: close,
    identify: function (u) {
      user = Object.assign({}, user, u || {});
    },
    captureError: function (e) {
      pushError({ type: 'js', message: String((e && e.message) || e).slice(0, 500) });
    },
  };
})();
