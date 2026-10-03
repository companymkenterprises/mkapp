'use strict';
// Shared helpers, page shell, login. Views register themselves in VIEWS.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-IN');

const S = { user: null, boot: null, bootAt: 0, business: 'Paste Manager', unread: 0, callsDue: 0 };
const VIEWS = {};
const GLOBAL_ACT = {};
let ACT = {}; // actions of the page that is open now

// Line icons, drawn in the colour of the text around them.
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  store: '<path d="M4 10v10h16V10"/><path d="M3 10l1.5-6h15L21 10"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3c2 .8 3.5 2.6 3.5 5.7"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>',
  bottle: '<path d="M10 3h4v3l2 3v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 13h8"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  lost: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5a3 3 0 0 0 6 0h5"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  warn: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v5"/><path d="M12 17.6v.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1 3"/>',
};
const icon = (name, size = 22) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
// A tap-to-call link; cls 'btn' gives the big button, '' a small link inside text.
const tel = (mobile, cls = 'btn') => `<a class="${cls}" href="tel:${esc(mobile)}">${icon('phone', cls ? 18 : 14)} ${esc(mobile)}</a>`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${+day} ${MONTHS[m - 1]}` + (S.boot && y !== S.boot.today.slice(0, 4) ? ' ' + y : '');
};
const fmtAt = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const addDaysStr = (d, n) => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const dayLabel = (d) => (d === S.boot.today ? 'Today' : d === addDaysStr(S.boot.today, 1) ? 'Tomorrow' : fmtDate(d));
const isStaff = () => S.user.role !== 'executive';
const isAdmin = () => S.user.role === 'admin';
const ROLE_NAME = { admin: 'Admin', manager: 'Manager', executive: 'Executive' };
const TYPE_NAME = { shop: 'Shop', customer: 'Customer' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Only a shop needs a route. A direct customer without one shows nothing.
const routeText = (route, type) => route || (type === 'customer' ? '' : 'No route yet');
const dots = (...parts) => parts.filter(Boolean).join(' · ');
const options = (list, selected, blank) =>
  (blank ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(selected ?? '') ? ' selected' : ''}>${esc(o.name)}</option>`).join('');

// The login code of this phone. It is sent with every request; logging out throws it away.
const session = {
  get: () => {
    try {
      return localStorage.getItem('sid') || '';
    } catch {
      return '';
    }
  },
  set: (v) => {
    try {
      if (v) localStorage.setItem('sid', v);
      else localStorage.removeItem('sid');
    } catch {}
  },
};

async function api(method, url, body) {
  let res;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (session.get()) headers['X-Session'] = session.get();
    res = await fetch(API_URL + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No internet. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && url !== '/login') {
    session.set('');
    if (S.user) {
      S.user = null;
      render();
    }
  }
  if (!res.ok) throw new Error((data && data.error) || 'Something went wrong. Try again.');
  return data;
}

let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), isError ? 5000 : 2800);
}

function sheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').classList.add('open');
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheet-body').innerHTML = '';
}
GLOBAL_ACT.close = closeSheet;
GLOBAL_ACT.back = () => history.back();
// A row of chips where one is selected; can also fill an input.
GLOBAL_ACT.chip = (el) => {
  $$('.chip', el.parentElement).forEach((c) => c.classList.toggle('on', c === el));
  if (el.dataset.target) $('#' + el.dataset.target).value = el.dataset.val;
};
function chipVal(groupId) {
  return $(`#${groupId} .chip.on`)?.dataset.val ?? '';
}
// ---------- deleting (admin only): always asks first ----------
let deleteJob = null;
function askDelete(title, text, job) {
  deleteJob = job;
  sheet(`<h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    <p class="red small"><b>This cannot be undone.</b></p>
    <div class="btns"><button class="btn big danger" data-act="yesDelete">Yes, delete</button><button class="btn light" data-act="close">No, keep it</button></div>`);
}
GLOBAL_ACT.yesDelete = async () => {
  const job = deleteJob;
  if (!job) return;
  await job();
  deleteJob = null;
  closeSheet();
  toast('Deleted');
};

// ---------- search and filter on a list that is already on the screen ----------
// searchBox() draws the box; every item of the list (a card, or a table row) is shown only when its text has the typed words.
// An item can carry data-k="made|sold": the filter chips (quickChips) then show only items that have the chosen one.
const searchBox = (placeholder = 'Search') =>
  `<div class="filters"><input id="quick-q" type="search" placeholder="${esc(placeholder)}" data-input="quick" aria-label="${esc(placeholder)}" autocomplete="off"></div>`;
const quickChips = (list) =>
  `<div class="chips" id="quick-k">${list.map(([val, label], i) => `<button class="chip${i ? '' : ' on'}" data-act="quickChip" data-val="${esc(val)}">${esc(label)}</button>`).join('')}</div>`;
function quickApply() {
  const box = $('#quick-list');
  if (!box) return;
  // Spaces, commas and the rupee sign do not matter: "1kg" finds "1 kg", "5000" finds "₹5,000".
  // Line breaks become "|" first, so that two numbers on different lines are not read as one.
  const squash = (s) => s.toLowerCase().replace(/[\n\t]+/g, '|').replace(/[ ,₹]/g, '');
  const words = ($('#quick-q')?.value || '').split(/\s+/).map(squash).filter(Boolean);
  const k = chipVal('quick-k');
  let shown = 0;
  const items = $$('[data-item]', box);
  for (const el of items) {
    el.hidden = false; // the text of a hidden item cannot be read line by line
    const text = squash(el.innerText);
    const ok = words.every((w) => text.includes(w)) && (!k || (el.dataset.k || '').split('|').includes(k));
    el.hidden = !ok;
    if (ok) shown++;
  }
  let none = $('#quick-none');
  if (!none) {
    none = document.createElement('div');
    none.id = 'quick-none';
    none.className = 'empty';
    none.textContent = 'Nothing found. Change the search or the filter.';
    box.after(none);
  }
  none.hidden = shown > 0 || !items.length;
}
GLOBAL_ACT.quick = quickApply;
GLOBAL_ACT.quickChip = (el) => {
  GLOBAL_ACT.chip(el);
  quickApply();
};

// PIN and mobile boxes accept numbers only.
GLOBAL_ACT.digits = (el) => {
  const clean = el.value.replace(/\D/g, '');
  if (clean !== el.value) el.value = clean;
};

// ---------- routing ----------
function parseHash() {
  const [p, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { parts: p.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
const refresh = () => render(true);

const NAV = {
  executive: [['home', 'home', 'Home'], ['calls', 'phone', 'Calls'], ['orders', 'orders', 'Orders'], ['shops', 'store', 'Customers'], ['more', 'menu', 'More']],
  manager: [['home', 'home', 'Home'], ['orders', 'orders', 'Orders'], ['shops', 'store', 'Customers'], ['stock', 'box', 'Stock'], ['more', 'menu', 'More']],
};
NAV.admin = NAV.manager;
const PARENT = { order: 'orders', bill: 'orders', shop: 'shops', shopform: 'shops', rates: 'shops', count: 'stock' };
const TITLES = {
  bill: 'Bill', leads: 'IndiaMART enquiries', expenses: 'Expenses',
  calls: 'Customers to call', orders: 'Orders', order: 'New order', shops: 'Customers', shop: 'Customer', shopform: 'Customer details', rates: 'Rates for this customer',
  stock: 'Stock', count: 'Count stock', more: 'More', alerts: 'Alerts', sales: 'Sales', staff: 'Staff', attendance: 'Attendance',
  team: 'Team work and salary', money: 'Company money', returns: 'Returned stock', routes: 'Routes', products: 'Brands and normal rates', lost: 'Customers we lost', settings: 'Settings', pin: 'Change PIN',
};

function shell(name) {
  document.body.classList.remove('login-page');
  if (!$('#main')) $('#app').innerHTML = '<header class="top" id="top"></header><main id="main"></main><nav class="bottom" id="nav"></nav>';
  const nav = NAV[S.user.role];
  const isRoot = nav.some((n) => n[0] === name);
  const tab = isRoot ? name : nav.some((n) => n[0] === PARENT[name]) ? PARENT[name] : 'more';
  $('#top').innerHTML =
    (isRoot ? '' : `<button class="icon-btn" data-act="back" aria-label="Back">${icon('back', 24)}</button>`) +
    `<div class="title">${esc(name === 'home' ? S.business : TITLES[name] || S.business)}</div>
     <a class="icon-btn" href="#/alerts" aria-label="Alerts">${icon('bell', 24)}<span class="badge" id="bell"></span></a>`;
  $('#nav').innerHTML = nav
    .map(([id, ico, label]) => `<a href="#/${id}" class="${id === tab ? 'on' : ''}"><span class="ico">${icon(ico, 24)}</span>${label}${id === 'calls' ? '<span class="badge" id="calls-badge"></span>' : ''}</a>`)
    .join('');
  updateBadges();
}
function updateBadges() {
  if ($('#bell')) $('#bell').textContent = S.unread || '';
  if ($('#calls-badge')) $('#calls-badge').textContent = S.callsDue || '';
}

let renderToken = 0;
async function render(keepScroll) {
  if (!S.user) return viewLogin();
  if (Date.now() - S.bootAt > 15 * 60 * 1000) await loadBoot().catch(() => {});
  if (!S.user) return viewLogin();

  const { parts, query } = parseHash();
  const name = VIEWS[parts[0]] ? parts[0] : 'home';
  const token = ++renderToken;
  ACT = {};
  closeSheet();
  shell(name);
  const main = $('#main');
  if (keepScroll !== true) main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const html = await VIEWS[name](parts, query);
    if (token !== renderToken) return;
    main.innerHTML = html;
    if (keepScroll !== true) window.scrollTo(0, 0);
  } catch (e) {
    if (token === renderToken && S.user) main.innerHTML = `<div class="empty">${esc(e.message)}<div class="btns"><button class="btn light" data-act="retry">Try again</button></div></div>`;
  }
}
GLOBAL_ACT.retry = () => render();

async function runAct(name, el, e) {
  const fn = ACT[name] || GLOBAL_ACT[name];
  if (!fn) return;
  const btn = el.tagName === 'BUTTON' ? el : null;
  try {
    if (btn) btn.disabled = true; // stops double taps saving twice
    await fn(el, e);
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  runAct(el.dataset.act, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) runAct(el.dataset.input, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) runAct(el.dataset.change, el, e);
});
document.addEventListener('submit', (e) => {
  const el = e.target.closest('form[data-submit]');
  if (!el) return;
  e.preventDefault();
  runAct(el.dataset.submit, $('button[type=submit]', el) || el, e);
});
window.addEventListener('hashchange', () => render());

// ---------- alerts ----------
let popupIds = [];
function showPopup(items, ids) {
  popupIds = ids || [];
  $('#popup').innerHTML = `<div class="popup-box">
    ${items.map((n) => `<div class="popup-item ${esc(n.level || '')}"><b>${esc(n.title)}</b><div class="pre small">${esc(n.body || '')}</div></div>`).join('')}
    <button class="btn big" data-act="popupOk">OK</button></div>`;
  $('#popup').classList.add('open');
}
GLOBAL_ACT.popupOk = async () => {
  $('#popup').classList.remove('open');
  if (popupIds.length) {
    await api('POST', '/notifications/read', { ids: popupIds });
    popupIds = [];
    pollAlerts();
  }
};
async function pollAlerts() {
  // Not while the app is in the background: nobody is looking, and it comes again when the app is opened.
  if (!S.user || document.visibilityState !== 'visible') return;
  try {
    const d = await api('GET', '/notifications');
    S.unread = d.unread;
    updateBadges();
    const pop = d.list.filter((n) => !n.seen && n.popup).slice(0, 5);
    if (pop.length && !$('#popup').classList.contains('open')) showPopup(pop, pop.map((n) => n.id));
  } catch {}
}
setInterval(pollAlerts, 2 * 60000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pollAlerts());

// ---------- login: mobile number + 6 digit PIN ----------
async function loadBoot() {
  S.boot = await api('GET', '/bootstrap');
  S.bootAt = Date.now();
  S.user = S.boot.user;
  S.business = S.boot.settings.business_name || S.business;
  document.title = S.business;
}

const pinBox = (id, autocomplete) =>
  `<input id="${id}" class="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" title="6 numbers" autocomplete="${autocomplete}" data-input="digits" placeholder="••••••" required>`;

function viewLogin() {
  ACT = {
    login: async () => {
      session.set((await api('POST', '/login', { mobile: $('#l-mobile').value, pin: $('#l-pin').value })).token);
      await loadBoot();
      if (location.hash && location.hash !== '#/home') location.hash = '#/home';
      else render();
      pollAlerts();
    },
  };
  document.body.classList.add('login-page');
  $('#app').innerHTML = `<form class="login" data-submit="login">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>${esc(S.business)}</h1>
    <p class="muted">Login with your mobile number and PIN</p>
    <label class="f" for="l-mobile">Mobile number</label>
    <input id="l-mobile" type="tel" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" title="10 digit mobile number" autocomplete="username" data-input="digits" required>
    <label class="f" for="l-pin">6 digit PIN</label>
    ${pinBox('l-pin', 'current-password')}
    <div class="btns"><button class="btn big gold" type="submit">Login</button></div>
  </form>`;
}

// Changing the PIN is never forced; anyone can do it here when they want.
VIEWS.pin = async () => {
  ACT.savePin = async () => {
    if ($('#p-new').value !== $('#p-new2').value) throw new Error('Both new PINs must be the same');
    await api('POST', '/pin', { old_pin: $('#p-old').value, new_pin: $('#p-new').value });
    toast('PIN changed');
    go('#/home');
  };
  return `<form data-submit="savePin">
    <h2>Change PIN</h2><p class="muted">Do not tell your PIN to anyone.</p>
    <label class="f" for="p-old">Old PIN</label>${pinBox('p-old', 'current-password')}
    <label class="f" for="p-new">New PIN (6 numbers)</label>${pinBox('p-new', 'new-password')}
    <label class="f" for="p-new2">New PIN again</label>${pinBox('p-new2', 'new-password')}
    <div class="btns"><button class="btn big" type="submit">Save PIN</button></div>
  </form>`;
};

async function logout() {
  await api('POST', '/logout').catch(() => {});
  session.set('');
  Object.assign(ORDER_FILTER, { q: '', route: '', user: '', mine: '' });
  S.user = null;
  S.boot = null;
  location.hash = '';
  render();
}
GLOBAL_ACT.logout = logout;
