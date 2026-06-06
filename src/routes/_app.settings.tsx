import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Settings as SettingsIcon,
  Download,
  Trash2,
  ShieldOff,
  ShieldAlert,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

interface BlockRow {
  blocked_id: string;
  created_at: string;
}

function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.rpc("current_user_is_admin").then(({ data }) => setIsAdmin(data === true));
  }, [user?.id]);

  const loadBlocks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("blocks")
      .select("blocked_id,created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });
    setBlocks((data as BlockRow[]) ?? []);
  }, [user]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const unblock = async (blockedId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedId);
    if (error) {
      toast.error("Impossible de débloquer.");
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.blocked_id !== blockedId));
    toast.success("Personne débloquée.");
  };

  const exportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // RLS scopes every table to the caller's own rows.
      const [profile, swipes, matches, messages, blocksData, reports] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("swipes").select("*"),
        supabase.from("matches").select("*"),
        supabase.from("messages").select("*"),
        supabase.from("blocks").select("*"),
        supabase.from("reports").select("*"),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email },
        profile: profile.data,
        swipes: swipes.data,
        matches: matches.data,
        messages: messages.data,
        blocks: blocksData.data,
        reports: reports.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zewjouna-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Vos données ont été exportées.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'export");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error) throw error;
      toast.success("Votre compte a été supprimé.");
      await signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de supprimer le compte");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col pb-10">
      <header className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <SettingsIcon className="h-5 w-5 text-primary" /> Réglages
        </h1>
      </header>

      <div className="space-y-8 px-5">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary"
          >
            <ShieldAlert className="h-4 w-4" /> Espace modération
          </Link>
        )}

        {/* Data export */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Mes données</h2>
          <p className="text-xs text-muted-foreground">
            Téléchargez une copie de toutes vos données (profil, swipes, matchs, messages, blocages,
            signalements) au format JSON.
          </p>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={exportData}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exporter mes données
          </Button>
        </section>

        {/* Blocks */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Personnes bloquées</h2>
          {blocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Vous n'avez bloqué personne.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {blocks.map((b) => (
                <li
                  key={b.blocked_id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldOff className="h-4 w-4" />
                    Bloqué le {new Date(b.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-primary"
                    onClick={() => unblock(b.blocked_id)}
                  >
                    Débloquer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Danger zone */}
        <section className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
            <Trash2 className="h-4 w-4" /> Supprimer mon compte
          </h2>
          <p className="text-xs text-muted-foreground">
            Action irréversible : votre profil, vos photos, vos matchs et vos messages seront
            définitivement effacés. Tapez <strong>SUPPRIMER</strong> pour confirmer.
          </p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="SUPPRIMER"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            className="w-full rounded-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={deleteAccount}
            disabled={confirm !== "SUPPRIMER" || deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Supprimer définitivement
          </Button>
        </section>
      </div>
    </div>
  );
}
