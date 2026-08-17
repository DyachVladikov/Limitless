import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, pick, serverError } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("rationality_books")
    .select("*")
    .order("is_finished");

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
  const book = {
    user_id: profile.id,
    ...pick(body, ["title", "total_pages"]),
  };

  const { data, error } = await supabase
    .from("rationality_books")
    .insert(book)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
