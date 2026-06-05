import { MEDIA_BUCKET } from "@/lib/storage/upload";
import { getSupabaseUrl } from "@/lib/supabase/env";

const MEDIA_PUBLIC_PREFIX = `/storage/v1/object/public/${MEDIA_BUCKET}/`;

export function extractMediaStoragePath(publicUrl: string): string | null {
  if (!publicUrl?.trim()) return null;

  try {
    const url = new URL(publicUrl, getSupabaseUrl());
    const idx = url.pathname.indexOf(MEDIA_PUBLIC_PREFIX);
    if (idx === -1) return null;
    return decodeURIComponent(
      url.pathname.slice(idx + MEDIA_PUBLIC_PREFIX.length),
    );
  } catch {
    return null;
  }
}
