import { NextRequest, NextResponse } from "next/server";
import { getSupabase, pick, serverError, unauthorized } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const { data, error } = await supabase.from("profiles").select("*").single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const body = await request.json();
  const updates = pick(body, ["username", "avatar_url", "title"]);

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}
