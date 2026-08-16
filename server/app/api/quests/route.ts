import { NextRequest, NextResponse } from "next/server";
import { getSupabase, serverError } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { supabase } = getSupabase(request);

  const { data, error } = await supabase
    .from("quest_templates")
    .select("*")
    .order("base_exp");

  if (error) return serverError(error);
  return NextResponse.json(data);
}
