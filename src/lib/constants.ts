// Shared frontend constants & helpers for ZEWJOUNA.

export const REGIONS = [
  "Kabylie",
  "Oranais",
  "Constantinois",
  "Algérois",
  "Sahara",
  "Aurès",
  "Mzab",
  "Hauts-Plateaux",
  "Sud",
] as const;

export const LANGUAGES = [
  "Arabe",
  "Kabyle",
  "Français",
  "Anglais",
  "Chaoui",
  "Mozabite",
  "Targui",
  "Espagnol",
] as const;

export const INTERESTS = [
  "Cuisine",
  "Voyages",
  "Musique",
  "Sport",
  "Cinéma",
  "Lecture",
  "Art",
  "Famille",
  "Spiritualité",
  "Entrepreneuriat",
  "Nature",
  "Gaming",
  "Mode",
  "Photographie",
  "Danse",
  "Café",
] as const;

export const GENDER_OPTIONS: { value: "female" | "male" | "nonbinary"; label: string }[] = [
  { value: "female", label: "Femme" },
  { value: "male", label: "Homme" },
  { value: "nonbinary", label: "Non-binaire" },
];

export const LOOKING_FOR_OPTIONS: {
  value: "female" | "male" | "nonbinary" | "everyone";
  label: string;
}[] = [
  { value: "female", label: "Des femmes" },
  { value: "male", label: "Des hommes" },
  { value: "nonbinary", label: "Personnes non-binaires" },
  { value: "everyone", label: "Tout le monde" },
];

/** Compute age from an ISO birthdate string. */
export function ageFromBirthdate(birthdate?: string | null): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Build the EWKT string the backend expects (longitude BEFORE latitude). */
export function toWkt(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/** Human-friendly distance from meters. */
export function formatDistance(distanceM?: number | null): string | null {
  if (distanceM == null) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM < 10000 ? 1 : 0)} km`;
}

export const PHOTO_BUCKET = "profile-photos";
