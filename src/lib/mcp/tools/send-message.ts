import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "send_message",
  title: "Envoyer un message",
  description:
    "Envoie un message dans un match. Les règles du backend s'appliquent (match expiré, règle Bumble du premier message, blocage).",
  inputSchema: {
    match_id: z.string().uuid().describe("Identifiant du match."),
    content: z.string().trim().min(1).describe("Contenu du message."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ match_id, content }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .insert({ match_id, sender_id: ctx.getUserId(), content })
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { message: data },
    };
  },
});
