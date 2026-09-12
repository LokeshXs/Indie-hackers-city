import { NextResponse } from "next/server";
import { loadFounderProjects } from "@/lib/city/achievements";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { formBoolean, validateProjectDetails } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to add a project.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The submitted project could not be read.");
  }
  const validation = validateProjectDetails(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted project details.");

  // Generated here rather than accepted from the client, as the claim route does.
  const projectId = crypto.randomUUID();

  // A launch post if the founder gave one; create_project falls back to the product's own URL,
  // since a live product is its own evidence that it launched.
  const launchPost = formData.get("launchPostUrl");
  const launchNote = formData.get("launchNote");

  // create_project also files the product_launched claim inside the same transaction, so a failed
  // claim rolls the project back.
  const result = await supabase.rpc("create_project", {
    project_uuid: projectId,
    project_name: validation.data.projectName,
    project_website_url: validation.data.websiteUrl,
    requested_project_type: validation.data.projectType,
    showcase_on_billboard: formBoolean(formData, "showcase"),
    evidence_link: typeof launchPost === "string" && launchPost.trim() ? launchPost.trim() : undefined,
    evidence_note: typeof launchNote === "string" && launchNote.trim() ? launchNote.trim() : undefined,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "project_limit_reached"
        ? "You have reached the maximum number of projects."
        : code === "project_url_taken"
          ? "You already have a project at that URL."
          : code === "claim_not_found"
            ? "Claim a plot before adding projects."
            : code === "invalid_request"
              ? "That launch link does not look like a URL."
              : "The project could not be added. Check the details and try again.");
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  const development = serializeCityDevelopment(result.data[0]);
  return NextResponse.json({
    development,
    // Returned so the card can jump straight to the verification step for the project it just
    // created. The token only exists once the row does, so this cannot be shown any earlier.
    projectId,
    projects: await loadFounderProjects(supabase, user.id, development.project.id),
  }, { status: 201 });
}
