import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CandidateRow } from "@/lib/database.types";
import { ageFromBirthdate, COUNTRIES, type Country } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Heart,
  X,
  Loader2,
  RefreshCw,
  Flame,
  SlidersHorizontal,
  MapPin,
  Globe,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/discover")({
  head: pageHead(
    "Découvrir — ZEWJOUNA",
    "Parcourez les profils de la diaspora algérienne autour de vous et likez ceux qui vous correspondent.",
  ),
  component: Discover,
});

// null = adaptive radius (auto, cold-start friendly). A number = hard cap in km.
const MIN_KM = 5;
const MAX_KM = 200;

function Discover() {
  const { user, profile } = useAuth();
  const [stack, setStack] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  // null = explore around my real location. A country = "passport" mode.
  const [country, setCountry] = useState<Country | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myAge = ageFromBirthdate(profile?.birthdate) ?? 25;
      const { data, error } = await supabase.rpc("get_candidates_adaptive", {
        p_target: 10,
        p_min_age: Math.max(18, myAge - 10),
        p_max_age: myAge + 12,
        p_limit: 20,
        ...(maxDistanceKm != null ? { p_max_distance_km: maxDistanceKm } : {}),
        ...(country ? { p_center_lng: country.lng, p_center_lat: country.lat } : {}),
      });
      if (error) throw error;
      setStack(((data as CandidateRow[]) ?? []).filter((c) => c.user_id !== user?.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de charger les profils");
    } finally {
      setLoading(false);
    }
  }, [profile?.birthdate, user?.id, maxDistanceKm, country]);

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
          if (m) {
            toast.success(`C'est un match avec ${candidate.display_name} ! 💚`);
            notify("match", m.id);
          }
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
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full"
                aria-label="Choisir un pays"
              >
                {country ? (
                  <span className="text-lg leading-none">{country.flag}</span>
                ) : (
                  <Globe className="h-5 w-5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 rounded-2xl p-2">
              <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">
                Explorer un pays
              </p>
              <div className="max-h-72 overflow-y-auto">
                <button
                  onClick={() => setCountry(null)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-muted ${
                    country == null ? "font-semibold" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Autour de moi
                  </span>
                  {country == null && <Check className="h-4 w-4 text-primary" />}
                </button>
                {COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setCountry(c)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-muted ${
                      country?.code === c.code ? "font-semibold" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{c.flag}</span> {c.label}
                    </span>
                    {country?.code === c.code && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full"
                aria-label="Filtres de distance"
              >
                <SlidersHorizontal className="h-5 w-5" />
                {maxDistanceKm != null && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-2xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-primary" /> Distance maximale
                  </p>
                  <span className="text-sm font-medium text-muted-foreground">
                    {maxDistanceKm == null ? "Illimitée" : `${maxDistanceKm} km`}
                  </span>
                </div>
                <Slider
                  value={[maxDistanceKm ?? MAX_KM]}
                  min={MIN_KM}
                  max={MAX_KM}
                  step={5}
                  onValueChange={([v]) => setMaxDistanceKm(v >= MAX_KM ? null : v)}
                />
                <p className="text-xs text-muted-foreground">
                  Au maximum (200 km), la distance est illimitée et on élargit automatiquement la
                  zone si besoin.
                </p>
                {maxDistanceKm != null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full"
                    onClick={() => setMaxDistanceKm(null)}
                  >
                    Réinitialiser
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={load}>
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {country && (
        <div className="mx-4 mb-1 flex items-center justify-between rounded-full bg-accent px-4 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-accent-foreground">
            <Globe className="h-4 w-4 text-primary" /> Vous explorez {country.flag} {country.label}
          </span>
          <button
            onClick={() => setCountry(null)}
            className="font-semibold text-primary transition-opacity hover:opacity-70"
          >
            Revenir
          </button>
        </div>
      )}

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
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
        {"Revenez bientôt —\nde nouvelles personnes rejoignent ZEWJOUNA chaque jour.\n"}
      </p>
      <Button className="mt-5 rounded-full" onClick={onReload}>
        <RefreshCw className="h-4 w-4" /> Actualiser
      </Button>
    </div>
  );
}
