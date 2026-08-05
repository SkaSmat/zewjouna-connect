import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_messages",
  title: "Messages d'une conversation",
  description: "Lit les messages d'un match donné (l'utilisateur doit être membre du match).",
  inputSchema: {
    match_id: z.string().uuid().describe("Identifiant du match."),
    limit: z.number().int().min(1).max(100).default(50).describe("Nombre max de messages."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ match_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("match_id", match_id)
      .order("created_at", { ascending: true })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { messages: data ?? [] },
    };
  },
});
