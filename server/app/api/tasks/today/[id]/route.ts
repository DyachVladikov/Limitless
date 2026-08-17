import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";
import { addExp, removeExp, touchStreak } from "@/lib/exp";

type Params = { params: Promise<{ id: string }> };

const statByCategory: Record<string, string> = {
  study: "stat_intelligence",
  sport: "stat_strength",
  health: "stat_energy",
  work: "stat_discipline",
  rationality: "stat_rationality",
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();

  const { id } = await params;
  const { isCompleted } = await request.json();

  if (typeof isCompleted !== "boolean") {
    return NextResponse.json({ error: "Нужен isCompleted" }, { status: 400 });
  }

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const { data: dailyTaskRaw, error: taskError } = await supabase
    .from("daily_tasks")
    .select("id, is_completed, tasks(exp, category)")
    .eq("id", id)
    .single();

  const dailyTask: any = dailyTaskRaw;

  if (taskError || !dailyTask) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }

  if (dailyTask.is_completed === isCompleted) {
    return NextResponse.json({ success: true });
  }

  const { error: updateError } = await supabase
    .from("daily_tasks")
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (updateError) return serverError(updateError);

  let profileUpdates: Record<string, any>;

  if (isCompleted) {
    const { expFields } = addExp(profile, dailyTask.tasks.exp);
    const statKey =
      statByCategory[dailyTask.tasks.category] ?? "stat_rationality";
    profileUpdates = {
      ...expFields,
      ...touchStreak(profile),
      [statKey]: profile[statKey] + 1,
    };
  } else {
    profileUpdates = removeExp(profile, dailyTask.tasks.exp);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profileUpdates)
    .eq("id", profile.id);

  if (profileError) return serverError(profileError);
  return NextResponse.json({ success: true });
}
