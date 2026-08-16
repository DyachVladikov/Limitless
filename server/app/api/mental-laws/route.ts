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
    .from("mental_laws")
    .select("*")
    .order("unlocked_at", { ascending: false });

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const userId = await getUserId(supabase, token);
  if (!userId) return unauthorized();

  const body = await request.json();
  const law = {
    user_id: userId,
    ...pick(body, ["title", "description"]),
  };

  const { data, error } = await supabase
    .from("mental_laws")
    .insert(law)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
