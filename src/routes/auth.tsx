import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth")({
  head: pageHead(
    "Connexion — ZEWJOUNA",
    "Connectez-vous ou créez votre compte ZEWJOUNA pour rencontrer la diaspora algérienne près de chez vous.",
  ),
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" && s.next.startsWith("/") ? { next: s.next } : {},
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (next) {
      window.location.replace(next);
      return;
    }
    navigate({ to: "/", replace: true });
  }, [user, loading, navigate, next]);

  const returnTo = () =>
    typeof window === "undefined"
      ? undefined
      : next
        ? window.location.origin + next
        : window.location.origin;

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !accepted) {
      toast.error("Vous devez confirmer avoir 18 ans et accepter les conditions.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: returnTo() },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vérifiez vos e-mails si une confirmation est requise.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (mode === "signup" && !accepted) {
      toast.error("Vous devez confirmer avoir 18 ans et accepter les conditions.");
      return;
    }
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: returnTo(),
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/discover", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la connexion Google");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="gradient-brand px-6 pb-12 pt-16 text-center text-primary-foreground">
        <h1 className="text-3xl font-extrabold tracking-tight">ZEWJOUNA</h1>
        <p className="mt-1 text-sm text-primary-foreground/85">
          Rencontres de la diaspora algérienne
        </p>
      </div>

      <div className="mx-auto -mt-6 w-full max-w-md flex-1 rounded-t-3xl bg-card px-6 pb-10 pt-8 shadow-card">
        <div className="mb-6 flex rounded-full bg-muted p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === m ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"
              }`}
            >
              {m === "signin" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">Au moins 8 caractères.</p>
            )}
          </div>
          {mode === "signup" && (
            <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
              />
              <span>
                Je certifie avoir <strong className="text-foreground">18 ans ou plus</strong> et
                j'accepte les{" "}
                <Link
                  to="/legal"
                  search={{ doc: "cgu" }}
                  className="font-medium text-primary underline"
                >
                  conditions d'utilisation
                </Link>{" "}
                et la{" "}
                <Link
                  to="/legal"
                  search={{ doc: "confidentialite" }}
                  className="font-medium text-primary underline"
                >
                  politique de confidentialité
                </Link>
                .
              </span>
            </label>
          )}

          <Button
            type="submit"
            className="w-full rounded-full"
            size="lg"
            disabled={busy || (mode === "signup" && !accepted)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Mail className="h-4 w-4" />
                {mode === "signin" ? "Se connecter" : "Créer mon compte"}
              </>
            )}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full rounded-full"
          onClick={handleGoogle}
          disabled={busy || (mode === "signup" && !accepted)}
        >
          <GoogleIcon />
          Continuer avec Google
        </Button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/legal" search={{ doc: "cgu" }} className="underline">
            Conditions d'utilisation
          </Link>
          {" · "}
          <Link to="/legal" search={{ doc: "confidentialite" }} className="underline">
            Confidentialité
          </Link>
          {" · "}
          <Link to="/legal" search={{ doc: "mentions" }} className="underline">
            Mentions légales
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
