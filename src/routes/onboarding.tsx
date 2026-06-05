import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { uploadOwnPhoto, getOwnSignedUrls } from "@/lib/photos";
import {
  REGIONS,
  LANGUAGES,
  INTERESTS,
  GENDER_OPTIONS,
  LOOKING_FOR_OPTIONS,
  ageFromBirthdate,
  toWkt,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { TagSelector } from "@/components/tag-selector";
import { Splash } from "@/routes/index";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Loader2,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  component: Onboarding,
});

const TOTAL = 6;

function Onboarding() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [lookingFor, setLookingFor] = useState<string>("");
  const [bio, setBio] = useState("");
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  // Prefill from any existing partial profile.
  useEffect(() => {
    if (profile) {
      setDisplayName((v) => v || profile.display_name || "");
      setBirthdate((v) => v || profile.birthdate || "");
      setGender((v) => v || profile.gender || "");
      setLookingFor((v) => v || profile.looking_for || "");
      setBio((v) => v || profile.bio || "");
    }
  }, [profile]);

  const age = ageFromBirthdate(birthdate);

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return displayName.trim().length >= 2;
      case 1:
        return age != null && age >= 18;
      case 2:
        return !!gender && !!lookingFor;
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return regions.length > 0 || languages.length > 0 || interests.length > 0;
      default:
        return false;
    }
  }, [step, displayName, age, gender, lookingFor, regions, languages, interests]);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      const newPaths: string[] = [];
      for (const file of Array.from(files).slice(0, 6 - photoPaths.length)) {
        const path = await uploadOwnPhoto(user.id, file);
        newPaths.push(path);
      }
      const allPaths = [...photoPaths, ...newPaths];
      setPhotoPaths(allPaths);
      const urls = await getOwnSignedUrls(allPaths);
      setPhotoUrls(urls);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi de la photo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async (idx: number) => {
    const next = photoPaths.filter((_, i) => i !== idx);
    setPhotoPaths(next);
    setPhotoUrls(await getOwnSignedUrls(next));
  };

  const requestGeo = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setGeoBusy(false);
        toast.success("Position enregistrée.");
      },
      () => {
        setGeoBusy(false);
        toast.error("Impossible d'obtenir votre position. Vous pourrez l'ajouter plus tard.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const community_tags = Array.from(
        new Set([...regions, ...languages, ...interests, ...(city.trim() ? [city.trim()] : [])]),
      );
      const payload: Record<string, unknown> = {
        user_id: user.id,
        display_name: displayName.trim(),
        birthdate,
        gender,
        looking_for: lookingFor,
        bio: bio.trim() || null,
        photos: photoPaths,
        community_tags,
      };
      if (coords) payload.location = toWkt(coords.lng, coords.lat);

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      await refreshProfile();
      toast.success("Profil créé ! Bienvenue sur ZEWJOUNA 🌿");
      navigate({ to: "/discover", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer le profil");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step < TOTAL - 1) setStep((s) => s + 1);
    else finish();
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (loading || !user) return <Splash />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 px-5 pt-6">
        {step > 0 ? (
          <button onClick={back} className="rounded-full p-1 text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-7" />
        )}
        <Progress value={((step + 1) / TOTAL) * 100} className="h-2 flex-1" />
        <span className="w-7 text-right text-xs font-medium text-muted-foreground">
          {step + 1}/{TOTAL}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-8">
        {step === 0 && (
          <Step title="Comment vous appelez-vous ?" subtitle="C'est ce prénom que les autres verront.">
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre prénom"
              maxLength={40}
              className="text-lg"
            />
          </Step>
        )}

        {step === 1 && (
          <Step title="Votre date de naissance" subtitle="Vous devez avoir au moins 18 ans.">
            <Input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="text-lg"
            />
            {age != null && (
              <p className={`mt-2 text-sm ${age >= 18 ? "text-muted-foreground" : "text-destructive"}`}>
                {age >= 18 ? `${age} ans` : "Vous devez avoir 18 ans ou plus."}
              </p>
            )}
          </Step>
        )}

        {step === 2 && (
          <Step title="Vous & vos préférences" subtitle="Pour vous proposer les bons profils.">
            <div className="space-y-5">
              <div>
                <Label className="mb-2 block">Je suis</Label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDER_OPTIONS.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      active={gender === o.value}
                      onClick={() => setGender(o.value)}
                    >
                      {o.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Je recherche</Label>
                <div className="grid grid-cols-2 gap-2">
                  {LOOKING_FOR_OPTIONS.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      active={lookingFor === o.value}
                      onClick={() => setLookingFor(o.value)}
                    >
                      {o.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step title="Parlez de vous" subtitle="Une bio sincère attire les bonnes personnes.">
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Ce qui vous fait vibrer, vos origines, ce que vous cherchez…"
              rows={6}
              maxLength={500}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
          </Step>
        )}

        {step === 4 && (
          <Step title="Ajoutez vos photos" subtitle="Au moins une belle photo de vous (jusqu'à 6).">
            <div className="grid grid-cols-3 gap-3">
              {photoUrls.map((url, i) => (
                <div key={i} className="relative aspect-3/4 overflow-hidden rounded-xl">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-full bg-foreground/70 p-1 text-background"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photoPaths.length < 6 && (
                <label className="flex aspect-3/4 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted text-muted-foreground">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-6 w-6" />
                  )}
                  <span className="text-[10px]">Ajouter</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoPick}
                  />
                </label>
              )}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" /> Vos photos restent privées et sécurisées.
            </p>
          </Step>
        )}

        {step === 5 && (
          <Step
            title="Votre communauté"
            subtitle="Le cœur de ZEWJOUNA : ce qui vous rapproche des autres."
          >
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">Région d'origine</Label>
                <TagSelector options={REGIONS} selected={regions} onChange={setRegions} />
              </div>
              <div>
                <Label className="mb-2 block">Ville actuelle</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Paris, Montréal, Alger…"
                  maxLength={60}
                />
              </div>
              <div>
                <Label className="mb-2 block">Langues</Label>
                <TagSelector options={LANGUAGES} selected={languages} onChange={setLanguages} />
              </div>
              <div>
                <Label className="mb-2 block">Centres d'intérêt</Label>
                <TagSelector
                  options={INTERESTS}
                  selected={interests}
                  onChange={setInterests}
                  max={8}
                />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Localisation</p>
                    <p className="text-xs text-muted-foreground">
                      {coords ? "Position activée ✓" : "Pour calculer les distances."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={coords ? "secondary" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={requestGeo}
                    disabled={geoBusy}
                  >
                    {geoBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    {coords ? "Activée" : "Activer"}
                  </Button>
                </div>
              </div>
            </div>
          </Step>
        )}
      </main>

      <footer className="sticky bottom-0 mx-auto w-full max-w-md bg-gradient-to-t from-background to-transparent px-5 pb-6 pt-4">
        <Button
          size="lg"
          className="w-full rounded-full"
          disabled={!canNext || saving}
          onClick={next}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step === TOTAL - 1 ? (
            "Terminer"
          ) : (
            <>
              Continuer <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-sm font-medium transition-all active:scale-95 ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-soft"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}
