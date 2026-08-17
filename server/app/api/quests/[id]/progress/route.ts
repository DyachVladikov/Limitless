import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";
import { addExp } from "@/lib/exp";
import { mapQuest } from "@/lib/mappers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();

  const { id } = await params;
  const body = await request.json();
  const amount =
    typeof body.amount === "number" && body.amount > 0 ? body.amount : 1;

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("*")
    .eq("id", id)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Квест не найден" }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_quest_progress")
    .select("*")
    .eq("user_id", profile.id)
    .eq("quest_id", id)
    .maybeSingle();

  if (existingError) return serverError(existingError);

  if (existing?.is_completed) {
    return NextResponse.json(mapQuest(quest, existing));
  }

  const progress = (existing?.progress ?? 0) + amount;
  const isCompleted = progress >= quest.target_count;

  const { data: row, error: upsertError } = await supabase
    .from("user_quest_progress")
    .upsert(
      {
        user_id: profile.id,
        quest_id: id,
        progress,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,quest_id" },
    )
    .select()
    .single();

  if (upsertError) return serverError(upsertError);

  if (isCompleted) {
    const { expFields } = addExp(profile, quest.exp);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ ...expFields, stat_ego: profile.stat_ego + 1 })
      .eq("id", profile.id);

    if (profileError) return serverError(profileError);
  }

  return NextResponse.json(mapQuest(quest, row));
}
