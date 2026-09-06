import { NextResponse } from "next/server";
import { errorResponse, rpcErrorCode } from "@/lib/city/api";
import { LEVEL_TWO_BUILDING_ASSET_IDS } from "@/lib/city/constants";
import { serializeCityDevelopment } from "@/lib/city/developments";
import type { LevelTwoBuildingAssetId } from "@/lib/city/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function isLevelTwoAssetId(value: unknown): value is LevelTwoBuildingAssetId {
  return LEVEL_TWO_BUILDING_ASSET_IDS.some((id) => id === value);
}

/** Redeems the 490 XP `levelTwo` reward by swapping the founder's shell for a level-2 one.
 *
 * The checks that matter -- has the founder earned it, and have they already spent it -- live in
 * the upgrade_plot_premises RPC, not here. That function is granted to `authenticated`, so it can
 * be called straight from the browser client; anything enforced only in this route would be one
 * rpc() call away from being skipped. What this adds is a readable error for each failure. */
export async function PATCH(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to move into your new premises.");

  let payload: { buildingAssetId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return errorResponse("invalid_request", "The submitted premises could not be read.");
  }
  if (!isLevelTwoAssetId(payload.buildingAssetId)) {
    return errorResponse("invalid_request", "Choose one of the new premises.");
  }

  const result = await supabase.rpc("upgrade_plot_premises", {
    requested_building_asset_id: payload.buildingAssetId,
  });

  if (result.error || !result.data?.[0]) {
    if (result.error) {
      const code = rpcErrorCode(result.error);
      const message = code === "claim_not_found" ? "Claim a plot before upgrading it."
        : code === "reward_locked" ? "Reach 490 XP to unlock new premises."
          : code === "premises_already_chosen" ? "You have already moved into your new premises."
            : "Your new premises could not be built.";
      return errorResponse(code, message);
    }
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  return NextResponse.json({ development: serializeCityDevelopment(result.data[0]) });
}
