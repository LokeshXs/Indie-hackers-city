import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { isUuid, validateProjectFormData } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!isUuid(projectId)) return errorResponse("invalid_request", "Choose a valid project.");

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to edit this project.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The submitted project update could not be read.");
  }
  const validation = validateProjectFormData(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted project details.");

  const result = await supabase.rpc("update_showcased_project", {
    requested_project_id: projectId,
    founder_full_name: validation.data.fullName,
    founder_x_handle: validation.data.xHandle,
    project_name: validation.data.projectName,
    project_website_url: validation.data.websiteUrl,
    requested_project_type: validation.data.projectType,
    requested_building_asset_id: validation.data.buildingAssetId,
    requested_building_color: validation.data.buildingColor,
    requested_billboard_text_color: validation.data.billboardTextColor,
    requested_billboard_background_color: validation.data.billboardBackgroundColor,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "x_handle_taken"
        ? "That X handle is already used by another founder."
        : code === "project_not_owned"
          ? "You can only edit your own project."
          : "The project could not be updated. Check the details and try again.",
      code === "project_not_owned" ? 403 : undefined);
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) });
}
