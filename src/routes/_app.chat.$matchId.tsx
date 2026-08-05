import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { MatchRow, MatchProfileRow, MessageRow } from "@/lib/database.types";
import { getSignedPhotoUrls } from "@/lib/photos";
import { notify } from "@/lib/notify";
import { SafetyMenu } from "@/components/safety-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Send, Clock, Lock } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/chat/$matchId")({
  head: pageHead("Conversation — ZEWJOUNA", "Discutez en temps réel avec votre match ZEWJOUNA."),
  component: Chat,
});

function Chat() {
  const { matchId } = useParams({ from: "/_app/chat/$matchId" });
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [other, setOther] = useState<MatchProfileRow | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const expired = !!match?.expires_at && new Date(match.expires_at).getTime() < Date.now();
  // Bumble rule: in a hetero pair with no messages yet, only the woman may start.
  const heteroPair =
    !!profile?.gender &&
    !!other?.gender &&
    ((profile.gender === "male" && other.gender === "female") ||
      (profile.gender === "female" && other.gender === "male"));
  const noMessages = messages.length === 0;
  const waitingForHer = heteroPair && noMessages && profile?.gender === "male";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: m } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
    const matchRow = (m as MatchRow) ?? null;
    setMatch(matchRow);
    if (matchRow) {
      const otherId = matchRow.user_a === user.id ? matchRow.user_b : matchRow.user_a;
      try {
        const { data } = await supabase.rpc("get_match_profile", { p_target: otherId });
        setOther(((data as MatchProfileRow[]) ?? [])[0] ?? null);
      } catch {
        /* ignore */
      }
      try {
        setPhoto((await getSignedPhotoUrls(otherId))[0] ?? null);
      } catch {
        /* ignore */
      }
    }
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    setMessages((msgs as MessageRow[]) ?? []);
    setLoading(false);
  }, [matchId, user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as MessageRow;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Mark received messages as read
  useEffect(() => {
    if (!user) return;
    const unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at);
    if (unread.length) {
      supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unread.map((m) => m.id),
        )
        .then(() => undefined);
    }
  }, [messages, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim() || sending) return;
    const content = text.trim();
    setSending(true);
    try {
      const { error } = await supabase
        .from("messages")
        .insert({ match_id: matchId, sender_id: user.id, content });
      if (error) throw error;
      setText("");
      notify("message", matchId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Message non envoyé";
      toast.error(
        heteroPair && profile?.gender === "male"
          ? "Sur ZEWJOUNA, c'est à elle de lancer la conversation."
          : msg,
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-3">
        <button onClick={() => navigate({ to: "/messages" })} className="p-1 text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{other?.display_name ?? "Profil"}</p>
          {expired && <p className="text-xs text-destructive">Match expiré</p>}
        </div>
        {other && (
          <SafetyMenu
            targetId={other.user_id}
            matchId={matchId}
            onBlocked={() => navigate({ to: "/messages" })}
            onUnmatched={() => navigate({ to: "/messages" })}
          />
        )}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !waitingForHer && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Lancez la conversation 🌿
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {expired ? (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-card px-4 py-4 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" /> Ce match a expiré.
        </div>
      ) : waitingForHer ? (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          En attente qu'elle lance la conversation.
        </div>
      ) : (
        <form
          onSubmit={send}
          className="flex items-center gap-2 border-t border-border bg-card px-3 py-3"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Écrire un message…"
            maxLength={1000}
            className="rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={!text.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
