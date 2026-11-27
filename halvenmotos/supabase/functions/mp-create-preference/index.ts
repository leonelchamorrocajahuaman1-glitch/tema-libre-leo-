// Crea una preferencia de pago de Mercado Pago para un pedido del usuario autenticado.
// Los importes salen SIEMPRE de la base de datos, nunca del navegador.
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   MP_ACCESS_TOKEN  Access token de producción (o de prueba) de Mercado Pago
//   SITE_URL         URL pública de la tienda, p. ej. https://tudominio.com/halvenmotos/
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  const SITE_URL = Deno.env.get("SITE_URL");
  if (!MP_ACCESS_TOKEN || !SITE_URL) {
    return json({ error: "La pasarela de pago aún no está configurada. Elige otro método o contáctanos." }, 503);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Sesión no válida" }, 401);

  let orderId = "";
  try {
    ({ order_id: orderId } = await req.json());
  } catch { /* cuerpo inválido */ }
  if (!/^[0-9a-f-]{36}$/i.test(orderId ?? "")) return json({ error: "Pedido no válido" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_number, user_id, status, payment_status, payment_method, total, currency, customer_email, customer_name, order_items(product_name, unit_price, quantity)")
    .eq("id", orderId)
    .single();
  if (error || !order) return json({ error: "Pedido no encontrado" }, 404);
  if (order.user_id !== user.id) return json({ error: "No autorizado" }, 403);
  if (order.payment_method !== "mercadopago") return json({ error: "Este pedido no usa Mercado Pago" }, 400);
  if (order.status === "cancelado") return json({ error: "El pedido está cancelado" }, 400);
  if (!["pendiente", "rechazado"].includes(order.payment_status)) {
    return json({ error: "Este pedido ya tiene un pago en curso o aprobado" }, 409);
  }

  const base = SITE_URL.endsWith("/") ? SITE_URL : SITE_URL + "/";
  const back = (s: string) => `${base}#/pedido/${order.id}?pago=${s}`;
  const items = (order.order_items as { product_name: string; unit_price: number; quantity: number }[]).map((i) => ({
    title: i.product_name,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    currency_id: order.currency,
  }));
  const itemsTotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const shipping = Math.round((Number(order.total) - itemsTotal) * 100) / 100;
  if (shipping > 0) items.push({ title: "Traslado", quantity: 1, unit_price: shipping, currency_id: order.currency });

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${order.id}-${Date.now()}`,
    },
    body: JSON.stringify({
      items,
      payer: { email: order.customer_email, name: order.customer_name },
      external_reference: order.id,
      statement_descriptor: "HALVEN MOTOS",
      back_urls: { success: back("ok"), pending: back("pendiente"), failure: back("error") },
      auto_return: "approved",
      notification_url: `${url}/functions/v1/mp-webhook`,
    }),
  });
  const pref = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok || !pref.init_point) {
    console.error("Mercado Pago preference error", mpRes.status, pref);
    return json({ error: "No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos." }, 502);
  }

  await admin.from("payments")
    .update({ provider_preference_id: pref.id })
    .eq("order_id", order.id)
    .eq("provider", "mercadopago")
    .is("provider_payment_id", null);

  return json({ init_point: pref.init_point });
});
