'use strict';
// Customers (shops and direct customers), their rates and balance, and the stock screens.

const myRoutes = () => (isStaff() ? S.boot.routes : S.boot.routes.filter((r) => S.user.route_ids.includes(r.id)));

VIEWS.shops = async (parts, query) => {
  let sort = query.sort === 'balance' ? 'balance' : '';
  let type = '';
  let timer;
  const load = async () => {
    const qs = new URLSearchParams({ q: $('#s-q')?.value || '', route: $('#s-route')?.value || '', sort, type });
    const d = await api('GET', '/customers?' + qs);
    const total = d.list.reduce((s, c) => s + Math.max(0, c.balance), 0);
    return d.list.length
      ? `<p class="muted">${plural(d.list.length, 'customer')} · Balance to collect ${rs(total)}</p>` +
          d.list
            .map(
              (c) => `<a class="card link row" href="#/shop/${c.id}">
                <div class="grow"><b>${esc(c.name)}</b>
                  <div class="muted">${dots(TYPE_NAME[c.type], c.route ? esc(c.route) : c.type === 'shop' ? '<span class="gold">No route yet</span>' : '', esc(c.mobile))}</div></div>
                <div class="right">${c.balance > 0 ? `<b class="red">${rs(c.balance)}</b><div class="muted small">balance</div>` : '<span class="muted small">No balance</span>'}</div>
              </a>`
            )
            .join('')
      : '<div class="empty">No customers found.</div>';
  };
  const reload = async () => ($('#shop-list').innerHTML = await load());
  Object.assign(ACT, {
    search: () => {
      clearTimeout(timer);
      timer = setTimeout(() => reload().catch((e) => toast(e.message, true)), 300);
    },
    reload,
    sort: async (el) => {
      sort = el.dataset.val;
      GLOBAL_ACT.chip(el);
      await reload();
    },
    type: async (el) => {
      type = el.dataset.val;
      GLOBAL_ACT.chip(el);
      await reload();
    },
  });
  const list = await load();
  const chip = (act, val, label, on) => `<button class="chip${on ? ' on' : ''}" data-act="${act}" data-val="${val}">${label}</button>`;
  return `<div class="btns top-action">
      <a class="btn" href="#/shopform?type=shop">${icon('plus', 18)} Add shop</a>
      <a class="btn" href="#/shopform?type=customer">${icon('plus', 18)} Add customer</a>
    </div>
    <div class="filters"><input id="s-q" type="search" placeholder="Search anything: name, mobile, area, route, balance" data-input="search" aria-label="Search"></div>
    <div class="filters">
      <select id="s-route" data-change="reload" aria-label="Route">${options([...myRoutes(), { id: 'none', name: 'No route yet' }], '', 'All routes')}</select>
    </div>
    <div class="chips">${chip('type', '', 'All', true)}${chip('type', 'shop', 'Shops')}${chip('type', 'customer', 'Customers')}</div>
    <div class="chips">${chip('sort', '', 'A to Z', !sort)}${chip('sort', 'balance', 'Highest balance first', !!sort)}</div>
    <div id="shop-list">${list}</div>`;
};

GLOBAL_ACT.pay = (el) =>
  sheet(`<h3>Money received from ${esc(el.dataset.name)}</h3>
    <p>Balance to collect: <b class="red">${rs(el.dataset.balance)}</b></p>
    <label class="f" for="pay-amount">Amount received (₹)</label>
    <input id="pay-amount" type="number" inputmode="decimal" min="1">
    <div class="chips" id="pay-mode">${S.boot.payModes.map((m, i) => `<button class="chip${i ? '' : ' on'}" data-act="chip" data-val="${m}">${m}</button>`).join('')}</div>
    ${moneyWentTo('pay-to', 'My account')}
    <label class="f" for="pay-note">Note (if any)</label>
    <input id="pay-note" type="text">
    <div class="btns"><button class="btn big" data-act="savePay" data-id="${esc(el.dataset.id)}">Save</button></div>`);
GLOBAL_ACT.savePay = async (el) => {
  const r = await api('POST', '/payments', { customer_id: el.dataset.id, amount: $('#pay-amount').value, mode: chipVal('pay-mode'), to: chipVal('pay-to'), note: $('#pay-note').value });
  closeSheet();
  toast(`Saved. Balance now ${rs(r.balance)}`);
  refresh();
  showHeld(r.held);
};

// Every product that has a rate for this customer: the special rate if set, otherwise the normal rate.
function ratesHtml(rates) {
  let open = true;
  const blocks = S.boot.brands
    .map((b) => {
      const rows = S.boot.products
        .filter((p) => p.brand_id === b.id)
        .map((p) => ({ p, rate: rates[p.id] || p.default_rate || 0, special: !!rates[p.id] }))
        .filter((x) => x.rate > 0);
      if (!rows.length) return '';
      const special = rows.filter((x) => x.special).length;
      const html = `<details class="rates"${open ? ' open' : ''}>
        <summary><b>${esc(b.name)}</b><span class="muted small">${plural(rows.length, 'rate')}${special ? ` · ${special} special` : ''}</span></summary>
        <table>${rows
          .map((x) => `<tr><td>${esc(x.p.pack)}</td><td class="num"><b>${rs(x.rate)}</b>${x.special ? ' <span class="tag special">Special</span>' : ''}</td></tr>`)
          .join('')}</table>
      </details>`;
      open = false;
      return html;
    })
    .join('');
  return blocks || '<p class="muted">No rates are set yet.</p>';
}

VIEWS.shop = async (parts) => {
  const id = +parts[1];
  let d;
  Object.assign(ACT, {
    reactivate: async () => {
      await api('POST', `/customers/${id}/reactivate`);
      toast('Customer is active again');
      refresh();
    },
    assignRoute: (el) =>
      sheet(`<h3>Route for ${esc(el.dataset.name)}</h3>
        <label class="f" for="ar-route">Route</label>
        <select id="ar-route">${options(myRoutes(), '', 'Select route')}</select>
        <div class="btns"><button class="btn big" data-act="saveAssign">Save route</button></div>`),
    // Returned stock: pieces of each product, one line per product.
    returnStock: async () => {
      const prods = S.boot.products.filter((p) => (d.rates[p.id] || p.default_rate) > 0);
      if (!prods.length) throw new Error('No rates are set for this customer, so the value of a return cannot be counted');
      const row = () => `<div class="row ret-row" style="gap:8px;margin-bottom:8px">
        <select class="grow" aria-label="Product">${options(prods.map((p) => ({ id: p.id, name: `${p.brand} ${p.pack}` })), '', 'Select product')}</select>
        <input style="width:96px" type="number" inputmode="numeric" min="1" placeholder="Pieces" aria-label="Pieces"></div>`;
      ACT.moreReturn = () => $('#ret-rows').insertAdjacentHTML('beforeend', row());
      sheet(`<h3>Stock returned by ${esc(d.customer.name)}</h3>
        <label class="f">Why is it returned?</label>
        <div class="chips" id="ret-reason">${S.boot.returnReasons.map((t) => `<button class="chip" data-act="chip" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <label class="f">Which product, how many pieces (not boxes)</label>
        <div id="ret-rows">${row()}</div>
        <div class="btns"><button class="btn light sm" data-act="moreReturn">+ Another product</button></div>
        <label class="f" for="ret-note">Note (if any)</label><input id="ret-note" type="text" placeholder="Example: batch of last week, lids were loose">
        <p class="muted small">The value of the pieces goes off the balance of the customer. Returned pieces are not added back to the stock.</p>
        <div class="btns"><button class="btn big" data-act="saveReturn">Save return</button></div>`);
    },
    saveReturn: async () => {
      if (!chipVal('ret-reason')) throw new Error('Select why it is returned');
      const items = $$('.ret-row').map((r) => ({ product_id: $('select', r).value, pieces: $('input', r).value })).filter((x) => x.product_id && x.pieces);
      const r = await api('POST', '/returns', { customer_id: id, reason: chipVal('ret-reason'), note: $('#ret-note').value, items });
      closeSheet();
      toast(`Return saved: ${rs(r.amount)} off. Balance now ${rs(r.balance)}`);
      refresh();
    },
    delPayment: (el) =>
      askDelete('Delete this money received?', `${el.dataset.text}. The balance of the customer goes up by this amount.`, async () => {
        await api('POST', `/payments/${el.dataset.id}/delete`);
        refresh();
      }),
    delCustomer: (el) =>
      askDelete(`Delete ${el.dataset.name}?`, 'All its orders, money received, calls and special rates are deleted with it.', async () => {
        await api('POST', `/customers/${id}/delete`);
        location.replace('#/shops');
      }),
    saveAssign: async () => {
      if (!$('#ar-route').value) throw new Error('Select the route');
      await api('PUT', `/customers/${id}/route`, { route_id: $('#ar-route').value });
      closeSheet();
      toast('Route saved');
      refresh();
    },
  });
  d = await api('GET', `/customers/${id}`);
  const c = d.customer;
  const attrs = `data-id="${c.id}" data-name="${esc(c.name)}"`;

  let h = `<h2>${esc(c.name)}</h2>
    <p class="muted">${[TYPE_NAME[c.type], c.owner, c.route, c.address].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="btns">${tel(c.mobile)}</div>
    <div class="banner ${c.balance > 0 ? 'bad' : 'ok'}">
      <div><div class="small">Balance to collect</div><div class="balance">${rs(c.balance)}</div></div>
      <button class="btn" data-act="pay" ${attrs} data-balance="${c.balance}">Receive money</button>
    </div>`;

  if (!c.route_id && c.type === 'shop') {
    h += `<div class="banner warn"><span>No route yet</span>
      ${myRoutes().length ? `<button class="btn" data-act="assignRoute" ${attrs}>Assign route</button>` : '<span class="small">The manager will assign it</span>'}</div>`;
  }

  if (c.status === 'lost') {
    h += `<div class="banner warn"><div><b>This customer said they do not need our product</b>
      <div class="small">${esc(c.lost_reasons || '')}${c.lost_note ? ' – ' + esc(c.lost_note) : ''} (${fmtDate(c.lost_at)})</div></div>
      ${isStaff() ? '<button class="btn" data-act="reactivate">Bring back</button>' : ''}</div>`;
  } else {
    h += `<div class="btns"><a class="btn big" href="#/order/${c.id}">Take order</a></div>
      <div class="btns">
        <button class="btn light sm" data-act="later" ${attrs}>Call later</button>
        <button class="btn light sm" data-act="noanswer" ${attrs}>No answer</button>
        <button class="btn danger sm" data-act="lost" ${attrs}>Not needed</button>
      </div>
      <p class="muted">Next call: ${c.next_call_date ? dayLabel(c.next_call_date) : 'Today'}</p>`;
  }

  h += `<h3>Rates</h3><p class="muted">Price of one box or bag for this customer.</p>${ratesHtml(d.rates)}`;
  if (isStaff()) h += `<div class="btns"><a class="btn light" href="#/rates/${c.id}">Change rates</a><a class="btn light" href="#/shopform/${c.id}">Edit details</a></div>`;

  h += `<h3>Orders</h3>${d.orders.length ? d.orders.map((o) => orderCard(o, S.boot.today, false)).join('') : '<p class="muted">No orders yet.</p>'}`;

  h += `<h3>Money received</h3>${
    d.payments.length
      ? `<div class="table-wrap"><table><tr><th>Date</th><th class="num">Amount</th><th>How</th><th>Collected by</th>${isAdmin() ? '<th></th>' : ''}</tr>
        ${d.payments
          .map(
            (p) => `<tr><td>${fmtDate(p.date)}</td><td class="num">${rs(p.amount)}</td><td>${esc(p.mode)}</td><td>${esc(p.by)}${p.to_company ? '<div class="muted small">into the company account</div>' : ''}</td>
              ${isAdmin() ? `<td><button class="btn danger sm" data-act="delPayment" data-id="${p.id}" data-text="${esc(`${rs(p.amount)} received on ${fmtDate(p.date)} by ${p.by}`)}">Delete</button></td>` : ''}</tr>`
          )
          .join('')}</table></div>`
      : '<p class="muted">No money received yet.</p>'
  }`;

  h += `<h3>Returned stock</h3>
    <div class="btns"><button class="btn light" data-act="returnStock">Return stock (damaged, bad smell...)</button></div>
    ${d.returns.length ? d.returns.map((r) => returnCard(r, false)).join('') : '<p class="muted">Nothing returned.</p>'}`;

  h += `<h3>Calls</h3>${
    d.calls.length
      ? `<div class="table-wrap"><table><tr><th>Date</th><th>Result</th><th>By</th></tr>
        ${d.calls.map((l) => `<tr><td>${fmtDate(l.date)}</td><td class="wrap">${esc(LAST_CALL[l.outcome])}${l.reason && l.outcome !== 'no_answer' ? ' – ' + esc(l.reason) : ''}</td><td>${esc(l.by)}</td></tr>`).join('')}</table></div>`
      : '<p class="muted">No calls yet.</p>'
  }`;
  if (isAdmin()) {
    h += `<h3>Delete</h3><p class="muted small">Only for a wrong or test entry. For a customer who stopped buying, use "Not needed" instead.</p>
      <div class="btns"><button class="btn danger" data-act="delCustomer" ${attrs}>Delete this customer</button></div>`;
  }
  return h;
};

// The rate boxes of every product, brand by brand. Used when adding a customer and on "Change rates".
const rateInputs = (rates) =>
  S.boot.brands
    .map(
      (b) => `<h3>${esc(b.name)}</h3><div class="card">${S.boot.products
        .filter((p) => p.brand_id === b.id)
        .map(
          (p) => `<div class="row" style="padding:5px 0"><label class="grow" for="r-${p.id}">${esc(p.pack)}<div class="muted small">Normal: ${p.default_rate ? rs(p.default_rate) : 'not set'}</div></label>
            <input id="r-${p.id}" style="width:120px" type="number" inputmode="decimal" min="0" data-rate="${p.id}" value="${esc(rates[p.id] ?? '')}" placeholder="₹"></div>`
        )
        .join('')}</div>`
    )
    .join('');
const typedRates = () => Object.fromEntries($$('[data-rate]').map((i) => [i.dataset.rate, i.value]));

// One form for both "Add shop" and "Add customer". The rates are decided here, in the same step.
VIEWS.shopform = async (parts, query) => {
  const id = +parts[1] || 0;
  const newType = query.type === 'customer' ? 'customer' : 'shop';
  ACT.saveShop = async () => {
    const body = { type: id ? $('#f-type').value : newType, name: $('#f-name').value, owner: $('#f-owner').value, mobile: $('#f-mobile').value, route_id: $('#f-route')?.value || '', address: $('#f-address').value };
    if (isStaff()) Object.assign(body, { opening_balance: $('#f-balance').value, call_every_days: $('#f-every').value });
    if (!id) Object.assign(body, { rates: typedRates(), lead_id: query.lead || '' });
    const r = id ? await api('PUT', `/customers/${id}`, body) : await api('POST', '/customers', body);
    toast('Saved');
    if (id) history.back();
    else location.replace(`#/shop/${r.id}`);
  };
  // Coming from an IndiaMART enquiry: its details are already filled in.
  const lead = !id && query.lead ? LEADS.get(+query.lead) : null;
  const c = id
    ? (await api('GET', `/customers/${id}`)).customer
    : { type: newType, name: lead ? lead.company || lead.name : '', owner: lead && lead.company ? lead.name : '', mobile: lead ? lead.mobile : '', address: lead ? lead.address || lead.city : '' };
  const shop = c.type === 'shop';
  const routes = myRoutes();
  // A new shop by an executive with one route gets that route; it can still be changed to "Assign later".
  const route = id ? c.route_id : !isStaff() && routes.length === 1 ? routes[0].id : '';
  // A direct customer needs no route. When editing, the manager can still give one.
  const routeField = shop
    ? `<label class="f" for="f-route">Route (can be given later)</label><select id="f-route">${options(routes, route, 'Assign later')}</select>`
    : id
      ? `<label class="f" for="f-route">Route (not needed for a customer)</label><select id="f-route">${options(routes, route, 'No route')}</select>`
      : '';
  return `<form data-submit="saveShop">
    <h2>${id ? 'Edit details' : shop ? 'New shop' : 'New customer'}</h2>
    ${id ? `<label class="f" for="f-type">Shop or customer</label><select id="f-type">${options([{ id: 'shop', name: 'Shop' }, { id: 'customer', name: 'Customer' }], c.type)}</select>` : ''}
    <label class="f" for="f-name">${shop ? 'Shop name' : 'Customer name'}</label><input id="f-name" value="${esc(c.name)}" required>
    <label class="f" for="f-owner">${shop ? 'Owner name' : 'Contact person (if any)'}</label><input id="f-owner" value="${esc(c.owner)}">
    <label class="f" for="f-mobile">Mobile number</label><input id="f-mobile" type="tel" inputmode="numeric" maxlength="10" value="${esc(c.mobile)}" data-input="digits" required>
    ${routeField}
    <label class="f" for="f-address">Address / area</label><textarea id="f-address">${esc(c.address)}</textarea>
    ${
      isStaff()
        ? `<label class="f" for="f-balance">Old balance from the book (₹)</label><input id="f-balance" type="number" inputmode="decimal" value="${esc(c.opening_balance ?? 0)}">
           <label class="f" for="f-every">Call every (days)</label><input id="f-every" type="number" inputmode="numeric" min="1" max="90" value="${esc(c.call_every_days ?? 7)}">`
        : ''
    }
    ${
      id
        ? ''
        : `<h2>Rates for this ${shop ? 'shop' : 'customer'}</h2>
           <p class="muted">Type the price of one box or bag. Leave a box empty to use the normal rate.</p>${rateInputs({})}`
    }
    <div class="${id ? 'btns' : 'sticky-foot'}"><button class="btn big" type="submit">${id ? 'Save' : shop ? 'Save shop' : 'Save customer'}</button></div>
  </form>`;
};

VIEWS.rates = async (parts) => {
  const id = +parts[1];
  ACT.saveRates = async () => {
    await api('PUT', `/customers/${id}/rates`, { rates: typedRates() });
    toast('Rates saved');
    history.back();
  };
  const d = await api('GET', `/customers/${id}`);
  return `<h2>${esc(d.customer.name)}</h2>
    <p class="muted">Type the rate only where this customer has a different rate. Leave empty to use the normal rate.</p>
    ${rateInputs(d.rates)}
    <div class="sticky-foot"><button class="btn big" data-act="saveRates">Save rates</button></div>`;
};

// ---------- stock ----------
VIEWS.stock = async (parts, query) => {
  const tab = query.tab === 'bottles' ? 'bottles' : 'boxes';
  let d;
  const mat = (id) => d.materials.find((m) => m.id === +id);

  // "Boxes made": one row per brand + box type, saved together.
  let rows = [];
  const productOf = (r) => S.boot.products.find((x) => x.brand_id === +r.brand && x.pack_id === +r.pack);
  const rowHtml = (r, i) => `<div class="card made-row">
    <div class="filters">
      <select data-change="madeSet" data-i="${i}" data-k="brand" aria-label="Brand">${options(S.boot.brands, r.brand)}</select>
      <select data-change="madeSet" data-i="${i}" data-k="pack" aria-label="Box type">${options(S.boot.packs, r.pack)}</select>
    </div>
    <div class="row">
      <input class="grow" type="number" inputmode="numeric" min="1" placeholder="How many made" value="${esc(r.boxes)}" data-input="madeSet" data-i="${i}" data-k="boxes" aria-label="How many made">
      ${rows.length > 1 ? `<button class="btn danger sm" data-act="delMadeRow" data-i="${i}">Remove</button>` : ''}
    </div>
  </div>`;
  // Bottles needed by all rows together, against what is in stock.
  const drawNeed = () => {
    const need = new Map();
    for (const r of rows) {
      const p = productOf(r);
      const boxes = parseInt(r.boxes, 10) || 0;
      if (p && p.material_id && boxes > 0) need.set(p.material_id, (need.get(p.material_id) || 0) + boxes * p.pieces);
    }
    $('#made-need').innerHTML = [...need]
      .map(([id, n]) => {
        const m = mat(id);
        const short = n > m.stock;
        return `<div class="${short ? 'red' : 'muted'} small">Uses ${num(n)} ${esc(m.name)}. In stock: ${num(m.stock)}${short ? ' – not enough' : ''}</div>`;
      })
      .join('');
  };
  const drawRows = () => {
    $('#made-rows').innerHTML = rows.map(rowHtml).join('');
    drawNeed();
  };

  Object.assign(ACT, {
    date: (el) => go(`#/stock?date=${el.value}`),
    showAll: () => go(`#/stock?all=1${query.date ? '&date=' + query.date : ''}`),
    made: () => {
      rows = [{ brand: S.boot.brands[0]?.id, pack: S.boot.packs[0]?.id, boxes: '' }];
      sheet(`<h3>Boxes made today</h3>
        <p class="muted">One row for each brand and box type.</p>
        <div id="made-rows"></div>
        <div class="btns"><button class="btn light" data-act="addMadeRow">${icon('plus', 18)} Add another</button></div>
        <div id="made-need"></div>
        <div class="btns"><button class="btn big" data-act="saveMade">Save all</button></div>`);
      drawRows();
    },
    madeSet: (el) => {
      rows[+el.dataset.i][el.dataset.k] = el.value;
      drawNeed();
    },
    addMadeRow: () => {
      const last = rows[rows.length - 1];
      rows.push({ brand: last.brand, pack: last.pack, boxes: '' });
      drawRows();
      $$('#made-rows input').pop().focus();
    },
    delMadeRow: (el) => {
      rows.splice(+el.dataset.i, 1);
      drawRows();
    },
    saveMade: async () => {
      if (rows.some((r) => !(parseInt(r.boxes, 10) > 0))) throw new Error('Enter how many were made in every row');
      const r = await api('POST', '/production', { items: rows.map((x) => ({ product_id: productOf(x)?.id, boxes: x.boxes })) });
      closeSheet();
      toast(`Saved ${plural(r.lines, 'product')}`);
      await refresh();
      pollAlerts();
    },
    addBottles: (el) =>
      sheet(`<h3>New ${esc(mat(el.dataset.id).name)} came</h3>
        <label class="f" for="b-qty">How many came</label><input id="b-qty" type="number" inputmode="numeric" min="1">
        <label class="f" for="b-note">Note (supplier, bill number)</label><input id="b-note" type="text">
        <div class="btns"><button class="btn big" data-act="saveBottles" data-id="${esc(el.dataset.id)}">Save</button></div>`),
    saveBottles: async (el) => {
      await api('POST', `/materials/${el.dataset.id}/add`, { qty: $('#b-qty').value, note: $('#b-note').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
    countBottles: (el) =>
      sheet(`<h3>Count ${esc(mat(el.dataset.id).name)}</h3>
        <p>App shows: <b>${num(mat(el.dataset.id).stock)}</b></p>
        <label class="f" for="b-count">How many are really there</label><input id="b-count" type="number" inputmode="numeric" min="0">
        <div class="btns"><button class="btn big" data-act="saveCount" data-id="${esc(el.dataset.id)}">Save count</button></div>`),
    saveCount: async (el) => {
      if ($('#b-count').value === '') throw new Error('Enter the count');
      await api('POST', `/materials/${el.dataset.id}/count`, { counted: $('#b-count').value });
      closeSheet();
      toast('Saved');
      await refresh();
      pollAlerts();
    },
    history: async (el) => {
      const r = await api('GET', `/materials/${el.dataset.id}/history`);
      const TYPE = { purchase: 'Came in', production: 'Used', count: 'Count correction' };
      sheet(`<h3>${esc(mat(el.dataset.id).name)}</h3>${
        r.list.length
          ? `<div class="table-wrap"><table><tr><th>Date</th><th></th><th class="num">Qty</th><th>By</th></tr>
            ${r.list
              .map(
                (t) => `<tr><td>${fmtDate(t.date)}</td><td class="wrap">${TYPE[t.type]}${t.note ? `<div class="muted small">${esc(t.note)}</div>` : ''}</td><td class="num">${t.qty > 0 ? '+' : ''}${num(t.qty)}</td><td>${esc(t.by || '')}
                  ${isAdmin() && t.type !== 'production' ? `<div><button class="btn danger sm" data-act="delBottleEntry" data-id="${t.id}" data-text="${esc(`${TYPE[t.type]} ${t.qty > 0 ? '+' : ''}${num(t.qty)} on ${fmtDate(t.date)}`)}">Delete</button></div>` : ''}</td></tr>`
              )
              .join('')}</table></div>
            ${isAdmin() ? '<p class="muted small">Bottles "Used" are removed by deleting the Boxes made entry in Stock.</p>' : ''}`
          : '<p class="muted">Nothing yet.</p>'
      }`);
    },
    delBottleEntry: (el) =>
      askDelete('Delete this bottle entry?', el.dataset.text, async () => {
        await api('POST', `/materials/entries/${el.dataset.id}/delete`);
        refresh();
      }),
    delStockEntry: (el) =>
      askDelete('Delete this entry?', `${el.dataset.text}. For boxes made, the bottles it used come back.`, async () => {
        await api('POST', `/stock/entries/${el.dataset.id}/delete`);
        refresh();
      }),
    editBottle: (el) => {
      const m = el.dataset.id ? mat(el.dataset.id) : { name: '', low_at: 0 };
      sheet(`<h3>${el.dataset.id ? 'Edit' : 'New bottle type'}</h3>
        <label class="f" for="e-name">Name</label><input id="e-name" value="${esc(m.name)}">
        <label class="f" for="e-low">Give low stock alert when this many or less are left</label><input id="e-low" type="number" inputmode="numeric" min="0" value="${m.low_at}">
        <div class="btns"><button class="btn big" data-act="saveBottle" data-id="${esc(el.dataset.id || '')}">Save</button></div>`);
    },
    saveBottle: async (el) => {
      const body = { name: $('#e-name').value, low_at: $('#e-low').value };
      await (el.dataset.id ? api('PUT', `/materials/${el.dataset.id}`, body) : api('POST', '/materials', body));
      closeSheet();
      toast('Saved');
      refresh();
    },
  });

  d = await api('GET', '/stock' + (query.date ? '?date=' + encodeURIComponent(query.date) : ''));
  let h = `<div class="tabs"><a href="#/stock" class="${tab === 'boxes' ? 'on' : ''}">Boxes</a><a href="#/stock?tab=bottles" class="${tab === 'bottles' ? 'on' : ''}">Bottles</a></div>`;

  if (tab === 'bottles') {
    h += `<p class="muted">Empty bottles, jars and pouches. They reduce by themselves when boxes are made.</p>
      ${searchBox('Search bottle type')}${quickChips([['', 'All'], ['low', 'Low only']])}<div id="quick-list">`;
    h += d.materials
      .map(
        (m) => `<div class="card" data-item data-k="${m.low ? 'low' : ''}">
          <div class="row"><b class="grow">${esc(m.name)}</b>${m.low ? `<span class="warn-ic" title="Low stock">${icon('warn', 22)}</span> <span class="tag low">LOW</span>` : ''}</div>
          <div class="balance ${m.low ? 'red' : ''}">${num(m.stock)}</div>
          <div class="muted small">Alert when ${num(m.low_at)} or less</div>
          <div class="btns">
            ${isStaff() ? `<button class="btn sm" data-act="addBottles" data-id="${m.id}">+ New stock came</button><button class="btn light sm" data-act="countBottles" data-id="${m.id}">Count</button>` : ''}
            <button class="btn light sm" data-act="history" data-id="${m.id}">History</button>
            ${isAdmin() ? `<button class="btn light sm" data-act="editBottle" data-id="${m.id}">Edit</button>` : ''}
          </div>
        </div>`
      )
      .join('');
    h += '</div>';
    if (isAdmin()) h += '<div class="btns"><button class="btn light" data-act="editBottle">+ New bottle type</button></div>';
    return h;
  }

  const shown = query.all ? d.products : d.products.filter((p) => p.opening || p.made || p.sold || p.closing || p.pending || p.corrected);
  h += `<div class="filters"><input type="date" data-change="date" value="${d.date}" max="${d.today}" aria-label="Date"></div>`;
  if (isStaff()) h += `<div class="btns"><button class="btn" data-act="made">${icon('plus', 18)} Boxes made</button><a class="btn light" href="#/count">Count stock</a></div>`;
  const tags = (p) => [p.made ? 'made' : '', p.sold ? 'sold' : '', p.pending ? 'ordered' : '', p.closing > 0 ? 'stock' : ''].filter(Boolean).join('|');
  h += shown.length
    ? `${searchBox('Search brand or box type')}
      ${quickChips([['', 'All'], ['made', 'Made'], ['sold', 'Sold'], ['ordered', 'Ordered'], ['stock', 'In stock']])}
      <div class="table-wrap"><table id="quick-list">
        <tr><th>Product</th><th class="num">Opening</th><th class="num">Made</th><th class="num">Sold</th><th class="num">${d.date === d.today ? 'In stock' : 'Closing'}</th><th class="num">Ordered</th></tr>
        ${shown
          .map(
            (p) => `<tr data-item data-k="${tags(p)}"><td>${esc(p.brand)}<div class="muted small">${esc(p.pack)}</div></td>
              <td class="num">${num(p.opening)}</td><td class="num">${p.made ? '+' + num(p.made) : '0'}</td><td class="num">${p.sold ? '−' + num(p.sold) : '0'}</td>
              <td class="num"><b class="${p.closing < 0 ? 'red' : ''}">${num(p.closing)}</b>${p.corrected ? `<div class="red small">${p.corrected > 0 ? '+' : ''}${p.corrected} in count</div>` : ''}</td>
              <td class="num">${p.pending ? num(p.pending) : ''}</td></tr>`
          )
          .join('')}
      </table></div>
      <p class="muted small">Opening + Made − Sold = In stock. "Ordered" = boxes in orders not yet delivered. A red number below zero means boxes were delivered before they were entered as made.</p>`
    : '<div class="empty">No stock yet. Enter the boxes after packing.</div>';
  if (!query.all && shown.length < d.products.length) h += '<div class="btns"><button class="btn light sm" data-act="showAll">Show all products</button></div>';

  // The entries behind the numbers of this day; the admin can delete a wrong one.
  if (isStaff()) {
    const entries = (await api('GET', '/stock/entries?date=' + encodeURIComponent(d.date))).list;
    if (entries.length) {
      const WHAT = { production: 'Boxes made', count: 'Count correction' };
      h += `<h3>Entries of ${dayLabel(d.date)}</h3><div class="table-wrap"><table><tr><th>Entry</th><th class="num">Boxes</th><th>By</th>${isAdmin() ? '<th></th>' : ''}</tr>
        ${entries
          .map(
            (e) => `<tr><td>${WHAT[e.type]}<div class="muted small">${esc(e.brand)} ${esc(e.pack)}</div></td><td class="num">${e.qty > 0 ? '+' : ''}${num(e.qty)}</td><td>${esc(e.by || '')}</td>
              ${isAdmin() ? `<td><button class="btn danger sm" data-act="delStockEntry" data-id="${e.id}" data-text="${esc(`${WHAT[e.type]}: ${e.qty > 0 ? '+' : ''}${e.qty} ${e.brand} ${e.pack}`)}">Delete</button></td>` : ''}</tr>`
          )
          .join('')}</table></div>`;
    }
  }

  if (d.counts.length) {
    h += `<h3>Stock count differences</h3><div class="table-wrap"><table><tr><th>Date</th><th>Product</th><th class="num">App</th><th class="num">Counted</th><th class="num">Difference</th><th>By</th></tr>
      ${d.counts.map((c) => `<tr><td>${fmtDate(c.date)}</td><td>${esc(c.brand)} ${esc(c.pack)}</td><td class="num">${c.expected}</td><td class="num">${c.counted}</td><td class="num ${c.diff < 0 ? 'red' : 'green'}"><b>${c.diff < 0 ? -c.diff + ' missing' : c.diff + ' extra'}</b></td><td>${esc(c.by || '')}</td></tr>`).join('')}
      </table></div>`;
  }
  return h;
};

VIEWS.count = async () => {
  ACT.saveStockCount = async () => {
    const items = $$('[data-count]').filter((i) => i.value !== '').map((i) => ({ product_id: +i.dataset.count, counted: i.value }));
    if (!items.length) throw new Error('Enter the count for at least one product');
    const r = await api('POST', '/stock/count', { items });
    toast(r.missing ? `Saved. ${plural(r.missing, 'product')} with missing stock` : 'Saved. Stock is correct', !!r.missing);
    go('#/stock');
    pollAlerts();
  };
  const d = await api('GET', '/stock');
  const stock = new Map(d.products.map((p) => [p.id, p.closing]));
  return `<p class="muted">Count the boxes in the godown and type the number. Leave empty what you did not count. If the count is less than the app, everyone gets a "missing" alert.</p>
    ${S.boot.brands
      .map(
        (b) => `<h3>${esc(b.name)}</h3><div class="card">${S.boot.products
          .filter((p) => p.brand_id === b.id)
          .map(
            (p) => `<div class="row" style="padding:5px 0"><label class="grow" for="k-${p.id}">${esc(p.pack)}<div class="muted small">App shows: ${num(stock.get(p.id))}</div></label>
              <input id="k-${p.id}" style="width:110px" type="number" inputmode="numeric" min="0" data-count="${p.id}" placeholder="Count"></div>`
          )
          .join('')}</div>`
      )
      .join('')}
    <div class="sticky-foot"><button class="btn big" data-act="saveStockCount">Save count</button></div>`;
};
