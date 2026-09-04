import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/city/api";
import { serializeCityDevelopment } from "@/lib/city/developments";
import { validateFounderFields } from "@/lib/city/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("not_authenticated", "Sign in to edit your founder details.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("invalid_request", "The submitted founder details could not be read.");
  }
  const validation = validateFounderFields(formData);
  if (!validation.data) return errorResponse("invalid_request", validation.error ?? "Check the submitted founder details.");

  // No RPC needed: profiles already carries an own-row UPDATE policy for authenticated users.
  const update = await supabase
    .from("profiles")
    .update({ full_name: validation.data.fullName, x_handle: validation.data.xHandle })
    .eq("id", user.id);

  if (update.error) {
    // profiles_x_handle_unique is a partial unique index on lower(x_handle).
    if (update.error.code === "23505") {
      return errorResponse("x_handle_taken", "That X handle is already used by another founder.");
    }
    return errorResponse("unexpected_error", "Your founder details could not be saved.");
  }

  const development = await supabase
    .from("city_developments")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (development.error || !development.data) {
    return errorResponse("unexpected_error", "The updated city record could not be loaded.");
  }

  return NextResponse.json({ development: serializeCityDevelopment(development.data) });
}
