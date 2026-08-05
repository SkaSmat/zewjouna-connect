import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Web push fan-out for match / message events.
 *
 * The caller is identified by their bearer token; we only ever notify the OTHER
 * member of a match the caller actually belongs to, and the payload never
 * contains message content (privacy on lock screens).
 */
export const notifyMatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(["match", "message"]),
        matchId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ sent: number }> => {
    const { userId, supabase } = context;

    // RLS: the caller only sees matches they belong to.
    const { data: match } = await supabase
      .from("matches")
      .select("id, user_a, user_b")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { sent: 0 };

    const recipientId = match.user_a === userId ? match.user_b : match.user_a;
    if (recipientId === userId) return { sent: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Anti-abuse: at most 30 push fan-outs per minute per sender.
    const { data: allowed } = await supabaseAdmin.rpc("rl_take", {
      p_key: `push:${userId}`,
      p_limit: 30,
      p_window_seconds: 60,
    });
    if (allowed === false) return { sent: 0 };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    if (!subs || subs.length === 0) return { sent: 0 };

    const { data: sender } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const name = sender?.display_name?.trim() || "Quelqu'un";

    const payload =
      data.type === "match"
        ? { title: "Nouveau match ✨", body: `${name} et vous, ça matche !`, url: "/matches" }
        : {
            title: "Nouveau message",
            body: `${name} vous a écrit.`,
            url: `/chat/${data.matchId}`,
          };

    const vapid = {
      subject: process.env["VAPID_SUBJECT"] ?? "mailto:contact@zewjouna.app",
      publicKey: process.env["VAPID_PUBLIC_KEY"],
      privateKey: process.env["VAPID_PRIVATE_KEY"],
    };
    if (!vapid.publicKey || !vapid.privateKey) return { sent: 0 };

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");

    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        const subscription = {
          endpoint: s.endpoint,
          expirationTime: null,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };
        try {
          const req = await buildPushPayload({ data: payload }, subscription, vapid);
          const res = await fetch(s.endpoint, {
            method: req.method,
            headers: req.headers,
            body: req.body as unknown as BodyInit,
          });
          if (res.ok) {
            sent += 1;
          } else if (res.status === 404 || res.status === 410) {
            // Subscription is dead — forget it.
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        } catch (err) {
          console.warn("[push] send failed", err);
        }
      }),
    );

    return { sent };
  });
