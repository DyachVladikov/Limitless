export function mapProfile(row: Record<string, any>) {
  const expToNextLevel = row.current_level * 100;

  return {
    id: row.id,
    name: row.username,
    avatarUrl: row.avatar_url,
    title: row.title,
    rank: row.rank,
    exp: Math.round((row.current_exp / expToNextLevel) * 100),
    stats: {
      statRationality: row.stat_rationality,
      statIntelligence: row.stat_intelligence,
      statEgo: row.stat_ego,
      statStrength: row.stat_strength,
      statEnergy: row.stat_energy,
      statDiscipline: row.stat_discipline,
    },
    streak: row.streak,
    level: {
      currentLevel: row.current_level,
      currentExp: row.current_exp,
      expToNextLevel,
      totalExp: row.total_exp,
    },
    lastActiveDate: row.last_active_date,
    createdAt: row.created_at,
  };
}

export function mapDailyTask(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.tasks.title,
    description: row.tasks.description,
    icon: row.tasks.icon,
    exp: row.tasks.exp,
    category: row.tasks.category,
    isCompleted: row.is_completed,
  };
}

export function mapQuest(
  row: Record<string, any>,
  progressRow?: Record<string, any>,
) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    exp: row.exp,
    targetCount: row.target_count,
    progress: progressRow?.progress ?? 0,
    isCompleted: progressRow?.is_completed ?? false,
  };
}
