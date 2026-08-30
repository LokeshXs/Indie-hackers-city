import type { User } from "@supabase/supabase-js";

function metadataString(user: User, key: string): string {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return "";
  return (
    metadataString(user, "full_name")
    || metadataString(user, "name")
    || metadataString(user, "display_name")
  );
}

export function getUserAvatarUrl(user: User | null): string {
  if (!user) return "";
  const value = metadataString(user, "avatar_url") || metadataString(user, "picture");
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function getUserInitials(user: User | null): string {
  const name = getUserDisplayName(user);
  if (!name) return user?.email?.charAt(0).toUpperCase() || "IH";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
