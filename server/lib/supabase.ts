import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export function getSupabase(request: NextRequest) {
  const token =
    request.headers.get("Authorization")?.replace("Bearer ", "") ?? null;

  const options = token
    ? { global: { headers: { Authorization: `Bearer ${token}` } } }
    : {};

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options,
  );

  return { supabase, token };
}

export async function getUserId(supabase: SupabaseClient, token: string) {
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id ?? null;
}

export function pick(body: Record<string, unknown>, allowed: string[]) {
  return Object.fromEntries(
    Object.entries(body).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined,
    ),
  );
}

export function unauthorized() {
  return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
}

export function serverError(error: { message: string }) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}
