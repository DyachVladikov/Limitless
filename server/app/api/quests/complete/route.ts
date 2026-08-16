import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  getUserId,
  serverError,
  unauthorized,
} from "@/lib/supabase";

const statByCategory: Record<string, string> = {
  fitness: "stat_strength",
  academy: "stat_intelligence",
  rationality: "stat_rationality",
};

export async function POST(request: NextRequest) {
  const { supabase, token } = getSupabase(request);
  if (!token) return unauthorized();

  const userId = await getUserId(supabase, token);
  if (!userId) return unauthorized();

  const { questId } = await request.json();
  if (!questId) {
    return NextResponse.json({ error: "Нужен questId" }, { status: 400 });
  }

  const { data: quest, error: questError } = await supabase
    .from("quest_templates")
    .select("*")
    .eq("id", questId)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Квест не найден" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error: completionError } = await supabase
    .from("quest_completions")
    .insert({ user_id: userId, quest_id: questId, target_date: today });

  if (completionError?.code === "23505") {
    return NextResponse.json(
      { error: "Квест уже выполнен сегодня" },
      { status: 409 },
    );
  }
  if (completionError) return serverError(completionError);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  let currentExp = profile.current_exp + quest.base_exp;
  let currentLevel = profile.current_level;
  let expToNextLevel = currentLevel * 100;

  while (currentExp >= expToNextLevel) {
    currentExp -= expToNextLevel;
    currentLevel += 1;
    expToNextLevel = currentLevel * 100;
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let streak = 1;
  if (profile.last_active_date === today) {
    streak = profile.streak;
  } else if (profile.last_active_date === yesterday) {
    streak = profile.streak + 1;
  }

  const statKey = statByCategory[quest.category] ?? "stat_rationality";

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      current_exp: currentExp,
      current_level: currentLevel,
      total_exp: profile.total_exp + quest.base_exp,
      [statKey]: profile[statKey] + 1,
      streak,
      last_active_date: today,
    })
    .eq("id", userId)
    .select()
    .single();

  if (updateError) return serverError(updateError);

  return NextResponse.json({
    profile: updatedProfile,
    leveledUp: currentLevel > profile.current_level,
  });
}
