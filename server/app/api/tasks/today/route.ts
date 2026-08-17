import { NextResponse } from "next/server";
import { getSupabase, getProfile, serverError } from "@/lib/supabase";
import { mapDailyTask } from "@/lib/mappers";

const TASKS_PER_DAY = 5;

export async function GET() {
  const supabase = getSupabase();

  const profile = await getProfile(supabase);
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: existing, error } = await supabase
    .from("daily_tasks")
    .select("id, is_completed, tasks(title, description, icon, exp, category)")
    .eq("user_id", profile.id)
    .eq("task_date", today);

  if (error) return serverError(error);

  if (existing.length > 0) {
    return NextResponse.json(existing.map(mapDailyTask));
  }

  const { data: allTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, category, days_of_week");

  if (tasksError) return serverError(tasksError);

  const jsDay = new Date().getDay();
  const todayWeekday = jsDay === 0 ? 7 : jsDay;

  const available = allTasks.filter(
    (task) => !task.days_of_week || task.days_of_week.includes(todayWeekday),
  );

  const priority = available.filter(
    (task) =>
      task.category === "sport" && task.days_of_week?.includes(todayWeekday),
  );

  const rest = available.filter((task) => !priority.includes(task));

  const randomFill = [...rest]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(0, TASKS_PER_DAY - priority.length));

  const todaysTasks = [...priority, ...randomFill].slice(0, TASKS_PER_DAY);

  if (todaysTasks.length > 0) {
    const { error: insertError } = await supabase.from("daily_tasks").insert(
      todaysTasks.map((task) => ({
        user_id: profile.id,
        task_id: task.id,
        task_date: today,
      })),
    );

    if (insertError) return serverError(insertError);
  }

  const { data: rolled, error: rolledError } = await supabase
    .from("daily_tasks")
    .select("id, is_completed, tasks(title, description, icon, exp, category)")
    .eq("user_id", profile.id)
    .eq("task_date", today);

  if (rolledError) return serverError(rolledError);
  return NextResponse.json(rolled.map(mapDailyTask));
}
