import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isProfileComplete } from "@/lib/auth";
import { Heart } from "lucide-react";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: pageHead(
    "ZEWJOUNA — Rencontres de la diaspora algérienne",
    "Rejoignez ZEWJOUNA : l'app de rencontre sérieuse de la diaspora algérienne, avec matching communautaire par région, langue et centres d'intérêt.",
  ),
  ssr: false,
  component: Index,
});

function Index() {
  const { user, loading, profile, profileLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!profileLoaded) return;
    if (isProfileComplete(profile)) {
      navigate({ to: "/discover", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [user, loading, profile, profileLoaded, navigate]);

  return <Splash />;
}

export function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gradient-brand text-primary-foreground">
      <div className="animate-pulse rounded-3xl bg-white/15 p-6 backdrop-blur">
        <Heart className="h-12 w-12" fill="currentColor" />
      </div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">ZEWJOUNA</h1>
      <p className="mt-1 text-sm text-primary-foreground/80">Diaspora algérienne</p>
    </div>
  );
}
