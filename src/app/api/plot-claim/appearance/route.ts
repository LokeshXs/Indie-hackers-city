import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { validateAppearance } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to restyle your plot.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The submitted colors could not be read.");
  }
  const validation = validateAppearance(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted colors.");

  // No building asset: the shell is assigned at claim time and is no longer founder-editable.
  const result = await supabase.rpc("update_plot_appearance", {
    requested_building_color: validation.data.buildingColor,
    requested_billboard_text_color: validation.data.billboardTextColor,
    requested_billboard_background_color: validation.data.billboardBackgroundColor,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "claim_not_found"
        ? "Claim a plot before restyling it."
        : "Your plot could not be restyled.");
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) });
}
