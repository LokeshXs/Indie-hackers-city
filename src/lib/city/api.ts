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
  | "unexpected_error";

const CONFLICT_ERRORS = new Set([
  "user_already_has_plot",
  "plot_taken",
  "x_handle_taken",
]);

const KNOWN_RPC_ERRORS = new Set([
  ...CONFLICT_ERRORS,
  "not_authenticated",
  "inactive_plot",
  "invalid_project",
  "invalid_building",
  "project_not_owned",
  "claim_not_found",
]);

export function rpcErrorCode(error: Pick<PostgrestError, "message">): CityApiErrorCode {
  const code = [...KNOWN_RPC_ERRORS].find((candidate) => error.message.includes(candidate));
  if (code === "not_authenticated") return "not_authenticated";
  if (code === "inactive_plot") return "inactive_plot";
  if (code === "project_not_owned") return "project_not_owned";
  if (code === "claim_not_found") return "claim_not_found";
  if (code && CONFLICT_ERRORS.has(code)) return code as CityApiErrorCode;
  if (code === "invalid_project" || code === "invalid_building") return "invalid_request";
  return "unexpected_error";
}

export function errorResponse(code: CityApiErrorCode, message: string, status?: number) {
  const responseStatus = status ?? (
    code === "not_authenticated" ? 401
      : CONFLICT_ERRORS.has(code) ? 409
        : ["invalid_request", "inactive_plot", "project_not_owned", "claim_not_found"].includes(code) ? 400
          : 500
  );
  return NextResponse.json({ error: { code, message } }, { status: responseStatus });
}

