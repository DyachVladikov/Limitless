import { NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  const weekStart = monday.toISOString().slice(0, 10);

  const { data: monthTasksRaw, error: tasksError } = await supabase
    .from("daily_tasks")
    .select("is_completed, tasks(exp)")
    .eq("user_id", profile.id)
    .eq("is_completed", true)
    .gte("task_date", monthStart);

  if (tasksError) return serverError(tasksError);

  const monthTasks: any[] = monthTasksRaw;

  const { data: monthQuestsRaw, error: questsError } = await supabase
    .from("user_quest_progress")
    .select("is_completed, quests(exp)")
    .eq("user_id", profile.id)
    .eq("is_completed", true)
    .gte("completed_at", monthStart);

  if (questsError) return serverError(questsError);

  const monthQuests: any[] = monthQuestsRaw;

  const { data: weekFocus, error: focusError } = await supabase
    .from("focus_sessions")
    .select("minutes")
    .eq("user_id", profile.id)
    .gte("session_date", weekStart);

  if (focusError) return serverError(focusError);

  const tasksPoints = monthTasks.reduce((sum, row) => sum + row.tasks.exp, 0);
  const questsPoints = monthQuests.reduce((sum, row) => sum + row.quests.exp, 0);
  const focusMinutes = weekFocus.reduce((sum, row) => sum + row.minutes, 0);

  return NextResponse.json({
    tasksCompleted: monthTasks.length,
    questsCompleted: monthQuests.length,
    focusMinutes,
    pointsEarned: tasksPoints + questsPoints,
  });
}
