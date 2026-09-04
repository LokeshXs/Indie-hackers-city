import { NextResponse } from "next/server";
import { isAchievementType, loadFounderPortfolio } from "@/lib/city/achievements";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import type { StartupBuildingLevel } from "@/lib/city/types";
import { isUuid } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to log an achievement.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "The achievement could not be read.");
  }
  const payload = typeof body === "object" && body ? body as { achievementType?: unknown; projectId?: unknown } : {};
  if (!isAchievementType(payload.achievementType)) {
    return errorResponse("invalid_request", "Choose a valid achievement.");
  }
  // Founder-scoped types carry no project, so an absent projectId is valid. record_achievement
  // decides which types require one and raises invalid_achievement if it is missing.
  const projectId = payload.projectId ?? null;
  if (projectId !== null && (typeof projectId !== "string" || !isUuid(projectId))) {
    return errorResponse("invalid_request", "Choose a valid project.");
  }

  const result = await supabase.rpc("record_achievement", {
    requested_achievement_type: payload.achievementType,
    requested_project_id: projectId ?? undefined,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "achievement_already_claimed"
        ? "That achievement is already logged for this project."
        : code === "project_not_owned"
          ? "You can only log achievements for your own project."
          : "The achievement could not be logged.",
      code === "project_not_owned" ? 403 : undefined);
    }
    return errorResponse("unexpected_error", "The achievement could not be logged.");
  }

  const awarded = result.data[0];

  // The RPC returns the XP outcome but not the city row, so re-read the projection for the map.
  const development = await supabase
    .from("city_developments")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (development.error || !development.data) {
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  const serialized = serializeCityDevelopment(development.data);

  return NextResponse.json({
    achievement: {
      achievementType: awarded.achievement_type,
      projectId: awarded.project_id,
      xpAwarded: awarded.xp_awarded,
      xpTotal: awarded.xp_total,
      buildingLevel: awarded.building_level as StartupBuildingLevel,
      levelChanged: awarded.level_changed,
    },
    development: serialized,
    // Returned so the card can grey out the rungs it just claimed without waiting for a refetch.
    ...(await loadFounderPortfolio(supabase, user.id, serialized.project.id)),
  });
}
