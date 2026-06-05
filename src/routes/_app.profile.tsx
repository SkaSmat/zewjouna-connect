import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getOwnSignedUrls, uploadOwnPhoto } from "@/lib/photos";
import {
  REGIONS,
  LANGUAGES,
  INTERESTS,
  GENDER_OPTIONS,
  LOOKING_FOR_OPTIONS,
  ageFromBirthdate,
} from "@/lib/constants";
import { TagSelector } from "@/components/tag-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User, LogOut, Loader2, Plus, X, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [lookingFor, setLookingFor] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const communityOptions = [...REGIONS, ...LANGUAGES, ...INTERESTS];
  const age = ageFromBirthdate(profile?.birthdate);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setLookingFor(profile.looking_for ?? "");
      setTags(profile.community_tags ?? []);
      const paths = profile.photos ?? [];
      setPhotoPaths(paths);
      getOwnSignedUrls(paths).then(setPhotoUrls).catch(() => setPhotoUrls([]));
    }
  }, [profile]);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files).slice(0, 6 - photoPaths.length)) {
        added.push(await uploadOwnPhoto(user.id, f));
      }
      const all = [...photoPaths, ...added];
      setPhotoPaths(all);
      setPhotoUrls(await getOwnSignedUrls(all));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async (i: number) => {
    const next = photoPaths.filter((_, idx) => idx !== i);
    setPhotoPaths(next);
    setPhotoUrls(await getOwnSignedUrls(next));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          looking_for: lookingFor,
          community_tags: tags,
          photos: photoPaths,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profil mis à jour.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex flex-1 flex-col pb-6">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <User className="h-5 w-5 text-primary" /> Mon profil
        </h1>
        {profile?.verified && (
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            <BadgeCheck className="h-3.5 w-3.5" /> Vérifié
          </span>
        )}
      </header>

      <div className="space-y-6 px-5">
        <section>
          <Label className="mb-2 block">Photos</Label>
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
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoPick} />
              </label>
            )}
          </div>
        </section>

        <section className="space-y-1.5">
          <Label htmlFor="name">Prénom</Label>
          <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          <p className="text-xs text-muted-foreground">
            {age != null ? `${age} ans` : ""}
            {profile?.gender ? ` · ${GENDER_OPTIONS.find((g) => g.value === profile.gender)?.label}` : ""}
          </p>
        </section>

        <section className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={500} />
        </section>

        <section>
          <Label className="mb-2 block">Je recherche</Label>
          <div className="grid grid-cols-2 gap-2">
            {LOOKING_FOR_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setLookingFor(o.value)}
                className={`rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all active:scale-95 ${
                  lookingFor === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <Label className="mb-2 block">Tags communautaires</Label>
          <TagSelector options={communityOptions} selected={tags} onChange={setTags} />
        </section>

        <Button size="lg" className="w-full rounded-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full rounded-full text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </Button>
      </div>
    </div>
  );
}
