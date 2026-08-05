import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_matches",
  title: "Mes matchs",
  description:
    "Liste les matchs de l'utilisateur connecté, avec le profil public de l'autre personne.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Nombre max de matchs."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const uid = ctx.getUserId();
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const enriched = await Promise.all(
      rows.map(async (m: { user_a: string; user_b: string }) => {
        const other = m.user_a === uid ? m.user_b : m.user_a;
        const { data: profile } = await supabase.rpc("get_match_profile", { p_target: other });
        return { ...m, other_user_id: other, other_profile: profile ?? null };
      }),
    );

    return {
      content: [{ type: "text", text: JSON.stringify(enriched) }],
      structuredContent: { matches: enriched },
    };
  },
});
