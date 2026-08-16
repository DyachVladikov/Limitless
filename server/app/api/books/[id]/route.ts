import { NextRequest, NextResponse } from "next/server";
import { getSupabase, pick, serverError, unauthorized } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const updates = pick(body, [
    "title",
    "total_pages",
    "read_pages",
    "is_finished",
  ]);

  const { data, error } = await supabase
    .from("rationality_books")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const { id } = await params;

  const { error } = await supabase
    .from("rationality_books")
    .delete()
    .eq("id", id);

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
