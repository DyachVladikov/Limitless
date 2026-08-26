import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";
import { mapQuest } from "@/lib/mappers";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const { data: quests, error: questsError } = await supabase
    .from("quests")
    .select("*")
    .order("exp");

  if (questsError) return serverError(questsError);

  const { data: progressRows, error: progressError } = await supabase
    .from("user_quest_progress")
    .select("*")
    .eq("user_id", profile.id);

  if (progressError) return serverError(progressError);

  const progressByQuest = new Map(
    progressRows.map((row) => [row.quest_id, row]),
  );

  const mapped = quests.map((quest) =>
    mapQuest(quest, progressByQuest.get(quest.id)),
  );

  const limit = Number(new URL(request.url).searchParams.get("limit"));

  if (limit > 0) {
    const closest = mapped
      .filter((quest) => !quest.isCompleted)
      .sort(
        (a, b) =>
          b.progress / b.targetCount - a.progress / a.targetCount ||
          b.exp - a.exp,
      )
      .slice(0, limit);

    return NextResponse.json(closest);
  }

  return NextResponse.json(mapped);
}
