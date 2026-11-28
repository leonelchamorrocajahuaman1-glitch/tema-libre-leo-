// HALVEN MOTOS — tienda del cliente (SPA con rutas por hash)
import {
  sb, $, $$, esc, money, fmtDate, debounce, hexToRgb, toast, errMsg, loadSettings, waLink,
  auth, onAuth, authReady, loadProfile, isStaff, getCart, setCart, addToCart, cartCount,
  MOTO_FIELDS, coverOf, stockOf, availability, imgHTML, badge, formData, setBusy, fieldError, clearErrors,
  RX, ORDER_STATUS, PAY_METHOD, PERU_REGIONS,
} from './core.js';
import { createHero } from './hero.js';

const app = $('#app');
const BASE = location.origin + location.pathname;
let S = {};               // ajustes del sitio
let favs = new Set();     // ids favoritos del usuario
let renderToken = 0;

/* =====================================================================
   ARRANQUE
   ===================================================================== */
const settingsP = loadSettings().then((s) => { S = s; applySettings(); return s; });

// Hero: motos destacadas desde la base de datos
const heroSlidesP = sb.from('motorcycles').select(MOTO_FIELDS)
  .eq('is_published', true).eq('is_featured', true).not('hero_image', 'is', null)
  .order('sort_order').limit(10)
  .then(({ data, error }) => {
    if (error) throw error;
    return (data || []).map((m) => ({ rgb: hexToRgb(m.hero_color) || [40, 42, 50], image: m.hero_image, moto: m }));
  });
heroSlidesP.catch((e) => console.warn('hero', e));
const hero = createHero({
  slides: heroSlidesP,
  onSlide: (i, slide) => fillHeroPanel(slide?.moto),
  onUserChange: (slide) => { $('#status').textContent = slide?.moto?.name || ''; },
});
let heroMoto = null;
function fillHeroPanel(m) {
  if (!m) return;
  heroMoto = m;
  const set = (k, v) => { const el = $(`[data-spec="${k}"]`); if (el) el.textContent = v; };
  $('#heroName').textContent = m.name;
  $('#heroName').href = `#/moto/${m.slug}`;
  $('#heroPrice').textContent = money(m.price);
  set('cc', m.displacement_cc ? `${m.displacement_cc} cc` : '—');
  set('hp', m.power_hp ? `${Number(m.power_hp)} hp` : '—');
  set('speed', m.top_speed_kmh ? `${m.top_speed_kmh} km/h` : '—');
  set('acc', m.acceleration_s ? `${Number(m.acceleration_s)} s` : '—');
  set('range', m.range_km ? `${m.range_km} km` : (m.tank_l ? `${Number(m.tank_l)} L` : '—'));
  set('cool', m.cooling || '—');
  const buy = $('#heroBuy');
  const out = stockOf(m) <= 0;
  buy.disabled = out;
  buy.textContent = out ? 'Agotado' : 'Comprar';
  const ask = $('#heroAsk');
  const wa = waLink(S.contact?.whatsapp, `Hola HALVEN MOTOS, quiero información sobre la ${m.name}.`);
  if (wa) { ask.href = wa; ask.target = '_blank'; ask.rel = 'noopener'; ask.removeAttribute('data-scroll'); }
}
$('#heroBuy').addEventListener('click', () => {
  if (!heroMoto) return;
  addToCart(heroMoto.id, heroMoto.colors?.[0]?.name || null, 1);
  location.hash = '#/checkout';
});

function applySettings() {
  const st = S.store || {}, c = S.contact || {};
  if (st.logo_url) $$('[data-store-logo]').forEach((el) => { el.innerHTML = `<img src="${esc(st.logo_url)}" alt="${esc(st.name || 'HALVEN MOTOS')}">`; });
  const word = S.home?.hero_word;
  if (word) hero.setWord(word);
  const cta = S.home?.hero_cta; if (cta) $$('[data-hero-cta]').forEach((a) => a.textContent = cta);
  const wa = waLink(c.whatsapp, 'Hola HALVEN MOTOS, quiero información sobre sus motocicletas.');
  const f = $('#waFloat');
  if (wa) { f.href = wa; f.hidden = false; } else f.hidden = true;
  if (heroMoto) fillHeroPanel(heroMoto);
  renderFooter();
}

/* =====================================================================
   NAVEGACIÓN GLOBAL
   ===================================================================== */
function updateCartBadges() {
  const n = cartCount();
  $$('[data-cart-count]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
}
window.addEventListener('cart:change', updateCartBadges);
window.addEventListener('storage', updateCartBadges);
updateCartBadges();

const drawer = $('#drawer');
function openMenu() { drawer.hidden = false; document.body.style.overflow = 'hidden'; $('.drawer-panel a', drawer)?.focus(); }
function closeMenu() { drawer.hidden = true; document.body.style.overflow = ''; }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-menu]')) { openMenu(); return; }
  if (e.target.closest('[data-close-menu]') || (e.target.closest('.drawer-panel a'))) closeMenu();
  const sc = e.target.closest('[data-scroll]');
  if (sc) {
    e.preventDefault();
    const id = sc.dataset.scroll;
    if (!isHome()) { location.hash = '#/' + id; return; }
    scrollToSection(id);
  }
  if (e.target.closest('[data-logout]')) logout();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!drawer.hidden) closeMenu(); $('#notifPop').hidden = true; closeModal(); }
});
async function logout() {
  await sb.auth.signOut();
  favs = new Set();
  toast('Sesión cerrada.');
  location.hash = '#/';
}

// Cabecera fija: aparece al pasar el hero
const siteHeader = $('#siteHeader');
const onScroll = () => {
  const past = !isHome() || window.scrollY > window.innerHeight - 90;
  siteHeader.classList.toggle('show', isHome() && past);
  document.body.classList.toggle('past-hero', past);
};
window.addEventListener('scroll', onScroll, { passive: true });

onAuth(async (a) => {
  const logged = !!a.session;
  $$('[data-auth-only]').forEach((el) => el.hidden = !logged);
  $$('[data-guest-only]').forEach((el) => el.hidden = logged);
  $$('[data-staff-only]').forEach((el) => el.hidden = !isStaff());
  $('#accountLink').href = logged ? '#/cuenta' : '#/login';
  if (logged) { await loadFavs(); initNotifications(); } else { favs = new Set(); stopNotifications(); }
});

async function loadFavs() {
  const { data } = await sb.from('favorites').select('motorcycle_id');
  favs = new Set((data || []).map((r) => r.motorcycle_id));
  $$('[data-fav]').forEach((b) => b.classList.toggle('on', favs.has(b.dataset.fav)));
}
async function toggleFav(id, btn) {
  if (!auth.session) { toast('Inicia sesión para guardar favoritos.', 'info'); location.hash = '#/login?next=' + encodeURIComponent(currentPath()); return; }
  const on = favs.has(id);
  btn.disabled = true;
  const { error } = on
    ? await sb.from('favorites').delete().eq('user_id', auth.session.user.id).eq('motorcycle_id', id)
    : await sb.from('favorites').insert({ user_id: auth.session.user.id, motorcycle_id: id });
  btn.disabled = false;
  if (error) { toast(errMsg(error), 'error'); return; }
  on ? favs.delete(id) : favs.add(id);
  $$(`[data-fav="${id}"]`).forEach((b) => { b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on)); });
  toast(on ? 'Quitada de favoritos.' : 'Guardada en favoritos.');
}
document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-fav]');
  if (f) { e.preventDefault(); toggleFav(f.dataset.fav, f); }
  const b = e.target.closest('[data-buy]');
  if (b) { e.preventDefault(); addToCart(b.dataset.buy, b.dataset.color || null, 1); location.hash = '#/checkout'; }
  const add = e.target.closest('[data-add]');
  if (add) { e.preventDefault(); addToCart(add.dataset.add, add.dataset.color || null, 1); toast('Agregada al carrito.'); }
});

/* ---------- notificaciones ---------- */
let notifChannel = null;
async function refreshNotifications() {
  if (!auth.session) return;
  const { data } = await sb.from('notifications').select('id,title,body,order_id,read_at,created_at')
    .eq('user_id', auth.session.user.id).order('created_at', { ascending: false }).limit(15);
  const list = data || [];
  const unread = list.filter((n) => !n.read_at).length;
  const c = $('#notifCount'); c.textContent = unread; c.hidden = unread === 0;
  $('#notifPop').innerHTML = `<h4>Notificaciones</h4>` + (list.length ? list.map((n) => `
    <a class="notif-item ${n.read_at ? '' : 'unread'}" href="${n.order_id ? '#/pedido/' + n.order_id : '#/pedidos'}" data-notif="${n.id}">
      ${esc(n.title)}<small>${esc(n.body || '')} · ${fmtDate(n.created_at, true)}</small></a>`).join('') : '<p class="notif-item"><small>Sin notificaciones por ahora.</small></p>');
}
function initNotifications() {
  refreshNotifications();
  if (notifChannel) return;
  notifChannel = sb.channel('notif-' + auth.session.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${auth.session.user.id}` }, (p) => {
      toast(p.new.title, 'info', 6000);
      refreshNotifications();
      if (/^\/pedido/.test(currentPath())) router();
    }).subscribe();
}
function stopNotifications() { if (notifChannel) { sb.removeChannel(notifChannel); notifChannel = null; } }
$('#notifBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#notifPop'); p.hidden = !p.hidden;
  $('#notifBtn').setAttribute('aria-expanded', String(!p.hidden));
});
document.addEventListener('click', async (e) => {
  const n = e.target.closest('[data-notif]');
  if (n) { $('#notifPop').hidden = true; await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.dataset.notif); refreshNotifications(); }
  else if (!e.target.closest('.notif-wrap')) $('#notifPop').hidden = true;
});

/* ---------- modal ---------- */
function openModal(html, wide = false) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="modal-backdrop" data-close-modal></div><div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target.closest('[data-close-modal]')) closeModal(); });
  $('input,button,select,textarea', m.querySelector('.modal-card'))?.focus();
  return m;
}
function closeModal() { $('#modal')?.remove(); }

/* =====================================================================
   ROUTER
   ===================================================================== */
const SECTIONS = ['catalogo', 'servicios', 'nosotros', 'galeria', 'faq', 'contacto'];
function parseHash() {
  const h = location.hash || '#/';
  if (!h.startsWith('#/')) return { path: '/', section: h.slice(1), query: new URLSearchParams() };
  const [p, q] = h.slice(1).split('?');
  return { path: p.replace(/\/+$/, '') || '/', query: new URLSearchParams(q || ''), section: '' };
}
const currentPath = () => parseHash().path;
const isHome = () => { const p = currentPath(); return p === '/' || SECTIONS.includes(p.slice(1)); };
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

const ROUTES = [
  [/^\/$/, viewHome],
  [/^\/(catalogo|servicios|nosotros|galeria|faq|contacto)$/, viewHome],
  [/^\/moto\/([a-z0-9-]+)$/, viewDetail],
  [/^\/carrito$/, viewCart],
  [/^\/checkout$/, viewCheckout],
  [/^\/login$/, viewLogin],
  [/^\/registro$/, viewRegister],
  [/^\/recuperar$/, viewRecover],
  [/^\/restablecer$/, viewReset],
  [/^\/cuenta$/, viewAccount],
  [/^\/pedidos$/, viewOrders],
  [/^\/pedido\/([0-9a-f-]{36})$/, viewOrder],
  [/^\/favoritos$/, viewFavorites],
  [/^\/privacidad$/, () => viewLegal('privacy')],
  [/^\/terminos$/, () => viewLegal('terms')],
];
let homeRendered = false;
async function router() {
  const { path, query, section } = parseHash();
  const token = ++renderToken;
  closeMenu();
  const home = path === '/' || SECTIONS.includes(path.slice(1));
  document.body.classList.toggle('route-home', home);
  $$('.sh-links a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + path));
  onScroll();
  if (home) {
    if (!homeRendered) { await viewHome(); homeRendered = true; }
    const target = section || (path !== '/' ? path.slice(1) : '');
    if (target) requestAnimationFrame(() => scrollToSection(target));
    document.title = 'HALVEN MOTOS | Ride Out';
    return;
  }
  homeRendered = false;
  for (const [rx, fn] of ROUTES) {
    const m = rx.exec(path);
    if (m) {
      app.innerHTML = '<div class="container page"><div class="spinner" aria-label="Cargando"></div></div>';
      window.scrollTo(0, 0);
      try { await fn(m[1], query, token); } catch (e) { console.error(e); if (token === renderToken) viewError(e); }
      if (token === renderToken) app.focus({ preventScroll: true });
      return;
    }
  }
  view404();
}
window.addEventListener('hashchange', router);
const stale = (t) => t !== renderToken;

function view404() {
  document.title = 'Página no encontrada | HALVEN MOTOS';
  app.innerHTML = `<div class="container page"><div class="empty"><h3>Página no encontrada</h3><p>La dirección no existe o fue movida.</p><a class="btn btn-primary" href="#/">Volver al inicio</a></div></div>`;
}
function viewError(e) {
  app.innerHTML = `<div class="container page"><div class="empty"><h3>No pudimos cargar esta página</h3><p>${esc(errMsg(e))}</p><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div></div>`;
}
function requireAuth(next) {
  if (auth.session) return true;
  location.hash = '#/login?next=' + encodeURIComponent(next || currentPath());
  return false;
}

/* =====================================================================
   INICIO (debajo del hero)
   ===================================================================== */
async function viewHome() {
  await settingsP;
  const h = S.home || {};
  app.innerHTML = `
  <section class="sec" id="catalogo" aria-labelledby="catTitle">
    <div class="container">
      <div class="sec-head reveal">
        <div><span class="eyebrow">Catálogo</span><h2 id="catTitle">${esc(h.catalog_title || 'Catálogo')}</h2></div>
        <p>${esc(h.catalog_subtitle || '')}</p>
      </div>
      <div id="catalogMount"></div>
    </div>
  </section>
  <section class="sec" id="nosotros" aria-labelledby="aboutTitle">
    <div class="container about">
      <div class="reveal">
        <span class="eyebrow">Nosotros</span>
        <h2 class="page-title" id="aboutTitle">${esc(h.about_title || 'Nosotros')}</h2>
        <p style="margin-top:18px">${esc(h.about_text || '')}</p>
        <div class="stats" id="aboutStats"></div>
      </div>
      <div class="about-media reveal">${imgHTML('sheet:0', 'Motocicleta HALVEN MOTOS')}</div>
    </div>
  </section>
  <section class="sec" id="servicios" aria-labelledby="servTitle">
    <div class="container">
      <div class="sec-head reveal"><div><span class="eyebrow">Servicios</span><h2 id="servTitle">Más que una venta</h2></div>
      <p>Te acompañamos antes, durante y después de tu compra.</p></div>
      <div class="services">${(h.services || []).map((s, i) => `
        <article class="service reveal"><div class="n">${String(i + 1).padStart(2, '0')}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('')}</div>
    </div>
  </section>
  <section class="sec" id="galeria" aria-labelledby="galTitle">
    <div class="container">
      <div class="sec-head reveal"><div><span class="eyebrow">Galería</span><h2 id="galTitle">En detalle</h2></div></div>
      <div class="gallery" id="galleryMount"></div>
    </div>
  </section>
  <section class="sec" id="faq" aria-labelledby="faqTitle">
    <div class="container">
      <div class="sec-head reveal"><div><span class="eyebrow">Preguntas frecuentes</span><h2 id="faqTitle">Resolvemos tus dudas</h2></div></div>
      <div class="faq">${(h.faq || []).map((f) => `<details class="reveal"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
    </div>
  </section>
  <section class="sec" id="contacto" aria-labelledby="ctTitle">
    <div class="container">
      <div class="sec-head reveal"><div><span class="eyebrow">Contacto</span><h2 id="ctTitle">Hablemos de tu próxima moto</h2></div></div>
      <div class="contact-grid" id="contactMount"></div>
    </div>
  </section>`;
  observeReveal();
  mountCatalog($('#catalogMount'));
  renderContact($('#contactMount'));
  renderGalleryAndStats();
}
function observeReveal() {
  const els = $$('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}
async function renderGalleryAndStats() {
  const { data } = await sb.from('motorcycles').select('id,name,slug,hero_color,brand,category_id,motorcycle_images(url,alt,sort_order)').eq('is_published', true);
  const motos = data || [];
  const items = [
    ...((S.home?.gallery || []).filter((g) => g?.url).map((g) => ({ url: g.url, caption: g.caption || '', c: '#2a2e36' }))),
    ...motos.flatMap((m) => (m.motorcycle_images || []).map((i) => ({ url: i.url, caption: m.name, c: m.hero_color, slug: m.slug }))),
  ].slice(0, 9);
  const g = $('#galleryMount');
  if (g) g.innerHTML = items.length ? items.map((it) => `<figure class="reveal" style="--c:${esc(it.c || '#2a2e36')}">
      ${it.slug ? `<a href="#/moto/${esc(it.slug)}" style="display:contents">` : ''}${imgHTML(it.url, it.caption)}${it.slug ? '</a>' : ''}
      ${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ''}</figure>`).join('') : '<p class="empty">Pronto publicaremos nuevas fotografías.</p>';
  const st = $('#aboutStats');
  if (st) {
    const brands = new Set(motos.map((m) => m.brand)).size;
    const cats = new Set(motos.map((m) => m.category_id).filter(Boolean)).size;
    st.innerHTML = `<div><b>${motos.length}</b><span>modelos en catálogo</span></div><div><b>${brands}</b><span>${brands === 1 ? 'marca' : 'marcas'}</span></div><div><b>${cats}</b><span>${cats === 1 ? 'categoría' : 'categorías'}</span></div>`;
  }
  observeReveal();
}
function renderContact(el) {
  const c = S.contact || {}, so = S.social || {};
  const item = (icon, label, value, href) => value ? `<a class="contact-item" ${href ? `href="${esc(href)}" target="_blank" rel="noopener"` : ''}>${icon}<div><small>${label}</small>${esc(value)}</div></a>` : '';
  const ic = {
    wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z"/></svg>',
    ph: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    em: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    clk: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  const list = [
    item(ic.wa, 'WhatsApp', c.whatsapp, waLink(c.whatsapp)),
    item(ic.ph, 'Teléfono', c.phone, c.phone ? 'tel:' + c.phone.replace(/\s/g, '') : ''),
    item(ic.em, 'Correo', c.email, c.email ? 'mailto:' + c.email : ''),
    item(ic.pin, 'Dirección', [c.address, c.city].filter(Boolean).join(', '), c.map_url || ''),
    item(ic.clk, 'Horario', c.hours, ''),
  ].join('');
  const socials = Object.entries({ Instagram: so.instagram, Facebook: so.facebook, TikTok: so.tiktok, YouTube: so.youtube })
    .filter(([, v]) => v).map(([k, v]) => `<a class="btn btn-ghost btn-sm" href="${esc(v)}" target="_blank" rel="noopener">${k}</a>`).join('');
  const canSend = !!(c.whatsapp || c.email);
  el.innerHTML = `
    <div class="contact-list reveal">${list || '<div class="alert">Muy pronto publicaremos nuestros canales de atención.</div>'}
      ${socials ? `<div class="socials">${socials}</div>` : ''}</div>
    <form class="panel reveal" id="contactForm" novalidate>
      <h3>Envíanos tu consulta</h3>
      <div class="grid-2">
        <label class="field"><span>Nombre</span><input name="name" required maxlength="80" autocomplete="name"></label>
        <label class="field"><span>Teléfono</span><input name="phone" maxlength="20" autocomplete="tel" inputmode="tel"></label>
        <label class="field span-2"><span>Mensaje</span><textarea name="msg" required maxlength="800" placeholder="¿Qué moto te interesa? ¿Quieres financiamiento o una prueba de manejo?"></textarea></label>
      </div>
      <button class="btn btn-primary" style="margin-top:16px" ${canSend ? '' : 'disabled'}>${c.whatsapp ? 'Enviar por WhatsApp' : 'Enviar por correo'}</button>
      ${canSend ? '' : '<p class="field-err" style="margin-top:8px;color:var(--muted)">Los canales de contacto aún no están configurados.</p>'}
    </form>`;
  $('#contactForm', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget; clearErrors(f);
    const d = formData(f);
    if (d.name.length < 2) return fieldError(f, 'name', 'Ingresa tu nombre.');
    if (d.phone && !RX.phone.test(d.phone)) return fieldError(f, 'phone', 'Teléfono no válido.');
    if (d.msg.length < 5) return fieldError(f, 'msg', 'Escribe tu consulta.');
    const text = `Hola HALVEN MOTOS, soy ${d.name}${d.phone ? ' (' + d.phone + ')' : ''}.\n${d.msg}`;
    if (c.whatsapp) window.open(waLink(c.whatsapp, text), '_blank', 'noopener');
    else location.href = `mailto:${c.email}?subject=${encodeURIComponent('Consulta desde la web')}&body=${encodeURIComponent(text)}`;
    f.reset(); toast('¡Gracias! Te responderemos pronto.');
  });
}
function renderFooter() {
  const st = S.store || {}, c = S.contact || {}, so = S.social || {};
  $('#footer').innerHTML = `<div class="container">
    <div class="ft-grid">
      <div><div class="ft-brand">${esc(st.name || 'HALVEN MOTOS')}</div><p>${esc(st.tagline || '')}</p>
        ${st.legal_name || st.ruc ? `<p style="margin-top:10px">${esc(st.legal_name || '')}${st.ruc ? ' · RUC ' + esc(st.ruc) : ''}</p>` : ''}</div>
      <div><h4>Tienda</h4><a href="#/catalogo">Catálogo</a><a href="#/carrito">Carrito</a><a href="#/pedidos">Mis pedidos</a><a href="#/favoritos">Favoritos</a></div>
      <div><h4>HALVEN</h4><a href="#/nosotros">Nosotros</a><a href="#/servicios">Servicios</a><a href="#/galeria">Galería</a><a href="#/faq">Preguntas frecuentes</a><a href="#/contacto">Contacto</a></div>
      <div><h4>Legal y contacto</h4><a href="#/privacidad">Política de privacidad</a><a href="#/terminos">Términos y condiciones</a>
        ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}
        ${Object.entries({ Instagram: so.instagram, Facebook: so.facebook, TikTok: so.tiktok, YouTube: so.youtube }).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${k}</a>`).join('')}</div>
    </div>
    <div class="ft-bottom"><span>© ${new Date().getFullYear()} ${esc(st.name || 'HALVEN MOTOS')}. Todos los derechos reservados.</span><span>Precios en soles (S/) con IGV incluido.</span></div>
  </div>`;
}

/* =====================================================================
   CATÁLOGO (filtros, buscador en tiempo real, paginación en servidor)
   ===================================================================== */
const PAGE = 9;
const catState = { q: '', brand: '', category: '', min: '', max: '', cc: '', avail: '', sort: 'featured', page: 1 };
let catCache = null;
async function catalogMeta() {
  if (catCache) return catCache;
  const [cats, brands] = await Promise.all([
    sb.from('categories').select('id,name,slug').order('sort_order'),
    sb.from('motorcycles').select('brand').eq('is_published', true),
  ]);
  catCache = { cats: cats.data || [], brands: [...new Set((brands.data || []).map((b) => b.brand))].sort() };
  return catCache;
}
function cardHTML(m) {
  const av = availability(m), color = m.colors?.[0]?.name || '';
  const out = av.cls === 'out';
  return `<article class="card" style="--c:${esc(m.hero_color || '#2a2e36')}">
    <a class="card-media" href="#/moto/${esc(m.slug)}" aria-label="${esc(m.name)}">${imgHTML(coverOf(m), m.name)}</a>
    <div class="card-tags">${m.is_featured ? '<span class="tag y">Destacada</span>' : ''}${m.categories ? `<span class="tag">${esc(m.categories.name)}</span>` : ''}</div>
    <button class="fav ${favs.has(m.id) ? 'on' : ''}" type="button" data-fav="${m.id}" aria-pressed="${favs.has(m.id)}" aria-label="Guardar ${esc(m.name)} en favoritos">
      <svg viewBox="0 0 20 20"><path d="M10 16.5S3 12.4 3 7.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.6c0 4.8-7 8.9-7 8.9z"/></svg></button>
    <div class="card-body">
      <div class="card-meta"><span>${esc(m.brand)} · ${esc(m.model)}</span><span>${m.year}</span></div>
      <h3><a href="#/moto/${esc(m.slug)}">${esc(m.name)}</a></h3>
      <div class="mini-specs">
        <div><b>${m.displacement_cc ? m.displacement_cc + ' cc' : '—'}</b>Cilindrada</div>
        <div><b>${m.power_hp ? Number(m.power_hp) + ' hp' : '—'}</b>Potencia</div>
        <div><b>${m.top_speed_kmh ? m.top_speed_kmh + ' km/h' : '—'}</b>Vel. máx.</div>
      </div>
      <div class="card-foot"><span class="price">${money(m.price)}${m.compare_at_price && m.compare_at_price > m.price ? `<s>${money(m.compare_at_price)}</s>` : ''}</span>
        <span class="avail ${av.cls}">${av.label}</span></div>
      <div class="card-actions">
        <a class="btn btn-ghost btn-sm" href="#/moto/${esc(m.slug)}">Ver detalles</a>
        <button class="btn btn-primary btn-sm" type="button" data-buy="${m.id}" data-color="${esc(color)}" ${out ? 'disabled' : ''}>${out ? 'Agotado' : 'Comprar'}</button>
      </div>
    </div>
  </article>`;
}
async function mountCatalog(el) {
  const meta = await catalogMeta();
  el.innerHTML = `
  <div class="toolbar">
    <label class="search field"><span class="sr">Buscar motocicletas</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="m14 14 4 4"/></svg>
      <input type="search" id="catQ" placeholder="Buscar por nombre, marca o modelo" value="${esc(catState.q)}" autocomplete="off"></label>
    <label class="field"><span class="sr">Ordenar</span><select id="catSort">
      <option value="featured">Destacadas primero</option><option value="price_asc">Precio: menor a mayor</option>
      <option value="price_desc">Precio: mayor a menor</option><option value="newest">Más recientes</option><option value="power">Más potentes</option></select></label>
    <button class="btn btn-ghost filters-toggle" type="button" id="filtersOpen">Filtros</button>
  </div>
  <div class="cat-layout">
    <aside class="filters" id="filters" aria-label="Filtros">
      <h3>Filtros <button type="button" class="link" id="catReset">Limpiar</button></h3>
      <label class="field"><span>Categoría</span><select data-f="category"><option value="">Todas</option>${meta.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Marca</span><select data-f="brand"><option value="">Todas</option>${meta.brands.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
      <div class="field"><span>Precio (S/)</span><div class="price-row">
        <input data-f="min" type="number" min="0" step="1000" placeholder="Mín." inputmode="numeric" aria-label="Precio mínimo">
        <input data-f="max" type="number" min="0" step="1000" placeholder="Máx." inputmode="numeric" aria-label="Precio máximo"></div></div>
      <label class="field"><span>Cilindrada</span><select data-f="cc"><option value="">Todas</option><option value="0-300">Hasta 300 cc</option>
        <option value="301-700">301 – 700 cc</option><option value="701-1000">701 – 1000 cc</option><option value="1001-3000">Más de 1000 cc</option></select></label>
      <label class="field"><span>Disponibilidad</span><select data-f="avail"><option value="">Todas</option><option value="stock">Solo disponibles</option></select></label>
      <button class="btn btn-primary filters-toggle" type="button" id="filtersClose">Ver resultados</button>
    </aside>
    <div><p class="result-info" id="catInfo" aria-live="polite"></p><div class="cards" id="catCards"></div><nav class="pager" id="catPager" aria-label="Paginación"></nav></div>
  </div>`;
  const filters = $('#filters', el);
  $$('[data-f]', el).forEach((i) => { i.value = catState[i.dataset.f]; });
  $('#catSort', el).value = catState.sort;
  const reload = () => { catState.page = 1; loadCatalog(el); };
  $('#catQ', el).addEventListener('input', debounce((e) => { catState.q = e.target.value.trim(); reload(); }, 280));
  $('#catSort', el).addEventListener('change', (e) => { catState.sort = e.target.value; reload(); });
  $$('[data-f]', el).forEach((i) => i.addEventListener(i.tagName === 'INPUT' ? 'input' : 'change', debounce(() => { catState[i.dataset.f] = i.value.trim(); reload(); }, i.tagName === 'INPUT' ? 400 : 0)));
  $('#catReset', el).addEventListener('click', () => { Object.assign(catState, { q: '', brand: '', category: '', min: '', max: '', cc: '', avail: '', page: 1 }); mountCatalog(el); });
  $('#filtersOpen', el).addEventListener('click', () => filters.classList.add('open'));
  $('#filtersClose', el).addEventListener('click', () => filters.classList.remove('open'));
  loadCatalog(el);
}
let catReq = 0;
async function loadCatalog(el) {
  const req = ++catReq;
  const cards = $('#catCards', el);
  cards.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton" style="height:420px"></div>').join('');
  const s = catState;
  const fields = s.avail ? MOTO_FIELDS.replace('inventory(', 'inventory!inner(') : MOTO_FIELDS;
  let q = sb.from('motorcycles').select(fields, { count: 'exact' }).eq('is_published', true);
  const term = s.q.replace(/[%,()*\\.:"']/g, ' ').trim();
  if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`);
  if (s.brand) q = q.eq('brand', s.brand);
  if (s.category) q = q.eq('category_id', s.category);
  if (s.min && !isNaN(+s.min)) q = q.gte('price', +s.min);
  if (s.max && !isNaN(+s.max)) q = q.lte('price', +s.max);
  if (s.cc) { const [a, b] = s.cc.split('-').map(Number); q = q.gte('displacement_cc', a).lte('displacement_cc', b); }
  if (s.avail) q = q.gt('inventory.stock', 0);
  q = ({
    price_asc: () => q.order('price', { ascending: true }),
    price_desc: () => q.order('price', { ascending: false }),
    newest: () => q.order('year', { ascending: false }).order('created_at', { ascending: false }),
    power: () => q.order('power_hp', { ascending: false, nullsFirst: false }),
  }[s.sort] || (() => q.order('is_featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false })))();
  const from = (s.page - 1) * PAGE;
  const { data, count, error } = await q.range(from, from + PAGE - 1);
  if (req !== catReq) return;
  if (error) { cards.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No se pudo cargar el catálogo</h3><p>${esc(errMsg(error))}</p></div>`; return; }
  const total = count || 0, pages = Math.max(1, Math.ceil(total / PAGE));
  $('#catInfo', el).textContent = total ? `${total} ${total === 1 ? 'motocicleta' : 'motocicletas'}${pages > 1 ? ` · página ${s.page} de ${pages}` : ''}` : '';
  cards.innerHTML = data.length ? data.map(cardHTML).join('')
    : `<div class="empty" style="grid-column:1/-1"><h3>No hay motocicletas con esos filtros</h3><p>Prueba con otra búsqueda o limpia los filtros.</p></div>`;
  const pager = $('#catPager', el);
  pager.innerHTML = pages > 1 ? `<button type="button" data-p="${s.page - 1}" ${s.page === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>` +
    Array.from({ length: pages }, (_, i) => `<button type="button" data-p="${i + 1}" class="${i + 1 === s.page ? 'on' : ''}" ${i + 1 === s.page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('') +
    `<button type="button" data-p="${s.page + 1}" ${s.page === pages ? 'disabled' : ''} aria-label="Siguiente">›</button>` : '';
  $$('[data-p]', pager).forEach((b) => b.addEventListener('click', () => { s.page = +b.dataset.p; loadCatalog(el); el.closest('section')?.scrollIntoView({ block: 'start' }); }));
}

/* =====================================================================
   DETALLE
   ===================================================================== */
async function viewDetail(slug, query, t) {
  const [{ data: m, error }] = await Promise.all([sb.from('motorcycles').select(MOTO_FIELDS).eq('slug', slug).maybeSingle(), settingsP]);
  if (stale(t)) return;
  if (error) throw error;
  if (!m || !m.is_published) { view404(); return; }
  document.title = `${m.name} | HALVEN MOTOS`;
  const imgs = (m.motorcycle_images || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (!imgs.length && m.hero_image) imgs.push({ url: m.hero_image, alt: m.name });
  const av = availability(m), stock = stockOf(m), maxQ = Math.max(1, Math.min(5, stock));
  const colors = Array.isArray(m.colors) ? m.colors : [];
  const wa = waLink(S.contact?.whatsapp, `Hola HALVEN MOTOS, quiero información sobre la ${m.name} (${BASE}#/moto/${m.slug}).`);
  const row = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '';
  app.innerHTML = `<div class="container page">
    <nav class="crumbs" aria-label="Ruta"><a href="#/">Inicio</a>/<a href="#/catalogo">Catálogo</a>/<span>${esc(m.name)}</span></nav>
    <div class="detail">
      <div>
        <div class="gallery-main" style="--c:${esc(m.hero_color || '#2a2e36')}" id="gMain">${imgHTML(imgs[0]?.url, imgs[0]?.alt || m.name)}
          <button class="fav ${favs.has(m.id) ? 'on' : ''}" type="button" data-fav="${m.id}" aria-pressed="${favs.has(m.id)}" aria-label="Guardar en favoritos"><svg viewBox="0 0 20 20"><path d="M10 16.5S3 12.4 3 7.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.6c0 4.8-7 8.9-7 8.9z"/></svg></button></div>
        ${imgs.length > 1 ? `<div class="thumbs" role="list">${imgs.map((im, i) => `<button type="button" role="listitem" class="${i ? '' : 'on'}" data-img="${i}" aria-label="Foto ${i + 1}">${imgHTML(im.url, '')}</button>`).join('')}</div>` : ''}
      </div>
      <div class="d-info">
        <span class="eyebrow">${esc(m.categories?.name || 'Motocicleta')}</span>
        <h1>${esc(m.name)}</h1>
        <div class="card-meta" style="justify-content:flex-start;gap:14px"><span>${esc(m.brand)}</span><span>Modelo ${esc(m.model)}</span><span>Año ${m.year}</span></div>
        <div class="d-price">${money(m.price)}${m.compare_at_price && m.compare_at_price > m.price ? ` <s style="font-size:16px;color:var(--muted)">${money(m.compare_at_price)}</s>` : ''}</div>
        <span class="avail ${av.cls}">${av.label}${stock > 0 ? ` · ${stock} en stock` : ''}</span>
        ${m.short_description ? `<p class="d-desc">${esc(m.short_description)}</p>` : ''}
        ${colors.length ? `<div class="field"><span>Color${colors.length > 1 ? ': elige uno' : ''}</span><div class="colors" role="radiogroup" aria-label="Color">
          ${colors.map((c, i) => `<button type="button" class="swatch ${i ? '' : 'on'}" role="radio" aria-checked="${!i}" data-color="${esc(c.name)}"><i style="background:${esc(c.hex || '#888')}"></i>${esc(c.name)}</button>`).join('')}</div></div>` : ''}
        <div class="d-buy">
          <div class="qty" aria-label="Cantidad"><button type="button" data-q="-1" aria-label="Menos">−</button><input id="dQty" type="number" min="1" max="${maxQ}" value="1" aria-label="Cantidad"><button type="button" data-q="1" aria-label="Más">+</button></div>
          <button class="btn btn-primary" id="dBuy" ${stock ? '' : 'disabled'}>Comprar ahora</button>
          <button class="btn btn-light" id="dAdd" ${stock ? '' : 'disabled'}>Agregar al carrito</button>
        </div>
        <div class="d-buy">${wa ? `<a class="btn btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>` : `<a class="btn btn-ghost" href="#/contacto">Consultar</a>`}</div>
        <table class="spec-table" style="margin-top:26px"><tbody>
          ${row('Cilindrada', m.displacement_cc && m.displacement_cc + ' cc')}${row('Potencia', m.power_hp && Number(m.power_hp) + ' hp')}
          ${row('Velocidad máxima', m.top_speed_kmh && m.top_speed_kmh + ' km/h')}${row('Aceleración 0–100 km/h', m.acceleration_s && Number(m.acceleration_s) + ' s')}
          ${row('Tipo de motor', m.engine_type)}${row('Transmisión', m.transmission)}${row('Sistema de frenos', m.brakes)}
          ${row('Capacidad del tanque', m.tank_l && Number(m.tank_l) + ' L')}${row('Autonomía', m.range_km && m.range_km + ' km')}
          ${row('Refrigeración', m.cooling)}${row('Peso', m.weight_kg && m.weight_kg + ' kg')}${row('Asientos', m.seats)}
          ${row('Colores disponibles', colors.map((c) => c.name).join(', '))}
        </tbody></table>
      </div>
    </div>
    ${m.description ? `<section class="d-section"><h2>Descripción</h2><p class="d-desc" style="max-width:820px">${esc(m.description)}</p></section>` : ''}
    <section class="d-section" id="related"></section>
  </div>`;
  let color = colors[0]?.name || null;
  $$('.swatch', app).forEach((b) => b.addEventListener('click', () => {
    $$('.swatch', app).forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
    b.classList.add('on'); b.setAttribute('aria-checked', 'true'); color = b.dataset.color;
  }));
  $$('[data-img]', app).forEach((b) => b.addEventListener('click', () => {
    const im = imgs[+b.dataset.img];
    const main = $('#gMain'); const fav = $('.fav', main);
    main.innerHTML = imgHTML(im.url, im.alt || m.name); main.appendChild(fav);
    $$('[data-img]', app).forEach((x) => x.classList.toggle('on', x === b));
  }));
  const qIn = $('#dQty');
  const clampQ = () => { qIn.value = Math.max(1, Math.min(maxQ, parseInt(qIn.value, 10) || 1)); };
  qIn.addEventListener('change', clampQ);
  $$('[data-q]', app).forEach((b) => b.addEventListener('click', () => { qIn.value = (parseInt(qIn.value, 10) || 1) + +b.dataset.q; clampQ(); }));
  const inCart = () => getCart().filter((i) => i.id === m.id).reduce((s, i) => s + i.qty, 0);
  const add = () => {
    clampQ();
    if (inCart() + +qIn.value > stock) { toast(`Solo hay ${stock} unidad${stock === 1 ? '' : 'es'} disponible${stock === 1 ? '' : 's'}.`, 'warn'); return false; }
    addToCart(m.id, color, +qIn.value); return true;
  };
  $('#dAdd').addEventListener('click', () => { if (add()) toast('Agregada al carrito.'); });
  $('#dBuy').addEventListener('click', () => { if (add() || inCart() > 0) location.hash = '#/checkout'; });
  // relacionadas
  if (m.category_id) {
    const { data: rel } = await sb.from('motorcycles').select(MOTO_FIELDS).eq('is_published', true).eq('category_id', m.category_id).neq('id', m.id).limit(3);
    if (!stale(t) && rel?.length) $('#related').innerHTML = `<h2>También te puede interesar</h2><div class="cards">${rel.map(cardHTML).join('')}</div>`;
  }
}

/* =====================================================================
   CARRITO
   ===================================================================== */
async function cartLines() {
  const cart = getCart();
  if (!cart.length) return { lines: [], removed: [] };
  const ids = [...new Set(cart.map((i) => i.id))];
  const { data, error } = await sb.from('motorcycles').select(MOTO_FIELDS).in('id', ids);
  if (error) throw error;
  const byId = new Map((data || []).filter((m) => m.is_published).map((m) => [m.id, m]));
  const removed = cart.filter((i) => !byId.has(i.id));
  const kept = cart.filter((i) => byId.has(i.id));
  if (removed.length) setCart(kept);
  return { lines: kept.map((i) => ({ ...i, m: byId.get(i.id) })), removed };
}
function shippingFor(subtotal, method) {
  if (method !== 'envio') return 0;
  const sh = S.shipping || {};
  if (sh.free_from != null && sh.free_from !== '' && subtotal >= Number(sh.free_from)) return 0;
  return Number(sh.envio_cost || 0);
}
async function viewCart(_, __, t) {
  document.title = 'Carrito | HALVEN MOTOS';
  await settingsP;
  const { lines, removed } = await cartLines();
  if (stale(t)) return;
  if (removed.length) toast('Quitamos del carrito motocicletas que ya no están disponibles.', 'warn');
  if (!lines.length) {
    app.innerHTML = `<div class="container page"><h1 class="page-title">Carrito</h1><div class="empty" style="margin-top:28px"><h3>Tu carrito está vacío</h3><p>Explora el catálogo y elige tu próxima moto.</p><a class="btn btn-primary" href="#/catalogo">Explorar motocicletas</a></div></div>`;
    return;
  }
  const subtotal = lines.reduce((s, l) => s + l.m.price * l.qty, 0);
  const problems = lines.filter((l) => l.qty > stockOf(l.m));
  app.innerHTML = `<div class="container page">
    <h1 class="page-title">Carrito</h1>
    <div class="two-col" style="margin-top:28px">
      <div class="panel">${lines.map((l, idx) => {
        const st = stockOf(l.m), max = Math.max(1, Math.min(5, st));
        return `<div class="cart-line">
          <a class="thumb" href="#/moto/${esc(l.m.slug)}" style="--c:${esc(l.m.hero_color || '#2a2e36')}">${imgHTML(coverOf(l.m), l.m.name)}</a>
          <div><h4><a href="#/moto/${esc(l.m.slug)}">${esc(l.m.name)}</a></h4>
            <small>${esc(l.m.brand)} · ${l.m.year}${l.color ? ' · ' + esc(l.color) : ''}</small>
            <small>${money(l.m.price)} c/u</small>
            ${st <= 0 ? '<small class="avail out">Agotado: quítala para continuar</small>' : l.qty > st ? `<small class="avail low">Solo quedan ${st}</small>` : ''}</div>
          <div class="right">
            <div class="qty"><button type="button" data-cq="${idx}" data-d="-1" aria-label="Menos">−</button><input type="number" value="${l.qty}" min="1" max="${max}" data-ci="${idx}" aria-label="Cantidad"><button type="button" data-cq="${idx}" data-d="1" aria-label="Más">+</button></div>
            <b>${money(l.m.price * l.qty)}</b>
            <button class="btn btn-sm btn-danger" type="button" data-rm="${idx}">Eliminar</button>
          </div></div>`;
      }).join('')}</div>
      <aside class="panel sticky">
        <h3>Resumen</h3>
        <div class="sum-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
        <div class="sum-row"><span>Traslado</span><b>Se calcula al finalizar</b></div>
        <div class="sum-row sum-total"><span>Total estimado</span><b>${money(subtotal)}</b></div>
        ${problems.length ? '<div class="alert alert-warn" style="margin-top:12px">Ajusta las cantidades marcadas para continuar.</div>' : ''}
        <a class="btn btn-primary btn-block" style="margin-top:16px" href="#/checkout" ${problems.length ? 'aria-disabled="true" onclick="return false"' : ''}>Finalizar compra</a>
        <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/catalogo">Continuar comprando</a>
      </aside>
    </div></div>`;
  const cart = getCart();
  const save = () => { setCart(cart); viewCart(null, null, renderToken); };
  $$('[data-cq]', app).forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.cq, max = Math.max(1, Math.min(5, stockOf(lines[i].m)));
    cart[i].qty = Math.max(1, Math.min(max, cart[i].qty + +b.dataset.d)); save();
  }));
  $$('[data-ci]', app).forEach((inp) => inp.addEventListener('change', () => {
    const i = +inp.dataset.ci, max = Math.max(1, Math.min(5, stockOf(lines[i].m)));
    cart[i].qty = Math.max(1, Math.min(max, parseInt(inp.value, 10) || 1)); save();
  }));
  $$('[data-rm]', app).forEach((b) => b.addEventListener('click', () => { cart.splice(+b.dataset.rm, 1); toast('Eliminada del carrito.'); save(); }));
}

/* =====================================================================
   CHECKOUT
   ===================================================================== */
async function viewCheckout(_, __, t) {
  document.title = 'Finalizar compra | HALVEN MOTOS';
  await authReady;
  if (!requireAuth('/checkout')) return;
  await settingsP;
  const { lines } = await cartLines();
  if (stale(t)) return;
  if (!lines.length) { location.hash = '#/carrito'; return; }
  if (lines.some((l) => l.qty > stockOf(l.m))) { toast('Algunas motos no tienen stock suficiente. Revisa tu carrito.', 'warn'); location.hash = '#/carrito'; return; }
  const p = auth.profile || await loadProfile() || {};
  const pays = ['mercadopago', 'transferencia', 'tienda'].map((k) => [k, S.payments?.[k]]).filter(([k, v]) => v?.enabled);
  const subtotal = lines.reduce((s, l) => s + l.m.price * l.qty, 0);
  app.innerHTML = `<div class="container page">
    <div class="steps"><span>1. Carrito</span><span class="on">2. Datos y pago</span><span>3. Confirmación</span></div>
    <h1 class="page-title">Finalizar compra</h1>
    ${p.is_active === false ? '<div class="alert alert-error" style="margin-top:16px">Tu cuenta está desactivada. Contáctanos para reactivarla.</div>' : ''}
    <form class="two-col" style="margin-top:28px" id="coForm" novalidate>
      <div>
        <section class="panel"><h3>Datos del cliente</h3>
          <div class="grid-2">
            <label class="field span-2"><span>Nombre completo</span><input name="name" required maxlength="120" autocomplete="name" value="${esc(p.full_name || '')}"></label>
            <label class="field"><span>Correo electrónico</span><input name="email" type="email" required autocomplete="email" value="${esc(p.email || auth.session.user.email || '')}"></label>
            <label class="field"><span>Teléfono / celular</span><input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(p.phone || '')}"></label>
            <label class="field"><span>DNI / CE / RUC</span><input name="document" required maxlength="15" value="${esc(p.document_id || '')}"></label>
            <label class="check" style="align-self:end"><input type="checkbox" name="save_profile" checked> Guardar estos datos en mi cuenta</label>
          </div></section>
        <section class="panel"><h3>Entrega</h3>
          <div class="seg" role="radiogroup" aria-label="Método de entrega">
            <label><input type="radio" name="delivery" value="envio" checked>Envío a domicilio</label>
            <label><input type="radio" name="delivery" value="recojo">Recojo en tienda</label></div>
          <div class="grid-2" id="addrFields" style="margin-top:16px">
            <label class="field span-2"><span>Dirección</span><input name="address" maxlength="200" autocomplete="street-address" value="${esc(p.address || '')}"></label>
            <label class="field"><span>Ciudad / distrito</span><input name="city" maxlength="80" value="${esc(p.city || '')}"></label>
            <label class="field"><span>Región</span><select name="region"><option value="">Selecciona</option>${PERU_REGIONS.map((r) => `<option ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
            <label class="field span-2"><span>Referencia (opcional)</span><input name="reference" maxlength="200"></label>
          </div>
          <p id="pickupNote" class="alert" style="margin-top:14px" hidden>Te contactaremos para coordinar el recojo${S.contact?.address ? ' en ' + esc(S.contact.address) : ''}.</p>
          ${S.shipping?.note ? `<p style="color:var(--muted);font-size:13.5px;margin-top:12px">${esc(S.shipping.note)}</p>` : ''}
        </section>
        <section class="panel"><h3>Método de pago</h3>
          ${pays.length ? `<div class="pay-opts">${pays.map(([k, v], i) => `<label class="pay-opt"><input type="radio" name="payment" value="${k}" ${i ? '' : 'checked'}>
            <div><b>${esc(v.label || PAY_METHOD[k])}</b><small>${esc(k === 'mercadopago' ? 'Serás redirigido a Mercado Pago para pagar de forma segura. El pedido se confirma cuando Mercado Pago aprueba el pago.' : (v.instructions || (k === 'transferencia' ? 'Te enviaremos los datos bancarios. Confirmaremos tu pedido al verificar el depósito.' : 'Paga al momento de recoger o coordinar tu moto en tienda.')))}</small></div></label>`).join('')}</div>`
          : '<div class="alert alert-warn">No hay métodos de pago habilitados por el momento. Contáctanos para completar tu compra.</div>'}
          <label class="field" style="margin-top:14px"><span>Notas para la tienda (opcional)</span><textarea name="notes" maxlength="500"></textarea></label>
        </section>
      </div>
      <aside class="panel sticky">
        <h3>Resumen del pedido</h3>
        ${lines.map((l) => `<div class="sum-row"><span>${esc(l.m.name)}${l.color ? ' · ' + esc(l.color) : ''} × ${l.qty}</span><b>${money(l.m.price * l.qty)}</b></div>`).join('')}
        <div class="sum-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:12px"><span>Subtotal</span><b>${money(subtotal)}</b></div>
        <div class="sum-row"><span>Traslado</span><b id="shipAmt"></b></div>
        <div class="sum-row sum-total"><span>Total</span><b id="totalAmt"></b></div>
        <label class="check" style="margin-top:16px"><input type="checkbox" name="terms" required> Acepto los <a href="#/terminos" target="_blank" style="color:var(--yellow)">términos y condiciones</a> y la <a href="#/privacidad" target="_blank" style="color:var(--yellow)">política de privacidad</a>.</label>
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="coSubmit" ${pays.length && p.is_active !== false ? '' : 'disabled'}>Confirmar pedido</button>
        <p style="color:var(--muted);font-size:12.5px;margin-top:10px">Los precios y el stock se validan en el servidor al confirmar.</p>
      </aside>
    </form></div>`;
  const form = $('#coForm');
  const sync = () => {
    const del = form.elements.delivery.value;
    $('#addrFields').hidden = del !== 'envio'; $('#pickupNote').hidden = del === 'envio';
    const sh = shippingFor(subtotal, del);
    $('#shipAmt').textContent = del === 'envio' ? (sh ? money(sh) : 'Sin costo / por coordinar') : 'Recojo en tienda';
    $('#totalAmt').textContent = money(subtotal + sh);
  };
  $$('input[name=delivery]', form).forEach((r) => r.addEventListener('change', sync)); sync();
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(form);
    const d = formData(form), del = form.elements.delivery.value, pay = form.elements.payment?.value;
    let bad = false;
    const err = (n, msg) => { fieldError(form, n, msg); if (!bad) form.elements[n]?.focus(); bad = true; };
    if (d.name.length < 3) err('name', 'Ingresa tu nombre completo.');
    if (!RX.email.test(d.email)) err('email', 'Correo no válido.');
    if (!RX.phone.test(d.phone)) err('phone', 'Teléfono no válido.');
    if (!RX.doc.test(d.document)) err('document', 'Documento no válido (8 a 15 caracteres).');
    if (del === 'envio') {
      if (d.address.length < 5) err('address', 'Ingresa la dirección.');
      if (!d.city) err('city', 'Ingresa la ciudad o distrito.');
      if (!d.region) err('region', 'Selecciona la región.');
    }
    if (!pay) { toast('Selecciona un método de pago.', 'error'); bad = true; }
    if (!form.elements.terms.checked) { toast('Debes aceptar los términos y condiciones.', 'error'); bad = true; }
    if (bad) return;
    const btn = $('#coSubmit'); setBusy(btn, true, 'Procesando…');
    const items = getCart().map((i) => ({ motorcycle_id: i.id, quantity: i.qty, color: i.color }));
    const { data: res, error } = await sb.rpc('create_order', {
      p_items: items, p_payment_method: pay, p_delivery_method: del,
      p_customer: { name: d.name, email: d.email, phone: d.phone, document: d.document, address: d.address, city: d.city, region: d.region, reference: d.reference, notes: d.notes },
    });
    if (error) { setBusy(btn, false); toast(errMsg(error), 'error', 7000); return; }
    setCart([]);
    if (d.save_profile) {
      await sb.from('profiles').update({ full_name: d.name, phone: d.phone, document_id: d.document.toUpperCase(),
        ...(del === 'envio' ? { address: d.address, city: d.city, region: d.region } : {}) }).eq('id', auth.session.user.id);
      loadProfile();
    }
    if (pay === 'mercadopago') {
      const r = await startMercadoPago(res.id);
      if (r) return; // redirigiendo
    }
    location.hash = `#/pedido/${res.id}?nuevo=1`;
  });
}
async function startMercadoPago(orderId) {
  const { data, error } = await sb.functions.invoke('mp-create-preference', { body: { order_id: orderId } });
  let msg = error ? (await error.context?.json?.().catch(() => null))?.error || errMsg(error) : null;
  if (!msg && data?.init_point) { location.href = data.init_point; return true; }
  toast((msg || 'No se pudo iniciar el pago.') + ' Tu pedido quedó registrado como pendiente.', 'error', 8000);
  return false;
}

/* =====================================================================
   AUTENTICACIÓN
   ===================================================================== */
function authShell(title, sub, body) {
  return `<div class="container page"><div class="auth-wrap"><div class="panel"><h1>${title}</h1><p class="sub">${sub}</p>${body}</div></div></div>`;
}
const pwField = (name, label, ac) => `<label class="field"><span>${label}</span><div class="pw-wrap"><input name="${name}" type="password" required minlength="8" autocomplete="${ac}"><button type="button" data-pw aria-label="Mostrar contraseña">Ver</button></div></label>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pw]'); if (!b) return;
  const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Ver' : 'Ocultar';
});
async function viewLogin(_, query) {
  document.title = 'Iniciar sesión | HALVEN MOTOS';
  await authReady;
  const next = query.get('next') || '/cuenta';
  if (auth.session) { location.hash = '#' + next; return; }
  app.innerHTML = authShell('Iniciar sesión', 'Accede para comprar, seguir tus pedidos y guardar favoritos.', `
    <form id="loginForm" novalidate>
      <label class="field"><span>Correo electrónico</span><input name="email" type="email" required autocomplete="email"></label>
      ${pwField('password', 'Contraseña', 'current-password')}
      <button class="btn btn-primary btn-block">Ingresar</button>
    </form>
    <div class="auth-links"><a href="#/recuperar">¿Olvidaste tu contraseña?</a><span>¿Nuevo? <a href="#/registro?next=${encodeURIComponent(next)}">Crear cuenta</a></span></div>`);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f);
    const d = formData(f);
    if (!RX.email.test(d.email)) return fieldError(f, 'email', 'Correo no válido.');
    if (!d.password) return fieldError(f, 'password', 'Ingresa tu contraseña.');
    const btn = $('button.btn-primary', f); setBusy(btn, true, 'Ingresando…');
    const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
    setBusy(btn, false);
    if (error) { toast(errMsg(error), 'error'); return; }
    await authReady; await loadProfile();
    toast('¡Bienvenido!');
    location.hash = '#' + next;
  });
}
async function viewRegister(_, query) {
  document.title = 'Crear cuenta | HALVEN MOTOS';
  await authReady;
  const next = query.get('next') || '/cuenta';
  if (auth.session) { location.hash = '#' + next; return; }
  app.innerHTML = authShell('Crear cuenta', 'Regístrate para comprar y seguir tus pedidos en línea.', `
    <form id="regForm" novalidate>
      <label class="field"><span>Nombre completo</span><input name="full_name" required maxlength="120" autocomplete="name"></label>
      <label class="field"><span>Celular</span><input name="phone" inputmode="tel" maxlength="20" autocomplete="tel"></label>
      <label class="field"><span>Correo electrónico</span><input name="email" type="email" required autocomplete="email"></label>
      ${pwField('password', 'Contraseña (mín. 8 caracteres, con letras y números)', 'new-password')}
      ${pwField('password2', 'Repite la contraseña', 'new-password')}
      <label class="check"><input type="checkbox" name="terms"> Acepto los <a href="#/terminos" target="_blank" style="color:var(--yellow)">términos</a> y la <a href="#/privacidad" target="_blank" style="color:var(--yellow)">política de privacidad</a>.</label>
      <button class="btn btn-primary btn-block">Crear cuenta</button>
    </form>
    <div class="auth-links"><span>¿Ya tienes cuenta? <a href="#/login?next=${encodeURIComponent(next)}">Inicia sesión</a></span></div>`);
  $('#regForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f);
    const d = formData(f); let bad = false;
    const err = (n, m) => { fieldError(f, n, m); bad = true; };
    if (d.full_name.length < 3) err('full_name', 'Ingresa tu nombre completo.');
    if (d.phone && !RX.phone.test(d.phone)) err('phone', 'Celular no válido.');
    if (!RX.email.test(d.email)) err('email', 'Correo no válido.');
    if (d.password.length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) err('password', 'Usa al menos 8 caracteres con letras y números.');
    if (d.password !== d.password2) err('password2', 'Las contraseñas no coinciden.');
    if (!f.elements.terms.checked) { toast('Debes aceptar los términos y la política de privacidad.', 'error'); bad = true; }
    if (bad) return;
    const btn = $('button.btn-primary', f); setBusy(btn, true, 'Creando cuenta…');
    const { data, error } = await sb.auth.signUp({ email: d.email, password: d.password,
      options: { data: { full_name: d.full_name, phone: d.phone }, emailRedirectTo: BASE + '?confirmado=1' } });
    setBusy(btn, false);
    if (error) { toast(errMsg(error), 'error'); return; }
    if (data.session) { toast('¡Cuenta creada!'); location.hash = '#' + next; return; }
    app.innerHTML = authShell('Revisa tu correo', '', `<div class="alert alert-ok">Te enviamos un enlace a <strong>${esc(d.email)}</strong> para confirmar tu cuenta. Después podrás iniciar sesión.</div>
      <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/login">Ir a iniciar sesión</a>`);
  });
}
async function viewRecover() {
  document.title = 'Recuperar contraseña | HALVEN MOTOS';
  app.innerHTML = authShell('Recuperar contraseña', 'Te enviaremos un enlace para crear una nueva contraseña.', `
    <form id="recForm" novalidate><label class="field"><span>Correo electrónico</span><input name="email" type="email" required autocomplete="email"></label>
    <button class="btn btn-primary btn-block">Enviar enlace</button></form>
    <div class="auth-links"><a href="#/login">Volver a iniciar sesión</a></div>`);
  $('#recForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f);
    const { email } = formData(f);
    if (!RX.email.test(email)) return fieldError(f, 'email', 'Correo no válido.');
    const btn = $('button', f); setBusy(btn, true, 'Enviando…');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: BASE + '?reset=1' });
    setBusy(btn, false);
    if (error && /rate|too many/i.test(error.message)) { toast(errMsg(error), 'error'); return; }
    // Mensaje neutro: no revela si el correo existe
    f.outerHTML = `<div class="alert alert-ok">Si existe una cuenta con <strong>${esc(email)}</strong>, recibirás un enlace para restablecer tu contraseña.</div>`;
  });
}
async function viewReset() {
  document.title = 'Nueva contraseña | HALVEN MOTOS';
  await authReady;
  if (!auth.session) {
    app.innerHTML = authShell('Enlace no válido', 'El enlace expiró o ya fue usado.', '<a class="btn btn-primary btn-block" href="#/recuperar">Solicitar uno nuevo</a>');
    return;
  }
  app.innerHTML = authShell('Crea una nueva contraseña', 'Usa al menos 8 caracteres con letras y números.', `
    <form id="resetForm" novalidate>${pwField('password', 'Nueva contraseña', 'new-password')}${pwField('password2', 'Repite la contraseña', 'new-password')}
    <button class="btn btn-primary btn-block">Guardar contraseña</button></form>`);
  $('#resetForm').addEventListener('submit', changePassword);
}
async function changePassword(e) {
  e.preventDefault(); const f = e.currentTarget; clearErrors(f);
  const d = formData(f);
  if (d.password.length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) return fieldError(f, 'password', 'Usa al menos 8 caracteres con letras y números.');
  if (d.password !== d.password2) return fieldError(f, 'password2', 'Las contraseñas no coinciden.');
  const btn = $('button.btn-primary', f); setBusy(btn, true, 'Guardando…');
  const { error } = await sb.auth.updateUser({ password: d.password });
  setBusy(btn, false);
  if (error) { toast(/different from the old/i.test(error.message) ? 'La nueva contraseña debe ser distinta de la anterior.' : errMsg(error), 'error'); return; }
  f.reset(); toast('Contraseña actualizada.');
  if (currentPath() === '/restablecer') location.hash = '#/cuenta';
}

/* =====================================================================
   CUENTA, PEDIDOS, FAVORITOS
   ===================================================================== */
function accShell(active, body) {
  const nav = [['/cuenta', 'Mi perfil'], ['/pedidos', 'Mis pedidos'], ['/favoritos', 'Favoritos']];
  return `<div class="container page"><h1 class="page-title" style="margin-bottom:28px">Mi cuenta</h1><div class="acc-layout">
    <nav class="acc-nav" aria-label="Cuenta">${nav.map(([h, l]) => `<a href="#${h}" class="${h === active ? 'on' : ''}">${l}</a>`).join('')}
      ${isStaff() ? '<a href="admin/">Panel de administración</a>' : ''}<a href="#/" data-logout>Cerrar sesión</a></nav>
    <div>${body}</div></div></div>`;
}
async function viewAccount(_, __, t) {
  document.title = 'Mi cuenta | HALVEN MOTOS';
  await authReady;
  if (!requireAuth('/cuenta')) return;
  const p = await loadProfile();
  if (stale(t)) return;
  if (!p) throw new Error('No se encontró tu perfil.');
  app.innerHTML = accShell('/cuenta', `
    <form class="panel" id="profForm" novalidate><h3>Datos personales</h3>
      <div class="grid-2">
        <label class="field"><span>Nombre completo</span><input name="full_name" required maxlength="120" value="${esc(p.full_name)}"></label>
        <label class="field"><span>Correo</span><input value="${esc(p.email)}" disabled></label>
        <label class="field"><span>Celular</span><input name="phone" maxlength="20" inputmode="tel" value="${esc(p.phone || '')}"></label>
        <label class="field"><span>DNI / CE / RUC</span><input name="document_id" maxlength="15" value="${esc(p.document_id || '')}"></label>
        <label class="field span-2"><span>Dirección</span><input name="address" maxlength="200" value="${esc(p.address || '')}"></label>
        <label class="field"><span>Ciudad / distrito</span><input name="city" maxlength="80" value="${esc(p.city || '')}"></label>
        <label class="field"><span>Región</span><select name="region"><option value="">Selecciona</option>${PERU_REGIONS.map((r) => `<option ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      </div>
      <button class="btn btn-primary" style="margin-top:18px">Guardar cambios</button>
      <p style="color:var(--muted);font-size:13px;margin-top:12px">Cliente desde ${fmtDate(p.created_at)}</p>
    </form>
    <form class="panel" id="pwForm" novalidate><h3>Cambiar contraseña</h3><div class="grid-2">${pwField('password', 'Nueva contraseña', 'new-password')}${pwField('password2', 'Repite la contraseña', 'new-password')}</div>
      <button class="btn btn-primary" style="margin-top:18px">Actualizar contraseña</button></form>`);
  $('#pwForm').addEventListener('submit', changePassword);
  $('#profForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; clearErrors(f);
    const d = formData(f);
    if (d.full_name.length < 3) return fieldError(f, 'full_name', 'Ingresa tu nombre completo.');
    if (d.phone && !RX.phone.test(d.phone)) return fieldError(f, 'phone', 'Celular no válido.');
    if (d.document_id && !RX.doc.test(d.document_id)) return fieldError(f, 'document_id', 'Documento no válido.');
    const btn = $('button.btn-primary', f); setBusy(btn, true, 'Guardando…');
    const payload = { full_name: d.full_name, phone: d.phone || null, document_id: d.document_id ? d.document_id.toUpperCase() : null,
      address: d.address || null, city: d.city || null, region: d.region || null };
    const { error } = await sb.from('profiles').update(payload).eq('id', auth.session.user.id);
    setBusy(btn, false);
    if (error) { toast(errMsg(error), 'error'); return; }
    await loadProfile(); toast('Datos actualizados.');
  });
}
async function viewOrders(_, __, t) {
  document.title = 'Mis pedidos | HALVEN MOTOS';
  await authReady;
  if (!requireAuth('/pedidos')) return;
  const { data, error } = await sb.from('orders').select('id,order_number,status,payment_status,payment_method,total,created_at,order_items(product_name,quantity)')
    .eq('user_id', auth.session.user.id).order('created_at', { ascending: false });
  if (stale(t)) return;
  if (error) throw error;
  app.innerHTML = accShell('/pedidos', data.length ? data.map((o) => `
    <a class="order-card" href="#/pedido/${o.id}">
      <div><h4>Pedido ${esc(o.order_number)}</h4>
        <div class="meta">${fmtDate(o.created_at, true)} · ${o.order_items.map((i) => esc(i.product_name) + (i.quantity > 1 ? ' ×' + i.quantity : '')).join(', ')}</div>
        <div class="badges">${badge('order', o.status)} <span class="badge b-${o.payment_status}">Pago: ${esc({ pendiente: 'pendiente', en_proceso: 'en proceso', aprobado: 'aprobado', rechazado: 'rechazado', reembolsado: 'reembolsado', cancelado: 'cancelado' }[o.payment_status])}</span></div></div>
      <div class="amt">${money(o.total)}<div class="meta" style="font-size:12.5px;font-weight:400">${esc(PAY_METHOD[o.payment_method])}</div></div>
    </a>`).join('') : '<div class="empty"><h3>Aún no tienes pedidos</h3><p>Cuando compres, aquí verás su estado en tiempo real.</p><a class="btn btn-primary" href="#/catalogo">Ver catálogo</a></div>');
}
async function viewOrder(id, query, t) {
  document.title = 'Pedido | HALVEN MOTOS';
  await authReady;
  if (!requireAuth('/pedido/' + id)) return;
  await settingsP;
  const { data: o, error } = await sb.from('orders')
    .select('*,order_items(*),payments(provider,status,amount,provider_payment_id,created_at,updated_at),order_status_history(status,note,created_at)')
    .eq('id', id).maybeSingle();
  if (stale(t)) return;
  if (error) throw error;
  if (!o) { view404(); return; }
  document.title = `Pedido ${o.order_number} | HALVEN MOTOS`;
  const steps = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado'];
  const at = steps.indexOf(o.status);
  const isNew = query.get('nuevo') === '1', back = query.get('pago');
  const payCfg = S.payments?.[o.payment_method] || {};
  const canPayMP = o.payment_method === 'mercadopago' && ['pendiente', 'rechazado'].includes(o.payment_status) && o.status !== 'cancelado';
  const canCancel = o.status === 'pendiente' && !['aprobado', 'en_proceso'].includes(o.payment_status);
  const hist = (o.order_status_history || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  app.innerHTML = `<div class="container page">
    ${isNew ? `<div class="success-hero" style="margin-bottom:40px"><div class="ok-icon"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h1>¡Pedido registrado!</h1><p style="color:var(--muted);margin-top:8px">Tu número de pedido es <b style="color:var(--text)">${esc(o.order_number)}</b>. Te avisaremos cada vez que cambie su estado.</p></div>` : ''}
    ${back ? `<div class="alert ${back === 'error' ? 'alert-error' : 'alert-warn'}" style="margin-bottom:20px">${back === 'error' ? 'El pago no se completó. Puedes intentarlo de nuevo.' : 'Volviste desde Mercado Pago. El estado del pago se actualiza automáticamente cuando Mercado Pago lo confirma.'}</div>` : ''}
    <nav class="crumbs"><a href="#/pedidos">Mis pedidos</a>/<span>${esc(o.order_number)}</span></nav>
    <div class="two-col">
      <div>
        <section class="panel">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
            <h3 style="margin:0">Pedido ${esc(o.order_number)}</h3><div>${badge('order', o.status)} ${badge('pay', o.payment_status)}</div></div>
          <p style="color:var(--muted);font-size:13.5px;margin-top:4px">Realizado el ${fmtDate(o.created_at, true)}</p>
          ${o.status === 'cancelado' ? `<div class="alert alert-error" style="margin-top:16px">Pedido cancelado${o.cancel_reason ? ': ' + esc(o.cancel_reason) : ''}.</div>` : `
          <div class="track">${steps.map((s, i) => `<div class="${i <= at ? 'on' : ''}"></div>`).join('')}</div>
          <div class="track-labels">${steps.map((s, i) => `<span class="${i <= at ? 'on' : ''}">${ORDER_STATUS[s]}</span>`).join('')}</div>`}
        </section>
        <section class="panel"><h3>Motocicletas</h3>
          ${o.order_items.map((i) => `<div class="sum-row"><span>${esc(i.product_name)}${i.color ? ' · ' + esc(i.color) : ''} × ${i.quantity}<br><small>${money(i.unit_price)} c/u</small></span><b>${money(i.line_total)}</b></div>`).join('')}
          <div class="sum-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:12px"><span>Subtotal</span><b>${money(o.subtotal)}</b></div>
          <div class="sum-row"><span>Traslado</span><b>${o.delivery_method === 'recojo' ? 'Recojo en tienda' : money(o.shipping_cost)}</b></div>
          <div class="sum-row sum-total"><span>Total</span><b>${money(o.total)}</b></div></section>
        <section class="panel"><h3>Historial</h3><ul class="timeline">${hist.map((h) => `<li class="on"><b>${esc(ORDER_STATUS[h.status])}</b>${h.note ? ' — ' + esc(h.note) : ''}<small>${fmtDate(h.created_at, true)}</small></li>`).join('')}</ul></section>
      </div>
      <aside>
        <section class="panel"><h3>Pago</h3>
          <div class="sum-row"><span>Método</span><b>${esc(PAY_METHOD[o.payment_method])}</b></div>
          <div class="sum-row"><span>Estado</span>${badge('pay', o.payment_status)}</div>
          ${o.payment_method !== 'mercadopago' && payCfg.instructions && o.payment_status !== 'aprobado' ? `<div class="alert" style="margin-top:12px;white-space:pre-line">${esc(payCfg.instructions)}\n\nIndica tu número de pedido ${esc(o.order_number)} como referencia.</div>` : ''}
          ${o.payment_method === 'transferencia' && !payCfg.instructions && o.payment_status === 'pendiente' ? '<div class="alert" style="margin-top:12px">Te enviaremos los datos bancarios por correo o WhatsApp.</div>' : ''}
          ${canPayMP ? '<button class="btn btn-primary btn-block" style="margin-top:14px" id="payMP">Pagar con Mercado Pago</button>' : ''}
        </section>
        <section class="panel"><h3>Entrega</h3>
          <p>${esc(o.customer_name)}<br><span style="color:var(--muted)">${esc(o.customer_email)} · ${esc(o.customer_phone)}</span></p>
          <p style="margin-top:10px;color:var(--metal-hi)">${o.delivery_method === 'recojo' ? 'Recojo en tienda' : esc([o.shipping_address, o.shipping_city, o.shipping_region].filter(Boolean).join(', '))}</p>
          ${o.shipping_reference ? `<p style="color:var(--muted);font-size:13.5px">Ref.: ${esc(o.shipping_reference)}</p>` : ''}
        </section>
        ${canCancel ? '<button class="btn btn-danger btn-block" style="margin-top:16px" id="cancelOrder">Cancelar pedido</button>' : ''}
      </aside>
    </div></div>`;
  if (query.toString()) history.replaceState(null, '', '#/pedido/' + id);
  $('#payMP')?.addEventListener('click', async (e) => { setBusy(e.currentTarget, true, 'Conectando…'); if (!(await startMercadoPago(o.id))) setBusy(e.currentTarget, false); });
  $('#cancelOrder')?.addEventListener('click', () => {
    const m = openModal(`<div class="modal-head"><h3>¿Cancelar el pedido ${esc(o.order_number)}?</h3></div><p style="color:var(--muted)">Las motocicletas volverán a estar disponibles para otros clientes. Esta acción no se puede deshacer.</p>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>Volver</button><button class="btn btn-danger" id="confirmCancel">Sí, cancelar</button></div>`);
    $('#confirmCancel', m).addEventListener('click', async (ev) => {
      setBusy(ev.currentTarget, true);
      const { error: err } = await sb.rpc('cancel_my_order', { p_order_id: o.id });
      closeModal();
      if (err) { toast(errMsg(err), 'error'); return; }
      toast('Pedido cancelado.'); router();
    });
  });
}
async function viewFavorites(_, __, t) {
  document.title = 'Favoritos | HALVEN MOTOS';
  await authReady;
  if (!requireAuth('/favoritos')) return;
  const { data, error } = await sb.from('favorites').select(`created_at,motorcycles(${MOTO_FIELDS})`).order('created_at', { ascending: false });
  if (stale(t)) return;
  if (error) throw error;
  const motos = (data || []).map((r) => r.motorcycles).filter((m) => m && m.is_published);
  favs = new Set(motos.map((m) => m.id));
  app.innerHTML = accShell('/favoritos', motos.length ? `<div class="cards">${motos.map(cardHTML).join('')}</div>`
    : '<div class="empty"><h3>Aún no guardas favoritos</h3><p>Toca el corazón de una moto para guardarla aquí.</p><a class="btn btn-primary" href="#/catalogo">Ver catálogo</a></div>');
}

/* =====================================================================
   LEGALES
   ===================================================================== */
async function viewLegal(kind) {
  await settingsP;
  const st = S.store || {}, c = S.contact || {};
  const name = esc(st.name || 'HALVEN MOTOS');
  const custom = S.legal?.[kind];
  const title = kind === 'privacy' ? 'Política de privacidad' : 'Términos y condiciones';
  document.title = `${title} | HALVEN MOTOS`;
  const body = custom ? custom.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('') : kind === 'privacy' ? `
    <p>En ${name}${st.ruc ? ' (RUC ' + esc(st.ruc) + ')' : ''} protegemos tus datos personales conforme a la Ley N.º 29733, Ley de Protección de Datos Personales, y su reglamento.</p>
    <h2>Datos que recopilamos</h2><p>Nombre, correo electrónico, teléfono, documento de identidad y dirección, que nos proporcionas al crear tu cuenta o realizar un pedido.</p>
    <h2>Finalidad</h2><ul><li>Gestionar tu cuenta, tus pedidos, pagos y entregas.</li><li>Atender tus consultas y reclamos.</li><li>Cumplir obligaciones legales y tributarias.</li></ul>
    <h2>Pagos</h2><p>No almacenamos datos de tarjetas. Los pagos en línea se procesan a través de la pasarela de pago (Mercado Pago), sujeta a sus propias políticas.</p>
    <h2>Tus derechos</h2><p>Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiéndonos${c.email ? ' a ' + esc(c.email) : ''}. También puedes actualizar tus datos desde "Mi cuenta".</p>
    <h2>Seguridad</h2><p>Aplicamos medidas técnicas y organizativas para proteger tu información; tu contraseña se almacena cifrada y nunca la conocemos.</p>`
    : `
    <p>Al comprar en ${name} aceptas estos términos.</p>
    <h2>Precios y disponibilidad</h2><p>Los precios se expresan en soles (S/) e incluyen IGV. El precio y el stock se validan al confirmar el pedido; si una unidad deja de estar disponible, te lo informaremos.</p>
    <h2>Pedidos y pagos</h2><p>Un pedido se confirma cuando verificamos el pago (aprobado por la pasarela o verificado por transferencia) o cuando acordamos contigo el pago en tienda. Los estados del pedido son: Pendiente, Confirmado, Preparando, Enviado y Entregado.</p>
    <h2>Cancelaciones</h2><p>Puedes cancelar un pedido pendiente y sin pago aprobado desde "Mis pedidos". En otros casos, contáctanos.</p>
    <h2>Entrega y documentación</h2><p>Coordinamos la entrega o el recojo en tienda. La inscripción vehicular y la placa se gestionan según la normativa vigente.</p>
    <h2>Garantía</h2><p>Las motocicletas nuevas cuentan con la garantía del fabricante según sus condiciones.</p>
    <h2>Libro de Reclamaciones</h2><p>Conforme al Código de Protección y Defensa del Consumidor, ponemos a tu disposición nuestro Libro de Reclamaciones.</p>`;
  app.innerHTML = `<div class="container page legal"><span class="eyebrow">Legal</span><h1 class="page-title">${title}</h1>${body}</div>`;
}

/* =====================================================================
   INICIO DE LA APP
   ===================================================================== */
(async function start() {
  await authReady;
  const params = new URLSearchParams(location.search);
  if (params.has('reset') || params.has('confirmado') || params.has('code')) {
    const goReset = params.has('reset');
    if (params.has('confirmado')) toast('¡Correo confirmado! Ya puedes comprar.');
    history.replaceState(null, '', location.pathname + (goReset ? '#/restablecer' : (location.hash || '#/')));
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') location.hash = '#/restablecer'; });
  router();
})();
