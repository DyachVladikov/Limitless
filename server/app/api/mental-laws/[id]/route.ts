import { NextRequest, NextResponse } from "next/server";
import { getSupabase, serverError, unauthorized } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const { id } = await params;

  const { error } = await supabase.from("mental_laws").delete().eq("id", id);

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
