import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { validateProjectFormData } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to claim a plot.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The submitted build permit could not be read.");
  }

  const plotId = formData.get("plotId");
  if (typeof plotId !== "string" || !/^pioneer:(jobs|lovelace|turing|hopper):(north|south|north-outer|south-outer):0[1-4]$/.test(plotId)) {
    return errorResponse("invalid_request", "Choose a valid Pioneer District plot.");
  }
  const validation = validateProjectFormData(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted project details.");

  const projectId = crypto.randomUUID();

  const result = await supabase.rpc("claim_plot", {
    project_uuid: projectId,
    requested_plot_id: plotId,
    founder_full_name: validation.data.fullName,
    founder_x_handle: validation.data.xHandle,
    project_name: validation.data.projectName,
    project_website_url: validation.data.websiteUrl,
    requested_project_type: validation.data.projectType,
    requested_building_asset_id: validation.data.buildingAssetId,
    requested_building_color: validation.data.buildingColor,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "plot_taken"
        ? "That plot was just claimed."
        : code === "user_already_has_plot"
          ? "Each founder receives one city plot."
          : code === "x_handle_taken"
            ? "That X handle is already used by another founder."
            : "The plot could not be claimed. Check your details and try again.");
    }
    return errorResponse("unexpected_error", "The plot was claimed but its city record could not be loaded.");
  }

  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) }, { status: 201 });
}

