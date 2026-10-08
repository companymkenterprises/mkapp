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
      ${
        // The total sales money of the month is only for the admin; the manager sees the number of orders.
        isAdmin()
          ? tile(`#/orders?tab=history&from=${d.from}&to=${d.to}&status=delivered`, rs(d.sales), 'Sales (delivered)', '', plural(d.orders, 'order'))
          : tile(`#/orders?tab=history&from=${d.from}&to=${d.to}&status=delivered`, d.orders, 'Orders delivered')
      }
      ${tile('#/sales?month=' + d.month, rs(d.collected), 'Money collected')}
      ${tile('#/expenses?month=' + d.month, rs(d.expenses), 'Expenses')}
      ${tile('#/team', rs(d.salaries), 'Salary paid')}
      ${tile('#/returns?month=' + d.month, rs(d.returns), 'Returned stock')}
      ${tile('#/shops?sort=balance', rs(d.outstanding), 'Total balance to collect now', 'warn')}
    </div>
    ${
      isAdmin()
        ? `<h3>Earnings of the month</h3>
    <div class="card"><ul class="items">
      <li><span>Total sales</span><span>${rs(d.sales)}</span></li>
      <li><span>− Returned stock</span><span>${rs(d.returns)}</span></li>
      <li><span>− Expenses</span><span>${rs(d.expenses)}</span></li>
      <li><span>− Salary paid</span><span>${rs(d.salaries)}</span></li>
      <li><b>= Earnings</b><b class="${d.earnings < 0 ? 'red' : ''}">${d.earnings < 0 ? '− ' : ''}${rs(Math.abs(d.earnings))}</b></li>
    </ul></div>`
        : ''
    }
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
          table('<th>Product</th><th class="num">Boxes</th><th class="num">Sales</th>', d.products.map((p) => `<tr><td>${esc(p.brand)} ${esc(p.pack)}</td><td class="num">${num(p.qty)}${p.pieces ? `<div class="muted small">+ ${num(p.pieces)} ${p.unit === 'Bag' ? 'packets' : 'pcs'}</div>` : ''}</td><td class="num">${rs(p.amount)}</td></tr>`).join(''))
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
  const tickedRoles = () => $$('input[name=u-role]:checked').map((i) => i.value);
  Object.assign(ACT, {
    editUser: (el) => {
      const u = list.find((x) => x.id === +el.dataset.id) || { name: '', mobile: '', role: 'executive', active: 1, route_ids: [] };
      sheet(`<h3>${u.id ? 'Edit staff' : 'New staff'}</h3>
        <label class="f" for="u-name">Name</label><input id="u-name" value="${esc(u.name)}">
        <label class="f" for="u-mobile">Mobile number for login (leave empty = no login)</label><input id="u-mobile" type="tel" inputmode="numeric" maxlength="10" value="${esc(u.mobile)}">
        <label class="f">Role (tick one or more)</label>
        ${ROLE_LIST.map((r) => `<label class="check"><input type="checkbox" name="u-role" value="${r}" data-change="roleChanged"${rolesOf(u).includes(r) ? ' checked' : ''}>${ROLE_NAME[r]}</label>`).join('')}
        <label class="f" for="u-pin">${u.id && u.mobile ? 'New PIN (leave empty to keep the old one)' : 'PIN (6 numbers) – only with a mobile number'}</label><input id="u-pin" class="pin" type="text" inputmode="numeric" maxlength="6" autocomplete="off" data-input="digits">
        <label class="f" for="u-email">Email address (if any)</label><input id="u-email" type="email" inputmode="email" autocomplete="off" value="${esc(u.email || '')}">
        <div id="u-routes-box"${rolesOf(u).join() === 'admin' ? ' hidden' : ''}>
        <label class="f" for="u-from">Hired from</label><select id="u-from">${options(HIRED_FROM.map((x) => ({ id: x, name: x })), u.hired_from, 'Not filled')}</select>
        <label class="f" for="u-joined">Joining date</label><input id="u-joined" type="date" max="${S.boot.today}" value="${esc(u.joined_on || (u.id ? '' : S.boot.today))}">
        <label class="f" for="u-per">Salary is paid</label><select id="u-per">${options(PAY_PER, u.per || 'month')}</select>
        <label class="f" for="u-salary">Salary for one month or one week (₹)</label><input id="u-salary" type="number" inputmode="decimal" min="0" value="${u.salary || ''}" placeholder="Leave empty if not decided">
        <label class="f" for="u-ot">Overtime pay for one hour (₹)</label><input id="u-ot" type="number" inputmode="decimal" min="0" value="${u.ot_rate || ''}">
        ${u.id ? '<p class="muted small">A new salary counts from this month. Earlier months keep the old salary.</p>' : ''}
        <div id="u-routes-only"${rolesOf(u).some((r) => r === 'manager' || r === 'executive') ? '' : ' hidden'}><label class="f">Routes</label>${routeChecks(u.route_ids)}</div></div>
        ${u.id ? `<label class="check"><input type="checkbox" id="u-active"${u.active ? ' checked' : ''}>${u.left_on ? 'Working with us again (tick if they came back)' : 'Working with us (untick to block login)'}</label>` : ''}
        <div class="btns"><button class="btn big" data-act="saveUser" data-id="${u.id || ''}">Save</button></div>
        ${u.id && u.id !== S.user.id ? `<div class="btns"><button class="btn danger sm" data-act="delUser" data-id="${u.id}" data-name="${esc(u.name)}" data-role="${ROLE_NAME[u.role].toLowerCase()}">Delete this staff member</button></div>` : ''}`);
    },
    // Someone who is only admin has just name, mobile, email and PIN. Hiring details and salary are asked for every other role;
    // routes for a manager or an executive.
    roleChanged: () => {
      const roles = tickedRoles();
      $('#u-routes-box').hidden = roles.join() === 'admin';
      $('#u-routes-only').hidden = !roles.some((r) => r === 'manager' || r === 'executive');
    },
    delUser: (el) =>
      askDelete(`Delete ${el.dataset.name}?`, `The login is removed. If orders, money or other entries are saved in their name, those entries stay and show the name as "ex ${el.dataset.role} ${el.dataset.name}".`, async () => {
        const r = await api('POST', `/users/${el.dataset.id}/delete`);
        await loadBoot();
        refresh();
        // shown after the "Deleted" message of the confirm box
        if (r.left) setTimeout(() => toast(`Login removed. Old entries now show "${r.name}"`), 50);
      }),
    saveUser: async (el) => {
      const roles = tickedRoles();
      if (!roles.length) throw new Error('Tick at least one role');
      const body = { name: $('#u-name').value, mobile: $('#u-mobile').value, email: $('#u-email').value, roles, pin: $('#u-pin').value, hired_from: $('#u-from').value, joined_on: $('#u-joined').value, salary: $('#u-salary').value, per: $('#u-per').value, ot_rate: $('#u-ot').value, route_ids: checkedRoutes() };
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
  const routeNames = (ids) => (hasAllRoutes(ids.filter(routeName).length) ? 'All routes' : ids.map(routeName).filter(Boolean).map(esc).join(', '));
  const sunday = isSunday(S.boot.today);
  return `${isAdmin() ? '<div class="btns"><button class="btn" data-act="editUser">+ New staff</button></div>' : ''}
    ${searchBox('Search name, mobile or route')}
    ${quickChips([['', 'All'], ['executive', 'Executives'], ['manager', 'Managers'], ['factory', 'Factory staff'], ['admin', 'Admin'], ['blocked', 'Blocked'], ['left', 'Left us']])}
    <div id="quick-list">${list
      .map(
        (u) => `<div class="card" data-item data-k="${u.left_on ? 'left' : rolesOf(u).join('|') + (u.active ? '' : '|blocked')}">
          <div class="row"><b class="grow">${esc(u.name)}</b>
            ${u.left_on ? `<span class="tag cancelled">Ex ${ROLE_NAME[u.role].toLowerCase()}</span>` : !u.active ? '<span class="tag cancelled">Blocked</span>' : rolesOf(u).join() === 'admin' ? '' : !u.attendance && sunday ? '<span class="tag present">Sunday off</span>' : `<span class="tag ${u.attendance || 'pending'}">${ATT[u.attendance] || 'Not marked'}</span>`}</div>
          <div class="muted">${dots(roleNames(u), u.mobile ? tel(u.mobile, '') : 'no login')}</div>
          ${u.email ? `<div class="muted small">${esc(u.email)}</div>` : ''}
          ${u.joined_on || u.hired_from || u.left_on ? `<div class="muted small">${esc(dots(u.joined_on ? 'Joined ' + fmtDate(u.joined_on) : '', u.hired_from ? 'from ' + u.hired_from : '', u.left_on ? 'left on ' + fmtDate(u.left_on) : ''))}</div>` : ''}
          ${isAdmin() && rolesOf(u).join() !== 'admin' && u.salary ? `<div class="muted small">Salary ${rs(u.salary)} a ${u.per === 'week' ? 'week' : 'month'}</div>` : ''}
          ${rolesOf(u).includes('executive') ? `<div class="muted">Routes: ${routeNames(u.route_ids) || '<span class="red">none given</span>'}</div>` : ''}
          ${!rolesOf(u).includes('executive') && rolesOf(u).includes('manager') && u.route_ids.length ? `<div class="muted">Routes: ${routeNames(u.route_ids)}</div>` : ''}
          <div class="btns">
            ${isAdmin() ? `<button class="btn light sm" data-act="editUser" data-id="${u.id}">Edit</button>` : u.role === 'executive' ? `<button class="btn light sm" data-act="editRoutes" data-id="${u.id}">Change routes</button>` : ''}
            ${u.role === 'factory' ? '' : `<a class="btn light sm" href="#/orders?tab=history&user=${u.id}">Orders</a>`}
            ${isAdmin() && rolesOf(u).join() !== 'admin' ? `<a class="btn light sm" href="#/team/${u.id}">Work and salary</a>` : ''}
          </div>
        </div>`
      )
      .join('')}</div>`;
};

// ---------- team: work and salary of each person, counted from the joining date ----------
// The salary amount is for a month, or for a week (factory staff are often paid by the week).
const PAY_PER = [{ id: 'month', name: 'Every month' }, { id: 'week', name: 'Every week' }];
const monthName = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const pendingText = (p) =>
  !p.salary && !p.earned && !p.paid ? '<span class="muted">Salary not set</span>' : p.pending < 0 ? `<b>Paid in advance ${rs(-p.pending)}</b>` : p.pending > 0 ? `<b class="red">Salary pending ${rs(p.pending)}</b>` : '<b>✓ Salary fully paid</b>';
const teamRoutes = (p) => (hasAllRoutes(p.route_count) ? 'All routes' : p.routes);
const exTag = (p) => (p.left_on ? `<span class="tag cancelled">Ex ${ROLE_NAME[p.role].toLowerCase()}</span>` : '');

VIEWS.team = async (parts) => {
  if (parts[1]) return teamMember(+parts[1]);
  const d = await api('GET', '/team');
  if (!d.list.length) return `<div class="empty">${isAdmin() ? 'No staff yet. Add them in More → Staff.' : 'No executive is on your routes yet.'}</div>`;
  const pending = d.list.reduce((s, p) => s + Math.max(0, p.pending), 0);
  return `<p class="muted">${isAdmin() ? 'Everyone who gets a salary.' : 'The executives on your routes and the factory staff.'} Everything is counted from the joining date.</p>
    <div class="tiles">${tile('#/team', rs(pending), 'Salary pending now', pending ? 'warn' : '')}${tile('#/team', String(d.list.filter((p) => !p.left_on).length), 'Working with us')}</div>
    ${searchBox('Search name, mobile or route')}
    ${quickChips([['', 'All'], ['pending', 'Salary pending'], ['executive', 'Executives'], ['factory', 'Factory staff'], ...(isAdmin() ? [['manager', 'Managers']] : []), ['left', 'Left us']])}
    <div id="quick-list">${d.list
      .map(
        (p) => `<a class="card" href="#/team/${p.id}" data-item data-k="${p.left_on ? 'left' : rolesOf(p).join('|')}${p.pending > 0 ? '|pending' : ''}">
          <div class="row"><b class="grow">${esc(p.name)}</b>${exTag(p)}</div>
          <div class="muted">${esc(dots(roleNames(p), teamRoutes(p), 'joined ' + fmtDate(p.since), p.left_on ? 'left ' + fmtDate(p.left_on) : ''))}</div>
          <div class="small">${esc(dots(plural(p.taken_count, 'order') + ' taken', plural(p.delivered_count, 'delivery').replace('deliverys', 'deliveries'), 'sales ' + rs(p.sales), 'collected ' + rs(p.collected)))}</div>
          <div class="small">${esc(dots(p.salary ? `Salary ${rs(p.salary)} a ${p.per === 'week' ? 'week' : 'month'}` : '', 'paid ' + rs(p.paid), p.ot_hours ? `overtime ${num(p.ot_hours)} h` : ''))}</div>
          <div>${pendingText(p)}</div>
          <div class="small">Company money with them: <b>${rs(p.money)}</b>${p.money_checked ? ` <span class="muted">· checked ${fmtDate(p.money_checked)}</span>` : ''}</div>
        </a>`
      )
      .join('')}</div>`;
};

async function teamMember(id) {
  let d;
  Object.assign(ACT, {
    paySalary: () =>
      sheet(`<h3>Salary paid to ${esc(d.person.name)}</h3>
        <p class="muted">${pendingText(d.person)}</p>
        <label class="f" for="sp-amount">Amount paid (₹)</label><input id="sp-amount" type="number" inputmode="decimal" min="1" value="${d.person.pending > 0 ? d.person.pending : ''}">
        <label class="f" for="sp-mode">How</label><select id="sp-mode">${options(S.boot.payModes.map((x) => ({ id: x, name: x })), 'Cash')}</select>
        <label class="f" for="sp-date">Date</label><input id="sp-date" type="date" max="${S.boot.today}" value="${S.boot.today}">
        <label class="f" for="sp-note">Note (if any)</label><input id="sp-note" placeholder="Example: advance, salary of March">
        <div class="btns"><button class="btn big" data-act="savePaySalary">Save</button></div>`),
    savePaySalary: async () => {
      await api('POST', `/team/${id}/pay`, { amount: $('#sp-amount').value, mode: $('#sp-mode').value, date: $('#sp-date').value, note: $('#sp-note').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
    changeSalary: () =>
      sheet(`<h3>Salary of ${esc(d.person.name)}</h3>
        <label class="f" for="cs-per">Salary is paid</label><select id="cs-per">${options(PAY_PER, d.person.per || 'month')}</select>
        <label class="f" for="cs-salary">Salary for one month or one week (₹)</label><input id="cs-salary" type="number" inputmode="decimal" min="0" value="${d.person.salary || ''}">
        <label class="f" for="cs-ot">Overtime pay for one hour (₹)</label><input id="cs-ot" type="number" inputmode="decimal" min="0" value="${d.person.ot_rate || ''}">
        <p class="muted small">A new salary counts from this month. Earlier months keep the old salary.</p>
        <div class="btns"><button class="btn big" data-act="saveSalary">Save</button></div>`),
    saveSalary: async () => {
      await api('PUT', `/team/${id}/salary`, { salary: $('#cs-salary').value, per: $('#cs-per').value, ot_rate: $('#cs-ot').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
    delSalary: (el) =>
      askDelete('Delete this salary payment?', el.dataset.text, async () => {
        await api('POST', `/salary/${el.dataset.id}/delete`);
        refresh();
      }),
  });
  d = await api('GET', `/team/${id}`);
  const p = d.person;
  const m = d.thisMonth;
  const work = (x) => `<td class="num">${x.taken_count}</td><td class="num">${x.delivered_count}</td><td class="num">${rs(x.sales)}</td><td class="num">${rs(x.collected)}</td>`;
  return `<div class="row"><h2 class="grow">${esc(p.name)}</h2>${exTag(p)}</div>
    <p class="muted">${esc(dots(roleNames(p), teamRoutes(p), p.hired_from ? 'from ' + p.hired_from : ''))}<br>
      Joined ${fmtDate(p.since)}${p.left_on ? ' · left ' + fmtDate(p.left_on) : ''}</p>
    <div class="btns">${tel(p.mobile)}<a class="btn light" href="#/orders?tab=history&user=${p.id}">Orders</a></div>

    <h3>Salary</h3>
    <div class="tiles">
      ${tile(`#/team/${p.id}`, rs(p.earned + p.ot_pay), 'Earned since joining', '', p.ot_pay ? `with overtime ${rs(p.ot_pay)}` : '')}
      ${tile(`#/team/${p.id}`, rs(p.paid), 'Salary paid')}
      ${tile(`#/team/${p.id}`, rs(Math.abs(p.pending)), p.pending < 0 ? 'Paid in advance' : 'Salary pending', p.pending > 0 ? 'warn' : '')}
      ${tile(`#/team/${p.id}`, p.salary ? rs(p.salary) : 'Not set', p.per === 'week' ? 'Salary for a week' : 'Salary for a month', '', p.ot_rate ? `overtime ${rs(p.ot_rate)} an hour` : '')}
    </div>
    <div class="btns"><button class="btn" data-act="paySalary">+ Salary paid</button><button class="btn light" data-act="changeSalary">Change salary</button></div>
    ${
      p.week
        ? `<div class="banner ${p.week.pay + p.week.ot_pay - p.week.paid > 0 ? 'warn' : 'ok'}"><div><div class="small">This week (${fmtDate(p.week.from)} to today, ${plural(p.week.days, 'day')}${p.week.absent ? `, ${p.week.absent} absent` : ''}${p.week.half ? `, ${p.week.half} half` : ''})</div>
            <div class="balance">Earned ${rs(p.week.pay + p.week.ot_pay)} · paid ${rs(p.week.paid)}</div></div></div>`
        : ''
    }
    <p class="muted small">One day's pay = ${p.per === 'week' ? 'weekly salary ÷ 7' : 'monthly salary ÷ days in the month'}. Absent (without informing) = no pay, half day = half pay. Leave (approved) and all other days are paid. Counted up to today.</p>

    <h3>Company money</h3>
    <a class="banner ${p.money > 0 ? 'warn' : 'ok'}" href="#/money/${p.id}"><div><div class="small">Company money with ${esc(p.name)} now${p.money_checked ? ' · last checked ' + fmtDate(p.money_checked) : ' · never checked'}</div><div class="balance">${rs(p.money)}</div></div><span class="btn light sm">Open</span></a>

    <h3>Work</h3>
    <div class="table-wrap"><table><tr><th></th><th class="num">Orders taken</th><th class="num">Deliveries</th><th class="num">Sales</th><th class="num">Collected</th></tr>
      <tr><td>This month</td>${work(m)}</tr><tr><td><b>Since joining</b></td>${work(p)}</tr></table></div>
    <div class="table-wrap"><table><tr><th>Since joining</th><th class="num">Present</th><th class="num">Half</th><th class="num">Absent</th><th class="num">Leave</th><th class="num">Overtime</th></tr>
      <tr><td>Days</td><td class="num">${p.present}</td><td class="num">${p.half}</td><td class="num">${p.absent}</td><td class="num">${p.leave}</td><td class="num">${num(p.ot_hours)} h</td></tr></table></div>

    <h3>Month by month</h3>
    ${
      p.months.length
        ? `<div class="table-wrap"><table><tr><th>Month</th><th class="num">Absent</th><th class="num">Half</th><th class="num">Salary earned</th><th class="num">Overtime</th><th class="num">Paid</th></tr>
          ${p.months.map((x) => `<tr><td>${monthName(x.month)}<div class="muted small">${plural(x.days, 'day')}</div></td><td class="num">${x.absent}</td><td class="num">${x.half}</td><td class="num">${rs(x.pay)}</td><td class="num">${x.ot_hours ? `${num(x.ot_hours)} h<div class="muted small">${rs(x.ot_pay)}</div>` : '–'}</td><td class="num">${rs(x.paid)}</td></tr>`).join('')}</table></div>`
        : '<p class="muted">Nothing yet.</p>'
    }

    <h3>Salary paid</h3>
    ${
      d.payments.length
        ? `<div class="table-wrap"><table><tr><th>Date</th><th class="num">Amount</th><th>How</th>${isAdmin() ? '<th></th>' : ''}</tr>
          ${d.payments
            .map(
              (x) => `<tr><td>${fmtDate(x.date)}${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}</td><td class="num">${rs(x.amount)}</td><td>${esc(x.mode)}</td>
                ${isAdmin() ? `<td><button class="btn danger sm" data-act="delSalary" data-id="${x.id}" data-text="${esc(`${rs(x.amount)} paid to ${p.name} on ${fmtDate(x.date)}`)}">Delete</button></td>` : ''}</tr>`
            )
            .join('')}</table></div>`
        : '<p class="muted">No salary paid yet.</p>'
    }`;
}

// "09:42 am" as saved, back to "09:42" for the clock box.
const clock24 = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])m$/i.exec(String(t || '').trim());
  if (!m) return '';
  const h = (+m[1] % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

VIEWS.attendance = async (parts, query) => {
  let d;
  Object.assign(ACT, {
    date: (el) => el.value && go(`#/attendance?date=${el.value}`),
    // Leave asks why first. Half day (any day) and present today open a clock. Absent, and present on a past day, are saved at once.
    mark: async (el) => {
      if (el.dataset.val === 'leave') {
        return sheet(`<h3>Leave of ${esc(el.dataset.name)}</h3>
          <p class="muted">${fmtDate(d.date)} · Leave is with approval and is paid.</p>
          <label class="f" for="lv-note">Why did they take leave?</label><input id="lv-note" value="${esc(el.dataset.note || '')}" placeholder="Example: fever, approved by Imran">
          <div class="btns"><button class="btn big" data-act="saveLeave" data-id="${el.dataset.id}">Save leave</button></div>`);
      }
      // A clock opens to choose the coming-in time (the time now, or the one already saved).
      if (el.dataset.val === 'half' || (el.dataset.val === 'present' && d.date === d.today)) {
        const now = new Date();
        const hm = clock24(el.dataset.time) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        return sheet(`<h3>${ATT[el.dataset.val]} – ${esc(el.dataset.name)}</h3>
          <p class="muted">${fmtDate(d.date)}</p>
          <label class="f" for="at-time">Came in at</label><input id="at-time" type="time" value="${hm}">
          <div class="btns"><button class="btn big" data-act="saveMark" data-id="${el.dataset.id}" data-val="${el.dataset.val}">Mark ${ATT[el.dataset.val].toLowerCase()}</button></div>`);
      }
      // Absent, or present on a past day: no clock. The tapped button lights up at once; the saving goes on behind.
      $$('.chip', el.parentElement).forEach((c) => c.classList.toggle('on', c === el));
      await api('PUT', '/attendance', { user_id: el.dataset.id, date: d.date, status: el.dataset.val });
      refresh();
    },
    saveMark: async (el) => {
      if (!$('#at-time').value) throw new Error('Select the time');
      await api('PUT', '/attendance', { user_id: el.dataset.id, date: d.date, status: el.dataset.val, time: $('#at-time').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
    saveLeave: async (el) => {
      if ($('#lv-note').value.trim().length < 3) throw new Error('Write why they took leave');
      await api('PUT', '/attendance', { user_id: el.dataset.id, date: d.date, status: 'leave', note: $('#lv-note').value });
      closeSheet();
      toast('Leave saved');
      refresh();
    },
    overtime: (el) =>
      sheet(`<h3>Overtime of ${esc(el.dataset.name)}</h3>
        <p class="muted">${fmtDate(d.date)}</p>
        <label class="f" for="ot-hours">Extra hours worked (0 to remove)</label><input id="ot-hours" type="number" inputmode="decimal" min="0" max="16" step="0.5" value="${+el.dataset.hours || ''}">
        <div class="btns"><button class="btn big" data-act="saveOvertime" data-id="${el.dataset.id}">Save</button></div>`),
    saveOvertime: async (el) => {
      await api('PUT', '/attendance/overtime', { user_id: el.dataset.id, date: d.date, hours: $('#ot-hours').value || 0 });
      closeSheet();
      toast('Saved');
      refresh();
    },
  });
  d = await api('GET', '/attendance' + (query.date ? '?date=' + encodeURIComponent(query.date) : ''));
  return `<div class="filters"><input type="date" data-change="date" value="${d.date}" max="${d.today}" aria-label="Date"></div>
    ${isSunday(d.date) ? '<div class="banner ok">Sunday is a paid weekly off. Nobody needs to be marked; mark only someone who worked (for overtime).</div>' : ''}
    ${
      d.list.length
        ? searchBox('Search name') +
          '<div id="quick-list">' +
          d.list
            .map(
              (u) => `<div class="card" data-item><div class="row"><b class="grow">${esc(u.name)}</b><span class="muted small">${u.in_time ? 'Came in: ' + esc(u.in_time) : ''}</span></div>
                ${u.status === 'leave' && u.note ? `<div class="muted small">Leave note: ${esc(u.note)}</div>` : ''}
                <div class="chips">${Object.entries(ATT).map(([v, t]) => `<button class="chip${u.status === v ? ' on' : ''}" data-act="mark" data-id="${u.id}" data-val="${v}" data-name="${esc(u.name)}" data-note="${esc(u.note || '')}" data-time="${esc(u.in_time || '')}">${t}</button>`).join('')}</div>
                ${u.name_only ? '' : `<div class="btns"><button class="btn light sm" data-act="overtime" data-id="${u.id}" data-name="${esc(u.name)}" data-hours="${u.ot_hours}">${u.ot_hours ? `Overtime: ${num(u.ot_hours)} h` : '+ Overtime'}</button></div>`}</div>`
            )
            .join('') +
          '</div>'
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
        <div class="btns"><button class="btn big" data-act="saveRoute" data-id="${r.id || ''}">Save</button></div>
        ${r.id && isAdmin() ? `<div class="btns"><button class="btn danger sm" data-act="delRoute" data-id="${r.id}" data-name="${esc(r.name)}">Delete this route</button></div>` : ''}`);
    },
    delRoute: (el) =>
      askDelete(`Delete the route ${el.dataset.name}?`, 'Only possible when no customer is on this route.', async () => {
        await api('POST', `/routes/${el.dataset.id}/delete`);
        await loadBoot();
        refresh();
      }),
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
        ? searchBox('Search route or executive') +
          '<div id="quick-list">' +
          list
            .map(
              (r) => `<div class="card row" data-item><div class="grow"><b>${esc(r.name)}</b>${r.active ? '' : ' <span class="tag cancelled">Not in use</span>'}
                <div class="muted">${plural(r.shops, 'customer')} · ${r.staff ? esc(r.staff) : '<span class="red">no executive</span>'}</div></div>
                <button class="btn light sm" data-act="editRoute" data-id="${r.id}">Edit</button></div>`
            )
            .join('') +
          '</div>'
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
        <label class="f" for="np-pieces">Pieces in one box. For a bag: packets in one bag</label><input id="np-pieces" type="number" inputmode="numeric" min="1">
        <label class="f" for="np-detail">Details (example: 12 packs x 10 pieces)</label><input id="np-detail">
        <label class="f" for="np-mat">Which bottle is used</label><select id="np-mat">${options(mats, '', 'None')}</select>
        <label class="f" for="np-uses">Only for a bag: pouches used for one bag</label><input id="np-uses" type="number" inputmode="numeric" min="1" placeholder="Example: 500">
        <div class="btns"><button class="btn big" data-act="savePack">Save</button></div>`);
    },
    savePack: async () => {
      await api('POST', '/packs', { name: $('#np-name').value, unit: $('#np-unit').value, pieces: $('#np-pieces').value, detail: $('#np-detail').value, material_id: $('#np-mat').value, material_qty: $('#np-uses').value });
      closeSheet();
      await loadBoot();
      toast('Box type added');
      refresh();
    },
    // A drum is sold whole. Only its size in kg is asked: "20 kg Drum", "25 kg Drum"...
    newDrum: () =>
      sheet(`<h3>New drum size</h3>
        <label class="f" for="nd-kg">How many kg is in one drum?</label><input id="nd-kg" type="number" inputmode="decimal" min="1" placeholder="Example: 20 or 25">
        <p class="muted small">The drum is added under every brand. Then type its rate here, or inside a customer.</p>
        <div class="btns"><button class="btn big" data-act="saveDrum">Save</button></div>`),
    saveDrum: async () => {
      const kg = Number($('#nd-kg').value);
      if (!(kg > 0)) throw new Error('Enter how many kg is in one drum');
      await api('POST', '/packs', { name: `${kg} kg Drum`, unit: 'Drum', pieces: 1, detail: `1 drum of ${kg} kg` });
      closeSheet();
      await loadBoot();
      toast(`${kg} kg Drum added`);
      refresh();
    },
    // Admin: a brand, box type or drum size added by mistake.
    delBrand: (el) =>
      askDelete(`Remove the brand ${el.dataset.name}?`, 'It is not offered any more. If orders, stock or rates already use it, those old entries stay as they are.', async () => {
        await api('POST', `/brands/${el.dataset.id}/delete`);
        await loadBoot();
        refresh();
      }),
    delPack: (el) =>
      askDelete(`Remove ${el.dataset.name}?`, 'It is removed under every brand and not offered any more. If orders, stock or rates already use it, those old entries stay as they are.', async () => {
        await api('POST', `/packs/${el.dataset.id}/delete`);
        await loadBoot();
        refresh();
      }),
  });
  await loadBoot();
  return `<p class="muted">Normal rate is used for every customer that has no rate of its own. A customer's own rates are set inside that customer.</p>
    <div class="btns"><button class="btn light" data-act="newBrand">+ New brand</button><button class="btn light" data-act="newPack">+ New box type</button><button class="btn light" data-act="newDrum">+ New drum size</button></div>
    ${S.boot.brands
      .map(
        (b) => `<div class="row"><h3 class="grow">${esc(b.name)}</h3><button class="btn danger sm" data-act="delBrand" data-id="${b.id}" data-name="${esc(b.name)}">Remove brand</button></div><div class="card">${S.boot.products
          .filter((p) => p.brand_id === b.id)
          .map(
            (p) => `<div class="row" style="padding:5px 0"><label class="grow" for="n-${p.id}">${esc(p.pack)}<div class="muted small">${packPieces(p)}</div></label>
              <input id="n-${p.id}" style="width:120px" type="number" inputmode="decimal" min="0" data-rate="${p.id}" value="${p.default_rate || ''}" placeholder="₹"></div>`
          )
          .join('')}</div>`
      )
      .join('')}
    <h3>Box types and drum sizes</h3>
    <div class="card">${S.boot.packs
      .map(
        (k) => `<div class="row" style="padding:5px 0"><div class="grow">${esc(k.name)}<div class="muted small">${packPieces(k)}</div></div>
          <button class="btn danger sm" data-act="delPack" data-id="${k.id}" data-name="${esc(k.name)}">Remove</button></div>`
      )
      .join('')}</div>
    <div class="sticky-foot"><button class="btn big" data-act="saveNormal">Save normal rates</button></div>`;
};

// Lost customers are called again. After the call: they came back, try again after some days, or lost for good.
VIEWS.lost = async () => {
  Object.assign(ACT, {
    reactivate: async (el) => {
      await api('POST', `/customers/${el.dataset.id}/reactivate`);
      toast('Customer is active again');
      refresh();
    },
    lostRetry: (el) =>
      sheet(`<h3>Call ${esc(el.dataset.name)} again later</h3>
        <label class="f">Call again after</label>
        <div class="chips">${[[3, '3 days'], [7, '1 week'], [15, '15 days'], [30, '1 month'], [60, '2 months'], [90, '3 months']]
          .map(([v, t]) => `<button class="chip" data-act="chip" data-target="lr-days" data-val="${v}">${t}</button>`)
          .join('')}</div>
        <input id="lr-days" type="number" inputmode="numeric" min="1" max="365" placeholder="Or type number of days">
        <label class="f" for="lr-note">What did they say? (if anything)</label>
        <textarea id="lr-note" placeholder="Example: will think about it, call after the festival"></textarea>
        <div class="btns"><button class="btn big" data-act="saveLostRetry" data-id="${esc(el.dataset.id)}">Save</button></div>`),
    saveLostRetry: async (el) => {
      if (!$('#lr-days').value) throw new Error('Select after how many days to call again');
      const r = await api('POST', `/customers/${el.dataset.id}/lost`, { action: 'retry', days: $('#lr-days').value, note: $('#lr-note').value });
      closeSheet();
      toast(`Saved. Call again on ${fmtDate(r.lost_retry_date)}`);
      refresh();
    },
    lostFinal: (el) =>
      sheet(`<h3>${esc(el.dataset.name)} is lost for good?</h3>
        <p class="muted">The customer will not come up for calling again. It stays in this list, and "Came back" still works later.</p>
        <label class="f" for="lf-note">Why? (if anything)</label>
        <textarea id="lf-note" placeholder="Example: shop closed, moved to another city"></textarea>
        <div class="btns"><button class="btn big danger" data-act="saveLostFinal" data-id="${esc(el.dataset.id)}">Yes, lost for good</button></div>`),
    saveLostFinal: async (el) => {
      await api('POST', `/customers/${el.dataset.id}/lost`, { action: 'final', note: $('#lf-note').value });
      closeSheet();
      toast('Saved');
      refresh();
    },
  });
  const d = await api('GET', '/customers?status=lost');
  if (!d.list.length) return '<div class="empty">✓ No customer has left us.</div>';
  const today = S.boot.today;
  const stateOf = (c) => (c.lost_final ? 'final' : c.lost_retry_date && c.lost_retry_date > today ? 'later' : 'call');
  const ORDER = { call: 0, later: 1, final: 2 };
  const list = d.list.map((c) => ({ ...c, state: stateOf(c) })).sort((a, b) => ORDER[a.state] - ORDER[b.state] || String(a.lost_retry_date || '').localeCompare(String(b.lost_retry_date || '')));
  const count = (s) => list.filter((c) => c.state === s).length;
  const TAG = { call: '<span class="tag late">Call now</span>', later: '', final: '<span class="tag final">Lost for good</span>' };
  return `<p class="muted">Call them again. After the call choose: came back, try again later, or lost for good.</p>
    ${searchBox('Search name, owner, mobile or reason')}
    ${quickChips([['', `All (${list.length})`], ['call', `To call now (${count('call')})`], ['later', `Call later (${count('later')})`], ['final', `Lost for good (${count('final')})`]])}
    <div id="quick-list">${list
      .map((c) => {
        const attrs = `data-id="${c.id}" data-name="${esc(c.name)}"`;
        return `<div class="card" data-item data-k="${c.state}">
        <div class="row"><a class="grow" href="#/shop/${c.id}"><b>${esc(c.name)}</b></a>${TAG[c.state]}</div>
        <div class="muted">${esc(dots(routeText(c.route, c.type), c.owner, 'lost on ' + fmtDate(c.lost_at)))}</div>
        <div><b>Reason:</b> ${esc(c.lost_reasons || '')}${c.lost_note ? ' – ' + esc(c.lost_note) : ''}</div>
        <div class="muted small">Marked by ${esc(c.lost_by_name || '')}</div>
        ${c.state === 'later' ? `<div class="small"><b>Call again on ${dayLabel(c.lost_retry_date)}</b>${c.lost_last_note ? ' – ' + esc(c.lost_last_note) : ''}</div>` : ''}
        ${c.state === 'final' && c.lost_last_note ? `<div class="small">${esc(c.lost_last_note)}</div>` : ''}
        ${c.balance > 0 ? `<div class="red"><b>Balance to collect: ${rs(c.balance)}</b></div>` : ''}
        <div class="btns">${tel(c.mobile)}<button class="btn" data-act="reactivate" ${attrs}>Came back</button></div>
        ${
          c.state === 'final'
            ? ''
            : `<div class="btns">
                <button class="btn light sm" data-act="lostRetry" ${attrs}>Try again later</button>
                <button class="btn danger sm" data-act="lostFinal" ${attrs}>Lost for good</button>
              </div>`
        }
      </div>`;
      })
      .join('')}</div>`;
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
    // An enquiry typed in by hand: seen on IndiaMART, or it came by phone.
    addLead: () =>
      sheet(`<h3>Add enquiry</h3>
        <label class="f" for="ld-company">Company or shop name</label><input id="ld-company" maxlength="100">
        <label class="f" for="ld-name">Name of the person</label><input id="ld-name" maxlength="100">
        <label class="f" for="ld-mobile">Mobile number (if any)</label><input id="ld-mobile" type="tel" inputmode="numeric" maxlength="10" data-input="digits">
        <label class="f" for="ld-city">City or area</label><input id="ld-city" maxlength="100">
        <label class="f" for="ld-product">What do they want?</label><input id="ld-product" maxlength="200" placeholder="Example: Ginger garlic paste 5 kg, 20 boxes">
        <label class="f" for="ld-message">Message (if any)</label><textarea id="ld-message" maxlength="1000"></textarea>
        <div class="btns"><button class="btn big" data-act="saveLead">Save enquiry</button></div>`),
    saveLead: async () => {
      if (!$('#ld-company').value.trim() && !$('#ld-name').value.trim()) throw new Error('Enter the name of the person or of the company');
      await api('POST', '/leads', { company: $('#ld-company').value, name: $('#ld-name').value, mobile: $('#ld-mobile').value, city: $('#ld-city').value, product: $('#ld-product').value, message: $('#ld-message').value });
      closeSheet();
      toast('Enquiry saved');
      if (done) go('#/leads');
      else refresh();
    },
    closeLead: async (el) => {
      await api('POST', `/leads/${el.dataset.id}/close`, { customer_id: el.dataset.customer || '' });
      toast('Done');
      refresh();
    },
    delLead: (el) =>
      askDelete('Delete this enquiry?', el.dataset.text, async () => {
        await api('POST', `/leads/${el.dataset.id}/delete`);
        refresh();
      }),
  });
  const d = await api('GET', '/leads' + (done ? '?tab=done' : ''));
  LEADS.clear();
  for (const l of d.list) LEADS.set(l.id, l);

  let h = `<div class="tabs"><a href="#/leads" class="${done ? '' : 'on'}">New</a><a href="#/leads?tab=done" class="${done ? 'on' : ''}">Done</a></div>`;
  h += `<div class="btns top-action"><button class="btn big" data-act="addLead">${icon('plus', 20)} Add enquiry</button></div>`;
  if (!d.on) {
    // Not connected to IndiaMART: the enquiries are typed in by hand.
    h += '<p class="muted small">Type in each enquiry you get on IndiaMART (or by phone) with "Add enquiry". Then call them, and add them as a shop or customer.</p>';
    if (!d.list.length) return h + `<div class="empty">${done ? 'Nothing here yet.' : 'No enquiries yet.'}</div>`;
  } else {
    if (d.problem) h += `<div class="banner bad">${esc(d.problem)}</div>`;
    h += `<div class="btns"><button class="btn light" data-act="syncLeads">Check now</button></div>
      <p class="muted small">New enquiries come by themselves every 10 minutes.${d.last ? ' Last checked: ' + fmtAt(d.last) : ''}</p>`;
    if (!d.list.length) return h + `<div class="empty">${done ? 'Nothing here yet.' : '✓ No new enquiries.'}</div>`;
  }
  return (
    h +
    searchBox('Search name, city, product or mobile') +
    '<div id="quick-list">' +
    d.list
      .map(
        (l) => `<div class="card" data-item>
          <div class="row"><b class="grow">${esc(l.company || l.name || 'No name')}</b><span class="muted small">${fmtAt(l.received_at)}</span></div>
          <div class="muted">${esc(dots(l.company ? l.name : '', l.city))}</div>
          ${l.source === 'manual' ? `<div class="muted small">Typed in by ${esc(l.added_by || 'staff')}</div>` : ''}
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
          ${isAdmin() ? `<div class="btns"><button class="btn danger sm" data-act="delLead" data-id="${l.id}" data-text="${esc(`${l.company || l.name || 'No name'}${l.product ? ', wants ' + l.product : ''}`)}">Delete</button></div>` : ''}
        </div>`
      )
      .join('') +
    '</div>'
  );
};

VIEWS.settings = async () => {
  const d = await api('GET', '/settings');
  ACT.saveSettings = async () => {
    await api('PUT', '/settings', {
      business_name: $('#set-name').value,
      business_address: $('#set-address').value,
      business_phone: $('#set-phone').value,
      business_gst: $('#set-gst').value,
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
    <label class="f" for="set-gst">GST number, if any (printed on the bill)</label><input id="set-gst" maxlength="15" autocapitalize="characters" value="${esc(S.boot.settings.business_gst || '')}">
    <h3>IndiaMART</h3>
    <p class="muted">${d.indiamart_on ? '✓ Connected. New enquiries come into the app by themselves.' : 'Not connected. Paste the CRM key from IndiaMART (Lead Manager → Settings → CRM integration / Pull API) to bring enquiries into the app.'}</p>
    ${d.indiamart_error ? `<div class="banner bad">${esc(d.indiamart_error)}</div>` : ''}
    <label class="f" for="set-im">${d.indiamart_on ? 'New key (leave empty to keep the saved one)' : 'IndiaMART CRM key'}</label><input id="set-im" type="text" autocomplete="off">
    ${d.indiamart_on ? '<label class="check"><input type="checkbox" id="set-im-off">Disconnect IndiaMART</label>' : ''}
    <div class="btns"><button class="btn big" type="submit">Save</button></div></form>`;
};

// Executives must not open manager pages even by typing the address (the server also refuses).
for (const name of ['sales', 'staff', 'team', 'attendance', 'routes', 'products', 'lost', 'settings', 'count', 'leads']) {
  const view = VIEWS[name];
  VIEWS[name] = (parts, query) => {
    if (!(name === 'count' ? canMake() : isStaff()) || (['products', 'settings'].includes(name) && !isAdmin())) return '<div class="empty">This page is only for the manager.</div>';
    return view(parts, query);
  };
}
