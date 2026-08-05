import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "discover_candidates",
  title: "Découvrir des profils",
  description:
    "Retourne le feed de découverte de l'utilisateur connecté (filtrage et classement faits côté backend).",
  inputSchema: {
    min_age: z.number().int().min(18).max(99).default(18).describe("Âge minimum."),
    max_age: z.number().int().min(18).max(99).default(60).describe("Âge maximum."),
    limit: z.number().int().min(1).max(30).default(10).describe("Nombre max de profils."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ min_age, max_age, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("get_candidates_adaptive", {
      p_target: ctx.getUserId(),
      p_min_age: min_age ?? 18,
      p_max_age: max_age ?? 60,
      p_limit: limit ?? 10,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { candidates: data ?? [] },
    };
  },
});
