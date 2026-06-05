import { useEffect, useRef, useState } from "react";
import type { CandidateRow } from "@/lib/database.types";
import { getSignedPhotoUrls } from "@/lib/photos";
import { formatDistance } from "@/lib/constants";
import { BadgeCheck, MapPin, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { SafetyMenu } from "@/components/safety-menu";

interface SwipeCardProps {
  candidate: CandidateRow;
  onDecision: (action: "like" | "pass") => void;
  isTop: boolean;
}

export function SwipeCard({ candidate, onDecision, isTop }: SwipeCardProps) {
  const [urls, setUrls] = useState<string[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<null | "like" | "pass">(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingPhotos(true);
    getSignedPhotoUrls(candidate.user_id)
      .then((u) => active && setUrls(u))
      .catch(() => active && setUrls([]))
      .finally(() => active && setLoadingPhotos(false));
    return () => {
      active = false;
    };
  }, [candidate.user_id]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    const { x } = drag;
    if (x > 110) fly("like");
    else if (x < -110) fly("pass");
    else setDrag({ x: 0, y: 0 });
    start.current = null;
  };

  const fly = (action: "like" | "pass") => {
    setLeaving(action);
    setDrag({ x: action === "like" ? 600 : -600, y: 0 });
    setTimeout(() => onDecision(action), 220);
  };

  const rotation = drag.x / 18;
  const likeOpacity = Math.min(Math.max(drag.x / 110, 0), 1);
  const passOpacity = Math.min(Math.max(-drag.x / 110, 0), 1);

  return (
    <div
      className="absolute inset-0 select-none touch-none"
      style={{
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)`,
        transition: start.current ? "none" : "transform 0.22s ease-out",
        zIndex: isTop ? 10 : 5,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative h-full w-full overflow-hidden rounded-3xl bg-muted shadow-card">
        {/* Photo */}
        {loadingPhotos ? (
          <div className="h-full w-full animate-pulse bg-muted" />
        ) : urls.length ? (
          <img
            src={urls[photoIdx]}
            alt={candidate.display_name ?? "Profil"}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="h-10 w-10" />
            <span className="text-sm">Pas de photo</span>
          </div>
        )}

        {/* Photo nav */}
        {urls.length > 1 && (
          <>
            <div className="absolute left-0 right-0 top-2 flex gap-1 px-3">
              {urls.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
            <button
              className="absolute left-0 top-0 h-full w-1/3"
              onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
              aria-label="Photo précédente"
            />
            <button
              className="absolute right-0 top-0 h-full w-1/3"
              onClick={() => setPhotoIdx((i) => Math.min(urls.length - 1, i + 1))}
              aria-label="Photo suivante"
            />
            {photoIdx > 0 && (
              <ChevronLeft className="pointer-events-none absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 text-white/70" />
            )}
            {photoIdx < urls.length - 1 && (
              <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 text-white/70" />
            )}
          </>
        )}

        {/* LIKE / PASS stamps */}
        <div
          className="absolute left-6 top-8 rotate-[-18deg] rounded-xl border-4 border-like px-4 py-1 text-2xl font-extrabold uppercase text-like"
          style={{ opacity: likeOpacity }}
        >
          Like
        </div>
        <div
          className="absolute right-6 top-8 rotate-[18deg] rounded-xl border-4 border-pass px-4 py-1 text-2xl font-extrabold uppercase text-pass"
          style={{ opacity: passOpacity }}
        >
          Nope
        </div>

        {/* Safety */}
        <div className="absolute right-2 top-5">
          <div className="rounded-full bg-black/30 text-white backdrop-blur">
            <SafetyMenu targetId={candidate.user_id} onBlocked={() => onDecision("pass")} />
          </div>
        </div>

        {/* Info gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pt-16 text-white">
          <div className="flex items-end gap-2">
            <h2 className="text-2xl font-extrabold leading-tight">
              {candidate.display_name}
              {candidate.age != null && (
                <span className="font-semibold"> · {candidate.age}</span>
              )}
            </h2>
          </div>
          {candidate.distance_m != null && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-white/85">
              <MapPin className="h-3.5 w-3.5" /> {formatDistance(candidate.distance_m)}
            </p>
          )}
          {candidate.bio && (
            <p className="mt-2 line-clamp-2 text-sm text-white/90">{candidate.bio}</p>
          )}
          <TagRow tags={candidate.community_tags} shared={candidate.shared_tags} />
        </div>
      </div>
    </div>
  );
}

function TagRow({ tags, shared }: { tags: string[] | null; shared: string[] | null }) {
  const sharedSet = new Set(shared ?? []);
  const ordered = [...(shared ?? []), ...((tags ?? []).filter((t) => !sharedSet.has(t)))].slice(
    0,
    6,
  );
  if (!ordered.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {ordered.map((t) => {
        const isShared = sharedSet.has(t);
        return (
          <span
            key={t}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              isShared
                ? "bg-primary text-primary-foreground"
                : "bg-white/15 text-white backdrop-blur"
            }`}
          >
            {isShared && <BadgeCheck className="h-3 w-3" />}
            {t}
          </span>
        );
      })}
    </div>
  );
}
