import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { MoreVertical, Flag, Ban, HeartCrack } from "lucide-react";
import { toast } from "sonner";

const REASONS = [
  "Faux profil",
  "Comportement inapproprié",
  "Harcèlement",
  "Contenu choquant",
  "Spam / arnaque",
  "Autre",
];

export function SafetyMenu({
  targetId,
  matchId,
  onBlocked,
  onUnmatched,
}: {
  targetId: string;
  matchId?: string;
  onBlocked?: () => void;
  onUnmatched?: () => void;
}) {
  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [unmatchOpen, setUnmatchOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submitReport = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const fullReason = details.trim() ? `${reason} — ${details.trim()}` : reason;
      const { error } = await supabase
        .from("reports")
        .insert({ reporter_id: user.id, reported_id: targetId, reason: fullReason });
      if (error) throw error;
      toast.success("Signalement envoyé. Merci de nous aider à garder ZEWJOUNA sûre.");
      setReportOpen(false);
      setDetails("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'envoyer le signalement");
    } finally {
      setBusy(false);
    }
  };

  const submitUnmatch = async () => {
    if (!matchId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("unmatch", { p_match_id: matchId });
      if (error) throw error;
      toast.success("Vous n'êtes plus en match.");
      setUnmatchOpen(false);
      onUnmatched?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de se dématcher");
    } finally {
      setBusy(false);
    }
  };

  const submitBlock = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("blocks")
        .insert({ blocker_id: user.id, blocked_id: targetId });
      if (error) throw error;
      toast.success("Profil bloqué.");
      setBlockOpen(false);
      onBlocked?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de bloquer ce profil");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Options">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            <Flag className="h-4 w-4" /> Signaler
          </DropdownMenuItem>
          {matchId && (
            <DropdownMenuItem onSelect={() => setUnmatchOpen(true)}>
              <HeartCrack className="h-4 w-4" /> Se dématcher
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setBlockOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="h-4 w-4" /> Bloquer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler ce profil</DialogTitle>
            <DialogDescription>
              Choisissez un motif. Votre signalement reste confidentiel.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  reason === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Détails (facultatif)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitReport} disabled={busy}>
              Envoyer le signalement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unmatchOpen} onOpenChange={setUnmatchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Se dématcher ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le match et toute la conversation seront supprimés pour vous deux. Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submitUnmatch();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Se dématcher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquer ce profil ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne verrez plus cette personne et elle ne pourra plus vous contacter. Cette action
              peut être gérée plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submitBlock();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Bloquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
