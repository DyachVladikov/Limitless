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
    .from("academy_courses")
    .select("*")
    .order("created_at");

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const userId = await getUserId(supabase, token);
  if (!userId) return unauthorized();

  const body = await request.json();
  const course = {
    user_id: userId,
    ...pick(body, ["title", "exam_date"]),
  };

  const { data, error } = await supabase
    .from("academy_courses")
    .insert(course)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
