import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function withAuthError(path: string): string {
  const url = new URL(path, "https://indie-hackers-city.invalid");
  url.searchParams.set("authError", "oauth");
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));

  if (code && isSupabaseConfigured()) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL(withAuthError(next), request.nextUrl.origin));
}
