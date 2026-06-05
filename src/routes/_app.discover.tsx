import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CandidateRow } from "@/lib/database.types";
import { ageFromBirthdate } from "@/lib/constants";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { Heart, X, Loader2, RefreshCw, Flame } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/discover")({
  component: Discover,
});

function Discover() {
  const { user, profile } = useAuth();
  const [stack, setStack] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myAge = ageFromBirthdate(profile?.birthdate) ?? 25;
      const { data, error } = await supabase.rpc("get_candidates_adaptive", {
        p_target: 10,
        p_min_age: Math.max(18, myAge - 10),
        p_max_age: myAge + 12,
        p_limit: 20,
      });
      if (error) throw error;
      setStack(((data as CandidateRow[]) ?? []).filter((c) => c.user_id !== user?.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de charger les profils");
    } finally {
      setLoading(false);
    }
  }, [profile?.birthdate, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (candidate: CandidateRow, action: "like" | "pass") => {
      setStack((prev) => prev.filter((c) => c.user_id !== candidate.user_id));
      if (!user) return;
      try {
        const { error } = await supabase
          .from("swipes")
          .insert({ swiper_id: user.id, swiped_id: candidate.user_id, action });
        if (error) throw error;
        if (action === "like") {
          // Detect a mutual match created server-side by the trigger.
          const { data: m } = await supabase
            .from("matches")
            .select("id,user_a,user_b")
            .or(`user_a.eq.${candidate.user_id},user_b.eq.${candidate.user_id}`)
            .limit(1)
            .maybeSingle();
          if (m) toast.success(`C'est un match avec ${candidate.display_name} ! 💚`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action impossible");
      }
    },
    [user],
  );

  const top = stack[0];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <Flame className="h-5 w-5 text-primary" fill="currentColor" /> Découvrir
        </h1>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={load}>
          <RefreshCw className="h-5 w-5" />
        </Button>
      </header>

      <div className="relative mx-4 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : stack.length === 0 ? (
          <Empty onReload={load} />
        ) : (
          <div className="absolute inset-0 mb-4">
            {stack
              .slice(0, 2)
              .reverse()
              .map((c) => (
                <SwipeCard
                  key={c.user_id}
                  candidate={c}
                  isTop={c.user_id === top?.user_id}
                  onDecision={(action) => decide(c, action)}
                />
              ))}
          </div>
        )}
      </div>

      {!loading && stack.length > 0 && (
        <div className="flex items-center justify-center gap-6 py-5">
          <button
            onClick={() => top && decide(top, "pass")}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card text-pass shadow-card transition-transform active:scale-90"
            aria-label="Passer"
          >
            <X className="h-7 w-7" strokeWidth={2.5} />
          </button>
          <button
            onClick={() => top && decide(top, "like")}
            className="flex h-20 w-20 items-center justify-center rounded-full gradient-brand text-primary-foreground shadow-card transition-transform active:scale-90"
            aria-label="J'aime"
          >
            <Heart className="h-9 w-9" fill="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="rounded-3xl bg-muted p-6">
        <Flame className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="mt-5 text-lg font-bold">Plus de profils pour l'instant</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Revenez bientôt — de nouvelles personnes rejoignent ZEWJOUNA chaque jour.
      </p>
      <Button className="mt-5 rounded-full" onClick={onReload}>
        <RefreshCw className="h-4 w-4" /> Actualiser
      </Button>
    </div>
  );
}
