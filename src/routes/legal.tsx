import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

type Doc = "confidentialite" | "cgu" | "mentions";

const CONTACT_EMAIL = "skandersmatii@gmail.com";
const LAST_UPDATED = "6 juin 2026";

export const Route = createFileRoute("/legal")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { doc?: Doc } => {
    const doc = search.doc;
    return doc === "cgu" || doc === "mentions" || doc === "confidentialite" ? { doc } : {};
  },
  component: Legal,
});

const TABS: { id: Doc; label: string }[] = [
  { id: "confidentialite", label: "Confidentialité" },
  { id: "cgu", label: "CGU" },
  { id: "mentions", label: "Mentions légales" },
];

function Legal() {
  const { doc } = useSearch({ from: "/legal" });
  const [tab, setTab] = useState<Doc>(doc ?? "confidentialite");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur">
        <Link
          to="/auth"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">Informations légales</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl px-5 pt-4">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full px-2 py-2 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <div className="mb-5 rounded-xl border border-dashed border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          ⚠️ Modèle de référence à faire valider par un professionnel du droit et à compléter avec
          les informations d'immatriculation de l'éditeur avant l'ouverture publique.
        </div>
        {tab === "confidentialite" && <Privacy />}
        {tab === "cgu" && <Terms />}
        {tab === "mentions" && <Mentions />}
      </main>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-foreground [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1">
      {children}
    </article>
  );
}

function Privacy() {
  return (
    <Prose>
      <p className="text-xs">Dernière mise à jour : {LAST_UPDATED}</p>
      <h2>1. Responsable du traitement</h2>
      <p>
        ZEWJOUNA (« nous ») exploite cette application de rencontre. L'éditeur est en cours de
        structuration juridique ; les informations d'immatriculation seront complétées avant
        l'ouverture publique. Contact / protection des données : {CONTACT_EMAIL}.
      </p>
      <h2>2. Données que nous collectons</h2>
      <ul>
        <li>Compte : adresse e-mail, mot de passe (haché par Supabase Auth).</li>
        <li>
          Profil : prénom affiché, date de naissance, genre, préférence, bio, photos, tags
          communautaires (région, langues, intérêts).
        </li>
        <li>
          Géolocalisation approximative (si vous l'activez) pour proposer des profils proches.
        </li>
        <li>Activité : swipes, matchs, messages, signalements, blocages.</li>
      </ul>
      <h2>3. Finalités et base légale</h2>
      <p>
        Fournir le service de mise en relation (exécution du contrat), assurer la sécurité et la
        modération (intérêt légitime), respecter nos obligations légales. La géolocalisation repose
        sur votre consentement, révocable à tout moment.
      </p>
      <h2>4. Partage</h2>
      <p>
        Vos informations de profil public-safe sont visibles des autres membres. Nous ne vendons pas
        vos données. Sous-traitants : Supabase (hébergement, base de données, stockage,
        authentification). Les photos sont stockées dans un bucket privé et diffusées via des URLs
        signées éphémères.
      </p>
      <h2>5. Durée de conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte est actif. Les comptes inactifs depuis 24
        mois sont supprimés automatiquement. À la suppression du compte, vos données sont effacées
        (suppression en cascade), à l'exception de certains journaux de sécurité et signalements
        conservés jusqu'à 12 mois supplémentaires.
      </p>
      <h2>6. Vos droits (RGPD)</h2>
      <p>
        Accès, rectification, effacement, portabilité, opposition, retrait du consentement. Vous
        pouvez supprimer votre compte depuis les réglages ou nous écrire à {CONTACT_EMAIL}.
        Réclamation possible auprès de la CNIL.
      </p>
      <h2>7. Sécurité</h2>
      <p>
        Row Level Security stricte, photos en bucket privé, messages réservés aux membres d'un
        match. Aucune mesure n'étant infaillible, nous vous invitons à la prudence.
      </p>
    </Prose>
  );
}

function Terms() {
  return (
    <Prose>
      <p className="text-xs">Dernière mise à jour : {LAST_UPDATED}</p>
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l'utilisation de ZEWJOUNA, application de rencontre
        dédiée à la diaspora algérienne.
      </p>
      <h2>2. Accès — 18 ans minimum</h2>
      <p>
        Le service est strictement réservé aux personnes majeures (18 ans et plus). En créant un
        compte, vous certifiez avoir au moins 18 ans.
      </p>
      <h2>3. Règles de conduite</h2>
      <ul>
        <li>
          Respecter les autres membres ; aucun harcèlement, propos haineux, ni contenu illégal.
        </li>
        <li>
          Pas de nudité non sollicitée, d'usurpation d'identité ni de spam/sollicitation
          commerciale.
        </li>
        <li>Photos : uniquement les vôtres, vous représentant réellement.</li>
      </ul>
      <h2>4. Modération</h2>
      <p>
        Vous pouvez signaler ou bloquer tout membre. Nous pouvons suspendre ou supprimer un compte
        qui enfreint ces règles, sans préavis en cas d'abus grave.
      </p>
      <h2>5. Fonctionnement « premier message »</h2>
      <p>
        Un match ouvre une fenêtre de 24 h. Dans un couple homme-femme, seule la femme peut envoyer
        le premier message ; l'envoi de ce message lève l'expiration.
      </p>
      <h2>6. Responsabilité</h2>
      <p>
        ZEWJOUNA est un service de mise en relation et ne garantit pas l'identité, le comportement
        ou les intentions des membres. Vous restez responsable de vos interactions et de votre
        sécurité lors des rencontres.
      </p>
      <h2>7. Résiliation</h2>
      <p>Vous pouvez supprimer votre compte à tout moment depuis les réglages.</p>
      <h2>8. Droit applicable</h2>
      <p>
        Le droit applicable et les tribunaux compétents seront précisés avant l'ouverture publique,
        lors de l'immatriculation de l'éditeur. Pour toute question : {CONTACT_EMAIL}.
      </p>
    </Prose>
  );
}

function Mentions() {
  return (
    <Prose>
      <h2>Éditeur</h2>
      <p>
        ZEWJOUNA — projet en cours de structuration juridique. Les informations d'immatriculation
        (raison sociale, forme juridique, siège, SIREN/SIRET, directeur de la publication) seront
        ajoutées avant l'ouverture publique. Contact : {CONTACT_EMAIL}.
      </p>
      <h2>Hébergement</h2>
      <p>Backend et base de données : Supabase. Hébergement du frontend : Lovable.</p>
      <h2>Propriété intellectuelle</h2>
      <p>
        La marque, le logo et le contenu de ZEWJOUNA sont protégés. Les contenus publiés par les
        membres restent leur propriété ; en les publiant, vous nous accordez une licence d'affichage
        limitée au fonctionnement du service.
      </p>
      <h2>Contact</h2>
      <p>Pour toute question : {CONTACT_EMAIL}.</p>
    </Prose>
  );
}
