import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { isUuid } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to switch projects.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "The project selection could not be read.");
  }
  const projectId = typeof body === "object" && body && "projectId" in body
    ? (body as { projectId?: unknown }).projectId
    : null;
  if (typeof projectId !== "string" || !isUuid(projectId)) {
    return errorResponse("invalid_request", "Choose a valid project.");
  }

  const result = await supabase.rpc("switch_claim_project", { requested_project_id: projectId });
  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "project_not_owned"
        ? "You can only showcase your own project."
        : "The showcased project could not be changed.",
      code === "project_not_owned" ? 403 : undefined);
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }
  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) });
}

