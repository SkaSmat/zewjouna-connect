import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

// Existing ZEWJOUNA backend (same values as the browser client — publishable only).
const FALLBACK_URL = "https://yahkxceolwolgglllcbt.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_mhaM9jttRd8R7ktktjxdjw_5zb0uy3s";

function supabaseProjectUrl(): string {
  return configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]) ?? FALLBACK_URL;
}

function supabasePublishableKey(): string {
  return (
    configuredEnv([
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ]) ?? FALLBACK_PUBLISHABLE_KEY
  );
}

/** Forwards the verified OAuth bearer token so RLS runs as the signed-in user. */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Authentification requise.");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
