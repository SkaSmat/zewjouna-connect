/**
 * Match/message notifications (web push + e-mail fallback).
 *
 * Not wired yet on the new backend: it needs VAPID keys (web push) and/or a
 * transactional e-mail provider key. Until those are configured this is a
 * no-op, so the UI flow is never blocked.
 */
export function notify(_type: "match" | "message", _matchId: string): void {
  // intentionally empty — see above
}
