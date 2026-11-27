// Webhook de Mercado Pago. Nunca confía en el cuerpo de la notificación:
// consulta el pago directamente a la API de Mercado Pago y lo aplica con
// la función SQL apply_gateway_payment (solo ejecutable con service_role).
//
// Secretos: MP_ACCESS_TOKEN (obligatorio), MP_WEBHOOK_SECRET (recomendado:
// "Clave secreta" de Webhooks en tu panel de Mercado Pago; si existe, se
// verifica la firma x-signature).
// Se despliega con verify_jwt = false porque Mercado Pago no envía JWT.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const STATUS: Record<string, string> = {
  approved: "aprobado",
  authorized: "en_proceso",
  in_process: "en_proceso",
  in_mediation: "en_proceso",
  pending: "pendiente",
  rejected: "rechazado",
  cancelled: "cancelado",
  refunded: "reembolsado",
  charged_back: "reembolsado",
};

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) return new Response("not configured", { status: 503 });

  const u = new URL(req.url);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const type = (body.type as string) ?? u.searchParams.get("type") ?? u.searchParams.get("topic");
  const dataId = String((body.data as { id?: string })?.id ?? u.searchParams.get("data.id") ?? u.searchParams.get("id") ?? "");
  if (type !== "payment" || !/^\d+$/.test(dataId)) return new Response("ignored");

  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (secret) {
    const sig = req.headers.get("x-signature") ?? "";
    const reqId = req.headers.get("x-request-id") ?? "";
    const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=")));
    const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
    if (!parts.ts || !parts.v1 || (await hmacHex(secret, manifest)) !== parts.v1) {
      return new Response("invalid signature", { status: 401 });
    }
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return new Response("payment lookup failed", { status: 502 });
  const p = await res.json();
  const orderId = String(p.external_reference ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("no reference");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { error } = await admin.rpc("apply_gateway_payment", {
    p_order_id: orderId,
    p_payment_id: String(p.id),
    p_status: STATUS[p.status] ?? "en_proceso",
    p_amount: Number(p.transaction_amount),
    p_currency: String(p.currency_id ?? "PEN"),
    p_raw: { id: p.id, status: p.status, status_detail: p.status_detail, payment_method_id: p.payment_method_id,
             payment_type_id: p.payment_type_id, date_approved: p.date_approved, transaction_amount: p.transaction_amount },
  });
  if (error) {
    console.error("apply_gateway_payment", error);
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
});
