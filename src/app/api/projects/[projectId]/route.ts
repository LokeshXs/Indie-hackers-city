import { NextResponse } from "next/server";
import { loadFounderProjects } from "@/lib/city/achievements";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { formBoolean, isUuid, validateProjectDetails } from "@/lib/city/validation";
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
  const validation = validateProjectDetails(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted project details.");

  // update_project, not the retired update_showcased_project: this one edits a project whether or
  // not it is the one currently on the billboard.
  const result = await supabase.rpc("update_project", {
    requested_project_id: projectId,
    project_name: validation.data.projectName,
    project_website_url: validation.data.websiteUrl,
    requested_project_type: validation.data.projectType,
    showcase_on_billboard: formBoolean(formData, "showcase"),
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "project_not_owned"
        ? "You can only edit your own project."
        : code === "showcase_required"
          ? "Your billboard needs a project. Put another one on it first."
          : code === "project_url_taken"
            ? "You already have a project at that URL."
            : "The project could not be updated. Check the details and try again.",
      code === "project_not_owned" ? 403 : undefined);
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  const development = serializeCityDevelopment(result.data[0]);
  return NextResponse.json({
    development,
    projects: await loadFounderProjects(supabase, user.id, development.project.id),
  });
}
