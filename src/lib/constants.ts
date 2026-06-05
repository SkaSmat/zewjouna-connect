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

/**
 * "Passport" countries — lets a user explore profiles elsewhere (Bumble-style).
 * Coordinates are an approximate population centroid used as the search center
 * for the discovery feed. Curated for the Algerian diaspora.
 */
export interface Country {
  code: string;
  label: string;
  flag: string;
  lng: number;
  lat: number;
}

export const COUNTRIES: Country[] = [
  { code: "DZ", label: "Algérie", flag: "🇩🇿", lng: 3.0588, lat: 36.7538 },
  { code: "FR", label: "France", flag: "🇫🇷", lng: 2.3522, lat: 48.8566 },
  { code: "CA", label: "Canada", flag: "🇨🇦", lng: -73.5673, lat: 45.5019 },
  { code: "BE", label: "Belgique", flag: "🇧🇪", lng: 4.3517, lat: 50.8503 },
  { code: "CH", label: "Suisse", flag: "🇨🇭", lng: 6.1432, lat: 46.2044 },
  { code: "GB", label: "Royaume-Uni", flag: "🇬🇧", lng: -0.1276, lat: 51.5072 },
  { code: "DE", label: "Allemagne", flag: "🇩🇪", lng: 13.405, lat: 52.52 },
  { code: "ES", label: "Espagne", flag: "🇪🇸", lng: -3.7038, lat: 40.4168 },
  { code: "IT", label: "Italie", flag: "🇮🇹", lng: 12.4964, lat: 41.9028 },
  { code: "NL", label: "Pays-Bas", flag: "🇳🇱", lng: 4.9041, lat: 52.3676 },
  { code: "US", label: "États-Unis", flag: "🇺🇸", lng: -74.006, lat: 40.7128 },
  { code: "AE", label: "Émirats arabes unis", flag: "🇦🇪", lng: 55.2708, lat: 25.2048 },
  { code: "QA", label: "Qatar", flag: "🇶🇦", lng: 51.531, lat: 25.2854 },
  { code: "TN", label: "Tunisie", flag: "🇹🇳", lng: 10.1815, lat: 36.8065 },
  { code: "MA", label: "Maroc", flag: "🇲🇦", lng: -7.6114, lat: 33.5731 },
  { code: "TR", label: "Turquie", flag: "🇹🇷", lng: 28.9784, lat: 41.0082 },
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
