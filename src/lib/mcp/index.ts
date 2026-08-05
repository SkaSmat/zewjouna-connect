import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listMatches from "./tools/list-matches";
import listMessages from "./tools/list-messages";
import sendMessage from "./tools/send-message";
import discoverCandidates from "./tools/discover-candidates";

// Direct Supabase host (RFC 8414 issuer must match the discovery document).
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "yahkxceolwolgglllcbt";

export default defineMcp({
  name: "zewjouna-connect-63",
  title: "Zewjouna Connect (63)",
  version: "0.1.0",
  instructions:
    "Outils ZEWJOUNA (rencontres, diaspora algérienne). L'utilisateur connecté peut lire son profil, ses matchs et ses conversations, envoyer un message et consulter son feed de découverte. Toutes les règles métier (filtrage, expiration 24 h, règle Bumble) sont appliquées par le backend.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, discoverCandidates, listMatches, listMessages, sendMessage],
});
