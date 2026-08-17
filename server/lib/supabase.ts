import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function getProfile(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .limit(1)
    .single();
  return data;
}

export function pick(body: Record<string, unknown>, allowed: string[]) {
  return Object.fromEntries(
    Object.entries(body).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined,
    ),
  );
}

export function serverError(error: { message: string }) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}
