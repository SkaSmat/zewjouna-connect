// Edge Function: delete-account
//
// Permanently deletes the authenticated caller's account (RGPD right to
// erasure). Removing the row from auth.users cascades to every table that
// references it (profiles, swipes, matches, messages, blocks, reports), so a
// single admin delete wipes all of the user's data.
//
// The caller is identified from their own JWT — a user can only ever delete
// THEMSELVES. The service-role key (needed for the admin delete) never leaves
// the server.
//
// Request: POST with Authorization: Bearer <user jwt>
// Response: { ok: true }

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  // Identify the caller from their JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  // Service-role client performs the cascade delete of the caller only.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Best-effort: remove the user's stored photos from the private bucket first
  // (storage objects are not FK-cascaded).
  const { data: profile } = await admin
    .from("profiles")
    .select("photos")
    .eq("user_id", user.id)
    .maybeSingle();
  const paths: string[] = profile?.photos ?? [];
  if (paths.length > 0) {
    await admin.storage.from("profile-photos").remove(paths);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});
