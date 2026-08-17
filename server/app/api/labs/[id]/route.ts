import { NextRequest, NextResponse } from "next/server";
import { getSupabase, pick, serverError } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = pick(body, [
    "title",
    "deadline",
    "check_variant",
    "check_graphs",
    "check_matrix",
    "check_screenshots",
    "is_completed",
  ]);

  if (body.is_completed === true) {
    updates.completed_at = new Date().toISOString();
  }
  if (body.is_completed === false) {
    updates.completed_at = null;
  }

  const { data, error } = await supabase
    .from("academy_labs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();

  const { id } = await params;

  const { error } = await supabase.from("academy_labs").delete().eq("id", id);

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
