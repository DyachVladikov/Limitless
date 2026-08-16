import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  getUserId,
  pick,
  serverError,
  unauthorized,
} from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const { data, error } = await supabase
    .from("rationality_books")
    .select("*")
    .order("is_finished");

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const userId = await getUserId(supabase, token);
  if (!userId) return unauthorized();

  const body = await request.json();
  const book = {
    user_id: userId,
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
