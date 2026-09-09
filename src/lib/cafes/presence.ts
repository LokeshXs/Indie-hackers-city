export interface CafeMember {
  userId: string;
  name: string;
  avatarUrl: string;
  intention: string;
  seatId: string;
  joinedAt: number;
  updatedAt: number;
}

export function readMember(value: unknown): CafeMember | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.userId !== "string" || !p.userId || p.userId.length > 128
    || typeof p.seatId !== "string" || !p.seatId || p.seatId.length > 128
    || typeof p.name !== "string" || typeof p.intention !== "string"
    || typeof p.joinedAt !== "number" || !Number.isFinite(p.joinedAt)
    || typeof p.updatedAt !== "number" || !Number.isFinite(p.updatedAt)) return null;
  let avatarUrl = "";
  try {
    const url = new URL(String(p.avatarUrl));
    if (url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com") avatarUrl = url.toString();
  } catch { /* Render initials for unavailable avatars. */ }
  return { userId: p.userId, seatId: p.seatId, name: p.name.trim().slice(0, 80) || "Founder",
    intention: p.intention.trim().slice(0, 100), avatarUrl, joinedAt: p.joinedAt, updatedAt: p.updatedAt };
}

/** Multiple tabs/devices can publish a presence; show one seat per account. */
export function cafeMembers(state: Record<string, unknown[]>): CafeMember[] {
  const members = new Map<string, CafeMember>();
  for (const entries of Object.values(state)) for (const entry of entries) {
    const member = readMember(entry);
    if (member && (!members.has(member.userId) || members.get(member.userId)!.updatedAt < member.updatedAt)) {
      members.set(member.userId, member);
    }
  }
  return [...members.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
