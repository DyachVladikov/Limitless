import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";
import { mapProfile } from "@/lib/mappers";

export async function GET() {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  return NextResponse.json(mapProfile(profile));
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const { name, avatarUrl, title } = await request.json();

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.username = name;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
  if (title !== undefined) updates.title = title;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profile.id)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(mapProfile(data));
}
