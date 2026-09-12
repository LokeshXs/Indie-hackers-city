import { NextResponse } from "next/server";
import { isAchievementType, loadFounderPortfolio } from "@/lib/city/achievements";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import type { StartupBuildingLevel } from "@/lib/city/types";
import { isUuid } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Trims the three evidence fields, turning blanks into the nulls the RPC expects. Returns null
 * when a supplied value is the wrong type at all, which is a malformed request rather than a
 * founder who forgot something. */
function readEvidence(payload: {
  evidenceLink?: unknown;
  evidenceFilePath?: unknown;
  evidenceNote?: unknown;
}): { link?: string; filePath?: string; note?: string } | null {
  const fields = [payload.evidenceLink, payload.evidenceFilePath, payload.evidenceNote];
  if (fields.some((value) => value !== undefined && value !== null && typeof value !== "string")) {
    return null;
  }
  const clean = (value: unknown) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : undefined;
  };
  return {
    link: clean(payload.evidenceLink),
    filePath: clean(payload.evidenceFilePath),
    note: clean(payload.evidenceNote),
  };
}

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
  const payload = typeof body === "object" && body
    ? body as {
      achievementType?: unknown;
      projectId?: unknown;
      evidenceLink?: unknown;
      evidenceFilePath?: unknown;
      evidenceNote?: unknown;
    }
    : {};
  if (!isAchievementType(payload.achievementType)) {
    return errorResponse("invalid_request", "Choose a valid achievement.");
  }
  // Founder-scoped types carry no project, so an absent projectId is valid. record_achievement
  // decides which types require one and raises invalid_achievement if it is missing.
  const projectId = payload.projectId ?? null;
  if (projectId !== null && (typeof projectId !== "string" || !isUuid(projectId))) {
    return errorResponse("invalid_request", "Choose a valid project.");
  }

  // Shape only. Whether the evidence is *enough* is the database's call (evidence_required) and
  // then a human's, so nothing here tries to second-guess either.
  const evidence = readEvidence(payload);
  if (!evidence) return errorResponse("invalid_request", "Check the evidence you attached.");

  const result = await supabase.rpc("record_achievement", {
    requested_achievement_type: payload.achievementType,
    requested_project_id: projectId ?? undefined,
    evidence_link: evidence.link,
    evidence_file_path: evidence.filePath,
    evidence_note: evidence.note,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      return errorResponse(code, code === "achievement_already_claimed"
        ? "That milestone is already logged or waiting to be reviewed."
        : code === "project_not_owned"
          ? "You can only log achievements for your own project."
          : code === "evidence_required"
            ? "Add a link or a screenshot so we can check this."
            : "The achievement could not be logged.",
      code === "project_not_owned" ? 403 : undefined);
    }
    return errorResponse("unexpected_error", "The achievement could not be logged.");
  }

  const submitted = result.data[0];

  // Filing moves no XP, so the development row is unchanged -- but the client's card still expects
  // one, and re-reading keeps a concurrent approval from leaving a stale total on screen.
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
      achievementType: submitted.achievement_type,
      projectId: submitted.project_id,
      status: submitted.status as "pending",
      xpPending: submitted.xp_pending,
      xpTotal: submitted.xp_total,
      buildingLevel: submitted.building_level as StartupBuildingLevel,
    },
    development: serialized,
    // Returned so the card can mark the rung as awaiting review without waiting for a refetch.
    ...(await loadFounderPortfolio(supabase, user.id, serialized.project.id)),
  });
}
