import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { MatchRow, MatchProfileRow, MessageRow } from "@/lib/database.types";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Loader2, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_app/messages")({
  component: Messages,
});

interface Convo {
  match: MatchRow;
  otherId: string;
  name: string;
  photo: string | null;
  last: MessageRow | null;
}

function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: matches } = await supabase
      .from("matches")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (matches as MatchRow[]) ?? [];
    const convos = await Promise.all(
      rows.map(async (match) => {
        const otherId = match.user_a === user.id ? match.user_b : match.user_a;
        let name = "Profil";
        let photo: string | null = null;
        try {
          const { data } = await supabase.rpc("get_match_profile", { p_target: otherId });
          name = ((data as MatchProfileRow[]) ?? [])[0]?.display_name ?? "Profil";
        } catch { /* ignore */ }
        try {
          photo = (await getSignedPhotoUrls(otherId))[0] ?? null;
        } catch { /* ignore */ }
        const { data: msgs } = await supabase
          .from("messages")
          .select("*")
          .eq("match_id", match.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const last = ((msgs as MessageRow[]) ?? [])[0] ?? null;
        return { match, otherId, name, photo, last } as Convo;
      }),
    );
    setItems(convos);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 py-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <MessageCircle className="h-5 w-5 text-primary" /> Messages
        </h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="rounded-3xl bg-muted p-6">
            <MessageCircle className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="mt-5 text-lg font-bold">Aucune conversation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos matchs apparaîtront ici dès que vous pourrez discuter.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border px-2 pb-6">
          {items.map((c) => (
            <button
              key={c.match.id}
              onClick={() => navigate({ to: "/chat/$matchId", params: { matchId: c.match.id } })}
              className="flex w-full items-center gap-3 px-3 py-3 text-left"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {c.last?.content ?? "Dites bonjour 👋"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
