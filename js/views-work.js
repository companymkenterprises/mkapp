'use strict';
// Daily work screens: home, calls, orders, new order, alerts, more.

const tile = (href, value, label, cls = '', sub = '') =>
  `<a class="tile ${cls}" href="${href}"><b>${esc(value)}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</a>`;

VIEWS.home = async () => {
  ACT.checkin = async () => {
    await api('POST', '/attendance/checkin');
    toast('Attendance marked');
    refresh();
  };
  const d = await api('GET', '/home');
  S.callsDue = d.callsDue;
  updateBadges();

  let h = `<h2>Hello, ${esc(S.user.name)}</h2><p class="muted">${fmtDate(d.today)} · ${ROLE_NAME[S.user.role]}</p>`;
  if (!isAdmin()) {
    h += d.attendance
      ? `<div class="banner ok">✓ Attendance marked${d.attendance.in_time ? ' at ' + esc(d.attendance.in_time) : ''}</div>`
      : '<div class="banner warn"><span>Mark your attendance for today</span><button class="btn" data-act="checkin">I am present</button></div>';
  }
  h += d.lowMaterials.map((m) => `<a class="banner bad" href="#/stock?tab=bottles"><span>${icon('warn', 20)} Only ${num(m.stock)} ${esc(m.name)} left. Order more.</span></a>`).join('');

  const lateText = d.late ? `${d.late} late` : '';
  if (!isStaff()) {
    h += `<div class="tiles">
      ${tile('#/calls', d.callsDue, 'Customers to call today', d.callsDue ? 'warn' : '')}
      ${tile('#/orders', d.pending, 'Orders to deliver', d.late ? 'bad' : '', lateText)}
      ${tile('#/orders?tab=today', d.mine.taken_count, 'My orders today', '', rs(d.mine.taken_value))}
      ${tile('#/orders?tab=today', rs(d.mine.collected), 'Money I collected today', '', `${d.mine.delivered_count} delivered`)}
      ${d.givenToMe ? tile('#/orders?mine=1', d.givenToMe, 'Deliveries given to me', 'warn') : ''}
      ${tile('#/money', rs(d.money), 'Company money with me', d.money > 0 ? 'warn' : '')}
    </div>`;
  } else {
    h += `<div class="tiles">
      ${tile('#/orders?tab=today', d.ordersToday.n, 'Orders today', '', rs(d.ordersToday.value))}
      ${tile('#/orders', d.pending, 'Orders to deliver', d.late ? 'bad' : '', lateText)}
      ${tile('#/orders?tab=today', rs(d.deliveredToday.value), 'Delivered today', '', plural(d.deliveredToday.n, 'order'))}
      ${tile('#/sales', rs(d.collectedToday), 'Money collected today')}
      ${tile('#/shops?sort=balance', rs(d.outstanding), 'Total balance to collect', 'warn')}
      ${isAdmin() ? tile('#/sales', rs(d.monthSales), 'Sales this month') : ''}
      ${tile('#/calls', d.callsDue, 'Customers to call today')}
      ${tile('#/attendance', `${d.present} / ${d.staff}`, 'Staff present')}
      ${tile('#/stock', num(d.boxes.made), 'Boxes made today')}
      ${tile('#/stock', num(d.boxes.sold), 'Boxes sold today')}
      ${tile('#/orders', num(d.boxes.ordered), 'Boxes ordered, to deliver')}
      ${tile('#/lost', d.lostToday, 'Customers lost today', d.lostToday ? 'bad' : '', `${d.lostThisMonth} this month`)}
      ${d.lostToCall ? tile('#/lost', d.lostToCall, 'Lost customers to call', 'warn') : ''}
      ${d.newLeads ? tile('#/leads', d.newLeads, 'New IndiaMART enquiries', 'warn') : ''}
    </div>
    <h3>Today by person</h3>
    ${
      d.people.length
        ? `<div class="table-wrap"><table><tr><th>Name</th><th class="num">Orders</th><th class="num">Order value</th><th class="num">Delivered</th><th class="num">Collected</th></tr>
          ${d.people.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.taken_count}</td><td class="num">${rs(p.taken_value)}</td><td class="num">${p.delivered_count}</td><td class="num">${rs(p.collected)}</td></tr>`).join('')}
          </table></div>`
        : '<p class="muted">No orders or collection yet today.</p>'
    }`;
  }

  // Remind once a day about the customers waiting for a call.
  const key = 'callsReminder';
  if (!isStaff() && d.callsDue && localStorage.getItem(key) !== d.today && !$('#popup').classList.contains('open')) {
    localStorage.setItem(key, d.today);
    showPopup([{ title: `${plural(d.callsDue, 'customer')} to call today`, body: 'Open Calls, phone each customer and take the order.', level: 'info' }]);
  }
  return h;
};

// ---------- call results (used on Calls page and on the customer page) ----------
GLOBAL_ACT.later = (el) =>
  sheet(`<h3>Call later – ${esc(el.dataset.name)}</h3>
    <label class="f">Why? (compulsory)</label>
    <div class="chips">${['Has stock', 'Owner not available', 'Closed today', 'Asked to call later', 'Will pay first, then order']
      .map((r) => `<button class="chip" data-act="chip" data-target="later-reason" data-val="${esc(r)}">${esc(r)}</button>`)
      .join('')}</div>
    <textarea id="later-reason" placeholder="Write the reason"></textarea>
    <label class="f">Call again after</label>
    <div class="chips">${[[1, '1 day'], [2, '2 days'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month']]
      .map(([v, t]) => `<button class="chip" data-act="chip" data-target="later-days" data-val="${v}">${t}</button>`)
      .join('')}</div>
    <input id="later-days" type="number" inputmode="numeric" min="1" max="90" placeholder="Or type number of days">
    <div class="btns"><button class="btn big" data-act="saveLater" data-id="${esc(el.dataset.id)}">Save</button></div>`);

GLOBAL_ACT.saveLater = async (el) => {
  const reason = $('#later-reason').value.trim();
  const days = $('#later-days').value;
  if (!reason) throw new Error('Write the reason. It is compulsory.');
  if (!days) throw new Error('Select after how many days to call again');
  const r = await api('POST', `/customers/${el.dataset.id}/call`, { outcome: 'later', reason, days });
  closeSheet();
  toast(`Saved. You will be reminded on ${fmtDate(r.next_call_date)}`);
  refresh();
};

GLOBAL_ACT.noanswer = async (el) => {
  await api('POST', `/customers/${el.dataset.id}/call`, { outcome: 'no_answer' });
  toast('Saved. You will be reminded tomorrow');
  refresh();
};

GLOBAL_ACT.lost = (el) =>
  sheet(`<h3>${esc(el.dataset.name)} does not need our product</h3>
    <p class="muted">Tick what the customer said. This goes to the admin.</p>
    <div id="lost-reasons">${S.boot.lostReasons.map((r) => `<label class="check"><input type="checkbox" value="${esc(r)}">${esc(r)}</label>`).join('')}</div>
    <label class="f" for="lost-note">What did they say?</label>
    <textarea id="lost-note" placeholder="Write here"></textarea>
    <div class="btns"><button class="btn big danger" data-act="saveLost" data-id="${esc(el.dataset.id)}">Send to admin</button></div>`);

GLOBAL_ACT.saveLost = async (el) => {
  const reasons = $$('#lost-reasons input:checked').map((i) => i.value);
  if (!reasons.length) throw new Error('Tick at least one reason');
  await api('POST', `/customers/${el.dataset.id}/call`, { outcome: 'lost', lost_reasons: reasons, reason: $('#lost-note').value });
  closeSheet();
  toast('Saved and sent to admin');
  refresh();
};

const LAST_CALL = { later: 'Asked to call later', no_answer: 'Did not pick up', order: 'Gave order', lost: 'Not needed', lost_retry: 'Still not needed, will call again', lost_final: 'Lost for good', back: 'Came back' };

VIEWS.calls = async (parts, query) => {
  ACT.route = (el) => go('#/calls' + (el.value ? '?route=' + el.value : ''));
  const d = await api('GET', '/calls/due' + (query.route ? '?route=' + encodeURIComponent(query.route) : ''));
  if (!query.route) {
    S.callsDue = d.list.length;
    updateBadges();
  }
  const routes = isStaff() ? S.boot.routes : S.boot.routes.filter((r) => S.user.route_ids.includes(r.id));
  let h = routes.length > 1 ? `<div class="filters"><select data-change="route">${options(routes, query.route, 'All routes')}</select></div>` : '';
  if (!d.list.length) return h + '<div class="empty">✓ No customers to call now.<br>Customers come here on the day you have to call them.</div>';
  h += `${searchBox('Search name, owner or mobile')}<p class="muted">${plural(d.list.length, 'customer')} to call</p><div id="quick-list">`;
  h += d.list
    .map((c) => {
      const lateDays = c.next_call_date && c.next_call_date < d.today ? Math.round((Date.parse(d.today) - Date.parse(c.next_call_date)) / 864e5) : 0;
      const attrs = `data-id="${c.id}" data-name="${esc(c.name)}"`;
      return `<div class="card" data-item>
        <div class="row"><a class="grow" href="#/shop/${c.id}"><b>${esc(c.name)}</b></a>${lateDays ? `<span class="tag late">${plural(lateDays, 'day')} late</span>` : ''}</div>
        <div class="muted">${esc(dots(routeText(c.route, c.type), c.owner))}</div>
        ${c.balance > 0 ? `<div class="red"><b>Balance to collect: ${rs(c.balance)}</b></div>` : ''}
        ${c.pending_orders ? '<div class="muted">Has an order waiting for delivery</div>' : ''}
        ${c.last_outcome ? `<div class="muted small">Last time: ${esc(LAST_CALL[c.last_outcome])}${c.last_outcome === 'later' && c.last_reason ? ' – ' + esc(c.last_reason) : ''}</div>` : ''}
        <div class="btns">
          ${tel(c.mobile)}
          <a class="btn" href="#/order/${c.id}">Take order</a>
        </div>
        <div class="btns">
          <button class="btn light sm" data-act="later" ${attrs}>Call later</button>
          <button class="btn light sm" data-act="noanswer" ${attrs}>No answer</button>
          <button class="btn danger sm" data-act="lost" ${attrs}>Not needed</button>
        </div>
      </div>`;
    })
    .join('');
  return h + '</div>';
};

// ---------- orders ----------
const ORDERS = new Map(); // orders on screen, for the deliver / cancel sheets

function orderCard(o, today, showCustomer = true) {
  ORDERS.set(o.id, o);
  const late = o.status === 'pending' && o.deliver_on < today;
  return `<div class="card">
    <div class="row">
      ${showCustomer ? `<a class="grow" href="#/shop/${o.customer_id}"><b>${esc(o.customer)}</b></a>` : `<b class="grow">Order #${o.id}</b>`}
      ${late ? '<span class="tag late">LATE</span>' : ''}<span class="tag ${o.status}">${o.status === 'pending' ? 'To deliver' : o.status === 'delivered' ? 'Delivered' : 'Cancelled'}</span>
    </div>
    ${showCustomer ? `<div class="muted">${dots(esc(routeText(o.route, o.customer_type)), tel(o.mobile, ''))}</div>` : ''}
    <ul class="items">${o.items.map((i) => `<li><span>${esc(i.brand)} ${esc(i.pack)} × ${i.qty}</span><span>${rs(i.amount)}</span></li>`).join('')}
      <li><b>Total</b><b>${rs(o.total)}</b></li></ul>
    ${o.note ? `<div class="muted">Note: ${esc(o.note)}</div>` : ''}
    <div class="muted small">Order taken by <b>${esc(o.taken_by_name)}</b> on ${fmtDate(o.taken_date)}${showCustomer ? ` · #${o.id}` : ''}</div>
    ${o.status === 'pending' ? `<div class="muted small">Deliver on: <b class="${late ? 'red' : ''}">${dayLabel(o.deliver_on)}</b></div>` : ''}
    ${o.status === 'pending' && o.assigned_to ? `<div class="small"><span class="tag assigned">Delivery given to ${esc(o.assigned_to_name)}</span></div>` : ''}
    ${o.status === 'delivered' ? `<div class="muted small">Delivered by <b>${esc(o.delivered_by_name)}</b> on ${fmtDate(o.delivered_date)}</div>` : ''}
    ${o.status === 'delivered' ? `<div class="muted small">Money received: <b>${o.received ? `${rs(o.received)} (${esc(o.received_how)})` : 'nothing'}</b></div>` : ''}
    ${o.status === 'cancelled' ? `<div class="muted small">Cancelled: ${esc(o.cancel_reason)}</div>` : ''}
    ${
      o.status === 'cancelled'
        ? ''
        : `<div class="btns">
            ${
              o.status === 'pending'
                ? `<button class="btn" data-act="deliver" data-id="${o.id}">Delivered</button>
                   ${isStaff() ? `<button class="btn light" data-act="assignDelivery" data-id="${o.id}">Assign delivery</button>` : ''}
                   <button class="btn danger" data-act="cancelOrder" data-id="${o.id}">Cancel</button>`
                : ''
            }
            <a class="btn light" href="#/bill/${o.id}">${icon('send', 18)} Bill</a>
          </div>`
    }
    ${isAdmin() ? `<div class="btns"><button class="btn danger sm" data-act="delOrder" data-id="${o.id}">Delete this order</button></div>` : ''}
  </div>`;
}

// Admin only: a wrong or test order is removed with its money received and its stock entries.
GLOBAL_ACT.delOrder = (el) => {
  const o = ORDERS.get(+el.dataset.id);
  const extra = o.status === 'delivered' ? ` The ${o.received ? rs(o.received) + ' received and the ' : ''}boxes it took from stock are removed too.` : '';
  askDelete(`Delete order #${o.id} of ${o.customer}?`, `Order of ${rs(o.total)}, taken by ${o.taken_by_name}.${extra}`, async () => {
    await api('POST', `/orders/${o.id}/delete`);
    refresh();
  });
};

// Managers and admin: give the delivery of an order to a person.
GLOBAL_ACT.assignDelivery = (el) => {
  const o = ORDERS.get(+el.dataset.id);
  sheet(`<h3>Who will deliver to ${esc(o.customer)}?</h3>
    <p class="muted">The person sees this order under "Deliveries given to me", also when the customer is not on their route.</p>
    <label class="f" for="as-user">Give the delivery to</label>
    <select id="as-user">${options(S.boot.people, o.assigned_to, 'Nobody yet')}</select>
    <div class="btns"><button class="btn big" data-act="saveDelivery" data-id="${o.id}">Save</button></div>`);
};
GLOBAL_ACT.saveDelivery = async (el) => {
  const r = await api('POST', `/orders/${el.dataset.id}/assign`, { user_id: $('#as-user').value });
  closeSheet();
  toast(r.assigned_to_name ? `Delivery given to ${r.assigned_to_name}` : 'Nobody has this delivery now');
  refresh();
};

// Where the customer's money went. Company account: only the payment is saved.
// Own hands or own account: it is company money with that person, and showHeld() shows the sum after saving.
const moneyWentTo = (id, mine) =>
  `<label class="f">Where did the money go?</label>
   <div class="chips" id="${id}"><button class="chip on" data-act="chip" data-val="me">${mine}</button><button class="chip" data-act="chip" data-val="company">Company account</button></div>`;
function showHeld(held) {
  if (!held) return;
  const mine = held.name === S.user.name;
  sheet(`<h3>Company money with ${mine ? 'you' : esc(held.name)}</h3>
    <ul class="items">
      <li><span>Company money before this payment</span><span>${rs(held.before)}</span></li>
      <li><span>+ This payment</span><span>${rs(held.added)}</span></li>
      <li><b>Total now</b><b class="red">${rs(held.total)}</b></li>
    </ul>
    <p class="muted small">${mine ? 'When you spend from it, add the expense in "Company money and expenses".' : 'When they spend from it, they add the expense in "Company money and expenses".'}</p>
    <div class="btns"><button class="btn big" data-act="close">OK</button></div>`);
}

GLOBAL_ACT.deliver = (el) => {
  const o = ORDERS.get(+el.dataset.id);
  sheet(`<h3>Delivered to ${esc(o.customer)}</h3>
    <ul class="items">
      <li><span>Old balance</span><span>${rs(o.balance)}</span></li>
      <li><span>This order</span><span>${rs(o.total)}</span></li>
      <li><b>Total to collect</b><b class="red">${rs(o.balance + o.total)}</b></li>
    </ul>
    ${
      isStaff()
        ? `<label class="f" for="d-by">Who delivered it? (it counts in that person's account)</label>
           <select id="d-by">${options(S.boot.people, o.assigned_to || S.user.id)}</select>`
        : ''
    }
    <label class="f" for="d-amount">Money received now (₹)</label>
    <input id="d-amount" type="number" inputmode="decimal" min="0" placeholder="0 if no money received">
    <div class="chips" id="d-mode">${S.boot.payModes.map((m, i) => `<button class="chip${i ? '' : ' on'}" data-act="chip" data-val="${m}">${m}</button>`).join('')}</div>
    ${moneyWentTo('d-to', isStaff() ? 'Account of the person who delivered' : 'My account')}
    <div class="btns"><button class="btn big" data-act="confirmDeliver" data-id="${o.id}">Delivered</button></div>`);
};
GLOBAL_ACT.confirmDeliver = async (el) => {
  const r = await api('POST', `/orders/${el.dataset.id}/deliver`, { collected: $('#d-amount').value, mode: chipVal('d-mode'), to: chipVal('d-to'), delivered_by: $('#d-by')?.value || '' });
  closeSheet();
  toast(`Delivered by ${r.delivered_by_name}. Balance now ${rs(r.balance)}`);
  refresh();
  showHeld(r.held);
};
GLOBAL_ACT.cancelOrder = (el) => {
  const o = ORDERS.get(+el.dataset.id);
  sheet(`<h3>Cancel order of ${esc(o.customer)}?</h3>
    <label class="f" for="c-reason">Why is it cancelled? (compulsory)</label>
    <textarea id="c-reason"></textarea>
    <div class="btns"><button class="btn big danger" data-act="confirmCancel" data-id="${o.id}">Cancel this order</button></div>`);
};
GLOBAL_ACT.confirmCancel = async (el) => {
  await api('POST', `/orders/${el.dataset.id}/cancel`, { reason: $('#c-reason').value });
  closeSheet();
  toast('Order cancelled');
  refresh();
};

// "Take order" from the Orders page: first choose the customer.
let pickTimer;
async function pickLoad() {
  const d = await api('GET', '/customers?' + new URLSearchParams({ q: $('#pick-q')?.value || '' }));
  const box = $('#pick-list');
  if (!box) return; // the sheet was closed while loading
  const add = '<div class="btns"><a class="btn light" href="#/shopform?type=shop">+ Add shop</a><a class="btn light" href="#/shopform?type=customer">+ Add customer</a></div>';
  box.innerHTML = d.list.length
    ? d.list
        .slice(0, 40)
        .map(
          (c) => `<a class="card link row" href="#/order/${c.id}">
            <div class="grow"><b>${esc(c.name)}</b><div class="muted">${esc(dots(routeText(c.route, c.type), c.mobile))}</div></div>
            ${c.balance > 0 ? `<div class="right"><b class="red">${rs(c.balance)}</b><div class="muted small">balance</div></div>` : ''}
          </a>`
        )
        .join('') + (d.list.length > 40 ? '<p class="muted">More customers: type the name or mobile to find them.</p>' : '')
    : '<div class="empty">No customer found.</div>' + add;
}
GLOBAL_ACT.pickCustomer = async () => {
  sheet(`<h3>Take order – choose the customer</h3>
    <input id="pick-q" type="search" placeholder="Search name or mobile" data-input="pickSearch" aria-label="Search customer">
    <div id="pick-list"><div class="loading">Loading…</div></div>`);
  await pickLoad();
};
GLOBAL_ACT.pickSearch = () => {
  clearTimeout(pickTimer);
  pickTimer = setTimeout(() => pickLoad().catch((e) => toast(e.message, true)), 300);
};

// The search and filters of the Orders page stay as they are while moving between its tabs and after a delivery.
const ORDER_FILTER = { q: '', route: '', user: '', mine: '' };

VIEWS.orders = async (parts, query) => {
  const tab = ['today', 'history'].includes(query.tab) ? query.tab : 'pending';
  const f = ORDER_FILTER;
  // A link like "#/orders?mine=1" or "?user=3" sets the filter.
  if ('mine' in query) f.mine = query.mine ? '1' : '';
  if ('user' in query) f.user = query.user;
  let timer;
  let today = S.boot.today;

  const load = async () => {
    const qs = new URLSearchParams({ tab, from: query.from || '', to: query.to || '', status: query.status || '', ...f });
    const d = await api('GET', '/orders?' + qs);
    today = d.today;
    ORDERS.clear();
    const filtered = f.q || f.route || f.user || f.mine;
    if (!d.list.length) return `<div class="empty">${filtered ? 'No orders found. Change the search or the filter.' : tab === 'pending' ? '✓ No orders waiting for delivery.' : 'No orders.'}</div>`;
    const total = d.list.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
    return `<p class="muted">${plural(d.list.length, 'order')} · ${rs(total)}</p>` + d.list.map((o) => orderCard(o, d.today)).join('');
  };
  const reload = async () => ($('#order-list').innerHTML = await load());
  Object.assign(ACT, {
    filter: () => go(`#/orders?tab=history&from=${$('#o-from').value}&to=${$('#o-to').value}&status=${$('#o-status').value}`),
    osearch: (el) => {
      f.q = el.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => reload().catch((e) => toast(e.message, true)), 300);
    },
    oset: async (el) => {
      f[el.dataset.k] = el.value;
      await reload();
    },
    omine: async (el) => {
      f.mine = f.mine ? '' : '1';
      el.classList.toggle('on', !!f.mine);
      await reload();
    },
  });

  const list = await load();
  let h = `<div class="btns top-action"><button class="btn big" data-act="pickCustomer">${icon('plus', 20)} Take order</button></div>
    <div class="tabs">
    <a href="#/orders" class="${tab === 'pending' ? 'on' : ''}">To deliver</a>
    <a href="#/orders?tab=today" class="${tab === 'today' ? 'on' : ''}">Today</a>
    <a href="#/orders?tab=history" class="${tab === 'history' ? 'on' : ''}">All</a></div>
    <div class="filters"><input id="o-q" type="search" placeholder="Search anything: name, staff, product, amount" data-input="osearch" value="${esc(f.q)}" aria-label="Search orders" autocomplete="off"></div>
    <div class="filters">
      <select data-change="oset" data-k="route" aria-label="Route">${options([...myRoutes(), { id: 'none', name: 'No route' }], f.route, 'All routes')}</select>
      ${isStaff() ? `<select data-change="oset" data-k="user" aria-label="Person">${options(S.boot.people, f.user, 'All staff')}</select>` : ''}
    </div>
    <div class="chips"><button class="chip${f.mine ? ' on' : ''}" data-act="omine">Only deliveries given to me</button></div>`;
  if (tab === 'history') {
    h += `<div class="filters">
      <input id="o-from" type="date" data-change="filter" value="${esc(query.from || today.slice(0, 8) + '01')}" aria-label="From date">
      <input id="o-to" type="date" data-change="filter" value="${esc(query.to || today)}" aria-label="To date">
      <select id="o-status" data-change="filter" aria-label="Status">${options([{ id: 'pending', name: 'To deliver' }, { id: 'delivered', name: 'Delivered' }, { id: 'cancelled', name: 'Cancelled' }], query.status, 'All')}</select>
    </div>`;
  }
  return `${h}<div id="order-list">${list}</div>`;
};

VIEWS.order = async (parts) => {
  const id = +parts[1];
  const qty = {};
  let brandId = S.boot.brands[0]?.id;
  let d;
  const rateOf = (p) => d.rates[p.id] || p.default_rate || 0;
  const lines = () => S.boot.products.filter((p) => qty[p.id] > 0).map((p) => ({ p, qty: qty[p.id], amount: qty[p.id] * rateOf(p) }));

  const productsHtml = () => {
    const count = (b) => S.boot.products.filter((p) => p.brand_id === b.id && qty[p.id] > 0).length;
    return `<div class="chips">${S.boot.brands
      .map((b) => `<button class="chip${b.id === brandId ? ' on' : ''}" data-act="brand" data-id="${b.id}">${esc(b.name)}${count(b) ? ` (${count(b)})` : ''}</button>`)
      .join('')}</div>
      ${S.boot.products
        .filter((p) => p.brand_id === brandId)
        .map((p) => {
          const rate = rateOf(p);
          const pack = S.boot.packs.find((k) => k.id === p.pack_id);
          return `<div class="card row">
            <div class="grow"><b>${esc(p.pack)}</b><div class="muted small">${esc(pack?.detail || '')}</div>
              ${rate ? `<div>${rs(rate)} per ${esc(p.unit.toLowerCase())}</div>` : '<div class="red small">Rate not set. Ask manager.</div>'}</div>
            ${
              rate
                ? `<div class="qty"><button data-act="minus" data-id="${p.id}" aria-label="Less">−</button>
                   <input type="number" inputmode="numeric" min="0" data-input="qty" data-id="${p.id}" value="${qty[p.id] || ''}" placeholder="0" aria-label="Quantity">
                   <button data-act="plus" data-id="${p.id}" aria-label="More">+</button></div>`
                : isStaff() ? `<a class="btn light sm" href="#/rates/${id}">Set rate</a>` : ''
            }
          </div>`;
        })
        .join('')}`;
  };
  const sumHtml = () => {
    const l = lines();
    if (!l.length) return '<p class="muted">Press + to add boxes.</p>';
    const total = l.reduce((s, x) => s + x.amount, 0);
    return `<ul class="items">${l.map((x) => `<li><span>${esc(x.p.brand)} ${esc(x.p.pack)} × ${x.qty}</span><span>${rs(x.amount)}</span></li>`).join('')}
      <li><b>Order total</b><b>${rs(total)}</b></li>
      <li><span>Balance after delivery</span><span class="red">${rs(d.customer.balance + total)}</span></li></ul>`;
  };
  const draw = () => {
    $('#order-products').innerHTML = productsHtml();
    $('#order-sum').innerHTML = sumHtml();
  };

  Object.assign(ACT, {
    brand: (el) => { brandId = +el.dataset.id; draw(); },
    plus: (el) => { qty[el.dataset.id] = (qty[el.dataset.id] || 0) + 1; draw(); },
    minus: (el) => { qty[el.dataset.id] = Math.max(0, (qty[el.dataset.id] || 0) - 1); draw(); },
    // Typing must not redraw the input itself, or the keyboard closes.
    qty: (el) => { qty[el.dataset.id] = Math.max(0, parseInt(el.value, 10) || 0); $('#order-sum').innerHTML = sumHtml(); },
    saveOrder: async () => {
      const items = lines().map((x) => ({ product_id: x.p.id, qty: x.qty }));
      if (!items.length) throw new Error('Add at least one product');
      const r = await api('POST', '/orders', { customer_id: id, items, deliver_on: $('#o-date').value, next_call_days: $('#o-next').value, note: $('#o-note').value });
      toast('Order saved');
      // Straight to the bill. "replace" so that Back does not open this form again and save the order twice.
      location.replace(`#/bill/${r.id}?new=1`);
    },
  });

  d = await api('GET', `/customers/${id}`);
  const c = d.customer;
  const t = S.boot.today;
  return `<h2>${esc(c.name)}</h2><p class="muted">${dots(esc(routeText(c.route, c.type)), tel(c.mobile, ''))}</p>
    ${c.balance > 0 ? `<div class="banner bad">Old balance to collect: ${rs(c.balance)}</div>` : '<div class="banner ok">No old balance</div>'}
    <div id="order-products">${productsHtml()}</div>
    <h3>Order</h3>
    <div class="card" id="order-sum">${sumHtml()}</div>
    <label class="f" for="o-date">Deliver on</label>
    <div class="chips">
      <button class="chip on" data-act="chip" data-target="o-date" data-val="${t}">Today</button>
      <button class="chip" data-act="chip" data-target="o-date" data-val="${addDaysStr(t, 1)}">Tomorrow</button>
      <button class="chip" data-act="chip" data-target="o-date" data-val="${addDaysStr(t, 2)}">After 2 days</button>
    </div>
    <input id="o-date" type="date" min="${t}" value="${t}">
    <label class="f" for="o-next">Call this customer again after (days)</label>
    <input id="o-next" type="number" inputmode="numeric" min="1" max="90" value="${c.call_every_days}">
    <label class="f" for="o-note">Note (if any)</label>
    <textarea id="o-note"></textarea>
    <div class="btns"><button class="btn big" data-act="saveOrder">Save order</button></div>`;
};

// ---------- bill: shown after every order, and from the "Bill" button of an order ----------
VIEWS.bill = async (parts, query) => {
  const id = +parts[1];
  const fileName = `Bill-${id}.pdf`;
  const o = (await api('GET', `/orders/${id}`)).order;
  // The bill link: works without login, but only with the long random code of this order.
  const pdfUrl = `${API_URL}/bill/${o.bill_token}`;

  const message = [
    `*${S.business}*`,
    `Bill no ${o.id} · ${fmtDate(o.taken_date)}`,
    ...o.items.map((i) => `${i.brand} ${i.pack} × ${i.qty} = ${rs(i.amount)}`),
    `*Total: ${rs(o.total)}*`,
    o.status === 'pending' && o.balance ? `Old balance: ${rs(o.balance)}\nTotal to pay: ${rs(o.balance + o.total)}` : '',
    o.status === 'delivered' ? `Balance to pay now: ${rs(o.balance)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // The PDF is fetched as soon as the page opens, so that sharing starts at once when the button is tapped.
  const getFile = async () => {
    const res = await fetch(pdfUrl);
    if (!res.ok) throw new Error('Could not make the bill. Try again.');
    return new File([await res.blob()], fileName, { type: 'application/pdf' });
  };
  let file = null;
  getFile().then((f) => (file = f), () => {});

  // Opens the WhatsApp chat of this customer's number with the bill typed in; the staff member presses send.
  // WhatsApp takes no file this way, so the message carries a link that opens the bill PDF.
  ACT.sendBill = () => {
    window.open(`https://wa.me/91${encodeURIComponent(o.mobile)}?text=${encodeURIComponent(`${message}\n\nBill (PDF): ${pdfUrl}`)}`, '_blank', 'noopener');
  };
  // The PDF itself, through the phone's share list (WhatsApp, then choose the customer).
  ACT.shareBill = async () => {
    file = file || (await getFile());
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
      } catch (e) {
        if (e.name !== 'AbortError') throw new Error('Could not open sharing. Press "Open bill" and send the file.');
      }
      return;
    }
    // A computer has no share list: the PDF is saved instead.
    const a = document.createElement('a');
    a.href = pdfUrl + '?download=1';
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    toast('Bill saved in Downloads');
  };

  return `${query.new ? `<div class="banner ok">✓ Order #${o.id} saved</div>` : ''}
    <h2>${esc(o.customer)}</h2>
    <p class="muted">${dots(`Bill no ${o.id}`, fmtDate(o.taken_date), tel(o.mobile, ''))}</p>
    <div class="card"><ul class="items">${o.items.map((i) => `<li><span>${esc(i.brand)} ${esc(i.pack)} × ${i.qty}</span><span>${rs(i.amount)}</span></li>`).join('')}
      <li><b>Total</b><b>${rs(o.total)}</b></li>
      ${o.status === 'pending' && o.balance ? `<li><span>Old balance</span><span>${rs(o.balance)}</span></li><li><b>Total to pay</b><b class="red">${rs(o.balance + o.total)}</b></li>` : ''}
      ${o.status === 'delivered' ? `<li><b>Balance to pay now</b><b class="red">${rs(o.balance)}</b></li>` : ''}</ul></div>
    <div class="btns"><button class="btn big" data-act="sendBill">${icon('send', 20)} Send bill on WhatsApp</button></div>
    <p class="muted small">Opens WhatsApp on ${esc(o.mobile)} with the bill written and a link to the PDF. Press send there.</p>
    <div class="btns">
      <button class="btn light" data-act="shareBill">Share PDF file</button>
      <a class="btn light" href="${pdfUrl}" target="_blank" rel="noopener">Open bill (PDF)</a>
    </div>
    <div class="btns"><a class="btn light" href="#/orders">Done</a></div>`;
};

// ---------- expenses ----------
// Adding an expense: from the Expenses page and from "Company money with me".
const EXPENSE_ACT = {
    addExpense: () =>
      sheet(`<h3>Add expense</h3>
        <label class="f">Money spent on</label>
        <div class="chips" id="x-type">${S.boot.expenseTypes.map((t) => `<button class="chip" data-act="chip" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <label class="f" for="x-amount">Amount (₹)</label>
        <input id="x-amount" type="number" inputmode="decimal" min="1">
        <label class="f" for="x-date">Date</label>
        <input id="x-date" type="date" max="${S.boot.today}" value="${S.boot.today}">
        <label class="f">Paid by</label>
        <div class="chips" id="x-mode">${S.boot.payModes.map((m, i) => `<button class="chip${i ? '' : ' on'}" data-act="chip" data-val="${m}">${m}</button>`).join('')}</div>
        <label class="f" for="x-note">Note (vehicle, bill number, paid to whom) – compulsory only for "Other"</label>
        <input id="x-note" type="text">
        <div class="btns"><button class="btn big" data-act="saveExpense">Save</button></div>`),
    saveExpense: async () => {
      if (!chipVal('x-type')) throw new Error('Select what the money was spent on');
      await api('POST', '/expenses', { category: chipVal('x-type'), amount: $('#x-amount').value, date: $('#x-date').value, mode: chipVal('x-mode'), note: $('#x-note').value });
      closeSheet();
      toast('Expense saved');
      refresh();
    },
};

VIEWS.expenses = async (parts, query) => {
  Object.assign(ACT, EXPENSE_ACT, {
    month: (el) => el.value && go(`#/expenses?month=${el.value}`),
    delExpense: (el) =>
      askDelete('Delete this expense?', el.dataset.text, async () => {
        await api('POST', `/expenses/${el.dataset.id}/delete`);
        refresh();
      }),
  });
  const d = await api('GET', '/expenses' + (query.month ? '?month=' + encodeURIComponent(query.month) : ''));
  const canRemove = () => isAdmin(); // only the admin deletes
  let h = `<div class="btns top-action"><button class="btn big" data-act="addExpense">${icon('plus', 20)} Add expense</button></div>
    <div class="filters"><input type="month" data-change="month" value="${d.month}" max="${d.today.slice(0, 7)}" aria-label="Month"></div>`;
  if (!d.list.length) return h + `<div class="empty">No expenses in this month${isStaff() ? '' : ' entered by you'}.</div>`;
  h += `<div class="banner warn"><div><div class="small">${isStaff() ? 'Total spent this month' : 'Entered by you this month'}</div><div class="balance">${rs(d.total)}</div></div></div>
    <div class="table-wrap"><table><tr><th>Spent on</th><th class="num">Entries</th><th class="num">Amount</th></tr>
      ${d.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.n}</td><td class="num">${rs(c.amount)}</td></tr>`).join('')}</table></div>
    <h3>All entries</h3>
    ${searchBox('Search type, note or person')}
    ${quickChips([['', 'All'], ...d.categories.map((c) => [c.category, c.category])])}
    <div id="quick-list">`;
  h += d.list
    .map(
      (e) => `<div class="card row" data-item data-k="${esc(e.category)}">
        <div class="grow"><b>${esc(e.category)}</b>
          <div class="muted small">${esc(dots(fmtDate(e.date), e.mode, e.by))}</div>
          ${e.note ? `<div class="muted small">${esc(e.note)}</div>` : ''}</div>
        <div class="right"><b>${rs(e.amount)}</b>${canRemove(e) ? `<div><button class="btn danger sm" data-act="delExpense" data-id="${e.id}" data-text="${esc(`${e.category} ${rs(e.amount)}, ${fmtDate(e.date)}, entered by ${e.by}`)}">Delete</button></div>` : ''}</div>
      </div>`
    )
    .join('');
  return h + '</div>';
};

// ---------- returned stock (damaged, bad smell...) ----------
const returnCard = (r, withCustomer) => `<div class="card row" data-item data-k="${esc(r.reason)}">
  <div class="grow"><b>${withCustomer ? `<a href="#/shop/${r.customer_id}">${esc(r.customer)}</a>` : esc(r.reason)}</b>
    <div class="small">${esc(r.items || '')}</div>
    <div class="muted small">${esc(dots(fmtDate(r.date), withCustomer ? r.reason : '', r.by))}</div>
    ${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</div>
  <div class="right"><b>${rs(r.amount)}</b><div class="muted small">${plural(r.pieces, 'piece')}</div>
    ${isAdmin() ? `<div><button class="btn danger sm" data-act="delReturn" data-id="${r.id}" data-text="${esc(`${r.items} returned by ${r.customer} on ${fmtDate(r.date)}. The balance of the customer goes up by ${rs(r.amount)}.`)}">Delete</button></div>` : ''}</div>
</div>`;
GLOBAL_ACT.delReturn = (el) =>
  askDelete('Delete this return?', el.dataset.text, async () => {
    await api('POST', `/returns/${el.dataset.id}/delete`);
    refresh();
  });

VIEWS.returns = async (parts, query) => {
  ACT.month = (el) => el.value && go(`#/returns?month=${el.value}`);
  const d = await api('GET', '/returns' + (query.month ? '?month=' + encodeURIComponent(query.month) : ''));
  let h = `<p class="muted">Pieces that customers gave back. To add one, open the customer and press "Return stock".</p>
    <div class="filters"><input type="month" data-change="month" value="${d.month}" max="${d.today.slice(0, 7)}" aria-label="Month"></div>`;
  if (!d.list.length) return h + `<div class="empty">✓ No stock returned in this month${isStaff() ? '' : ' through you'}.</div>`;
  const reasons = [...new Set(d.list.map((r) => r.reason))];
  return `${h}<div class="banner warn"><div><div class="small">Returned this month</div><div class="balance">${plural(d.pieces, 'piece')} · ${rs(d.total)}</div></div></div>
    <div class="table-wrap"><table><tr><th>Product</th><th class="num">Pieces</th><th class="num">Value</th></tr>
      ${d.products.map((p) => `<tr><td>${esc(p.brand)} ${esc(p.pack)}</td><td class="num">${num(p.pieces)}</td><td class="num">${rs(p.amount)}</td></tr>`).join('')}</table></div>
    <h3>All returns</h3>
    ${searchBox('Search customer, product, reason or person')}
    ${quickChips([['', 'All'], ...reasons.map((r) => [r, r])])}
    <div id="quick-list">${d.list.map((r) => returnCard(r, true)).join('')}</div>`;
};

// ---------- company money with a staff member ----------
// Customers pay the staff member, so company money sits with them. They type what they really have:
// more = the extra is theirs; less = they add it, or say where and when it was used.
const CHECK_TEXT = { ok: '✓ Correct', extra: 'Extra (theirs)', added: 'Less – added from own money', used: 'Less – used for work' };

// The admin does not hold company money in the daily work: they see what every staff member holds and spent.
async function staffMoney() {
  const d = await api('GET', '/money/staff');
  if (!d.list.length) return `<div class="empty">No staff yet. Add them in More → Staff.</div><div class="btns"><a class="btn light" href="#/money/${d.me}">Company money with me</a></div>`;
  return `<div class="banner ${d.total > 0 ? 'warn' : 'ok'}"><div><div class="small">Company money with all staff now</div><div class="balance">${rs(d.total)}</div></div></div>
    <p class="muted small">Money that customers paid into the staff member's own hands or account, minus the expenses they entered and what they gave back. Open a person to see every expense.</p>
    ${searchBox('Search name')}
    ${quickChips([['', 'All'], ['has', 'Has company money'], ['executive', 'Executives'], ['manager', 'Managers'], ['left', 'Left us']])}
    <div id="quick-list">${d.list
      .map(
        (p) => `<a class="card" href="#/money/${p.id}" data-item data-k="${p.left_on ? 'left' : p.role}${p.should > 0 ? '|has' : ''}">
          <div class="row"><b class="grow">${esc(p.name)}</b><b class="${p.should > 0 ? 'red' : ''}">${rs(p.should)}</b></div>
          <div class="muted small">${esc(dots(p.left_on ? 'Ex ' + ROLE_NAME[p.role].toLowerCase() : ROLE_NAME[p.role], p.checked ? 'balance checked ' + fmtDate(p.checked) : 'balance never checked'))}</div>
          <div class="small">${esc(dots('Collected ' + rs(p.collected), `Expenses ${rs(p.spent)} (${p.expense_count})`, p.returned ? 'Gave back ' + rs(p.returned) : '', p.given ? 'Given ' + rs(p.given) : ''))}</div>
        </a>`
      )
      .join('')}</div>
    <div class="btns"><a class="btn light sm" href="#/money/${d.me}">Company money with me</a></div>`;
}

VIEWS.money = async (parts) => {
  const other = +parts[1] || 0;
  if (!other && isAdmin()) return staffMoney();
  let d;
  const save = async (body) => {
    const r = await api('POST', '/money/check', body);
    closeSheet();
    toast(r.action === 'ok' ? '✓ Your balance is correct' : r.action === 'extra' ? `Saved. ${rs(r.diff)} extra is yours` : 'Saved');
    refresh();
  };
  Object.assign(ACT, EXPENSE_ACT, {
    checkMoney: () =>
      sheet(`<h3>Check my balance</h3>
        <p class="muted">You should have ${rs(d.should)} of company money now.</p>
        <label class="f" for="mc-has">Money you have now (₹)</label><input id="mc-has" type="number" inputmode="decimal" min="0">
        <div class="btns"><button class="btn big" data-act="checkNext">Next</button></div>`),
    checkNext: async () => {
      if ($('#mc-has').value === '') throw new Error('Enter the money you have now');
      const has = +$('#mc-has').value;
      const short = Math.round((d.should - has) * 100) / 100;
      if (short <= 0) return save({ has });
      sheet(`<h3>${rs(short)} is less</h3>
        <p class="muted">You should have ${rs(d.should)}, you have ${rs(has)}.</p>
        <div class="btns"><button class="btn big" data-act="checkAdded" data-has="${has}">I will add ${rs(short)} from my money</button></div>
        <h3>Or: it was used for work</h3>
        <label class="f">Used for</label>
        <div class="chips" id="mc-type">${S.boot.expenseTypes.map((t) => `<button class="chip" data-act="chip" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <label class="f" for="mc-used">Amount used (₹)</label><input id="mc-used" type="number" inputmode="decimal" min="1" max="${short}" value="${short}">
        <label class="f" for="mc-date">When</label><input id="mc-date" type="date" max="${S.boot.today}" value="${S.boot.today}">
        <label class="f" for="mc-note">Where (shop, petrol pump, paid to whom) – compulsory only for "Other"</label><input id="mc-note" type="text">
        <p class="muted small">It is saved as an expense. If the amount used is smaller than ${rs(short)}, you add the rest from your money.</p>
        <div class="btns"><button class="btn big light" data-act="checkUsed" data-has="${has}">Save where it was used</button></div>`);
    },
    checkAdded: (el) => save({ has: el.dataset.has, action: 'added' }),
    checkUsed: async (el) => {
      if (!chipVal('mc-type')) throw new Error('Select what the money was used for');
      return save({ has: el.dataset.has, action: 'used', category: chipVal('mc-type'), used: $('#mc-used').value, date: $('#mc-date').value, note: $('#mc-note').value });
    },
    moveMoney: (el) =>
      sheet(`<h3>${el.dataset.type === 'given' ? `Company gave money to ${esc(d.person.name)}` : `${esc(d.person.name)} gave money to the company`}</h3>
        <label class="f" for="mv-amount">Amount (₹)</label><input id="mv-amount" type="number" inputmode="decimal" min="1" value="${el.dataset.type === 'returned' && d.should > 0 ? d.should : ''}">
        <label class="f" for="mv-mode">How</label><select id="mv-mode">${options(S.boot.payModes.map((x) => ({ id: x, name: x })), 'Cash')}</select>
        <label class="f" for="mv-date">Date</label><input id="mv-date" type="date" max="${S.boot.today}" value="${S.boot.today}">
        <label class="f" for="mv-note">Note (if any)</label><input id="mv-note" type="text">
        <div class="btns"><button class="btn big" data-act="saveMove" data-type="${el.dataset.type}">Save</button></div>`),
    saveMove: async (el) => {
      await api('POST', `/money/${d.person.id}/move`, { type: el.dataset.type, amount: $('#mv-amount').value, mode: $('#mv-mode').value, date: $('#mv-date').value, note: $('#mv-note').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
    delMove: (el) =>
      askDelete('Delete this entry?', el.dataset.text, async () => {
        await api('POST', `/money/${el.dataset.kind}/${el.dataset.id}/delete`);
        refresh();
      }),
  });
  d = await api('GET', other ? `/money/${other}` : '/money');
  const who = d.own ? 'you' : d.person.name;
  const del = (kind, id, text) => (isAdmin() ? `<div><button class="btn danger sm" data-act="delMove" data-kind="${kind}" data-id="${id}" data-text="${esc(text)}">Delete</button></div>` : '');
  return `${d.own ? '' : `<h2>${esc(d.person.name)}</h2>`}
    <div class="banner ${d.should > 0 ? 'warn' : 'ok'}"><div><div class="small">${d.should < 0 ? `The company has to give ${esc(who)}` : `Company money ${d.own ? 'you' : 'they'} should have now`}</div><div class="balance">${rs(Math.abs(d.should))}</div></div></div>
    <div class="table-wrap"><table>
      <tr><td>Collected from customers${d.direct ? `<div class="muted small">${rs(d.direct)} more went straight into the company account – not counted</div>` : ''}</td><td class="num">+ ${rs(d.collected)}</td></tr>
      <tr><td>Given by the company</td><td class="num">+ ${rs(d.given)}</td></tr>
      <tr><td>Expenses entered</td><td class="num">− ${rs(d.spent)}</td></tr>
      <tr><td>Given back to the company</td><td class="num">− ${rs(d.returned)}</td></tr>
    </table></div>
    ${d.own ? `<div class="btns"><button class="btn big" data-act="checkMoney">Check my balance</button></div>
      <p class="muted small">Type the money you really have. More than this: the extra is yours. Less: add it from your money, or say where and when it was used.</p>` : ''}
    ${
      isStaff() && !d.own
        ? `<div class="btns"><button class="btn" data-act="moveMoney" data-type="returned">${esc(d.person.name)} gave money to the company</button></div>
           <div class="btns"><button class="btn light" data-act="moveMoney" data-type="given">Company gave money to ${esc(d.person.name)}</button></div>`
        : ''
    }
    ${d.own ? '<p class="muted small">When you hand this money over to the company, the manager enters it and it goes down here.</p>' : ''}
    <h3>Balance checks</h3>
    ${
      d.checks.length
        ? d.checks
            .map(
              (c) => `<div class="card row"><div class="grow"><b>${CHECK_TEXT[c.action]}</b>
                <div class="muted small">${esc(dots(fmtDate(c.date), 'should have ' + rs(c.should), 'had ' + rs(c.has)))}</div>
                ${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}</div>
                <div class="right"><b class="${c.diff < 0 ? 'red' : ''}">${c.diff > 0 ? '+ ' : c.diff < 0 ? '− ' : ''}${rs(Math.abs(c.diff))}</b>${del('checks', c.id, `Balance check of ${fmtDate(c.date)}`)}</div></div>`
            )
            .join('')
        : '<p class="muted">No balance check yet.</p>'
    }
    <h3>${d.own ? 'My expenses' : 'Expenses entered'} (${d.expenses.length})</h3>
    ${d.own ? `<div class="btns"><button class="btn big" data-act="addExpense">${icon('plus', 20)} Add expense</button></div>` : ''}
    ${
      d.expenses.length
        ? `<div class="table-wrap"><table><tr><th>Date</th><th>Spent on</th><th class="num">Amount</th></tr>
          ${d.expenses.map((e) => `<tr><td>${fmtDate(e.date)}</td><td class="wrap">${esc(e.category)}<div class="muted small">${esc(dots(e.mode, e.note))}</div></td><td class="num">${rs(e.amount)}</td></tr>`).join('')}</table></div>`
        : '<p class="muted">No expenses entered.</p>'
    }
    <h3>Money collected into ${d.own ? 'your' : 'their'} account (${d.payments.length})</h3>
    ${
      d.payments.length
        ? `<div class="table-wrap"><table><tr><th>Date</th><th>Customer</th><th class="num">Amount</th></tr>
          ${d.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td class="wrap">${isStaff() ? `<a href="#/shop/${p.customer_id}">${esc(p.customer)}</a>` : esc(p.customer)}<div class="muted small">${esc(p.mode)}</div></td><td class="num">${rs(p.amount)}</td></tr>`).join('')}</table></div>`
        : '<p class="muted">Nothing collected.</p>'
    }
    <h3>Money given and taken back</h3>
    ${
      d.moves.length
        ? d.moves
            .map(
              (m) => `<div class="card row"><div class="grow"><b>${m.type === 'given' ? 'Given by the company' : 'Given back to the company'}</b>
                <div class="muted small">${esc(dots(fmtDate(m.date), m.mode, m.by ? 'entered by ' + m.by : ''))}</div>
                ${m.note ? `<div class="muted small">${esc(m.note)}</div>` : ''}</div>
                <div class="right"><b>${rs(m.amount)}</b>${del('moves', m.id, `${rs(m.amount)} ${m.type === 'given' ? 'given to' : 'taken from'} ${d.person.name} on ${fmtDate(m.date)}`)}</div></div>`
            )
            .join('')
        : '<p class="muted">Nothing yet.</p>'
    }`;
};

// ---------- alerts ----------
VIEWS.alerts = async () => {
  const d = await api('GET', '/notifications');
  if (d.unread) {
    api('POST', '/notifications/read', {}).catch(() => {});
    S.unread = 0;
    updateBadges();
  }
  if (!d.list.length) return '<div class="empty">No alerts.</div>';
  return d.list
    .map(
      (n) => `<div class="card"><div class="popup-item ${esc(n.level)}" style="margin:0">
        <div class="row"><b class="grow">${esc(n.title)}</b>${n.seen ? '' : '<span class="tag pending">New</span>'}</div>
        <div class="pre small">${esc(n.body || '')}</div>
        <div class="muted small">${fmtAt(n.at)}${n.customer_id && isStaff() ? ` · <a href="#/shop/${n.customer_id}">Open customer</a>` : ''}</div>
      </div></div>`
    )
    .join('');
};

// ---------- more ----------
VIEWS.more = async () => {
  const item = (href, ico, label) => `<a href="${href}"><span class="ico">${icon(ico)}</span>${label}</a>`;
  let h = `<p class="muted">${esc(S.user.name)} · ${ROLE_NAME[S.user.role]} · ${esc(S.user.mobile)}</p><div class="menu">`;
  if (isStaff()) {
    h += item('#/calls', 'phone', 'Customers to call') + item('#/sales', 'chart', isAdmin() ? 'Sales and earnings' : 'Sales') + item('#/staff', 'users', 'Staff') + item('#/team', 'wallet', 'Team work and salary') + item('#/attendance', 'calendar', 'Attendance');
    h += item('#/stock?tab=bottles', 'bottle', 'Bottles') + item('#/routes', 'route', 'Routes') + item('#/leads', 'inbox', 'IndiaMART enquiries') + item('#/lost', 'lost', 'Customers we lost');
    if (isAdmin()) h += item('#/products', 'tag', 'Brands and normal rates') + item('#/settings', 'settings', 'Settings');
  } else {
    h += item('#/stock', 'box', 'Stock') + item('#/stock?tab=bottles', 'bottle', 'Bottles');
  }
  // Managers and executives enter and see their expenses inside "Company money and expenses"; the admin has the page of all expenses.
  h += (isAdmin() ? item('#/money', 'wallet', 'Company money with staff') + item('#/expenses', 'wallet', 'Expenses') : item('#/money', 'wallet', 'Company money and expenses')) + item('#/returns', 'box', 'Returned stock') + item('#/alerts', 'bell', 'Alerts') + item('#/pin', 'lock', 'Change PIN');
  h += `<button data-act="logout"><span class="ico">${icon('power')}</span>Logout</button></div>`;
  return h;
};
