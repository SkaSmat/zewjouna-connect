// Edge Function: send-notification
//
// Sends transactional e-mails (via Resend) when a match is created or a message
// is received. Invoked by the client (JWT-gated); the caller must be a member
// of the match. Message notifications are throttled to avoid spamming.
//
// Request body:
//   { type: "match",   match_id }  -> emails BOTH members
//   { type: "message", match_id }  -> emails the OTHER member (throttled)
//
// Secrets required (set in Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   your Resend API key
//   NOTIFY_FROM      optional, e.g. "ZEWJOUNA <hello@votre-domaine.com>"
//                    (defaults to Resend's onboarding sender for testing)

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

const APP_URL = "https://zewjouna.lovable.app";

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("[send-notification] RESEND_API_KEY missing — skipping email");
    return;
  }
  const from = Deno.env.get("NOTIFY_FROM") ?? "ZEWJOUNA <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error("[send-notification] resend error", res.status, await res.text());
  }
}

function wrap(title: string, body: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2e7d5b">${title}</h2>
    <p style="font-size:15px;line-height:1.5;color:#333">${body}</p>
    <p><a href="${APP_URL}" style="display:inline-block;background:#2e7d5b;color:#fff;
      padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">
      Ouvrir ZEWJOUNA</a></p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let type: string | undefined;
  let matchId: string | undefined;
  try {
    const b = await req.json();
    type = b?.type;
    matchId = b?.match_id;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if ((type !== "match" && type !== "message") || !matchId) {
    return json({ error: "Bad request" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // The caller must belong to the match.
  const { data: match } = await admin
    .from("matches")
    .select("user_a,user_b")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || (match.user_a !== user.id && match.user_b !== user.id)) {
    return json({ error: "Forbidden" }, 403);
  }
  const otherId = match.user_a === user.id ? match.user_b : match.user_a;

  // Resolve display names for nicer copy.
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id,display_name")
    .in("user_id", [user.id, otherId]);
  const nameOf = (id: string) => profs?.find((p) => p.user_id === id)?.display_name ?? "Quelqu'un";

  const emailOf = async (id: string) => {
    const { data } = await admin.auth.admin.getUserById(id);
    return data.user?.email ?? null;
  };

  if (type === "match") {
    // Notify both members once.
    for (const [id, otherName] of [
      [user.id, nameOf(otherId)],
      [otherId, nameOf(user.id)],
    ] as const) {
      const to = await emailOf(id);
      if (to) {
        await sendEmail(
          to,
          "✨ Nouveau match sur ZEWJOUNA",
          wrap(
            "C'est un match !",
            `Vous avez un nouveau match avec <b>${otherName}</b>. Lancez la conversation 🌿`,
          ),
        );
      }
    }
    return json({ ok: true });
  }

  // type === "message": notify the recipient, throttled to 1 email / 15 min.
  const { data: allowed } = await admin.rpc("rl_take", {
    p_key: `notif:msg:${matchId}:${otherId}`,
    p_limit: 1,
    p_window_seconds: 900,
  });
  if (allowed === false) return json({ ok: true, throttled: true });

  const to = await emailOf(otherId);
  if (to) {
    await sendEmail(
      to,
      `💬 ${nameOf(user.id)} vous a écrit sur ZEWJOUNA`,
      wrap(
        "Nouveau message",
        `<b>${nameOf(user.id)}</b> vous a envoyé un message. Répondez-lui sur ZEWJOUNA.`,
      ),
    );
  }
  return json({ ok: true });
});
