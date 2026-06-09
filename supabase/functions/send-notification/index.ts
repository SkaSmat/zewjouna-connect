// Edge Function: send-notification
//
// Notifies match/message events. For each recipient it tries WEB PUSH first
// (to their registered devices) and falls back to E-MAIL only when they have
// no active push subscription. Invoked by the client (JWT-gated); the caller
// must be a member of the match. Message notifications are throttled.
//
// Request body:
//   { type: "match",   match_id }  -> notifies BOTH members
//   { type: "message", match_id }  -> notifies the OTHER member
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY     Resend API key (e-mail fallback)
//   NOTIFY_FROM        optional sender, e.g. "ZEWJOUNA <no-reply@domaine.com>"
//   VAPID_PUBLIC_KEY   Web Push VAPID public key
//   VAPID_PRIVATE_KEY  Web Push VAPID private key
//   VAPID_SUBJECT      e.g. "mailto:contact@domaine.com"

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@zewjouna.app";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const from = Deno.env.get("NOTIFY_FROM") ?? "ZEWJOUNA <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error("[notify] resend error", res.status, await res.text());
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

// deno-lint-ignore no-explicit-any
type Admin = any;

// Push to all of a user's devices. Returns how many were reachable; prunes
// expired subscriptions (404/410).
async function pushToUser(
  admin: Admin,
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else {
        console.error("[notify] push error", code, err);
      }
    }
  }
  return sent;
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

  const { data: match } = await admin
    .from("matches")
    .select("user_a,user_b")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || (match.user_a !== user.id && match.user_b !== user.id)) {
    return json({ error: "Forbidden" }, 403);
  }
  const otherId = match.user_a === user.id ? match.user_b : match.user_a;

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
    // Notify both members; push first, e-mail fallback.
    for (const [id, otherName] of [
      [user.id, nameOf(otherId)],
      [otherId, nameOf(user.id)],
    ] as const) {
      const pushed = await pushToUser(admin, id, {
        title: "✨ Nouveau match",
        body: `Vous avez un match avec ${otherName} !`,
        url: `${APP_URL}/matches`,
      });
      if (pushed === 0) {
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
    }
    return json({ ok: true });
  }

  // type === "message": notify the recipient.
  const senderName = nameOf(user.id);
  const pushed = await pushToUser(admin, otherId, {
    title: `💬 ${senderName}`,
    body: "vous a envoyé un message",
    url: `${APP_URL}/messages`,
  });
  if (pushed > 0) return json({ ok: true, channel: "push" });

  // No push device → throttled e-mail fallback (1 / 15 min).
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
      `💬 ${senderName} vous a écrit sur ZEWJOUNA`,
      wrap("Nouveau message", `<b>${senderName}</b> vous a envoyé un message. Répondez-lui.`),
    );
  }
  return json({ ok: true, channel: "email" });
});
