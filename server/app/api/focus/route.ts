import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const { minutes } = await request.json();

  if (typeof minutes !== "number" || minutes <= 0) {
    return NextResponse.json({ error: "Нужны minutes" }, { status: 400 });
  }

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("focus_sessions")
    .insert({ user_id: profile.id, minutes })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}
