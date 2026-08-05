import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { MatchRow, MatchProfileRow } from "@/lib/database.types";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Loader2, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/matches")({
  head: pageHead(
    "Mes matchs — ZEWJOUNA",
    "Retrouvez vos matchs ZEWJOUNA et lancez la conversation avant la fin des 24 heures.",
  ),
  component: Matches,
});

interface MatchView {
  match: MatchRow;
  otherId: string;
  profile: MatchProfileRow | null;
  photo: string | null;
}

function timeLeft(expires?: string | null): string | null {
  if (!expires) return null;
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return "expiré";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Matches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<MatchView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: matches, error } = await supabase
        .from("matches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (matches as MatchRow[]) ?? [];
      const views = await Promise.all(
        rows.map(async (match) => {
          const otherId = match.user_a === user.id ? match.user_b : match.user_a;
          let prof: MatchProfileRow | null = null;
          let photo: string | null = null;
          try {
            const { data } = await supabase.rpc("get_match_profile", { p_target: otherId });
            prof = ((data as MatchProfileRow[]) ?? [])[0] ?? null;
          } catch {
            /* ignore */
          }
          try {
            const urls = await getSignedPhotoUrls(otherId);
            photo = urls[0] ?? null;
          } catch {
            /* ignore */
          }
          return { match, otherId, profile: prof, photo } as MatchView;
        }),
      );
      setItems(views);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de charger les matchs");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 py-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" fill="currentColor" /> Vos matchs
        </h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="rounded-3xl bg-muted p-6">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="mt-5 text-lg font-bold">Aucun match pour l'instant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Continuez à découvrir des profils pour créer des connexions.
          </p>
        </div>
      ) : (
        <div className="space-y-3 px-4 pb-6">
          {items.map((v) => {
            const left = timeLeft(v.match.expires_at);
            const expired = left === "expiré";
            const yourTurn = !v.match.conversation_started && !expired;
            return (
              <button
                key={v.match.id}
                onClick={() => navigate({ to: "/chat/$matchId", params: { matchId: v.match.id } })}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-soft transition-transform active:scale-[0.99]"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {v.photo ? (
                    <img src={v.photo} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {v.profile?.display_name ?? "Profil"}
                    {v.profile?.age != null && (
                      <span className="font-medium text-muted-foreground"> · {v.profile.age}</span>
                    )}
                  </p>
                  {yourTurn ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      À toi de jouer
                    </span>
                  ) : expired ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                      Match expiré
                    </span>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Conversation en cours
                    </p>
                  )}
                </div>
                {left && !expired && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> {left}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
