// Fixed SQL identifiers from the approved 18-table schema. Never accept client identifiers.
export const columns = {
  profiles: ["id", "name", "avatar_url", "title", "timezone", "training_days", "study_days", "study_breaks", "planned_absences", "total_exp", "highest_rank", "stat_intelligence", "stat_strength", "stat_rationality", "stat_ego", "stat_discipline", "stat_energy", "login_streak", "activity_streak", "last_login_date", "last_activity_date", "day_activity_snapshot", "current_day", "last_closed_day", "daily_set_completed_at", "quest_counters", "nutrition_goal_calories", "nutrition_goal_protein", "nutrition_goal_fat", "nutrition_goal_carbs", "day_nutrition_goals", "day_balance_version", "last_mentor_popup_at", "pending_rank_change", "created_at", "updated_at", "version"],
  tasks: ["id", "title", "description", "icon", "category", "completion_action", "is_enabled", "availability", "cooldown_days", "next_available_on", "reward_xp", "reward_stats", "penalty_xp", "penalty_stats", "assignment_id", "assigned_for", "completed_at", "assigned_effects", "applied_reward", "created_at", "updated_at", "version"],
  quests: ["id", "title", "description", "icon", "is_enabled", "required_rank", "unlocked_at", "progress_mode", "metric_key", "manual_progress", "target_count", "progress_unit", "reward_xp", "reward_stats", "completed_at", "completed_on", "applied_reward", "completion_seen_at", "created_at", "updated_at", "version"],
  focus_sessions: ["id", "game_date", "duration_seconds", "credited_seconds", "awarded_xp", "balance_version", "saved_at", "created_at", "updated_at", "version"],
  mentors: ["id", "name", "section", "images", "phrases", "created_at", "updated_at", "version"],
  workout_programs: ["id", "name", "description", "is_enabled", "sort_order", "created_at", "updated_at", "version"],
  exercises: ["id", "name", "equipment", "muscle_group", "note", "is_enabled", "created_at", "updated_at", "version"],
  program_exercises: ["program_id", "exercise_id", "position", "created_at", "updated_at", "version"],
  workouts: ["id", "kind", "performed_on", "attended", "program_id", "program_name_snapshot", "created_at", "updated_at", "version"],
  workout_exercises: ["workout_id", "exercise_id", "exercise_name_snapshot", "weight_kg", "repetitions", "created_at", "updated_at", "version"],
  dishes: ["id", "name", "portion_label", "calories_per_portion", "protein_per_portion", "fat_per_portion", "carbs_per_portion", "is_enabled", "created_at", "updated_at", "version"],
  nutrition_entries: ["id", "game_date", "dish_id", "title", "portions", "calories_per_portion", "protein_per_portion", "fat_per_portion", "carbs_per_portion", "deleted_at", "created_at", "updated_at", "version"],
  subjects: ["id", "name", "is_archived", "closed_at", "closed_awarded_xp", "created_at", "updated_at", "version"],
  lab_works: ["id", "subject_id", "number", "done_at", "passed_at", "done_awarded_xp", "passed_awarded_xp", "created_at", "updated_at", "version"],
  coding_tasks: ["id", "title", "url", "difficulty", "is_enabled", "reward_xp", "cooldown_days", "next_available_on", "assignment_id", "assigned_at", "assigned_reward_xp", "result", "resolved_at", "awarded_xp", "created_at", "updated_at", "version"],
  knowledge_entries: ["id", "kind", "title", "content", "source_url", "is_enabled", "sort_order", "created_at", "updated_at", "version"],
  books: ["id", "title", "author", "description", "source_url", "progress_unit", "total_units", "read_units", "completed_at", "is_archived", "created_at", "updated_at", "version"],
  scenarios: ["id", "title", "prompt", "reference_answer", "is_enabled", "reward_xp", "cooldown_days", "next_available_on", "attempt_id", "issued_at", "assigned_content", "user_answer", "answer_submitted_at", "self_score", "completed_at", "awarded_xp", "created_at", "updated_at", "version"],
} as const;
export type Table = keyof typeof columns;
export const jsonColumns = new Set(["applied_reward", "assigned_content", "assigned_effects", "availability", "day_activity_snapshot", "day_nutrition_goals", "images", "penalty_stats", "pending_rank_change", "phrases", "planned_absences", "quest_counters", "reward_stats", "study_breaks"]);
