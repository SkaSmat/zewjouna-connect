import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget e-mail notification. Triggers the `send-notification` edge
 * function for a new match or message. Failures are swallowed: notifications
 * are best-effort and must never block or break the UI flow.
 */
export function notify(type: "match" | "message", matchId: string): void {
  supabase.functions
    .invoke("send-notification", { body: { type, match_id: matchId } })
    .catch(() => undefined);
}
