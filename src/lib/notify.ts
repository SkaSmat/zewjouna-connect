import { notifyMatchEvent } from "@/lib/notify.functions";

/**
 * Fire-and-forget notification for a match/message event.
 *
 * Delivery is web push only (see `src/lib/push.ts` for the subscription flow).
 * Failures are swallowed: a notification must never block the UI flow.
 */
export function notify(type: "match" | "message", matchId: string): void {
  void notifyMatchEvent({ data: { type, matchId } }).catch((err) => {
    console.warn("[notify] push dispatch failed:", err);
  });
}
