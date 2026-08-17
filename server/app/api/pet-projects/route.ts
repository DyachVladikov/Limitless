import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, pick, serverError } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("pet_projects")
    .select("*")
    .order("created_at");

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const body = await request.json();
  const project = {
    user_id: profile.id,
    ...pick(body, ["title", "stack", "status"]),
  };

  const { data, error } = await supabase
    .from("pet_projects")
    .insert(project)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
