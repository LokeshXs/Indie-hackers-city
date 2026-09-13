import { unlocksFor } from "./unlocks";

export const STATUS_TEXT_LIMIT = 40;

/** Count Unicode code points, matching Postgres char_length (including emoji). */
export function statusTextLength(value: string): number {
  return Array.from(value).length;
}

export function validateStatusText(value: unknown): { data: { statusText: string | null }; error?: never } | { data?: never; error: string } {
  if (value !== null && typeof value !== "string") {
    return { error: "Enter a status message or clear it to use Online." };
  }
  const text = value?.trim() || null;
  if (text && (statusTextLength(text) > STATUS_TEXT_LIMIT || /[\r\n\u2028\u2029]/u.test(text))) {
    return { error: `Enter a single-line status of ${STATUS_TEXT_LIMIT} characters or fewer.` };
  }
  return { data: { statusText: text } };
}

export function plotStatusLabel(statusText: string | null, xp: number): string {
  return (unlocksFor(xp).status && statusText?.trim()) || "Online";
}
