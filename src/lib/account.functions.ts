import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SIGN_TTL_SECONDS = 600;
const BUCKET = "profile-photos";

/**
 * Signed URLs for ANOTHER user's photos (private bucket).
 * The caller is identified from their bearer token; blocked pairs get nothing.
 */
export const signedPhotoUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ urls: string[] }> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Anti-scraping: 60 signature requests per minute per user.
    const { data: allowed } = await supabaseAdmin.rpc("rl_take", {
      p_key: `photos:${userId}`,
      p_limit: 60,
      p_window_seconds: 60,
    });
    if (allowed === false) throw new Error("Trop de requêtes, réessayez dans un instant.");

    if (data.targetId !== userId) {
      const { data: blocked } = await supabaseAdmin
        .from("blocks")
        .select("blocker_id")
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${data.targetId}),` +
            `and(blocker_id.eq.${data.targetId},blocked_id.eq.${userId})`,
        )
        .limit(1);
      if (blocked && blocked.length > 0) return { urls: [] };
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("photos")
      .eq("user_id", data.targetId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);

    const paths = profile?.photos ?? [];
    if (paths.length === 0) return { urls: [] };

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGN_TTL_SECONDS);
    if (signErr) throw new Error(signErr.message);

    return {
      urls: (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u),
    };
  });

/** RGPD right to erasure: a user deletes only themselves. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("photos")
      .eq("user_id", userId)
      .maybeSingle();
    const paths = profile?.photos ?? [];
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
