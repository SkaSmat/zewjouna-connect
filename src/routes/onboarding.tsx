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
import { MultiSelect } from "@/components/multi-select";
import { Splash } from "@/routes/index";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/onboarding")({
  head: pageHead(
    "Créer mon profil — ZEWJOUNA",
    "Complétez votre profil ZEWJOUNA : photos, bio, préférences et attaches communautaires pour des rencontres qui vous ressemblent.",
  ),
  ssr: false,
  component: Onboarding,
});

const TOTAL = 6;

// Per-step copy shown as a friendly icon/emoji hero (Bumble/Badoo style).
const STEP_EMOJI = ["👋", "🎂", "💚", "✨", "📸", "🌍"] as const;

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
      const payload = {
        user_id: user.id,
        display_name: displayName.trim(),
        birthdate,
        gender: gender as "female" | "male" | "nonbinary",
        looking_for: lookingFor as "everyone" | "female" | "male" | "nonbinary",
        bio: bio.trim() || null,
        photos: photoPaths,
        community_tags,
        ...(coords ? { location: toWkt(coords.lng, coords.lat) } : {}),
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
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
          <button
            onClick={back}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted active:scale-90"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-8" />
        )}
        {/* Segmented progress, Bumble-style. */}
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "gradient-brand" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <span className="w-8 text-right text-xs font-semibold text-muted-foreground">
          {step + 1}/{TOTAL}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-7">
        {step === 0 && (
          <Step
            emoji={STEP_EMOJI[0]}
            title="Comment vous appelez-vous ?"
            subtitle="C'est ce prénom que les autres verront."
          >
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre prénom"
              maxLength={40}
              className="h-14 rounded-2xl text-lg"
            />
          </Step>
        )}

        {step === 1 && (
          <Step
            emoji={STEP_EMOJI[1]}
            title="Votre date de naissance"
            subtitle="Vous devez avoir au moins 18 ans."
          >
            <Input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="h-14 rounded-2xl text-lg"
            />
            {age != null && (
              <p
                className={`mt-3 text-sm font-medium ${
                  age >= 18 ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                {age >= 18 ? `${age} ans 🎉` : "Vous devez avoir 18 ans ou plus."}
              </p>
            )}
          </Step>
        )}

        {step === 2 && (
          <Step
            emoji={STEP_EMOJI[2]}
            title="Vous & vos préférences"
            subtitle="Pour vous proposer les bons profils."
          >
            <div className="space-y-6">
              <div>
                <Label className="mb-2.5 block font-semibold">Je suis</Label>
                <div className="grid grid-cols-3 gap-2.5">
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
                <Label className="mb-2.5 block font-semibold">Je recherche</Label>
                <div className="space-y-2.5">
                  {LOOKING_FOR_OPTIONS.map((o) => (
                    <OptionRow
                      key={o.value}
                      active={lookingFor === o.value}
                      onClick={() => setLookingFor(o.value)}
                    >
                      {o.label}
                    </OptionRow>
                  ))}
                </div>
              </div>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step
            emoji={STEP_EMOJI[3]}
            title="Parlez de vous"
            subtitle="Une bio sincère attire les bonnes personnes."
          >
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Ce qui vous fait vibrer, vos origines, ce que vous cherchez…"
              rows={6}
              maxLength={500}
              className="rounded-2xl text-base"
            />
            <p className="mt-2 text-right text-xs text-muted-foreground">{bio.length}/500</p>
          </Step>
        )}

        {step === 4 && (
          <Step
            emoji={STEP_EMOJI[4]}
            title="Ajoutez vos photos"
            subtitle="Au moins une belle photo de vous (jusqu'à 6)."
          >
            <div className="grid grid-cols-3 gap-3">
              {photoUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-3/4 overflow-hidden rounded-2xl shadow-soft"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Principale
                    </span>
                  )}
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-full bg-foreground/70 p-1 text-background transition-transform active:scale-90"
                    aria-label="Retirer la photo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photoPaths.length < 6 && (
                <label className="flex aspect-3/4 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-6 w-6" />
                  )}
                  <span className="text-[10px] font-medium">Ajouter</span>
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
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" /> Vos photos restent privées et sécurisées.
            </p>
          </Step>
        )}

        {step === 5 && (
          <Step
            emoji={STEP_EMOJI[5]}
            title="Votre communauté"
            subtitle="Le cœur de ZEWJOUNA : ce qui vous rapproche des autres."
          >
            <div className="space-y-6">
              <div>
                <Label className="mb-2.5 block font-semibold">Région d'origine</Label>
                <MultiSelect
                  options={REGIONS}
                  selected={regions}
                  onChange={setRegions}
                  placeholder="Choisir vos régions"
                />
              </div>
              <div>
                <Label className="mb-2.5 block font-semibold">Ville actuelle</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Paris, Montréal, Alger…"
                  maxLength={60}
                  className="h-12 rounded-2xl"
                />
              </div>
              <div>
                <Label className="mb-2.5 block font-semibold">Langues</Label>
                <MultiSelect
                  options={LANGUAGES}
                  selected={languages}
                  onChange={setLanguages}
                  placeholder="Choisir vos langues"
                />
              </div>
              <div>
                <Label className="mb-2.5 block font-semibold">Centres d'intérêt</Label>
                <MultiSelect
                  options={INTERESTS}
                  selected={interests}
                  onChange={setInterests}
                  max={8}
                  placeholder="Choisir vos centres d'intérêt (max 8)"
                />
              </div>
              <div
                className={`rounded-2xl border p-4 transition-colors ${
                  coords ? "border-primary/40 bg-accent" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <MapPin className="h-4 w-4 text-primary" /> Localisation
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {coords
                        ? "Position activée — on vous montrera les profils près de vous ✓"
                        : "Pour voir les personnes proches de vous."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={coords ? "secondary" : "outline"}
                    size="sm"
                    className="shrink-0 rounded-full"
                    onClick={requestGeo}
                    disabled={geoBusy}
                  >
                    {geoBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : coords ? (
                      <Check className="h-4 w-4" />
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

      <footer className="sticky bottom-0 mx-auto w-full max-w-md bg-gradient-to-t from-background via-background to-transparent px-5 pb-7 pt-5">
        <Button
          size="lg"
          className="h-14 w-full rounded-full text-base font-semibold shadow-soft"
          disabled={!canNext || saving}
          onClick={next}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step === TOTAL - 1 ? (
            <>
              <Sparkles className="h-4 w-4" /> Terminer
            </>
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
  emoji,
  title,
  subtitle,
  children,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
      {emoji && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl shadow-soft">
          {emoji}
        </div>
      )}
      <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
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
      className={`rounded-2xl border px-3 py-3.5 text-sm font-medium transition-all active:scale-95 ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-soft"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function OptionRow({
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
      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition-all active:scale-[0.98] ${
        active
          ? "border-primary bg-accent text-accent-foreground shadow-soft"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {children}
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
          active ? "border-primary bg-primary text-primary-foreground" : "border-border"
        }`}
      >
        {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
