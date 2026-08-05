import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Ban, Check, X, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/admin")({
  head: pageHead(
    "Modération — ZEWJOUNA",
    "Espace de modération ZEWJOUNA : traitement des signalements et des comptes suspendus.",
  ),
  component: AdminPage,
});

interface ReportRow {
  report_id: string;
  reporter_id: string;
  reported_id: string;
  reported_name: string | null;
  reported_banned: boolean;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
}

function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_reports", { p_only_open: onlyOpen });
    if (error) {
      toast.error("Chargement impossible.");
      setReports([]);
    } else {
      setReports((data as ReportRow[]) ?? []);
    }
    setLoading(false);
  }, [onlyOpen]);

  useEffect(() => {
    let active = true;
    supabase.rpc("current_user_is_admin").then(({ data }) => {
      if (!active) return;
      const isAdmin = data === true;
      setAllowed(isAdmin);
      if (!isAdmin) navigate({ to: "/discover", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate, user?.id]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const setBan = async (reportedId: string, banned: boolean) => {
    const { error } = await supabase.rpc("admin_set_ban", {
      p_user: reportedId,
      p_banned: banned,
    });
    if (error) return toast.error("Action impossible.");
    toast.success(banned ? "Utilisateur banni." : "Utilisateur débanni.");
    setReports((prev) =>
      prev.map((r) => (r.reported_id === reportedId ? { ...r, reported_banned: banned } : r)),
    );
  };

  const setStatus = async (reportId: string, status: ReportRow["status"]) => {
    const { error } = await supabase.rpc("admin_set_report_status", {
      p_report: reportId,
      p_status: status,
    });
    if (error) return toast.error("Action impossible.");
    if (onlyOpen) setReports((prev) => prev.filter((r) => r.report_id !== reportId));
    else setReports((prev) => prev.map((r) => (r.report_id === reportId ? { ...r, status } : r)));
    toast.success("Signalement traité.");
  };

  if (allowed === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-10">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <ShieldAlert className="h-5 w-5 text-primary" /> Modération
        </h1>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={() => setOnlyOpen((v) => !v)}
        >
          {onlyOpen ? "Voir tout" : "Ouverts seulement"}
        </Button>
      </header>

      <div className="px-5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : reports.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucun signalement {onlyOpen ? "ouvert" : ""}. 🎉
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <ReportCard
                key={r.report_id}
                report={r}
                onBan={(b) => setBan(r.reported_id, b)}
                onStatus={(s) => setStatus(r.report_id, s)}
                onReload={load}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onBan,
  onStatus,
  onReload,
}: {
  report: ReportRow;
  onBan: (banned: boolean) => void;
  onStatus: (status: ReportRow["status"]) => void;
  onReload: () => void;
}) {
  const [urls, setUrls] = useState<string[] | null>(null);

  const viewPhotos = async () => {
    setUrls([]);
    setUrls(await getSignedPhotoUrls(report.reported_id));
  };

  const removePhoto = async (index: number) => {
    const { error } = await supabase.rpc("admin_remove_photo", {
      p_user: report.reported_id,
      p_index: index,
    });
    if (error) return toast.error("Suppression impossible.");
    toast.success("Photo retirée.");
    setUrls((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    onReload();
  };

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            {report.reported_name ?? "Utilisateur"}
            {report.reported_banned && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                Banni
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Motif : {report.reason}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleString("fr-FR")} · statut : {report.status}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {report.reported_banned ? (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => onBan(false)}>
            Débannir
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-destructive text-destructive"
            onClick={() => onBan(true)}
          >
            <Ban className="h-4 w-4" /> Bannir
          </Button>
        )}
        <Button size="sm" variant="ghost" className="rounded-full" onClick={viewPhotos}>
          Voir les photos
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full text-primary"
          onClick={() => onStatus("resolved")}
        >
          <Check className="h-4 w-4" /> Résolu
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => onStatus("dismissed")}
        >
          <X className="h-4 w-4" /> Rejeter
        </Button>
      </div>

      {urls !== null && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {urls.length === 0 ? (
            <p className="col-span-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="h-4 w-4" /> Aucune photo.
            </p>
          ) : (
            urls.map((u, i) => (
              <div key={i} className="relative aspect-3/4 overflow-hidden rounded-lg">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                  aria-label="Retirer la photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </li>
  );
}
