import { NextRequest, NextResponse } from "next/server";
import { getSupabase, pick, serverError } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();

  const { id } = await params;
  const body = await request.json();
  const updates = pick(body, ["title", "stack", "status"]);

  const { data, error } = await supabase
    .from("pet_projects")
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

  const { error } = await supabase.from("pet_projects").delete().eq("id", id);

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
