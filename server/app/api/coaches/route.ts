import { NextRequest, NextResponse } from "next/server";
import { getSupabase, serverError } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  const tagsParam = new URL(request.url).searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",") : [];

  let query = supabase.from("coach_dialogues").select("*");
  if (tags.length > 0) {
    query = query.overlaps("tags", tags);
  }

  const { data, error } = await query;

  if (error) return serverError(error);
  return NextResponse.json(data);
}
