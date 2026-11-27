// Núcleo compartido por la tienda y el panel: cliente Supabase, sesión,
// ajustes del sitio, carrito, favoritos y utilidades de interfaz.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { CONFIG } from './config.js';

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const SHEET_URL = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261122_131809_0c1477f1-f13a-4b07-84e4-6ad1f33c15c5.png&w=3840&q=85';
export const SHEET_PNG = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261122_131809_0c1477f1-f13a-4b07-84e4-6ad1f33c15c5.png';

/* ---------------- utilidades ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const PEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
export const money = (n) => PEN.format(Number(n || 0));
export const fmtDate = (d, time = false) => d ? new Date(d).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
}) : '—';
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

export const ORDER_STATUS = { pendiente: 'Pendiente', confirmado: 'Confirmado', preparando: 'Preparando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
export const PAY_STATUS = { pendiente: 'Pendiente', en_proceso: 'En proceso', aprobado: 'Aprobado', rechazado: 'Rechazado', reembolsado: 'Reembolsado', cancelado: 'Cancelado' };
export const PAY_METHOD = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia bancaria', tienda: 'Pago en tienda' };
export const ROLES = { customer: 'Cliente', admin: 'Administrador', sales: 'Ventas', catalog: 'Catálogo' };
export const badge = (kind, value) => {
  const label = (kind === 'pay' ? PAY_STATUS : ORDER_STATUS)[value] || value;
  return `<span class="badge b-${esc(value)}">${esc(label)}</span>`;
};
export const PERU_REGIONS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco',
  'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua',
  'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'];

/* Imagen de producto: URL de Storage o 'sheet:N' (las cuatro motos de la lámina original del hero) */
export function imgHTML(url, alt = '', cls = '') {
  const m = /^sheet:([0-3])$/.exec(url || '');
  if (m) return `<span class="sheet-img s${m[1]} ${cls}" role="img" aria-label="${esc(alt)}"></span>`;
  if (!url) return `<span class="img-ph ${cls}" role="img" aria-label="${esc(alt)}"><svg viewBox="0 0 64 32" aria-hidden="true"><circle cx="13" cy="22" r="8"/><circle cx="51" cy="22" r="8"/><path d="M13 22l12-12h12l6 6h8l-8 6M25 10l6 12h12"/></svg></span>`;
  return `<img class="${cls}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

/* ---------------- mensajes ---------------- */
export function toast(msg, type = 'ok', ms = 4200) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms);
}

export function errMsg(e) {
  const m = String(e?.message || e?.error_description || e || '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada.';
  if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/banned/i.test(m)) return 'Tu cuenta está desactivada. Contáctanos.';
  if (/JWT|session/i.test(m) && /expired|invalid/i.test(m)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (/permission denied|row-level security|42501/i.test(m)) return 'No tienes permiso para realizar esta acción.';
  if (/duplicate key.*slug/i.test(m)) return 'Ya existe un registro con ese identificador (slug).';
  if (/duplicate key.*name/i.test(m)) return 'Ya existe un registro con ese nombre.';
  if (/violates foreign key/i.test(m)) return 'No se puede eliminar: hay registros relacionados.';
  if (/violates check constraint/i.test(m)) return 'Algún dato no tiene un formato válido.';
  return m || 'Ocurrió un error inesperado.';
}

/* ---------------- ajustes del sitio ---------------- */
let settingsP = null;
export function loadSettings(force = false) {
  if (!settingsP || force) {
    settingsP = sb.from('site_settings').select('key,value').then(({ data, error }) => {
      if (error) throw error;
      return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    }).catch((e) => { settingsP = null; console.warn('settings', e); return {}; });
  }
  return settingsP;
}
export const waLink = (number, text = '') => {
  const n = String(number || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
};

/* ---------------- sesión ---------------- */
export const auth = { session: null, profile: null, ready: false };
const authListeners = new Set();
export const onAuth = (fn) => { authListeners.add(fn); if (auth.ready) fn(auth); return () => authListeners.delete(fn); };

export async function loadProfile() {
  if (!auth.session) { auth.profile = null; return null; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', auth.session.user.id).maybeSingle();
  if (error) console.warn('profile', error);
  auth.profile = data || null;
  return auth.profile;
}
async function setSession(session, event) {
  const changed = (auth.session?.user?.id || null) !== (session?.user?.id || null);
  auth.session = session;
  if (changed || !auth.ready || event === 'USER_UPDATED') await loadProfile();
  auth.ready = true;
  authListeners.forEach((fn) => fn(auth, event));
}
export const authReady = sb.auth.getSession().then(({ data }) => setSession(data.session, 'INITIAL'));
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION') return;
  setTimeout(() => setSession(session, event), 0); // fuera del callback (recomendación de supabase-js)
});
export const isStaff = () => !!auth.profile && auth.profile.is_active && auth.profile.role !== 'customer';
export const hasRole = (...r) => !!auth.profile && auth.profile.is_active && r.includes(auth.profile.role);

/* ---------------- carrito (solo ids; precios siempre desde la BD) ---------------- */
const CART_KEY = 'hm_cart_v1';
const safeLS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } },
};
export function getCart() {
  const c = safeLS.get(CART_KEY);
  return Array.isArray(c) ? c.filter((i) => i && /^[0-9a-f-]{36}$/i.test(i.id) && Number.isInteger(i.qty) && i.qty >= 1 && i.qty <= 5).slice(0, 10) : [];
}
export function setCart(items) {
  safeLS.set(CART_KEY, items);
  window.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
}
export function addToCart(id, color = null, qty = 1) {
  const cart = getCart();
  const line = cart.find((i) => i.id === id && (i.color || null) === (color || null));
  if (line) line.qty = Math.min(5, line.qty + qty); else cart.push({ id, color: color || null, qty: Math.min(5, qty) });
  setCart(cart);
}
export const cartCount = () => getCart().reduce((s, i) => s + i.qty, 0);

/* ---------------- consultas comunes ---------------- */
export const MOTO_FIELDS = 'id,slug,name,brand,model,year,price,compare_at_price,displacement_cc,power_hp,top_speed_kmh,acceleration_s,engine_type,transmission,brakes,tank_l,range_km,weight_kg,cooling,seats,short_description,description,colors,hero_image,hero_color,is_featured,is_published,sort_order,category_id,categories(name,slug),inventory(stock,low_stock_threshold),motorcycle_images(id,url,alt,sort_order)';
export const coverOf = (m) => (m.motorcycle_images || []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.url || m.hero_image || '';
export const stockOf = (m) => m.inventory?.stock ?? 0;
export function availability(m) {
  const s = stockOf(m), low = m.inventory?.low_stock_threshold ?? 2;
  if (s <= 0) return { cls: 'out', label: 'Agotado' };
  if (s <= low) return { cls: 'low', label: s === 1 ? 'Última unidad' : `Últimas ${s} unidades` };
  return { cls: 'ok', label: 'Disponible' };
}

/* ---------------- formularios ---------------- */
export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.classList.add('busy'); if (label) btn.textContent = label; }
  else { btn.disabled = false; btn.classList.remove('busy'); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
export function fieldError(form, name, msg) {
  const input = form.elements[name];
  if (!input) return;
  const wrap = input.closest('.field') || input.parentElement;
  let el = wrap.querySelector('.field-err');
  if (!msg) { el?.remove(); input.removeAttribute('aria-invalid'); return; }
  if (!el) { el = document.createElement('small'); el.className = 'field-err'; wrap.appendChild(el); }
  el.textContent = msg;
  input.setAttribute('aria-invalid', 'true');
}
export function clearErrors(form) { $$('.field-err', form).forEach((e) => e.remove()); $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid')); }
export const RX = {
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  phone: /^[0-9+ ()-]{6,20}$/,
  doc: /^[0-9A-Za-z-]{8,15}$/,
};
