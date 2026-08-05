import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
};

type AuthzDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("authorization_id manquant");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">Demande d'autorisation illisible</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "cette application";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Aucune redirection renvoyée par le serveur d'autorisation.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-xl font-bold text-foreground">
        Connecter {clientName} à votre compte ZEWJOUNA
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {clientName} pourra lire votre profil, vos matchs et vos conversations, et envoyer des
        messages en votre nom.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button className="flex-1 rounded-full" disabled={busy} onClick={() => decide(true)}>
          Autoriser
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Refuser
        </Button>
      </div>
    </main>
  );
}
