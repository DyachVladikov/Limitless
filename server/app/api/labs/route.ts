import { NextRequest, NextResponse } from "next/server";
import { getSupabase, pick, serverError } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  const courseId = new URL(request.url).searchParams.get("course_id");

  let query = supabase.from("academy_labs").select("*").order("deadline");
  if (courseId) query = query.eq("course_id", courseId);

  const { data, error } = await query;

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const body = await request.json();
  const lab = pick(body, ["course_id", "title", "deadline"]);

  const { data, error } = await supabase
    .from("academy_labs")
    .insert(lab)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
