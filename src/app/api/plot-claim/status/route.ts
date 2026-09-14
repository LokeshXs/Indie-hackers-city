import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { validateStatusText } from "@/lib/city/status";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to edit your status.");

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return errorResponse("invalid_request", "The submitted status could not be read."); }
  const validation = validateStatusText(
    payload && typeof payload === "object" && "statusText" in payload ? payload.statusText : undefined,
  );
  if (!validation.data) return errorResponse("invalid_request", validation.error);

  // Ownership and the XP unlock are also checked by the RPC, including direct calls.
  const result = await supabase.rpc("update_plot_status", {
    requested_status_text: validation.data.statusText ?? "",
  });
  if (result.error || !result.data?.[0]) {
    const code = result.error ? rpcErrorCode(result.error) : "unexpected_error";
    const message = code === "reward_locked" ? "Reach 110 XP to customise your status."
      : code === "claim_not_found" ? "Claim a plot before editing your status."
        : code === "invalid_request" ? "Enter a single-line status of 40 characters or fewer."
          : "Your status could not be saved. Try again.";
    return errorResponse(code, message);
  }
  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) });
}
