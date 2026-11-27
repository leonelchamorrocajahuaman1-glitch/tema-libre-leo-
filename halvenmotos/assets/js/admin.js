// HALVEN MOTOS — panel de administración.
// La interfaz oculta lo que cada rol no puede usar, pero la seguridad real está
// en la base de datos: RLS + funciones que verifican el rol en cada operación.
import {
  sb, $, $$, esc, money, fmtDate, debounce, slugify, toast, errMsg, auth, onAuth, authReady, loadProfile,
  imgHTML, badge, formData, setBusy, fieldError, clearErrors, RX, ORDER_STATUS, PAY_STATUS, PAY_METHOD, ROLES, hasRole,
} from './core.js';

let view = $('#view');
let renderToken = 0;
const stale = (t) => t !== renderToken;

const ICON = {
  dash: '<path d="M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z"/>',
  moto: '<circle cx="5" cy="13" r="3"/><circle cx="15" cy="13" r="3"/><path d="M5 13l4-6h4l2 6M9 7l2 6"/>',
  cat: '<path d="M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v5H3zM11 12h6v5h-6z"/>',
  ord: '<path d="M4 3h12v14l-3-2-3 2-3-2-3 2zM7 7h6M7 10h6"/>',
  cli: '<circle cx="8" cy="7" r="3"/><path d="M2.5 17a5.5 5.5 0 0 1 11 0M13 4.5a3 3 0 0 1 0 5.5M15 12a5 5 0 0 1 3 5"/>',
  inv: '<path d="M3 6l7-3 7 3v8l-7 3-7-3zM3 6l7 3 7-3M10 9v8"/>',
  cms: '<path d="M3 4h14v12H3zM3 8h14M7 8v8"/>',
  cfg: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8"/>',
};
const NAV = [
  ['dashboard', 'Dashboard', 'dash', ['admin', 'sales', 'catalog']],
  ['motos', 'Motocicletas', 'moto', ['admin', 'catalog', 'sales']],
  ['categorias', 'Categorías', 'cat', ['admin', 'catalog']],
  ['pedidos', 'Pedidos', 'ord', ['admin', 'sales']],
  ['clientes', 'Clientes', 'cli', ['admin', 'sales']],
  ['inventario', 'Inventario', 'inv', ['admin', 'catalog', 'sales']],
  ['contenido', 'Contenido', 'cms', ['admin', 'catalog']],
  ['configuracion', 'Configuración', 'cfg', ['admin']],
];
const can = (...roles) => hasRole(...roles);

/* =====================================================================
   ACCESO
   ===================================================================== */
function gateLogin(msg) {
  $('#shell').hidden = true;
  const g = $('#gate'); g.hidden = false;
  g.innerHTML = `<div class="gate-card">
    <div class="gate-logo">HalvenMotos<sup>®</sup></div>
    <h1>Panel de administración</h1><p>Acceso exclusivo para el equipo autorizado.</p>
    ${msg ? `<div class="alert alert-error" style="margin-bottom:14px">${esc(msg)}</div>` : ''}
    <form id="gForm" novalidate>
      <label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="field"><span>Contraseña</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary btn-block">Ingresar</button>
    </form>
    <p style="margin:16px 0 0;text-align:center"><a href="../" style="color:var(--yellow)">← Volver a la tienda</a></p></div>`;
  $('#gForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f);
    const d = formData(f);
    if (!RX.email.test(d.email)) return fieldError(f, 'email', 'Correo no válido.');
    const btn = $('button', f); setBusy(btn, true, 'Ingresando…');
    const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
    setBusy(btn, false);
    if (error) toast(errMsg(error), 'error');
  });
}
function gateDenied() {
  $('#shell').hidden = true;
  const g = $('#gate'); g.hidden = false;
  g.innerHTML = `<div class="gate-card denied"><div class="gate-logo">HalvenMotos<sup>®</sup></div>
    <h1>Acceso denegado</h1><p>Tu cuenta (${esc(auth.session?.user?.email || '')}) no tiene permisos de administración${auth.profile && !auth.profile.is_active ? ' o está desactivada' : ''}.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-ghost" href="../">Ir a la tienda</a><button class="btn btn-primary" id="gOut">Cambiar de cuenta</button></div></div>`;
  $('#gOut').addEventListener('click', () => sb.auth.signOut());
}
let bootedUser = null;
onAuth(async (a) => {
  if (!a.session) { bootedUser = null; stopRealtime(); gateLogin(); return; }
  if (!a.profile) await loadProfile();
  if (!a.profile || !a.profile.is_active || a.profile.role === 'customer') { bootedUser = null; stopRealtime(); gateDenied(); return; }
  if (bootedUser === a.session.user.id) return; // mismo usuario (refresco de token, etc.)
  bootedUser = a.session.user.id;
  $('#gate').hidden = true; $('#shell').hidden = false;
  $('#me').innerHTML = `<b>${esc(a.profile.full_name || a.profile.email)}</b>${esc(ROLES[a.profile.role])}`;
  buildNav(); startRealtime(); router();
});
$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); toast('Sesión cerrada.'); });

function buildNav() {
  $('#sideNav').innerHTML = NAV.filter(([, , , r]) => can(...r)).map(([k, l, i]) =>
    `<a href="#/${k}" data-nav="${k}"><svg viewBox="0 0 20 20">${ICON[i]}</svg>${l}${k === 'pedidos' ? '<span class="pill" id="pendPill" hidden></span>' : ''}${k === 'inventario' ? '<span class="pill" id="stockPill" hidden></span>' : ''}</a>`).join('');
  refreshPills();
}
async function refreshPills() {
  if (can('admin', 'sales')) {
    const { count } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pendiente');
    const p = $('#pendPill'); if (p) { p.textContent = count || ''; p.hidden = !count; }
  }
  const { data } = await sb.rpc('admin_inventory');
  const n = (data || []).filter((r) => r.state !== 'ok').length;
  const s = $('#stockPill'); if (s) { s.textContent = n || ''; s.hidden = !n; }
}

/* ---------- menú móvil ---------- */
const side = $('#side'), back = $('#sideBackdrop');
$('#menuToggle').addEventListener('click', () => { side.classList.add('open'); back.hidden = false; });
back.addEventListener('click', () => { side.classList.remove('open'); back.hidden = true; });

/* ---------- notificaciones y tiempo real ---------- */
let rt = null;
function startRealtime() {
  refreshBell();
  if (rt || !can('admin', 'sales')) return;
  rt = sb.channel('admin-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'audience=eq.staff' }, (p) => {
      toast('🔔 ' + p.new.title, 'info', 7000); refreshBell(); refreshPills();
      if (current === 'pedidos' || current === 'dashboard') router();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => { if (current === 'pedidos' && !$('#modal')) router(); refreshPills(); })
    .subscribe();
}
function stopRealtime() { if (rt) { sb.removeChannel(rt); rt = null; } }
async function refreshBell() {
  if (!can('admin', 'sales')) { $('.notif-wrap').hidden = true; return; }
  const { data } = await sb.from('notifications').select('id,title,body,order_id,read_at,created_at').eq('audience', 'staff').order('created_at', { ascending: false }).limit(20);
  const list = data || [], unread = list.filter((n) => !n.read_at).length;
  const c = $('#bellCount'); c.textContent = unread; c.hidden = !unread;
  $('#bellPop').innerHTML = `<h4><span>Notificaciones</span>${unread ? '<button class="link" id="readAll" style="color:var(--yellow)">Marcar todo como leído</button>' : ''}</h4>` +
    (list.length ? list.map((n) => `<a href="#/pedidos?id=${n.order_id || ''}" class="${n.read_at ? '' : 'unread'}" data-nid="${n.id}">${esc(n.title)}<small>${esc(n.body || '')} · ${fmtDate(n.created_at, true)}</small></a>`).join('') : '<p style="padding:10px;color:var(--muted);font-size:14px">Sin notificaciones.</p>');
  $('#readAll')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('audience', 'staff').is('read_at', null);
    refreshBell();
  });
}
$('#bell').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#bellPop'); p.hidden = !p.hidden; $('#bell').setAttribute('aria-expanded', String(!p.hidden)); });
document.addEventListener('click', async (e) => {
  const n = e.target.closest('[data-nid]');
  if (n) { $('#bellPop').hidden = true; await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.dataset.nid); refreshBell(); }
  else if (!e.target.closest('.notif-wrap')) $('#bellPop').hidden = true;
});

/* ---------- modal y confirmación ---------- */
function openModal(html, wide = false) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="modal-backdrop" data-close-modal></div><div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target.closest('[data-close-modal]')) closeModal(); });
  setTimeout(() => $('input:not([type=hidden]),select,textarea', m.querySelector('.modal-card'))?.focus(), 30);
  return m;
}
function closeModal() { $('#modal')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#bellPop').hidden = true; } });
const xBtn = '<button class="icon-btn" type="button" data-close-modal aria-label="Cerrar"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15"/></svg></button>';
function confirmDialog(title, text, okLabel = 'Eliminar', danger = true) {
  return new Promise((res) => {
    const m = openModal(`<div class="modal-head"><h3>${esc(title)}</h3>${xBtn}</div><p style="color:var(--muted)">${text}</p>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="okBtn">${esc(okLabel)}</button></div>`);
    $('#okBtn', m).addEventListener('click', () => { closeModal(); res(true); });
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close-modal]')) res(false); });
  });
}

/* =====================================================================
   ROUTER
   ===================================================================== */
let current = '';
const VIEWS = { dashboard: viewDashboard, motos: viewMotos, categorias: viewCategories, pedidos: viewOrders, clientes: viewCustomers, inventario: viewInventory, contenido: viewContent, configuracion: viewSettings };
async function router() {
  if (!auth.profile || auth.profile.role === 'customer') return;
  const [p, q] = (location.hash.slice(2) || 'dashboard').split('?');
  const item = NAV.find(([k]) => k === p);
  if (!item || !can(...item[3])) { location.hash = '#/dashboard'; return; }
  current = p;
  closeModal(); hideTip();
  const t = ++renderToken;
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === p));
  $('#pageTitle').textContent = item[1];
  document.title = `${item[1]} | Panel HALVEN MOTOS`;
  side.classList.remove('open'); back.hidden = true;
  // contenedor nuevo en cada navegación: así no se acumulan manejadores de eventos
  const fresh = view.cloneNode(false); view.replaceWith(fresh); view = fresh;
  view.innerHTML = '<div class="spinner" aria-label="Cargando"></div>';
  try { await VIEWS[p](new URLSearchParams(q || ''), t); }
  catch (e) { console.error(e); if (!stale(t)) view.innerHTML = `<div class="empty"><h3>No se pudo cargar</h3><p>${esc(errMsg(e))}</p><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div>`; }
}
window.addEventListener('hashchange', router);

/* =====================================================================
   GRÁFICOS (SVG propio, una sola serie, con tooltip)
   ===================================================================== */
const tip = $('#tip');
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - r.height - 10) + 'px'; }
const hideTip = () => { tip.hidden = true; };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const mLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(Math.round(n));
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function chartFrame(data, fmt, draw) {
  const W = 560, H = 220, L = 52, Rr = 8, T = 10, B = 26;
  const max = niceMax(Math.max(...data.map((d) => d.v), 0));
  const x = (i) => L + (i + 0.5) * ((W - L - Rr) / data.length);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((k) => `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(max * k)}" y2="${y(max * k)}"/><text class="axis" x="${L - 8}" y="${y(max * k) + 4}" text-anchor="end">${fmt(max * k)}</text>`).join('');
  const labels = data.map((d, i) => (data.length <= 12 || i % 2 === 0) ? `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(d.l)}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${draw({ x, y, W, H, L, Rr, T, B, bw: (W - L - Rr) / data.length })}${labels}</svg>`;
}
function barChart(el, data, fmtFull, fmtAxis) {
  el.innerHTML = chartFrame(data, fmtAxis, ({ x, y, bw }) => data.map((d, i) => {
    const w = Math.max(4, Math.min(34, bw * 0.6)), top = y(d.v), h = Math.max(0, y(0) - top);
    const r = Math.min(4, h, w / 2);
    const path = h > 0 ? `M${x(i) - w / 2},${y(0)} V${top + r} Q${x(i) - w / 2},${top} ${x(i) - w / 2 + r},${top} H${x(i) + w / 2 - r} Q${x(i) + w / 2},${top} ${x(i) + w / 2},${top + r} V${y(0)} Z` : '';
    return `<rect class="hit" x="${x(i) - bw / 2}" y="0" width="${bw}" height="${y(0)}" data-i="${i}"/>${path ? `<path class="bar" d="${path}"/>` : ''}`;
  }).join(''));
  $$('.hit', el).forEach((h) => { h.addEventListener('mousemove', (e) => { const d = data[+h.dataset.i]; showTip(e, `${esc(d.full || d.l)}<b>${fmtFull(d.v)}</b>`); }); h.addEventListener('mouseleave', hideTip); });
}
function lineChart(el, data, fmtFull, fmtAxis) {
  el.innerHTML = chartFrame(data, fmtAxis, ({ x, y, bw }) => {
    const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(' ');
    return `<defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe100" stop-opacity=".22"/><stop offset="1" stop-color="#ffe100" stop-opacity="0"/></linearGradient></defs>
      <polygon class="area" points="${x(0)},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}"/><polyline class="line" points="${pts}"/>
      <line class="cross" id="cross" x1="0" x2="0" y1="${y(niceMax(Math.max(...data.map((d) => d.v), 0)))}" y2="${y(0)}" visibility="hidden"/>
      ${data.map((d, i) => `<circle class="dot" cx="${x(i)}" cy="${y(d.v)}" r="4"/>`).join('')}
      ${data.map((d, i) => `<rect class="hit" x="${x(i) - bw / 2}" y="0" width="${bw}" height="${y(0)}" data-i="${i}"/>`).join('')}`;
  });
  const cross = $('#cross', el);
  $$('.hit', el).forEach((h) => {
    h.addEventListener('mousemove', (e) => { const i = +h.dataset.i, d = data[i]; const cx = h.x.baseVal.value + h.width.baseVal.value / 2; cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible'); showTip(e, `${esc(d.full || d.l)}<b>${fmtFull(d.v)}</b>`); });
    h.addEventListener('mouseleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); });
  });
}
function hbars(rows, fmt, clsOf) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span class="lbl" title="${esc(r.l)}">${esc(r.l)}</span><div class="track"><div class="fill ${clsOf ? clsOf(r) : ''}" style="width:${(r.v / max) * 100}%"></div></div><span class="val">${fmt(r.v)}</span></div>`).join('')}</div>`;
}
const tableView = (head, rows) => `<details class="table-view"><summary>Ver como tabla</summary><table class="t" style="min-width:0"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;

/* =====================================================================
   DASHBOARD
   ===================================================================== */
async function viewDashboard(_, t) {
  if (!can('admin', 'sales')) return viewCatalogDashboard(t);
  const [{ data: s, error }, { data: recent }, { data: inv }, { data: settings }] = await Promise.all([
    sb.rpc('admin_dashboard_stats'),
    sb.from('orders').select('id,order_number,customer_name,total,status,payment_status,created_at').order('created_at', { ascending: false }).limit(6),
    sb.rpc('admin_inventory'),
    sb.from('site_settings').select('key,value'),
  ]);
  if (stale(t)) return;
  if (error) throw error;
  const S = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
  const alerts = [];
  if (!S.contact?.whatsapp) alerts.push('Configura el número de WhatsApp en <a href="#/contenido" style="color:var(--yellow)">Contenido</a> para activar el botón flotante y las consultas.');
  if (!S.payments?.mercadopago?.enabled) alerts.push('Mercado Pago está desactivado. Para activarlo, configura los secretos <code>MP_ACCESS_TOKEN</code> y <code>SITE_URL</code> en Supabase y actívalo en <a href="#/configuracion" style="color:var(--yellow)">Configuración</a>.');
  if (S.payments?.transferencia?.enabled && !S.payments?.transferencia?.instructions) alerts.push('Agrega los datos bancarios para transferencias en <a href="#/configuracion" style="color:var(--yellow)">Configuración</a>.');
  const low = (inv || []).filter((r) => r.state !== 'ok');
  const kpi = (label, value, sub = '', accent = false) => `<div class="kpi ${accent ? 'accent' : ''}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  view.innerHTML = `
    ${alerts.length || low.length ? `<div class="alerts">${alerts.map((a) => `<div class="alert alert-warn">${a}</div>`).join('')}
      ${low.length ? `<div class="alert alert-error"><strong>Stock bajo:</strong> ${low.map((r) => `${esc(r.name)} (${r.stock})`).join(', ')}. <a href="#/inventario" style="color:var(--yellow)">Ver inventario</a></div>` : ''}</div>` : ''}
    <div class="kpis">
      ${kpi('Ventas de hoy', money(s.sales_today), 'pagos aprobados', true)}
      ${kpi('Ventas del mes', money(s.sales_month), 'pagos aprobados', true)}
      ${kpi('Ingresos totales', money(s.revenue_total), 'histórico', true)}
      ${kpi('Pedidos', s.orders_total, `${s.orders_pending} pendientes`)}
      ${kpi('Motocicletas', s.motorcycles_total, 'registradas')}
      ${kpi('Disponibles', s.motorcycles_available, 'publicadas con stock')}
      ${kpi('Agotadas', s.motorcycles_sold_out, `${s.low_stock} con stock bajo`)}
      ${kpi('Clientes', s.customers_total, 'registrados')}
    </div>
    <div class="grid-charts">
      <section class="box"><div class="box-head"><h2>Ventas por mes</h2><p>Pagos aprobados, últimos 12 meses (S/)</p></div><div class="chart" id="chSales"></div><div id="tvSales"></div></section>
      <section class="box"><div class="box-head"><h2>Evolución de ingresos</h2><p>Acumulado de los últimos 12 meses (S/)</p></div><div class="chart" id="chRev"></div></section>
      <section class="box"><div class="box-head"><h2>Productos más vendidos</h2><p>Unidades en pedidos no cancelados</p></div><div id="chTop"></div></section>
      <section class="box"><div class="box-head"><h2>Pedidos por estado</h2><p>Todos los pedidos</p></div><div id="chStatus"></div></section>
    </div>
    <section class="box" style="margin-top:14px"><div class="box-head"><h2>Últimos pedidos</h2><a class="btn btn-ghost btn-sm" href="#/pedidos">Ver todos</a></div>
      ${recent?.length ? `<div class="table-wrap" style="border:0"><table class="t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody>
      ${recent.map((o) => `<tr class="clickable" data-open-order="${o.id}"><td><b>${esc(o.order_number)}</b></td><td>${esc(o.customer_name)}</td><td>${fmtDate(o.created_at, true)}</td><td>${badge('order', o.status)}</td><td>${badge('pay', o.payment_status)}</td><td class="num">${money(o.total)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Aún no hay pedidos. Aparecerán aquí en cuanto un cliente compre.</div>'}</section>`;
  const monthly = (s.monthly || []).map((m) => ({ l: mLabel(m.month), full: mLabel(m.month), v: Number(m.revenue), o: m.orders }));
  barChart($('#chSales'), monthly, money, short);
  $('#tvSales').innerHTML = tableView(['Mes', 'Ingresos', 'Pedidos'], monthly.map((m) => [m.l, money(m.v), m.o]));
  let acc = 0;
  lineChart($('#chRev'), monthly.map((m) => ({ ...m, v: (acc += m.v) })), money, short);
  const top = (s.top_products || []).map((p) => ({ l: p.name, v: p.units }));
  $('#chTop').innerHTML = top.length ? hbars(top, (v) => `${v} u.`) : '<div class="empty" style="padding:30px">Sin ventas todavía.</div>';
  const st = Object.keys(ORDER_STATUS).map((k) => ({ k, l: ORDER_STATUS[k], v: Number(s.by_status?.[k] || 0) }));
  $('#chStatus').innerHTML = st.some((r) => r.v) ? hbars(st, (v) => v, (r) => 's-' + r.k) : '<div class="empty" style="padding:30px">Sin pedidos todavía.</div>';
  $$('[data-open-order]').forEach((tr) => tr.addEventListener('click', () => openOrder(tr.dataset.openOrder)));
}
async function viewCatalogDashboard(t) {
  const [{ data: inv }, { count: cats }] = await Promise.all([sb.rpc('admin_inventory'), sb.from('categories').select('id', { count: 'exact', head: true })]);
  if (stale(t)) return;
  const rows = inv || [];
  view.innerHTML = `<div class="kpis">
    <div class="kpi"><span>Motocicletas</span><b>${rows.length}</b></div>
    <div class="kpi"><span>Publicadas</span><b>${rows.filter((r) => r.is_published).length}</b></div>
    <div class="kpi"><span>Agotadas</span><b>${rows.filter((r) => r.state === 'agotado').length}</b></div>
    <div class="kpi"><span>Categorías</span><b>${cats || 0}</b></div></div>
    <section class="box"><div class="box-head"><h2>Stock actual</h2></div>${hbars(rows.map((r) => ({ l: r.name, v: r.stock })), (v) => v)}</section>`;
}

/* =====================================================================
   MOTOCICLETAS (CRUD)
   ===================================================================== */
const motoState = { q: '', status: '', cat: '' };
async function viewMotos(_, t) {
  const [{ data, error }, { data: cats }] = await Promise.all([
    sb.from('motorcycles').select('id,slug,name,brand,model,year,price,hero_color,hero_image,is_published,is_featured,sort_order,category_id,categories(name),inventory(stock,low_stock_threshold),motorcycle_images(url,sort_order)').order('sort_order').order('created_at', { ascending: false }),
    sb.from('categories').select('id,name').order('sort_order'),
  ]);
  if (stale(t)) return;
  if (error) throw error;
  const edit = can('admin', 'catalog');
  view.innerHTML = `<div class="toolbar">
      <label class="field grow"><span class="sr">Buscar</span><input id="mQ" placeholder="Buscar por nombre, marca o modelo" value="${esc(motoState.q)}"></label>
      <label class="field"><span class="sr">Categoría</span><select id="mCat"><option value="">Todas las categorías</option>${(cats || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="sr">Estado</span><select id="mSt"><option value="">Todas</option><option value="pub">Publicadas</option><option value="hid">Ocultas</option><option value="feat">Destacadas</option><option value="out">Agotadas</option></select></label>
      ${edit ? '<button class="btn btn-primary" id="newMoto">+ Nueva motocicleta</button>' : ''}
    </div>
    <div class="table-wrap"><table class="t"><thead><tr><th></th><th>Motocicleta</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th>Publicada</th><th>Destacada</th><th></th></tr></thead><tbody id="mBody"></tbody></table></div>`;
  $('#mCat').value = motoState.cat; $('#mSt').value = motoState.status;
  const render = () => {
    const q = motoState.q.toLowerCase();
    const rows = data.filter((m) => (!q || `${m.name} ${m.brand} ${m.model}`.toLowerCase().includes(q))
      && (!motoState.cat || m.category_id === motoState.cat)
      && (!motoState.status || (motoState.status === 'pub' && m.is_published) || (motoState.status === 'hid' && !m.is_published)
        || (motoState.status === 'feat' && m.is_featured) || (motoState.status === 'out' && (m.inventory?.stock ?? 0) === 0)));
    $('#mBody').innerHTML = rows.length ? rows.map((m) => {
      const cover = (m.motorcycle_images || []).sort((a, b) => a.sort_order - b.sort_order)[0]?.url || m.hero_image;
      const st = m.inventory?.stock ?? 0;
      return `<tr>
        <td><div class="thumb" style="--c:${esc(m.hero_color || '#2a2e36')}">${imgHTML(cover, m.name)}</div></td>
        <td><b>${esc(m.name)}</b><span class="sub">${esc(m.brand)} · ${esc(m.model)} · ${m.year}</span></td>
        <td>${esc(m.categories?.name || '—')}</td>
        <td class="num">${money(m.price)}</td>
        <td class="num"><span class="badge ${st === 0 ? 'b-cancelado' : st <= (m.inventory?.low_stock_threshold ?? 2) ? 'b-pendiente' : 'b-confirmado'}">${st}</span></td>
        <td><label class="switch"><input type="checkbox" data-pub="${m.id}" ${m.is_published ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="Publicar ${esc(m.name)}"><span></span></label></td>
        <td><label class="switch"><input type="checkbox" data-feat="${m.id}" ${m.is_featured ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="Destacar ${esc(m.name)}"><span></span></label></td>
        <td><div class="actions"><a class="btn btn-ghost btn-sm" href="../#/moto/${esc(m.slug)}" target="_blank" rel="noopener">Ver</a>
          ${edit ? `<button class="btn btn-ghost btn-sm" data-edit="${m.id}">Editar</button><button class="btn btn-danger btn-sm" data-del="${m.id}">Eliminar</button>` : ''}</div></td></tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty" style="border:0">No hay motocicletas con esos filtros.</div></td></tr>`;
  };
  render();
  $('#mQ').addEventListener('input', debounce((e) => { motoState.q = e.target.value; render(); }, 150));
  $('#mCat').addEventListener('change', (e) => { motoState.cat = e.target.value; render(); });
  $('#mSt').addEventListener('change', (e) => { motoState.status = e.target.value; render(); });
  $('#newMoto')?.addEventListener('click', () => motoForm(null, cats || []));
  view.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'); if (ed) motoForm(ed.dataset.edit, cats || []);
    const del = e.target.closest('[data-del]');
    if (del) {
      const m = data.find((x) => x.id === del.dataset.del);
      if (!(await confirmDialog(`¿Eliminar ${m.name}?`, 'Se eliminarán también sus fotos y su stock. Los pedidos existentes conservan el nombre y precio de la moto. Si solo quieres retirarla de la tienda, mejor desactiva "Publicada".'))) return;
      const { data: imgs } = await sb.from('motorcycle_images').select('storage_path').eq('motorcycle_id', m.id);
      const { error: err } = await sb.from('motorcycles').delete().eq('id', m.id);
      if (err) { toast(errMsg(err), 'error'); return; }
      const paths = (imgs || []).map((i) => i.storage_path).filter(Boolean);
      if (paths.length) await sb.storage.from('motorcycles').remove(paths);
      toast('Motocicleta eliminada.'); router();
    }
  });
  view.addEventListener('change', async (e) => {
    const p = e.target.closest('[data-pub],[data-feat]'); if (!p) return;
    const field = p.dataset.pub ? 'is_published' : 'is_featured', id = p.dataset.pub || p.dataset.feat;
    p.disabled = true;
    const { error: err } = await sb.from('motorcycles').update({ [field]: p.checked }).eq('id', id);
    p.disabled = false;
    if (err) { p.checked = !p.checked; toast(errMsg(err), 'error'); return; }
    const m = data.find((x) => x.id === id); m[field] = p.checked;
    toast(field === 'is_published' ? (p.checked ? 'Publicada en la tienda.' : 'Oculta de la tienda.') : (p.checked ? 'Marcada como destacada (aparece en el hero).' : 'Ya no es destacada.'));
  });
}

async function uploadImage(file, folder) {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG, WebP o AVIF.');
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen supera 8 MB.');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('motorcycles').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return { path, url: sb.storage.from('motorcycles').getPublicUrl(path).data.publicUrl };
}

async function motoForm(id, cats, startTab = 0) {
  let m = { name: '', slug: '', brand: '', model: '', year: new Date().getFullYear(), price: '', colors: [], is_published: false, is_featured: false, sort_order: 0, hero_color: '#2a2e36' };
  let images = [], inv = { stock: 0, low_stock_threshold: 2 };
  if (id) {
    const { data, error } = await sb.from('motorcycles').select('*,inventory(stock,low_stock_threshold),motorcycle_images(id,url,storage_path,alt,sort_order)').eq('id', id).single();
    if (error) { toast(errMsg(error), 'error'); return; }
    m = data; images = (data.motorcycle_images || []).sort((a, b) => a.sort_order - b.sort_order); inv = data.inventory || inv;
  }
  const v = (k) => esc(m[k] ?? '');
  const num = (k, label, step = '1', extra = '') => `<label class="field"><span>${label}</span><input name="${k}" type="number" step="${step}" min="0" value="${v(k)}" ${extra}></label>`;
  const txt = (k, label, cls = '', extra = '') => `<label class="field ${cls}"><span>${label}</span><input name="${k}" value="${v(k)}" ${extra}></label>`;
  const md = openModal(`<div class="modal-head"><h3>${id ? 'Editar' : 'Nueva'} motocicleta</h3>${xBtn}</div>
    <div class="tabs" role="tablist">${['General', 'Ficha técnica', 'Colores', 'Fotografías', 'Hero y publicación'].map((l, i) => `<button type="button" role="tab" data-tab="${i}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
    <form id="mForm" novalidate>
      <div class="tab-pane on" data-pane="0"><div class="form-grid">
        ${txt('name', 'Nombre comercial *', 's2', 'required maxlength="120"')}
        ${txt('slug', 'Slug (URL) *', '', 'required maxlength="80" pattern="[a-z0-9-]+"')}
        ${txt('brand', 'Marca *', '', 'required maxlength="60"')}
        ${txt('model', 'Modelo *', '', 'required maxlength="80"')}
        ${num('year', 'Año *', '1', 'min="1950" max="2100" required')}
        <label class="field"><span>Categoría</span><select name="category_id"><option value="">Sin categoría</option>${cats.map((c) => `<option value="${c.id}" ${m.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        ${num('price', 'Precio (S/) *', '0.01', 'required')}
        ${num('compare_at_price', 'Precio anterior (opcional)', '0.01')}
        <label class="field s3"><span>Descripción corta</span><input name="short_description" maxlength="240" value="${v('short_description')}"></label>
        <label class="field s3"><span>Descripción completa</span><textarea name="description" maxlength="6000" rows="6">${v('description')}</textarea></label>
      </div></div>
      <div class="tab-pane" data-pane="1"><div class="form-grid">
        ${num('displacement_cc', 'Cilindrada (cc)')}${num('power_hp', 'Potencia (hp)', '0.1')}${num('top_speed_kmh', 'Velocidad máxima (km/h)')}
        ${num('acceleration_s', '0–100 km/h (s)', '0.1')}${num('tank_l', 'Tanque (L)', '0.1')}${num('range_km', 'Autonomía (km)')}
        ${num('weight_kg', 'Peso (kg)')}${num('seats', 'Asientos', '1', 'max="3"')}${txt('cooling', 'Refrigeración', '', 'maxlength="60" placeholder="Líquida"')}
        ${txt('engine_type', 'Tipo de motor', 's3', 'maxlength="120"')}${txt('transmission', 'Transmisión', 's3', 'maxlength="120"')}${txt('brakes', 'Sistema de frenos', 's3', 'maxlength="200"')}
      </div></div>
      <div class="tab-pane" data-pane="2"><p class="help" style="margin:0 0 12px">El cliente elige uno de estos colores al comprar.</p><div class="rows" id="colorRows"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addColor" style="margin-top:12px">+ Agregar color</button></div>
      <div class="tab-pane" data-pane="3">${id ? `<label class="drop" id="drop"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><b>Arrastra fotos aquí o haz clic para subir</b><span>JPG, PNG, WebP o AVIF · máx. 8 MB c/u</span></label>
        <div class="imgs" id="imgList" style="margin-top:14px"></div><p class="help">La primera foto es la portada del catálogo. Usa ↑ ↓ para ordenar.</p>`
        : '<div class="alert">Guarda la motocicleta primero; después podrás subir sus fotografías.</div>'}</div>
      <div class="tab-pane" data-pane="4"><div class="form-grid">
        <label class="field"><span>Color del fondo del hero</span><input type="color" name="hero_color" value="${v('hero_color') || '#2a2e36'}" style="height:46px"></label>
        ${num('sort_order', 'Orden (menor primero)')}
        <div></div>
        <label class="check"><input type="checkbox" name="is_published" ${m.is_published ? 'checked' : ''}> Publicada en la tienda</label>
        <label class="check s2"><input type="checkbox" name="is_featured" ${m.is_featured ? 'checked' : ''}> Destacada (aparece en el carrusel del hero)</label>
        ${!id ? `${num('stock', 'Stock inicial')}${num('low_stock_threshold', 'Alerta de stock bajo en')}<div></div>` : ''}
        <div class="field s3"><span>Imagen del hero (PNG/WebP transparente, perfil lateral mirando a la derecha)</span>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div class="thumb" id="heroPrev" style="width:180px;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 50% 85%,${v('hero_color') || '#2a2e36'},#121419)">${imgHTML(m.hero_image, 'Hero')}</div>
          <label class="btn btn-ghost btn-sm">Subir PNG transparente<input type="file" id="heroFile" accept="image/png,image/webp" hidden></label>
          <select id="heroSheet" class="input" style="width:auto"><option value="">…o usar una moto de la lámina original</option>${[0, 1, 2, 3].map((n) => `<option value="sheet:${n}" ${m.hero_image === 'sheet:' + n ? 'selected' : ''}>Lámina ${n + 1} (${['Magenta', 'Sapphire', 'Copper', 'Violet'][n]})</option>`).join('')}</select>
          ${m.hero_image ? '<button type="button" class="btn btn-danger btn-sm" id="heroClear">Quitar</button>' : ''}</div>
          <p class="help">Sin imagen de hero, la moto se muestra en el catálogo pero no en el carrusel. Debe tener fondo transparente para integrarse con "RIDE OUT".</p></div>
      </div></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="mSave">${id ? 'Guardar cambios' : 'Crear motocicleta'}</button></div>
    </form>`, true);
  const form = $('#mForm', md);
  let heroImage = m.hero_image || null;
  // pestañas
  $$('[data-tab]', md).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', md).forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-pane]', md).forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
  }));
  if (startTab) $(`[data-tab="${startTab}"]`, md)?.click();
  // slug automático
  const nameIn = form.elements.name, slugIn = form.elements.slug;
  let slugTouched = !!id;
  slugIn.addEventListener('input', () => { slugTouched = true; });
  nameIn.addEventListener('input', () => { if (!slugTouched) slugIn.value = slugify(nameIn.value); });
  // colores
  const colors = (Array.isArray(m.colors) ? m.colors : []).map((c) => ({ ...c }));
  const renderColors = () => {
    $('#colorRows', md).innerHTML = colors.map((c, i) => `<div class="row-item color">
      <label class="field"><span>Nombre</span><input data-cn="${i}" value="${esc(c.name)}" maxlength="40"></label>
      <label class="field"><span>Hex</span><input data-ch="${i}" value="${esc(c.hex || '#888888')}" maxlength="7"></label>
      <input type="color" data-cp="${i}" value="${esc(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888')}" aria-label="Elegir color">
      <button type="button" class="btn btn-danger btn-sm" data-crm="${i}">Quitar</button></div>`).join('') || '<p class="help">Sin colores registrados.</p>';
  };
  renderColors();
  $('#addColor', md).addEventListener('click', () => { colors.push({ name: '', hex: '#888888' }); renderColors(); });
  md.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.cn) colors[+t.dataset.cn].name = t.value;
    if (t.dataset.ch) colors[+t.dataset.ch].hex = t.value;
    if (t.dataset.cp) { colors[+t.dataset.cp].hex = t.value; $(`[data-ch="${t.dataset.cp}"]`, md).value = t.value; }
  });
  md.addEventListener('click', (e) => { const r = e.target.closest('[data-crm]'); if (r) { colors.splice(+r.dataset.crm, 1); renderColors(); } });
  // imagen del hero
  const heroPrev = () => { $('#heroPrev', md).innerHTML = imgHTML(heroImage, 'Hero'); };
  $('#heroSheet', md).addEventListener('change', (e) => { if (e.target.value) { heroImage = e.target.value; heroPrev(); } });
  $('#heroClear', md)?.addEventListener('click', () => { heroImage = null; heroPrev(); $('#heroSheet', md).value = ''; });
  $('#heroFile', md).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { toast('Subiendo imagen del hero…', 'info'); const up = await uploadImage(f, 'hero'); heroImage = up.url; heroPrev(); toast('Imagen del hero lista. Guarda para aplicarla.'); }
    catch (err) { toast(errMsg(err), 'error'); }
  });
  // fotografías
  if (id) {
    const renderImgs = () => {
      $('#imgList', md).innerHTML = images.map((im, i) => `<div class="img-card"><div class="ph" style="--c:${esc(m.hero_color || '#2a2e36')}">${imgHTML(im.url, im.alt || '')}</div>
        <div class="bar"><button type="button" class="icon-btn" data-up="${i}" aria-label="Subir" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-down="${i}" aria-label="Bajar" ${i === images.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-danger btn-sm" data-irm="${i}">Eliminar</button></div></div>`).join('') || '<p class="help">Aún no hay fotografías.</p>';
    };
    renderImgs();
    const persistOrder = async () => {
      await Promise.all(images.map((im, i) => sb.from('motorcycle_images').update({ sort_order: i }).eq('id', im.id)));
    };
    const handleFiles = async (files) => {
      for (const f of files) {
        try {
          const up = await uploadImage(f, 'motos/' + id);
          const { data: row, error } = await sb.from('motorcycle_images').insert({ motorcycle_id: id, url: up.url, storage_path: up.path, alt: m.name, sort_order: images.length }).select().single();
          if (error) { await sb.storage.from('motorcycles').remove([up.path]); throw error; }
          images.push(row); renderImgs(); toast('Foto subida.');
        } catch (err) { toast(`${f.name}: ${errMsg(err)}`, 'error'); }
      }
    };
    const drop = $('#drop', md);
    $('input', drop).addEventListener('change', (e) => handleFiles([...e.target.files]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));
    md.addEventListener('click', async (e) => {
      const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-down]'), rm = e.target.closest('[data-irm]');
      if (up || dn) { const i = +(up ? up.dataset.up : dn.dataset.down), j = up ? i - 1 : i + 1; [images[i], images[j]] = [images[j], images[i]]; renderImgs(); await persistOrder(); }
      if (rm) {
        const im = images[+rm.dataset.irm];
        const { error } = await sb.from('motorcycle_images').delete().eq('id', im.id);
        if (error) { toast(errMsg(error), 'error'); return; }
        if (im.storage_path) await sb.storage.from('motorcycles').remove([im.storage_path]);
        images.splice(+rm.dataset.irm, 1); renderImgs(); await persistOrder(); toast('Foto eliminada.');
      }
    });
  }
  // guardar
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(form);
    const d = formData(form);
    const n = (k) => d[k] === '' || d[k] == null ? null : Number(d[k]);
    let bad = false;
    const err = (k, msg, tab = 0) => { fieldError(form, k, msg); if (!bad) $(`[data-tab="${tab}"]`, md).click(); bad = true; };
    if (d.name.length < 2) err('name', 'Ingresa el nombre.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) err('slug', 'Solo minúsculas, números y guiones.');
    if (!d.brand) err('brand', 'Ingresa la marca.');
    if (!d.model) err('model', 'Ingresa el modelo.');
    if (!(n('year') >= 1950 && n('year') <= 2100)) err('year', 'Año no válido.');
    if (!(n('price') > 0)) err('price', 'Ingresa un precio mayor a 0.');
    const cleanColors = colors.map((c) => ({ name: c.name.trim(), hex: c.hex.trim() })).filter((c) => c.name);
    if (cleanColors.some((c) => !/^#[0-9a-f]{6}$/i.test(c.hex))) { toast('Revisa los colores: el hex debe tener el formato #RRGGBB.', 'error'); $('[data-tab="2"]', md).click(); bad = true; }
    if (new Set(cleanColors.map((c) => c.name.toLowerCase())).size !== cleanColors.length) { toast('Hay colores con el mismo nombre.', 'error'); bad = true; }
    if (bad) return;
    const payload = {
      name: d.name, slug: d.slug, brand: d.brand, model: d.model, year: n('year'), category_id: d.category_id || null,
      price: n('price'), compare_at_price: n('compare_at_price'), short_description: d.short_description || null, description: d.description || null,
      displacement_cc: n('displacement_cc'), power_hp: n('power_hp'), top_speed_kmh: n('top_speed_kmh'), acceleration_s: n('acceleration_s'),
      tank_l: n('tank_l'), range_km: n('range_km'), weight_kg: n('weight_kg'), seats: n('seats'), cooling: d.cooling || null,
      engine_type: d.engine_type || null, transmission: d.transmission || null, brakes: d.brakes || null,
      colors: cleanColors, hero_color: d.hero_color, hero_image: heroImage, sort_order: n('sort_order') || 0,
      is_published: !!form.elements.is_published.checked, is_featured: !!form.elements.is_featured.checked,
    };
    const btn = $('#mSave', md); setBusy(btn, true, 'Guardando…');
    let res;
    if (id) res = await sb.from('motorcycles').update(payload).eq('id', id).select('id').single();
    else res = await sb.from('motorcycles').insert(payload).select('id').single();
    if (res.error) { setBusy(btn, false); toast(errMsg(res.error), 'error'); return; }
    if (!id) {
      const { error: ie } = await sb.from('inventory').update({ stock: Math.max(0, n('stock') || 0), low_stock_threshold: Math.max(0, n('low_stock_threshold') ?? 2) }).eq('motorcycle_id', res.data.id);
      if (ie) toast('La moto se creó, pero no se pudo guardar el stock: ' + errMsg(ie), 'warn');
      toast('Motocicleta creada. Ahora puedes subir sus fotos.');
      closeModal(); await router(); motoForm(res.data.id, cats, 3);
      return;
    }
    toast('Cambios guardados. Ya se ven en la tienda.');
    closeModal(); router();
  });
}

/* =====================================================================
   CATEGORÍAS
   ===================================================================== */
async function viewCategories(_, t) {
  const [{ data, error }, { data: motos }] = await Promise.all([
    sb.from('categories').select('*').order('sort_order'),
    sb.from('motorcycles').select('category_id'),
  ]);
  if (stale(t)) return;
  if (error) throw error;
  const counts = {}; (motos || []).forEach((m) => { if (m.category_id) counts[m.category_id] = (counts[m.category_id] || 0) + 1; });
  view.innerHTML = `<div class="toolbar"><p style="color:var(--muted)">${data.length} categorías</p><button class="btn btn-primary" id="newCat">+ Nueva categoría</button></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Orden</th><th>Nombre</th><th>Slug</th><th>Descripción</th><th class="num">Motos</th><th></th></tr></thead><tbody>
    ${data.map((c) => `<tr><td>${c.sort_order}</td><td><b>${esc(c.name)}</b></td><td><code>${esc(c.slug)}</code></td><td style="max-width:360px;color:var(--muted)">${esc(c.description || '')}</td><td class="num">${counts[c.id] || 0}</td>
      <td><div class="actions"><button class="btn btn-ghost btn-sm" data-cedit="${c.id}">Editar</button><button class="btn btn-danger btn-sm" data-cdel="${c.id}">Eliminar</button></div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty" style="border:0">Sin categorías.</div></td></tr>'}
    </tbody></table></div>`;
  const form = (c) => {
    c = c || { name: '', slug: '', description: '', sort_order: data.length + 1 };
    const md = openModal(`<div class="modal-head"><h3>${c.id ? 'Editar' : 'Nueva'} categoría</h3>${xBtn}</div>
      <form id="cForm" novalidate><div class="grid-2">
        <label class="field"><span>Nombre *</span><input name="name" required maxlength="60" value="${esc(c.name)}"></label>
        <label class="field"><span>Slug *</span><input name="slug" required maxlength="60" value="${esc(c.slug)}"></label>
        <label class="field span-2"><span>Descripción</span><textarea name="description" maxlength="400">${esc(c.description || '')}</textarea></label>
        <label class="field"><span>Orden</span><input name="sort_order" type="number" value="${c.sort_order}"></label></div>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`);
    const f = $('#cForm', md);
    let touched = !!c.id;
    f.elements.slug.addEventListener('input', () => { touched = true; });
    f.elements.name.addEventListener('input', () => { if (!touched) f.elements.slug.value = slugify(f.elements.name.value); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); clearErrors(f);
      const d = formData(f);
      if (d.name.length < 2) return fieldError(f, 'name', 'Ingresa el nombre.');
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) return fieldError(f, 'slug', 'Solo minúsculas, números y guiones.');
      const btn = $('button.btn-primary', f); setBusy(btn, true);
      const payload = { name: d.name, slug: d.slug, description: d.description || null, sort_order: parseInt(d.sort_order, 10) || 0 };
      const { error: err } = c.id ? await sb.from('categories').update(payload).eq('id', c.id) : await sb.from('categories').insert(payload);
      setBusy(btn, false);
      if (err) { toast(errMsg(err), 'error'); return; }
      closeModal(); toast('Categoría guardada.'); router();
    });
  };
  $('#newCat').addEventListener('click', () => form());
  view.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-cedit]'); if (ed) form(data.find((c) => c.id === ed.dataset.cedit));
    const del = e.target.closest('[data-cdel]');
    if (del) {
      const c = data.find((x) => x.id === del.dataset.cdel), n = counts[c.id] || 0;
      if (!(await confirmDialog(`¿Eliminar la categoría ${c.name}?`, n ? `${n} motocicleta(s) quedarán sin categoría (no se eliminan).` : 'No tiene motocicletas asociadas.'))) return;
      const { error: err } = await sb.from('categories').delete().eq('id', c.id);
      if (err) { toast(errMsg(err), 'error'); return; }
      toast('Categoría eliminada.'); router();
    }
  });
}

/* =====================================================================
   PEDIDOS
   ===================================================================== */
const ordState = { q: '', status: '', pay: '' };
async function viewOrders(params, t) {
  const { data, error } = await sb.from('orders').select('id,order_number,customer_name,customer_email,customer_phone,total,status,payment_status,payment_method,delivery_method,created_at').order('created_at', { ascending: false }).limit(500);
  if (stale(t)) return;
  if (error) throw error;
  view.innerHTML = `<div class="toolbar">
    <label class="field grow"><span class="sr">Buscar</span><input id="oQ" placeholder="N.º de pedido, cliente, correo o teléfono" value="${esc(ordState.q)}"></label>
    <label class="field"><span class="sr">Estado</span><select id="oSt"><option value="">Todos los estados</option>${Object.entries(ORDER_STATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    <label class="field"><span class="sr">Pago</span><select id="oPay"><option value="">Todos los pagos</option>${Object.entries(PAY_STATUS).map(([k, l]) => `<option value="${k}">Pago ${l.toLowerCase()}</option>`).join('')}</select></label></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Estado</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody id="oBody"></tbody></table></div>`;
  $('#oSt').value = ordState.status; $('#oPay').value = ordState.pay;
  const render = () => {
    const q = ordState.q.toLowerCase();
    const rows = data.filter((o) => (!q || `${o.order_number} ${o.customer_name} ${o.customer_email} ${o.customer_phone}`.toLowerCase().includes(q))
      && (!ordState.status || o.status === ordState.status) && (!ordState.pay || o.payment_status === ordState.pay));
    $('#oBody').innerHTML = rows.length ? rows.map((o) => `<tr class="clickable" data-open-order="${o.id}" tabindex="0">
      <td><b>${esc(o.order_number)}</b></td><td>${fmtDate(o.created_at, true)}</td>
      <td>${esc(o.customer_name)}<span class="sub">${esc(o.customer_email)}</span></td>
      <td>${esc(PAY_METHOD[o.payment_method])}<span class="sub">${o.delivery_method === 'recojo' ? 'Recojo en tienda' : 'Envío'}</span></td>
      <td>${badge('order', o.status)}</td><td>${badge('pay', o.payment_status)}</td><td class="num"><b>${money(o.total)}</b></td></tr>`).join('')
      : `<tr><td colspan="7"><div class="empty" style="border:0">${data.length ? 'No hay pedidos con esos filtros.' : 'Aún no hay pedidos.'}</div></td></tr>`;
  };
  render();
  $('#oQ').addEventListener('input', debounce((e) => { ordState.q = e.target.value; render(); }, 150));
  $('#oSt').addEventListener('change', (e) => { ordState.status = e.target.value; render(); });
  $('#oPay').addEventListener('change', (e) => { ordState.pay = e.target.value; render(); });
  const open = (el) => openOrder(el.dataset.openOrder);
  view.addEventListener('click', (e) => { const r = e.target.closest('[data-open-order]'); if (r) open(r); });
  view.addEventListener('keydown', (e) => { const r = e.target.closest('[data-open-order]'); if (r && e.key === 'Enter') open(r); });
  if (params.get('id')) openOrder(params.get('id'));
}
async function openOrder(id) {
  const { data: o, error } = await sb.from('orders').select('*,order_items(*),payments(*),order_status_history(*)').eq('id', id).maybeSingle();
  if (error || !o) { toast(error ? errMsg(error) : 'Pedido no encontrado.', 'error'); return; }
  const hist = (o.order_status_history || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const pays = (o.payments || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const final = ['cancelado', 'entregado'].includes(o.status);
  const steps = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado'];
  const nextOpts = steps.filter((s) => steps.indexOf(s) > steps.indexOf(o.status));
  const manual = o.payment_method !== 'mercadopago';
  const md = openModal(`<div class="modal-head"><h3>Pedido ${esc(o.order_number)} ${badge('order', o.status)} ${badge('pay', o.payment_status)}</h3>${xBtn}</div>
    <div class="detail-grid">
      <section class="box"><h2 class="section-title">Cliente</h2><dl class="kv">
        <dt>Nombre</dt><dd>${esc(o.customer_name)}</dd><dt>Correo</dt><dd><a href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a></dd>
        <dt>Teléfono</dt><dd><a href="https://wa.me/${esc(o.customer_phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(o.customer_phone)}</a></dd>
        <dt>Documento</dt><dd>${esc(o.customer_document)}</dd>
        <dt>Entrega</dt><dd>${o.delivery_method === 'recojo' ? 'Recojo en tienda' : esc([o.shipping_address, o.shipping_city, o.shipping_region].filter(Boolean).join(', '))}${o.shipping_reference ? `<br><small style="color:var(--muted)">Ref.: ${esc(o.shipping_reference)}</small>` : ''}</dd>
        ${o.notes ? `<dt>Notas</dt><dd>${esc(o.notes)}</dd>` : ''}<dt>Fecha</dt><dd>${fmtDate(o.created_at, true)}</dd></dl></section>
      <section class="box"><h2 class="section-title">Importes</h2>
        ${o.order_items.map((i) => `<div class="sum-row" style="display:flex;justify-content:space-between;padding:6px 0"><span>${esc(i.product_name)}${i.color ? ' · ' + esc(i.color) : ''} × ${i.quantity}<br><small style="color:var(--muted)">${money(i.unit_price)} c/u</small></span><b>${money(i.line_total)}</b></div>`).join('')}
        <dl class="kv" style="border-top:1px solid var(--line);padding-top:10px;margin-top:6px"><dt>Subtotal</dt><dd>${money(o.subtotal)}</dd><dt>Traslado</dt><dd>${money(o.shipping_cost)}</dd><dt><b>Total</b></dt><dd><b>${money(o.total)}</b></dd></dl></section>
      <section class="box"><h2 class="section-title">Pago · ${esc(PAY_METHOD[o.payment_method])}</h2>
        ${pays.map((p) => `<dl class="kv" style="margin-bottom:10px"><dt>Estado</dt><dd>${badge('pay', p.status)}</dd><dt>Monto</dt><dd>${money(p.amount)} ${esc(p.currency)}</dd>
          ${p.provider_payment_id ? `<dt>Referencia</dt><dd>${esc(p.provider_payment_id)}</dd>` : ''}${p.detail ? `<dt>Detalle</dt><dd>${esc(p.detail)}</dd>` : ''}
          ${p.raw?.payment_type_id ? `<dt>Medio</dt><dd>${esc(p.raw.payment_method_id || '')} (${esc(p.raw.payment_type_id)})</dd>` : ''}<dt>Actualizado</dt><dd>${fmtDate(p.updated_at, true)}</dd></dl>`).join('') || '<p class="help">Sin registros de pago.</p>'}
        ${manual && o.status !== 'cancelado' ? `<form id="payForm" class="grid-2" style="margin-top:10px" novalidate>
          <label class="field"><span>Registrar pago</span><select name="status"><option value="aprobado">Aprobado (verificado)</option><option value="rechazado">Rechazado</option><option value="reembolsado">Reembolsado</option></select></label>
          <label class="field"><span>N.º de operación</span><input name="ref" maxlength="60"></label>
          <button class="btn btn-ghost btn-sm span-2">Registrar pago</button></form>` : ''}
        ${!manual ? '<p class="help">El estado de Mercado Pago se actualiza automáticamente por webhook. No se puede modificar manualmente.</p>' : ''}</section>
      <section class="box"><h2 class="section-title">Estado del pedido</h2>
        <ul class="timeline" style="list-style:none;padding-left:0">${hist.map((h) => `<li style="padding:0 0 10px"><b>${esc(ORDER_STATUS[h.status])}</b>${h.note ? ' — ' + esc(h.note) : ''}<br><small style="color:var(--muted)">${fmtDate(h.created_at, true)}</small></li>`).join('')}</ul>
        ${final ? '<p class="help">Este pedido está cerrado.</p>' : `<form id="stForm" novalidate style="display:flex;flex-direction:column;gap:10px">
          <label class="field"><span>Cambiar estado</span><select name="status">${nextOpts.map((s) => `<option value="${s}">${ORDER_STATUS[s]}</option>`).join('')}<option value="cancelado">Cancelar pedido</option></select></label>
          <label class="field"><span>Nota (visible para el cliente)</span><input name="note" maxlength="500" placeholder="Ej.: N.º de guía, fecha de entrega…"></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${o.status === 'pendiente' ? '<button type="button" class="btn btn-primary btn-sm" id="quickConfirm">Confirmar pedido</button>' : ''}<button class="btn btn-ghost btn-sm">Actualizar estado</button></div></form>`}
      </section>
    </div>
    <section class="box" style="margin-top:14px"><h2 class="section-title">Notas internas</h2><textarea class="input" id="adminNotes" maxlength="2000" rows="3" placeholder="Solo visibles para el equipo">${esc(o.admin_notes || '')}</textarea>
      <button class="btn btn-ghost btn-sm" id="saveNotes" style="margin-top:10px">Guardar notas</button></section>`, true);
  const setStatus = async (status, note, btn) => {
    if (status === 'cancelado' && !(await confirmDialog('¿Cancelar este pedido?', 'El stock reservado volverá al inventario y el cliente será notificado.', 'Cancelar pedido'))) { openOrder(id); return; }
    setBusy(btn, true);
    const { error: err } = await sb.rpc('admin_update_order_status', { p_order_id: id, p_status: status, p_note: note || null });
    setBusy(btn, false);
    if (err) { toast(errMsg(err), 'error'); return; }
    toast(`Pedido ${ORDER_STATUS[status].toLowerCase()}. El cliente ya lo ve en su cuenta.`);
    openOrder(id); if (current === 'pedidos' || current === 'dashboard') router(); refreshPills();
  };
  $('#stForm', md)?.addEventListener('submit', (e) => { e.preventDefault(); const d = formData(e.currentTarget); setStatus(d.status, d.note, $('button.btn-ghost', e.currentTarget)); });
  $('#quickConfirm', md)?.addEventListener('click', (e) => setStatus('confirmado', $('#stForm [name=note]', md).value, e.currentTarget));
  $('#payForm', md)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f); const d = formData(f);
    if (d.status === 'aprobado' && d.ref.length < 3) return fieldError(f, 'ref', 'Ingresa el número de operación.');
    const btn = $('button', f); setBusy(btn, true);
    const { error: err } = await sb.rpc('admin_register_payment', { p_order_id: id, p_status: d.status, p_reference: d.ref || null });
    setBusy(btn, false);
    if (err) { toast(errMsg(err), 'error'); return; }
    toast('Pago registrado.'); openOrder(id); if (current === 'pedidos') router();
  });
  $('#saveNotes', md).addEventListener('click', async (e) => {
    setBusy(e.currentTarget, true);
    const { error: err } = await sb.rpc('admin_update_order_notes', { p_order_id: id, p_notes: $('#adminNotes', md).value });
    setBusy(e.currentTarget, false);
    toast(err ? errMsg(err) : 'Notas guardadas.', err ? 'error' : 'ok');
  });
}

/* =====================================================================
   CLIENTES
   ===================================================================== */
async function viewCustomers(_, t) {
  const { data, error } = await sb.rpc('admin_customers');
  if (stale(t)) return;
  if (error) throw error;
  const isAdmin = can('admin');
  let q = '', role = '';
  view.innerHTML = `<div class="toolbar"><label class="field grow"><span class="sr">Buscar</span><input id="cQ" placeholder="Nombre, correo, teléfono o documento"></label>
    <label class="field"><span class="sr">Rol</span><select id="cRole"><option value="">Todos los roles</option>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Registro</th><th class="num">Pedidos</th><th class="num">Compras</th><th>Rol</th><th>Cuenta</th><th></th></tr></thead><tbody id="cBody"></tbody></table></div>`;
  const render = () => {
    const rows = data.filter((c) => (!q || `${c.full_name} ${c.email} ${c.phone || ''} ${c.document_id || ''}`.toLowerCase().includes(q)) && (!role || c.role === role));
    $('#cBody').innerHTML = rows.map((c) => `<tr>
      <td><b>${esc(c.full_name || '—')}</b><span class="sub">${esc(c.email)}</span></td><td>${esc(c.phone || '—')}</td><td>${fmtDate(c.created_at)}</td>
      <td class="num">${c.orders_count}</td><td class="num">${money(c.total_spent)}</td>
      <td>${isAdmin && c.id !== auth.session.user.id ? `<select class="input" style="min-height:34px;padding:4px 30px 4px 10px;width:auto" data-role="${c.id}">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${c.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : esc(ROLES[c.role])}</td>
      <td>${isAdmin && c.id !== auth.session.user.id ? `<label class="switch"><input type="checkbox" data-active="${c.id}" ${c.is_active ? 'checked' : ''} aria-label="Cuenta activa"><span></span></label>` : `<span class="badge ${c.is_active ? 'b-confirmado' : 'b-cancelado'}">${c.is_active ? 'Activa' : 'Inactiva'}</span>`}</td>
      <td><button class="btn btn-ghost btn-sm" data-cview="${c.id}">Ver</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty" style="border:0">Sin resultados.</div></td></tr>';
  };
  render();
  $('#cQ').addEventListener('input', debounce((e) => { q = e.target.value.toLowerCase(); render(); }, 150));
  $('#cRole').addEventListener('change', (e) => { role = e.target.value; render(); });
  view.addEventListener('change', async (e) => {
    const r = e.target.closest('[data-role]');
    if (r) {
      const c = data.find((x) => x.id === r.dataset.role);
      if (r.value !== 'customer' && !(await confirmDialog('¿Dar acceso al panel?', `${esc(c.email)} tendrá el rol <b>${esc(ROLES[r.value])}</b> y podrá entrar a /admin.`, 'Confirmar', false))) { r.value = c.role; return; }
      const { error: err } = await sb.rpc('admin_set_user_role', { p_user: c.id, p_role: r.value });
      if (err) { r.value = c.role; toast(errMsg(err), 'error'); return; }
      c.role = r.value; toast('Rol actualizado.');
    }
    const a = e.target.closest('[data-active]');
    if (a) {
      a.disabled = true;
      const { data: res, error: err } = await sb.functions.invoke('admin-user-status', { body: { user_id: a.dataset.active, active: a.checked } });
      a.disabled = false;
      const msg = err ? (await err.context?.json?.().catch(() => null))?.error || errMsg(err) : null;
      if (msg || !res?.ok) { a.checked = !a.checked; toast(msg || 'No se pudo actualizar la cuenta.', 'error'); return; }
      data.find((x) => x.id === a.dataset.active).is_active = a.checked;
      toast(a.checked ? 'Cuenta activada.' : 'Cuenta desactivada: ya no podrá iniciar sesión ni comprar.');
    }
  });
  view.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-cview]'); if (!v) return;
    const c = data.find((x) => x.id === v.dataset.cview);
    const { data: orders } = await sb.from('orders').select('id,order_number,total,status,payment_status,created_at').eq('user_id', c.id).order('created_at', { ascending: false });
    openModal(`<div class="modal-head"><h3>${esc(c.full_name || c.email)}</h3>${xBtn}</div>
      <dl class="kv"><dt>Correo</dt><dd>${esc(c.email)}</dd><dt>Teléfono</dt><dd>${esc(c.phone || '—')}</dd><dt>Documento</dt><dd>${esc(c.document_id || '—')}</dd>
      <dt>Ubicación</dt><dd>${esc([c.city, c.region].filter(Boolean).join(', ') || '—')}</dd><dt>Registro</dt><dd>${fmtDate(c.created_at, true)}</dd>
      <dt>Rol</dt><dd>${esc(ROLES[c.role])}</dd><dt>Cuenta</dt><dd>${c.is_active ? 'Activa' : 'Inactiva'}</dd></dl>
      <h4 class="section-title">Pedidos (${orders?.length || 0})</h4>
      ${orders?.length ? `<div class="table-wrap"><table class="t" style="min-width:0"><tbody>${orders.map((o) => `<tr class="clickable" data-open-order="${o.id}"><td><b>${esc(o.order_number)}</b><span class="sub">${fmtDate(o.created_at)}</span></td><td>${badge('order', o.status)}</td><td>${badge('pay', o.payment_status)}</td><td class="num">${money(o.total)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="help">Sin pedidos.</p>'}`);
    $$('#modal [data-open-order]').forEach((r) => r.addEventListener('click', () => openOrder(r.dataset.openOrder)));
  });
}

/* =====================================================================
   INVENTARIO
   ===================================================================== */
async function viewInventory(_, t) {
  const { data, error } = await sb.rpc('admin_inventory');
  if (stale(t)) return;
  if (error) throw error;
  const edit = can('admin', 'catalog');
  const out = data.filter((r) => r.state === 'agotado'), low = data.filter((r) => r.state === 'bajo');
  const stateBadge = (s) => `<span class="badge ${s === 'agotado' ? 'b-cancelado' : s === 'bajo' ? 'b-pendiente' : 'b-confirmado'}">${s === 'agotado' ? 'Agotado' : s === 'bajo' ? 'Stock bajo' : 'Normal'}</span>`;
  view.innerHTML = `<div class="alerts">
      ${out.length ? `<div class="alert alert-error"><strong>Agotadas (${out.length}):</strong> ${out.map((r) => esc(r.name)).join(', ')}</div>` : ''}
      ${low.length ? `<div class="alert alert-warn"><strong>Stock bajo (${low.length}):</strong> ${low.map((r) => `${esc(r.name)} (${r.stock})`).join(', ')}</div>` : ''}
      ${!out.length && !low.length ? '<div class="alert alert-ok">Todo el inventario está en niveles normales.</div>' : ''}</div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Motocicleta</th><th class="num">Stock actual</th><th class="num">Alerta en</th><th class="num">Reservadas</th><th class="num">Vendidas</th><th>Estado</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
    ${data.map((r) => `<tr><td><b>${esc(r.name)}</b><span class="sub">${esc(r.brand)}${r.is_published ? '' : ' · oculta'}</span></td>
      <td class="num">${edit ? `<input class="input stock-in" type="number" min="0" value="${r.stock}" data-stock="${r.motorcycle_id}" aria-label="Stock de ${esc(r.name)}">` : r.stock}</td>
      <td class="num">${edit ? `<input class="input stock-in" type="number" min="0" value="${r.low_stock_threshold}" data-thr="${r.motorcycle_id}" aria-label="Umbral de alerta">` : r.low_stock_threshold}</td>
      <td class="num">${r.reserved}</td><td class="num">${r.sold}</td><td>${stateBadge(r.state)}</td>
      ${edit ? `<td><button class="btn btn-ghost btn-sm" data-save="${r.motorcycle_id}">Guardar</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>
    <p class="help" style="margin-top:10px">"Reservadas" son unidades en pedidos pendientes de pago (ya descontadas del stock; vuelven al stock si el pedido se cancela). "Vendidas" son unidades en pedidos confirmados o pagados.</p>`;
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const id = b.dataset.save;
    const stock = parseInt($(`[data-stock="${id}"]`).value, 10), thr = parseInt($(`[data-thr="${id}"]`).value, 10);
    if (!(stock >= 0) || !(thr >= 0)) { toast('Ingresa números enteros mayores o iguales a 0.', 'error'); return; }
    setBusy(b, true);
    const { error: err } = await sb.from('inventory').update({ stock, low_stock_threshold: thr }).eq('motorcycle_id', id);
    setBusy(b, false);
    if (err) { toast(errMsg(err), 'error'); return; }
    toast('Stock actualizado.'); refreshPills(); router();
  });
}

/* =====================================================================
   CONTENIDO Y CONFIGURACIÓN (site_settings)
   ===================================================================== */
async function getSettings() {
  const { data, error } = await sb.from('site_settings').select('key,value');
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.key, r.value]));
}
async function saveSetting(key, value) {
  const { error } = await sb.from('site_settings').upsert({ key, value, updated_by: auth.session.user.id });
  if (error) throw error;
}
const sField = (name, label, val, attrs = '', cls = '') => `<label class="field ${cls}"><span>${label}</span><input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
const sArea = (name, label, val, attrs = '', cls = '') => `<label class="field ${cls}"><span>${label}</span><textarea name="${name}" ${attrs}>${esc(val ?? '')}</textarea></label>`;
function bindSave(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(form);
    const btn = $('button.btn-primary', form); setBusy(btn, true, 'Guardando…');
    try { const ok = await fn(formData(form)); if (ok !== false) toast('Guardado. Los cambios ya se ven en la tienda.'); }
    catch (err) { toast(errMsg(err), 'error'); }
    setBusy(btn, false);
  });
}

async function viewContent(_, t) {
  const [S, { data: motos }] = await Promise.all([getSettings(), sb.from('motorcycles').select('id,name,is_featured,is_published,sort_order,hero_image').order('sort_order')]);
  if (stale(t)) return;
  const h = S.home || {}, c = S.contact || {}, so = S.social || {};
  const services = (h.services || []).map((x) => ({ ...x })), faq = (h.faq || []).map((x) => ({ ...x })), gallery = (h.gallery || []).map((x) => ({ ...x }));
  view.innerHTML = `
  <form class="box" id="heroForm" novalidate><div class="box-head"><h2>Banner principal (hero)</h2></div>
    <div class="form-grid">${sField('hero_word', 'Palabra gigante del hero', h.hero_word || 'RIDE OUT', 'maxlength="14"')}${sField('hero_cta', 'Texto del botón "Explorar"', h.hero_cta, 'maxlength="40"')}<div></div></div>
    <h3 class="section-title">Motocicletas destacadas en el carrusel</h3>
    <div class="table-wrap"><table class="t" style="min-width:0"><thead><tr><th>Moto</th><th>Imagen de hero</th><th class="num">Orden</th><th>Destacada</th></tr></thead><tbody>
    ${(motos || []).map((m) => `<tr><td>${esc(m.name)}${m.is_published ? '' : ' <span class="badge">oculta</span>'}</td><td>${m.hero_image ? '<span class="badge b-confirmado">Sí</span>' : '<span class="badge b-pendiente">Falta</span>'}</td>
      <td class="num"><input class="input stock-in" type="number" data-ord="${m.id}" value="${m.sort_order}"></td>
      <td><label class="switch"><input type="checkbox" data-hf="${m.id}" ${m.is_featured ? 'checked' : ''}><span></span></label></td></tr>`).join('')}</tbody></table></div>
    <p class="help">Solo aparecen en el carrusel las motos publicadas, destacadas y con imagen de hero (PNG transparente). Se cargan en el orden indicado.</p>
    <div class="modal-foot"><button class="btn btn-primary">Guardar banner</button></div></form>

  <form class="box" id="homeForm" novalidate><div class="box-head"><h2>Textos de la página principal</h2></div>
    <div class="form-grid">${sField('catalog_title', 'Título del catálogo', h.catalog_title, 'maxlength="60"')}${sField('catalog_subtitle', 'Subtítulo del catálogo', h.catalog_subtitle, 'maxlength="160"', 's2')}
      ${sField('about_title', 'Título de "Nosotros"', h.about_title, 'maxlength="60"')}${sArea('about_text', 'Texto de "Nosotros"', h.about_text, 'maxlength="1200" rows="4"', 's2')}</div>
    <h3 class="section-title">Servicios</h3><div class="rows" id="svcRows"></div><button type="button" class="btn btn-ghost btn-sm" id="addSvc" style="margin-top:10px">+ Agregar servicio</button>
    <h3 class="section-title">Preguntas frecuentes</h3><div class="rows" id="faqRows"></div><button type="button" class="btn btn-ghost btn-sm" id="addFaq" style="margin-top:10px">+ Agregar pregunta</button>
    <h3 class="section-title">Galería (imágenes adicionales)</h3>
    <label class="drop" id="galDrop"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><b>Subir imágenes a la galería</b><span>Se muestran junto a las fotos de las motocicletas</span></label>
    <div class="imgs" id="galList" style="margin-top:12px"></div>
    <div class="modal-foot"><button class="btn btn-primary">Guardar textos y galería</button></div></form>

  <form class="box" id="contactForm" novalidate><div class="box-head"><h2>Información de contacto y redes sociales</h2></div>
    <div class="form-grid">
      ${sField('whatsapp', 'WhatsApp (con código de país, ej. 51987654321)', c.whatsapp, 'inputmode="tel" maxlength="20"')}${sField('phone', 'Teléfono', c.phone, 'maxlength="20"')}${sField('email', 'Correo', c.email, 'type="email" maxlength="120"')}
      ${sField('address', 'Dirección de la tienda', c.address, 'maxlength="200"', 's2')}${sField('city', 'Ciudad', c.city, 'maxlength="80"')}
      ${sField('hours', 'Horario de atención', c.hours, 'maxlength="120"')}${sField('map_url', 'Enlace de Google Maps', c.map_url, 'type="url" maxlength="400"', 's2')}
      ${sField('instagram', 'Instagram (URL)', so.instagram, 'type="url"')}${sField('facebook', 'Facebook (URL)', so.facebook, 'type="url"')}${sField('tiktok', 'TikTok (URL)', so.tiktok, 'type="url"')}${sField('youtube', 'YouTube (URL)', so.youtube, 'type="url"')}
    </div><div class="modal-foot"><button class="btn btn-primary">Guardar contacto</button></div></form>`;

  bindSave($('#heroForm'), async (d) => {
    await saveSetting('home', { ...(S.home || {}), hero_word: (d.hero_word || 'RIDE OUT').toUpperCase(), hero_cta: d.hero_cta || 'Explorar motocicletas' });
    S.home = { ...(S.home || {}), hero_word: (d.hero_word || 'RIDE OUT').toUpperCase(), hero_cta: d.hero_cta };
    const ups = (motos || []).map((m) => {
      const feat = $(`[data-hf="${m.id}"]`).checked, ord = parseInt($(`[data-ord="${m.id}"]`).value, 10) || 0;
      return feat !== m.is_featured || ord !== m.sort_order ? sb.from('motorcycles').update({ is_featured: feat, sort_order: ord }).eq('id', m.id) : null;
    }).filter(Boolean);
    const res = await Promise.all(ups);
    const err = res.find((r) => r.error); if (err) throw err.error;
  });
  const rowsUI = (el, arr, a, b, la, lb) => {
    el.innerHTML = arr.map((x, i) => `<div class="row-item"><label class="field"><span>${la}</span><input data-k="${a}" data-i="${i}" value="${esc(x[a] || '')}" maxlength="140"></label>
      <label class="field"><span>${lb}</span><textarea data-k="${b}" data-i="${i}" rows="2" maxlength="600">${esc(x[b] || '')}</textarea></label>
      <button type="button" class="btn btn-danger btn-sm" data-rm-i="${i}">Quitar</button></div>`).join('') || '<p class="help">Vacío.</p>';
  };
  const svcEl = $('#svcRows'), faqEl = $('#faqRows');
  const rerender = () => { rowsUI(svcEl, services, 'title', 'text', 'Título', 'Descripción'); rowsUI(faqEl, faq, 'q', 'a', 'Pregunta', 'Respuesta'); };
  rerender();
  [[svcEl, services], [faqEl, faq]].forEach(([el, arr]) => {
    el.addEventListener('input', (e) => { const x = e.target; if (x.dataset.k) arr[+x.dataset.i][x.dataset.k] = x.value; });
    el.addEventListener('click', (e) => { const r = e.target.closest('[data-rm-i]'); if (r) { arr.splice(+r.dataset.rmI, 1); rerender(); } });
  });
  $('#addSvc').addEventListener('click', () => { services.push({ title: '', text: '' }); rerender(); });
  $('#addFaq').addEventListener('click', () => { faq.push({ q: '', a: '' }); rerender(); });
  const renderGal = () => {
    $('#galList').innerHTML = gallery.map((g, i) => `<div class="img-card"><div class="ph">${imgHTML(g.url, g.caption || '')}</div><div class="bar" style="flex-direction:column">
      <input class="input" data-gcap="${i}" value="${esc(g.caption || '')}" placeholder="Leyenda" maxlength="80" style="min-height:34px;padding:6px 10px"><button type="button" class="btn btn-danger btn-sm" data-grm="${i}">Quitar</button></div></div>`).join('');
  };
  renderGal();
  $('#galList').addEventListener('input', (e) => { if (e.target.dataset.gcap) gallery[+e.target.dataset.gcap].caption = e.target.value; });
  $('#galList').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-grm]'); if (!r) return;
    const g = gallery.splice(+r.dataset.grm, 1)[0]; renderGal();
    if (g.path) await sb.storage.from('motorcycles').remove([g.path]);
    toast('Imagen quitada. Guarda para confirmar.');
  });
  $('#galDrop input').addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      try { const up = await uploadImage(f, 'site/gallery'); gallery.push({ url: up.url, path: up.path, caption: '' }); renderGal(); }
      catch (err) { toast(`${f.name}: ${errMsg(err)}`, 'error'); }
    }
    toast('Imágenes subidas. Guarda para publicarlas.');
  });
  bindSave($('#homeForm'), async (d) => {
    const clean = (arr, a, b) => arr.map((x) => ({ [a]: (x[a] || '').trim(), [b]: (x[b] || '').trim() })).filter((x) => x[a] && x[b]);
    const value = { ...(S.home || {}), catalog_title: d.catalog_title, catalog_subtitle: d.catalog_subtitle, about_title: d.about_title, about_text: d.about_text,
      services: clean(services, 'title', 'text'), faq: clean(faq, 'q', 'a'), gallery: gallery.map((g) => ({ url: g.url, path: g.path || null, caption: (g.caption || '').trim() })) };
    await saveSetting('home', value); S.home = value;
  });
  bindSave($('#contactForm'), async (d) => {
    const form = $('#contactForm');
    const wa = d.whatsapp.replace(/\D/g, '');
    if (d.whatsapp && !/^\d{8,15}$/.test(wa)) { fieldError(form, 'whatsapp', 'Número no válido: incluye el código de país, sin espacios (ej. 51987654321).'); return false; }
    if (d.email && !RX.email.test(d.email)) { fieldError(form, 'email', 'Correo no válido.'); return false; }
    for (const k of ['map_url', 'instagram', 'facebook', 'tiktok', 'youtube']) if (d[k] && !/^https:\/\/\S+$/i.test(d[k])) { fieldError(form, k, 'Debe ser un enlace https://'); return false; }
    await saveSetting('contact', { whatsapp: wa, phone: d.phone, email: d.email, address: d.address, city: d.city, hours: d.hours, map_url: d.map_url });
    await saveSetting('social', { instagram: d.instagram, facebook: d.facebook, tiktok: d.tiktok, youtube: d.youtube });
  });
}

async function viewSettings(_, t) {
  const S = await getSettings();
  if (stale(t)) return;
  const st = S.store || {}, p = S.payments || {}, sh = S.shipping || {}, lg = S.legal || {};
  const pay = (k, label) => `<div class="box" style="background:var(--bg2)"><label class="check" style="color:var(--text)"><input type="checkbox" name="${k}_enabled" ${p[k]?.enabled ? 'checked' : ''}> <b>${label}</b></label>
    <div class="form-grid" style="margin-top:12px">${sField(k + '_label', 'Nombre visible', p[k]?.label || label, 'maxlength="80"', 's3')}
    ${k !== 'mercadopago' ? sArea(k + '_instructions', k === 'transferencia' ? 'Instrucciones (banco, N.º de cuenta, CCI, titular)' : 'Instrucciones', p[k]?.instructions, 'maxlength="800" rows="3"', 's3') : ''}</div>
    ${k === 'mercadopago' ? '<p class="help">Requiere los secretos <code>MP_ACCESS_TOKEN</code> y <code>SITE_URL</code> en Supabase → Edge Functions → Secrets. Sin ellos, el cliente verá un aviso y el pedido quedará pendiente. Los pagos nunca se aprueban sin la confirmación de Mercado Pago.</p>' : ''}</div>`;
  view.innerHTML = `
  <form class="box" id="storeForm" novalidate><div class="box-head"><h2>Datos de la tienda</h2></div>
    <div class="form-grid">${sField('name', 'Nombre de la tienda', st.name || 'HALVEN MOTOS', 'maxlength="60" required')}${sField('legal_name', 'Razón social', st.legal_name, 'maxlength="120"')}${sField('ruc', 'RUC', st.ruc, 'maxlength="11" inputmode="numeric"')}
      ${sField('tagline', 'Eslogan', st.tagline, 'maxlength="120"', 's2')}<label class="field"><span>Moneda</span><input value="Sol peruano — PEN (S/)" disabled></label>
      <div class="field s3"><span>Logotipo (se muestra en la cabecera y el menú; el hero conserva su logotipo original)</span>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div id="logoPrev" style="min-width:120px;min-height:40px;display:grid;place-items:center;background:var(--bg2);border-radius:10px;padding:8px">${st.logo_url ? `<img src="${esc(st.logo_url)}" alt="Logo" style="height:36px">` : '<span class="help" style="margin:0">Texto "HalvenMotos®"</span>'}</div>
        <label class="btn btn-ghost btn-sm">Subir logotipo<input type="file" id="logoFile" accept="image/png,image/webp,image/jpeg" hidden></label>
        ${st.logo_url ? '<button type="button" class="btn btn-danger btn-sm" id="logoClear">Quitar</button>' : ''}</div></div></div>
    <div class="modal-foot"><button class="btn btn-primary">Guardar datos</button></div></form>
  <form class="box" id="payForm" novalidate><div class="box-head"><h2>Métodos de pago</h2></div>
    <div class="grid-charts">${pay('transferencia', 'Transferencia bancaria')}${pay('tienda', 'Pago en tienda')}${pay('mercadopago', 'Mercado Pago (tarjeta, Yape, PagoEfectivo)')}</div>
    <div class="modal-foot"><button class="btn btn-primary">Guardar métodos de pago</button></div></form>
  <form class="box" id="shipForm" novalidate><div class="box-head"><h2>Envíos</h2></div>
    <div class="form-grid">${sField('envio_cost', 'Costo de traslado (S/)', sh.envio_cost ?? 0, 'type="number" min="0" step="0.01"')}${sField('free_from', 'Traslado gratis desde (S/, opcional)', sh.free_from ?? '', 'type="number" min="0" step="0.01"')}
      ${sField('note', 'Nota visible al finalizar la compra', sh.note, 'maxlength="200"')}</div>
    <div class="modal-foot"><button class="btn btn-primary">Guardar envíos</button></div></form>
  <form class="box" id="legalForm" novalidate><div class="box-head"><h2>Textos legales</h2><p>Si los dejas vacíos se muestra una plantilla base. Revísalos con tu asesor legal.</p></div>
    ${sArea('privacy', 'Política de privacidad (separa párrafos con una línea en blanco)', lg.privacy, 'rows="8" maxlength="20000"')}
    <div style="height:12px"></div>${sArea('terms', 'Términos y condiciones', lg.terms, 'rows="8" maxlength="20000"')}
    <div class="modal-foot"><button class="btn btn-primary">Guardar textos legales</button></div></form>`;
  let logo = st.logo_url || null;
  $('#logoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const up = await uploadImage(f, 'site/logo'); logo = up.url; $('#logoPrev').innerHTML = `<img src="${esc(logo)}" alt="Logo" style="height:36px">`; toast('Logotipo subido. Guarda para aplicarlo.'); }
    catch (err) { toast(errMsg(err), 'error'); }
  });
  $('#logoClear')?.addEventListener('click', () => { logo = null; $('#logoPrev').innerHTML = '<span class="help" style="margin:0">Texto "HalvenMotos®"</span>'; });
  bindSave($('#storeForm'), async (d) => {
    if (d.ruc && !/^\d{11}$/.test(d.ruc)) { fieldError($('#storeForm'), 'ruc', 'El RUC debe tener 11 dígitos.'); return false; }
    if (d.name.length < 2) { fieldError($('#storeForm'), 'name', 'Ingresa el nombre.'); return false; }
    await saveSetting('store', { ...st, name: d.name, legal_name: d.legal_name, ruc: d.ruc, tagline: d.tagline, logo_url: logo, currency: 'PEN', currency_symbol: 'S/' });
  });
  bindSave($('#payForm'), async () => {
    const f = $('#payForm'), val = {};
    for (const k of ['transferencia', 'tienda', 'mercadopago']) {
      val[k] = { enabled: f.elements[k + '_enabled'].checked, label: f.elements[k + '_label'].value.trim() || PAY_METHOD[k], ...(f.elements[k + '_instructions'] ? { instructions: f.elements[k + '_instructions'].value.trim() } : {}) };
    }
    if (!Object.values(val).some((v) => v.enabled)) { toast('Debe haber al menos un método de pago activo.', 'error'); return false; }
    await saveSetting('payments', val);
  });
  bindSave($('#shipForm'), async (d) => {
    const cost = Number(d.envio_cost || 0), free = d.free_from === '' ? null : Number(d.free_from);
    if (!(cost >= 0) || (free !== null && !(free >= 0))) { toast('Ingresa montos válidos.', 'error'); return false; }
    await saveSetting('shipping', { envio_cost: cost, free_from: free, note: d.note });
  });
  bindSave($('#legalForm'), async (d) => { await saveSetting('legal', { privacy: d.privacy, terms: d.terms }); });
}

