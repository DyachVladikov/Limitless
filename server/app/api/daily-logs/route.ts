import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, pick, serverError } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  const date =
    new URL(request.url).searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("log_date", date)
    .maybeSingle();

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const body = await request.json();
  const log = {
    user_id: profile.id,
    log_date: new Date().toISOString().slice(0, 10),
    ...pick(body, [
      "carbs_level",
      "protein_level",
      "fatigue_level",
      "is_sugar_eaten",
      "log_date",
    ]),
  };

  const { data, error } = await supabase
    .from("daily_logs")
    .upsert(log, { onConflict: "user_id,log_date" })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}
