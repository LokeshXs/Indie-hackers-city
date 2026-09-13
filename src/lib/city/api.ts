import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

export type CityApiErrorCode =
  | "not_authenticated"
  | "invalid_request"
  | "inactive_plot"
  | "user_already_has_plot"
  | "plot_taken"
  | "x_handle_taken"
  | "project_not_owned"
  | "claim_not_found"
  | "achievement_already_claimed"
  | "project_limit_reached"
  | "project_url_taken"
  | "project_already_exists"
  | "showcase_required"
  | "evidence_required"
  | "reward_locked"
  | "premises_already_chosen"
  | "unexpected_error";

const CONFLICT_ERRORS = new Set([
  "premises_already_chosen",
  "user_already_has_plot",
  "plot_taken",
  "x_handle_taken",
  "achievement_already_claimed",
  "project_limit_reached",
  "project_url_taken",
  "project_already_exists",
]);

const KNOWN_RPC_ERRORS = new Set([
  ...CONFLICT_ERRORS,
  "not_authenticated",
  "inactive_plot",
  "invalid_project",
  "invalid_building",
  "project_not_owned",
  "claim_not_found",
  "invalid_achievement",
  "invalid_evidence",
  "invalid_status",
  "evidence_required",
  "showcase_required",
  "reward_locked",
]);

// Longest first: the match is a substring scan, so a shorter code that happens to be contained in a
// longer one would otherwise win purely on Set insertion order.
const RPC_ERROR_CANDIDATES = [...KNOWN_RPC_ERRORS].sort((a, b) => b.length - a.length);

export function rpcErrorCode(error: Pick<PostgrestError, "message">): CityApiErrorCode {
  const code = RPC_ERROR_CANDIDATES.find((candidate) => error.message.includes(candidate));
  if (code === "not_authenticated") return "not_authenticated";
  if (code === "inactive_plot") return "inactive_plot";
  if (code === "project_not_owned") return "project_not_owned";
  if (code === "claim_not_found") return "claim_not_found";
  if (code === "showcase_required") return "showcase_required";
  if (code === "evidence_required") return "evidence_required";
  if (code === "reward_locked") return "reward_locked";
  if (code && CONFLICT_ERRORS.has(code)) return code as CityApiErrorCode;
  if (["invalid_project", "invalid_building", "invalid_achievement", "invalid_evidence", "invalid_status"].includes(code ?? "")) {
    return "invalid_request";
  }
  return "unexpected_error";
}

export function errorResponse(code: CityApiErrorCode, message: string, status?: number) {
  const responseStatus = status ?? (
    code === "not_authenticated" ? 401
      : code === "reward_locked" ? 403
      : CONFLICT_ERRORS.has(code) ? 409
        : ["invalid_request", "inactive_plot", "project_not_owned", "claim_not_found", "showcase_required", "evidence_required"].includes(code) ? 400
          : 500
  );
  return NextResponse.json({ error: { code, message } }, { status: responseStatus });
}
