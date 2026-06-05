import { supabase } from "@/integrations/supabase/client";
import { PHOTO_BUCKET } from "@/lib/constants";

/**
 * Get signed URLs for ANOTHER user's photos.
 * This is the ONLY permitted way to display other people's photos.
 */
export async function getSignedPhotoUrls(targetId: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("signed-photo-urls", {
    body: { target_id: targetId },
  });
  if (error) throw error;
  return (data?.urls as string[]) ?? [];
}

/** Sign my OWN stored photo paths (RLS allows reading my own folder). */
export async function getOwnSignedUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 600);
  if (error) throw error;
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
}

/** Upload a photo to my own folder: "<uid>/<filename>". Returns the storage path. */
export async function uploadOwnPhoto(uid: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function removeOwnPhoto(path: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}
