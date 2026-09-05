type ClassValue = string | false | null | undefined;

/** Join conditional class names. The repo has no Tailwind utilities in use, so
 * there are no conflicting classes to merge — plain filtering is enough. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
