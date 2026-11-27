// Activa o bloquea una cuenta. Primero llama a la RPC admin_set_user_active
// con el JWT del que llama (la base de datos verifica que sea administrador),
// y solo entonces bloquea/desbloquea el inicio de sesión en Supabase Auth.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  let userId = "", active = true;
  try {
    ({ user_id: userId, active } = await req.json());
  } catch { /* cuerpo inválido */ }
  if (!/^[0-9a-f-]{36}$/i.test(userId ?? "") || typeof active !== "boolean") {
    return json({ error: "Solicitud no válida" }, 400);
  }

  const { error } = await userClient.rpc("admin_set_user_active", { p_user: userId, p_active: active });
  if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  if (banErr) return json({ error: "Perfil actualizado, pero no se pudo cambiar el acceso: " + banErr.message }, 500);
  return json({ ok: true });
});
