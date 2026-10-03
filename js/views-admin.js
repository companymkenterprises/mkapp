'use strict';
// Manager and admin screens: sales, staff, attendance, routes, brands and rates, lost customers, settings.

VIEWS.sales = async (parts, query) => {
  ACT.month = (el) => el.value && go(`#/sales?month=${el.value}`);
  const d = await api('GET', '/reports/sales' + (query.month ? '?month=' + encodeURIComponent(query.month) : ''));
  const brands = new Map();
  for (const p of d.products) brands.set(p.brand, (brands.get(p.brand) || 0) + p.amount);

  const table = (head, rows) => `<div class="table-wrap"><table><tr>${head}</tr>${rows}</table></div>`;
  return `<div class="filters"><input type="month" data-change="month" value="${d.month}" max="${S.boot.today.slice(0, 7)}" aria-label="Month"></div>
    <div class="tiles">
      ${tile(`#/orders?tab=history&from=${d.from}&to=${d.to}&status=delivered`, rs(d.sales), 'Sales (delivered)', '', plural(d.orders, 'order'))}
      ${tile('#/sales?month=' + d.month, rs(d.collected), 'Money collected')}
      ${tile('#/expenses?month=' + d.month, rs(d.expenses), 'Expenses')}
      ${tile('#/shops?sort=balance', rs(d.outstanding), 'Total balance to collect now', 'warn')}
    </div>
    <h3>Sales by person</h3>
    ${
      d.people.length
        ? table(
            '<th>Name</th><th class="num">Sales</th><th class="num">Orders taken</th><th class="num">Deliveries</th><th class="num">Collected</th>',
            d.people.map((p) => `<tr><td>${esc(p.name)}</td><td class="num"><b>${rs(p.sales)}</b></td><td class="num">${p.taken_count}</td><td class="num">${p.delivered_count}</td><td class="num">${rs(p.collected)}</td></tr>`).join('')
          ) + '<p class="muted small">Sales = delivered orders that this person took.</p>'
        : '<p class="muted">No staff yet.</p>'
    }
    <h3>Sales by brand</h3>
    ${brands.size ? table('<th>Brand</th><th class="num">Sales</th>', [...brands].map(([b, v]) => `<tr><td>${esc(b)}</td><td class="num">${rs(v)}</td></tr>`).join('')) : '<p class="muted">No sales in this month.</p>'}
    ${
      d.products.length
        ? '<h3>Sales by product</h3>' +
          table('<th>Product</th><th class="num">Boxes</th><th class="num">Sales</th>', d.products.map((p) => `<tr><td>${esc(p.brand)} ${esc(p.pack)}</td><td class="num">${num(p.qty)}</td><td class="num">${rs(p.amount)}</td></tr>`).join(''))
        : ''
    }
    ${
      d.shops.length
        ? '<h3>Top customers</h3>' +
          table('<th>Customer</th><th class="num">Orders</th><th class="num">Sales</th>', d.shops.map((s) => `<tr><td><a href="#/shop/${s.id}">${esc(s.name)}</a></td><td class="num">${s.orders}</td><td class="num">${rs(s.amount)}</td></tr>`).join(''))
        : ''
    }
    ${
      d.days.length
        ? '<h3>Day by day</h3>' +
          table('<th>Date</th><th class="num">Sales</th><th class="num">Collected</th>', d.days.map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="num">${rs(x.sales)}</td><td class="num">${rs(x.collected)}</td></tr>`).join(''))
        : ''
    }`;
};

const ATT = { present: 'Present', half: 'Half day', absent: 'Absent', leave: 'Leave' };
const HIRED_FROM = ['WorkIndia', 'Reference', 'Walk-in', 'Other'];

VIEWS.staff = async () => {
  let list = [];
  const routeChecks = (ids) =>
    S.boot.routes.length
      ? S.boot.routes.map((r) => `<label class="check"><input type="checkbox" name="u-route" value="${r.id}"${ids.includes(r.id) ? ' checked' : ''}>${esc(r.name)}</label>`).join('')
      : '<p class="muted">No routes yet. Add them in More → Routes.</p>';
  const checkedRoutes = () => $$('input[name=u-route]:checked').map((i) => +i.value);
  Object.assign(ACT, {
    editUser: (el) => {
      const u = list.find((x) => x.id === +el.dataset.id) || { name: '', mobile: '', role: 'executive', active: 1, route_ids: [] };
      sheet(`<h3>${u.id ? 'Edit staff' : 'New staff'}</h3>
        <label class="f" for="u-name">Name</label><input id="u-name" value="${esc(u.name)}">
        <label class="f" for="u-mobile">Mobile number (used for login)</label><input id="u-mobile" type="tel" inputmode="numeric" maxlength="10" value="${esc(u.mobile)}">
        <label class="f" for="u-role">Role</label><select id="u-role">${options([{ id: 'executive', name: 'Executive' }, { id: 'manager', name: 'Manager' }, { id: 'admin', name: 'Admin' }], u.role)}</select>
        <label class="f" for="u-pin">${u.id ? 'New PIN (leave empty to keep the old one)' : 'PIN (6 numbers)'}</label><input id="u-pin" class="pin" type="text" inputmode="numeric" maxlength="6" autocomplete="off" data-input="digits">
        <label class="f" for="u-from">Hired from</label><select id="u-from">${options(HIRED_FROM.map((x) => ({ id: x, name: x })), u.hired_from, 'Not filled')}</select>
        <label class="f" for="u-joined">Joining date</label><input id="u-joined" type="date" max="${S.boot.today}" value="${esc(u.joined_on || (u.id ? '' : S.boot.today))}">
        <label class="f">Routes</label>${routeChecks(u.route_ids)}
        ${u.id ? `<label class="check"><input type="checkbox" id="u-active"${u.active ? ' checked' : ''}>Working with us (untick to block login)</label>` : ''}
        <div class="btns"><button class="btn big" data-act="saveUser" data-id="${u.id || ''}">Save</button></div>`);
    },
    saveUser: async (el) => {
      const body = { name: $('#u-name').value, mobile: $('#u-mobile').value, role: $('#u-role').value, pin: $('#u-pin').value, hired_from: $('#u-from').value, joined_on: $('#u-joined').value, route_ids: checkedRoutes() };
      if (el.dataset.id) await api('PUT', `/users/${el.dataset.id}`, { ...body, active: $('#u-active').checked });
      else await api('POST', '/users', body);
      closeSheet();
      toast('Saved');
      refresh();
    },
    editRoutes: (el) => {
      const u = list.find((x) => x.id === +el.dataset.id);
      sheet(`<h3>Routes of ${esc(u.name)}</h3>${routeChecks(u.route_ids)}
        <div class="btns"><button class="btn big" data-act="saveRoutes" data-id="${u.id}">Save</button></div>`);
    },
    saveRoutes: async (el) => {
      await api('PUT', `/users/${el.dataset.id}/routes`, { route_ids: checkedRoutes() });
      closeSheet();
      toast('Saved');
      refresh();
    },
  });
  list = (await api('GET', '/users')).list;
  const routeName = (id) => S.boot.routes.find((r) => r.id === id)?.name;
  return `${isAdmin() ? '<div class="btns"><button class="btn" data-act="editUser">+ New staff</button></div>' : ''}
    ${list
      .map(
        (u) => `<div class="card">
          <div class="row"><b class="grow">${esc(u.name)}</b>
            ${!u.active ? '<span class="tag cancelled">Blocked</span>' : u.role === 'admin' ? '' : `<span class="tag ${u.attendance || 'pending'}">${ATT[u.attendance] || 'Not marked'}</span>`}</div>
          <div class="muted">${ROLE_NAME[u.role]} · ${tel(u.mobile, '')}</div>
          ${u.joined_on || u.hired_from ? `<div class="muted small">${esc(dots(u.joined_on ? 'Joined ' + fmtDate(u.joined_on) : '', u.hired_from ? 'from ' + u.hired_from : ''))}</div>` : ''}
          ${u.role === 'executive' ? `<div class="muted">Routes: ${u.route_ids.map(routeName).filter(Boolean).map(esc).join(', ') || '<span class="red">none given</span>'}</div>` : ''}
          <div class="btns">
            ${isAdmin() ? `<button class="btn light sm" data-act="editUser" data-id="${u.id}">Edit</button>` : u.role === 'executive' ? `<button class="btn light sm" data-act="editRoutes" data-id="${u.id}">Change routes</button>` : ''}
            <a class="btn light sm" href="#/orders?tab=history&user=${u.id}">Orders</a>
          </div>
        </div>`
      )
      .join('')}`;
};

VIEWS.attendance = async (parts, query) => {
  let d;
  Object.assign(ACT, {
    date: (el) => el.value && go(`#/attendance?date=${el.value}`),
    mark: async (el) => {
      await api('PUT', '/attendance', { user_id: el.dataset.id, date: d.date, status: el.dataset.val });
      refresh();
    },
  });
  d = await api('GET', '/attendance' + (query.date ? '?date=' + encodeURIComponent(query.date) : ''));
  return `<div class="filters"><input type="date" data-change="date" value="${d.date}" max="${d.today}" aria-label="Date"></div>
    ${
      d.list.length
        ? d.list
            .map(
              (u) => `<div class="card"><div class="row"><b class="grow">${esc(u.name)}</b><span class="muted small">${u.in_time ? 'In: ' + esc(u.in_time) : ''}</span></div>
                <div class="chips">${Object.entries(ATT).map(([v, t]) => `<button class="chip${u.status === v ? ' on' : ''}" data-act="mark" data-id="${u.id}" data-val="${v}">${t}</button>`).join('')}</div></div>`
            )
            .join('')
        : '<div class="empty">No staff yet.</div>'
    }
    ${
      d.month.length
        ? `<h3>${MONTHS[+d.date.slice(5, 7) - 1]} ${d.date.slice(0, 4)} – full month</h3>
          <div class="table-wrap"><table><tr><th>Name</th><th class="num">Present</th><th class="num">Half</th><th class="num">Absent</th><th class="num">Leave</th></tr>
          ${d.month.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${m.present}</td><td class="num">${m.half}</td><td class="num">${m.absent}</td><td class="num">${m.leave}</td></tr>`).join('')}</table></div>`
        : ''
    }`;
};

VIEWS.routes = async () => {
  let list = [];
  Object.assign(ACT, {
    editRoute: (el) => {
      const r = list.find((x) => x.id === +el.dataset.id) || { name: '', active: 1 };
      sheet(`<h3>${r.id ? 'Edit route' : 'New route'}</h3>
        <label class="f" for="rt-name">Route name</label><input id="rt-name" value="${esc(r.name)}">
        ${r.id ? `<label class="check"><input type="checkbox" id="rt-active"${r.active ? ' checked' : ''}>In use</label>` : ''}
        <div class="btns"><button class="btn big" data-act="saveRoute" data-id="${r.id || ''}">Save</button></div>`);
    },
    saveRoute: async (el) => {
      if (el.dataset.id) await api('PUT', `/routes/${el.dataset.id}`, { name: $('#rt-name').value, active: $('#rt-active').checked });
      else await api('POST', '/routes', { name: $('#rt-name').value });
      closeSheet();
      await loadBoot();
      toast('Saved');
      refresh();
    },
  });
  list = (await api('GET', '/routes')).list;
  return `<div class="btns"><button class="btn" data-act="editRoute">+ New route</button></div>
    ${
      list.length
        ? list
            .map(
              (r) => `<div class="card row"><div class="grow"><b>${esc(r.name)}</b>${r.active ? '' : ' <span class="tag cancelled">Not in use</span>'}
                <div class="muted">${plural(r.shops, 'customer')} · ${r.staff ? esc(r.staff) : '<span class="red">no executive</span>'}</div></div>
                <button class="btn light sm" data-act="editRoute" data-id="${r.id}">Edit</button></div>`
            )
            .join('')
        : '<div class="empty">No routes yet. Add your first route, then give it to an executive in Staff.</div>'
    }`;
};

VIEWS.products = async () => {
  Object.assign(ACT, {
    saveNormal: async () => {
      await api('PUT', '/products/rates', { rates: Object.fromEntries($$('[data-rate]').map((i) => [i.dataset.rate, i.value])) });
      await loadBoot();
      toast('Rates saved');
      refresh();
    },
    newBrand: () =>
      sheet(`<h3>New brand</h3><label class="f" for="nb-name">Brand name</label><input id="nb-name">
        <div class="btns"><button class="btn big" data-act="saveBrand">Save</button></div>`),
    saveBrand: async () => {
      await api('POST', '/brands', { name: $('#nb-name').value });
      closeSheet();
      await loadBoot();
      toast('Brand added');
      refresh();
    },
    newPack: async () => {
      const mats = (await api('GET', '/stock')).materials;
      sheet(`<h3>New box type</h3>
        <label class="f" for="np-name">Name (example: 2 kg Box)</label><input id="np-name">
        <label class="f" for="np-unit">Box or bag</label><select id="np-unit"><option>Box</option><option>Bag</option></select>
        <label class="f" for="np-pieces">Total pieces in one box / bag</label><input id="np-pieces" type="number" inputmode="numeric" min="1">
        <label class="f" for="np-detail">Details (example: 12 packs x 10 pieces)</label><input id="np-detail">
        <label class="f" for="np-mat">Which bottle is used</label><select id="np-mat">${options(mats, '', 'None')}</select>
        <div class="btns"><button class="btn big" data-act="savePack">Save</button></div>`);
    },
    savePack: async () => {
      await api('POST', '/packs', { name: $('#np-name').value, unit: $('#np-unit').value, pieces: $('#np-pieces').value, detail: $('#np-detail').value, material_id: $('#np-mat').value });
      closeSheet();
      await loadBoot();
      toast('Box type added');
      refresh();
    },
  });
  await loadBoot();
  return `<p class="muted">Normal rate is used for every customer that has no special rate. Special rates are set inside each customer.</p>
    <div class="btns"><button class="btn light" data-act="newBrand">+ New brand</button><button class="btn light" data-act="newPack">+ New box type</button></div>
    ${S.boot.brands
      .map(
        (b) => `<h3>${esc(b.name)}</h3><div class="card">${S.boot.products
          .filter((p) => p.brand_id === b.id)
          .map(
            (p) => `<div class="row" style="padding:5px 0"><label class="grow" for="n-${p.id}">${esc(p.pack)}<div class="muted small">${num(p.pieces)} pieces</div></label>
              <input id="n-${p.id}" style="width:120px" type="number" inputmode="decimal" min="0" data-rate="${p.id}" value="${p.default_rate || ''}" placeholder="₹"></div>`
          )
          .join('')}</div>`
      )
      .join('')}
    <div class="sticky-foot"><button class="btn big" data-act="saveNormal">Save normal rates</button></div>`;
};

VIEWS.lost = async () => {
  ACT.reactivate = async (el) => {
    await api('POST', `/customers/${el.dataset.id}/reactivate`);
    toast('Customer is active again');
    refresh();
  };
  const d = await api('GET', '/customers?status=lost');
  if (!d.list.length) return '<div class="empty">✓ No customer has left us.</div>';
  return d.list
    .map(
      (c) => `<div class="card">
        <div class="row"><a class="grow" href="#/shop/${c.id}"><b>${esc(c.name)}</b></a><span class="muted small">${fmtDate(c.lost_at)}</span></div>
        <div class="muted">${esc(dots(routeText(c.route, c.type), c.owner))}</div>
        <div><b>Reason:</b> ${esc(c.lost_reasons || '')}${c.lost_note ? ' – ' + esc(c.lost_note) : ''}</div>
        <div class="muted small">Marked by ${esc(c.lost_by_name || '')}</div>
        ${c.balance > 0 ? `<div class="red"><b>Balance to collect: ${rs(c.balance)}</b></div>` : ''}
        <div class="btns">${tel(c.mobile)}<button class="btn light" data-act="reactivate" data-id="${c.id}">Bring back</button></div>
      </div>`
    )
    .join('');
};

// ---------- IndiaMART enquiries ----------
const LEADS = new Map(); // enquiries on screen, to fill the "add customer" form

VIEWS.leads = async (parts, query) => {
  const done = query.tab === 'done';
  Object.assign(ACT, {
    syncLeads: async () => {
      const r = await api('POST', '/leads/sync');
      toast(r.added ? `${r.added} new ${r.added === 1 ? 'enquiry' : 'enquiries'} came` : 'No new enquiries');
      refresh();
    },
    closeLead: async (el) => {
      await api('POST', `/leads/${el.dataset.id}/close`, { customer_id: el.dataset.customer || '' });
      toast('Done');
      refresh();
    },
  });
  const d = await api('GET', '/leads' + (done ? '?tab=done' : ''));
  LEADS.clear();
  for (const l of d.list) LEADS.set(l.id, l);

  let h = `<div class="tabs"><a href="#/leads" class="${done ? '' : 'on'}">New</a><a href="#/leads?tab=done" class="${done ? 'on' : ''}">Done</a></div>`;
  if (!d.on) {
    return h + `<div class="empty">IndiaMART is not connected yet.<br>${isAdmin() ? 'Add the IndiaMART key in <a href="#/settings">Settings</a>.' : 'The admin adds the IndiaMART key in Settings.'}</div>`;
  }
  if (d.problem) h += `<div class="banner bad">${esc(d.problem)}</div>`;
  h += `<div class="btns"><button class="btn light" data-act="syncLeads">Check now</button></div>
    <p class="muted small">New enquiries come by themselves every 10 minutes.${d.last ? ' Last checked: ' + fmtAt(d.last) : ''}</p>`;
  if (!d.list.length) return h + `<div class="empty">${done ? 'Nothing here yet.' : '✓ No new enquiries.'}</div>`;
  return (
    h +
    d.list
      .map(
        (l) => `<div class="card">
          <div class="row"><b class="grow">${esc(l.company || l.name || 'No name')}</b><span class="muted small">${fmtAt(l.received_at)}</span></div>
          <div class="muted">${esc(dots(l.company ? l.name : '', l.city))}</div>
          ${l.product ? `<div><b>Wants:</b> ${esc(l.product)}</div>` : ''}
          ${l.message ? `<div class="pre small">${esc(l.message)}</div>` : ''}
          ${l.status === 'customer' && l.customer_id ? `<div class="btns"><a class="btn light sm" href="#/shop/${l.customer_id}">Open customer</a></div>` : ''}
          ${l.status === 'closed' ? '<div class="muted small">Marked as not useful</div>' : ''}
          ${
            l.status !== 'new'
              ? ''
              : `<div class="btns">${l.mobile ? tel(l.mobile) : ''}</div>
                 <div class="btns">${
                   l.existing_id
                     ? `<a class="btn light sm" href="#/shop/${l.existing_id}">Already a customer – open</a><button class="btn light sm" data-act="closeLead" data-id="${l.id}" data-customer="${l.existing_id}">Done</button>`
                     : `<a class="btn sm" href="#/shopform?type=shop&lead=${l.id}">Add as shop</a><a class="btn sm" href="#/shopform?type=customer&lead=${l.id}">Add as customer</a>
                        <button class="btn danger sm" data-act="closeLead" data-id="${l.id}">Not useful</button>`
                 }</div>`
          }
        </div>`
      )
      .join('')
  );
};

VIEWS.settings = async () => {
  const d = await api('GET', '/settings');
  ACT.saveSettings = async () => {
    await api('PUT', '/settings', {
      business_name: $('#set-name').value,
      business_address: $('#set-address').value,
      business_phone: $('#set-phone').value,
      indiamart_key: $('#set-im').value,
      indiamart_off: $('#set-im-off')?.checked || false,
    });
    await loadBoot();
    toast('Saved');
    render();
  };
  return `<form data-submit="saveSettings">
    <label class="f" for="set-name">Business name (shown on top of the app and on the bill)</label><input id="set-name" value="${esc(S.business)}" required>
    <label class="f" for="set-address">Address (printed on the bill)</label><textarea id="set-address">${esc(S.boot.settings.business_address)}</textarea>
    <label class="f" for="set-phone">Phone number (printed on the bill)</label><input id="set-phone" type="tel" value="${esc(S.boot.settings.business_phone)}">
    <h3>IndiaMART</h3>
    <p class="muted">${d.indiamart_on ? '✓ Connected. New enquiries come into the app by themselves.' : 'Not connected. Paste the CRM key from IndiaMART (Lead Manager → Settings → CRM integration / Pull API) to bring enquiries into the app.'}</p>
    ${d.indiamart_error ? `<div class="banner bad">${esc(d.indiamart_error)}</div>` : ''}
    <label class="f" for="set-im">${d.indiamart_on ? 'New key (leave empty to keep the saved one)' : 'IndiaMART CRM key'}</label><input id="set-im" type="text" autocomplete="off">
    ${d.indiamart_on ? '<label class="check"><input type="checkbox" id="set-im-off">Disconnect IndiaMART</label>' : ''}
    <div class="btns"><button class="btn big" type="submit">Save</button></div></form>`;
};

// Executives must not open manager pages even by typing the address (the server also refuses).
for (const name of ['sales', 'staff', 'attendance', 'routes', 'products', 'lost', 'settings', 'count', 'leads']) {
  const view = VIEWS[name];
  VIEWS[name] = (parts, query) => {
    if (!isStaff() || (['products', 'settings'].includes(name) && !isAdmin())) return '<div class="empty">This page is only for the manager.</div>';
    return view(parts, query);
  };
}
