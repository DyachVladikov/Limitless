-- Limitless: начальная схема редизайна, без данных.
-- ТОЛЬКО для чистого проекта Supabase. Не запускать старые 001–012 перед этим файлом.
-- Инструкция: ../README.md. Спецификация: docs/backend-redesign.md.
-- Файл применяется целиком. Ошибка откатывает создание всей схемы.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  existing_objects text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO existing_objects
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass
        AND d.objid = c.oid AND d.deptype = 'e'
    );
  IF existing_objects IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Limitless: требуется чистая схема public. Найдены: ' || existing_objects,
      HINT = 'Используйте новый проект Supabase. Эта миграция не удаляет и не переносит прежнюю БД.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'limitless_private')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user', 'handle_updated_at')
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'auth' AND c.relname = 'users'
         AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Limitless: найдены функции/схема прежней или уже установленной БД. Нужен чистый проект.';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Limitless: ожидаются роли Supabase anon, authenticated и service_role с BYPASSRLS.';
  END IF;
END;
$preflight$;

-- Технические функции не являются сущностями и не публикуются как API.
CREATE SCHEMA limitless_private;
REVOKE ALL ON SCHEMA limitless_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA limitless_private TO service_role;

CREATE FUNCTION limitless_private.json_object(value jsonb, allowed text[], required text[] DEFAULT '{}')
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object'
    THEN value ?& required AND value - allowed = '{}'::jsonb ELSE false END;
$$;

CREATE FUNCTION limitless_private.json_text(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '[^[:space:]]', false);
$$;

CREATE FUNCTION limitless_private.json_number(value jsonb, whole boolean DEFAULT false, positive boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n := (value #>> '{}')::numeric;
  RETURN n >= 0 AND n < 'Infinity'::numeric
    AND (NOT whole OR n = trunc(n)) AND (NOT positive OR n > 0);
END;
$$;

CREATE FUNCTION limitless_private.iso_date(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE s text;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  s := value #>> '{}';
  IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
  PERFORM s::date;
  RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END;
$$;

CREATE FUNCTION limitless_private.valid_weekdays(value smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(
    (cardinality(value) = 0 OR array_ndims(value) = 1)
    AND NOT EXISTS (SELECT 1 FROM unnest(value) AS d WHERE d IS NULL OR d NOT BETWEEN 1 AND 7)
    AND cardinality(value) = (SELECT count(DISTINCT d) FROM unnest(value) AS d), false);
$$;

-- Только форматы JSON из спецификации. Правила XP/кулдаунов выполняет будущий бэкенд.
-- false вместо SQL NULL: иначе CHECK пропустил бы неполную структуру.
CREATE FUNCTION limitless_private.valid_json(value jsonb, kind text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  item jsonb;
  k text;
  v jsonb;
  keys text[];
  seen_ids text[] := '{}';
  s text;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN RETURN false; END IF;
  CASE kind
    WHEN 'stats', 'quest_counters' THEN
      keys := CASE kind WHEN 'stats' THEN
        ARRAY['intelligence','strength','rationality','ego','discipline','energy']
        ELSE ARRAY['daily_tasks_completed','daily_sets_completed','coding_tasks_solved','scenarios_completed'] END;
      IF NOT limitless_private.json_object(value, keys) THEN RETURN false; END IF;
      FOR k, v IN SELECT * FROM jsonb_each(value) LOOP
        IF NOT limitless_private.json_number(v, true) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'effect' THEN
      RETURN limitless_private.json_object(value, ARRAY['xp','stats'], ARRAY['xp','stats'])
        AND limitless_private.json_number(value->'xp')
        AND limitless_private.valid_json(value->'stats', 'stats');
    WHEN 'assigned_effects' THEN
      RETURN limitless_private.json_object(value, ARRAY['reward','penalty'], ARRAY['reward','penalty'])
        AND limitless_private.valid_json(value->'reward', 'effect')
        AND limitless_private.valid_json(value->'penalty', 'effect');
    WHEN 'availability' THEN
      IF NOT limitless_private.json_object(value,
        ARRAY['trainingDayOnly','studyDayOnly','excludeStudyBreaks','requiredStudyAction']) THEN RETURN false; END IF;
      FOR k, v IN SELECT * FROM jsonb_each(value) LOOP
        IF k = 'requiredStudyAction' THEN
          IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') NOT IN ('lab_done','lab_passed','subject_closed') THEN RETURN false; END IF;
        ELSIF jsonb_typeof(v) <> 'boolean' THEN RETURN false;
        END IF;
      END LOOP;
      RETURN true;
    WHEN 'study_breaks', 'planned_absences' THEN
      IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
      keys := CASE kind WHEN 'study_breaks' THEN ARRAY['startDate','endDate']
        ELSE ARRAY['startDate','endDate','reason'] END;
      FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
        IF NOT limitless_private.json_object(item, keys, ARRAY['startDate','endDate'])
          OR NOT limitless_private.iso_date(item->'startDate')
          OR NOT limitless_private.iso_date(item->'endDate') THEN RETURN false; END IF;
        IF (item->>'startDate')::date > (item->>'endDate')::date THEN RETURN false; END IF;
        IF item ? 'reason' AND jsonb_typeof(item->'reason') <> 'string' THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'activity_snapshot' THEN
      RETURN limitless_private.json_object(value, ARRAY['streak','lastActiveDate'], ARRAY['streak','lastActiveDate'])
        AND limitless_private.json_number(value->'streak', true)
        AND (value->'lastActiveDate' = 'null'::jsonb OR limitless_private.iso_date(value->'lastActiveDate'));
    WHEN 'nutrition_goals' THEN
      keys := ARRAY['calories','protein','fat','carbs'];
      IF NOT limitless_private.json_object(value, keys, keys) THEN RETURN false; END IF;
      FOR k, v IN SELECT * FROM jsonb_each(value) LOOP
        IF NOT limitless_private.json_number(v, false, true) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'rank_change' THEN
      keys := ARRAY['id','fromRank','toRank','changedAt'];
      IF NOT limitless_private.json_object(value, keys, keys) THEN RETURN false; END IF;
      FOREACH k IN ARRAY keys LOOP
        IF NOT limitless_private.json_text(value->k) THEN RETURN false; END IF;
      END LOOP;
      IF value->>'fromRank' NOT IN ('E','D','C','B','A','S','S+','SS','SSS')
        OR value->>'toRank' NOT IN ('E','D','C','B','A','S','S+','SS','SSS')
        OR value->>'fromRank' = value->>'toRank' THEN RETURN false; END IF;
      IF (value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
      PERFORM (value->>'id')::uuid;
      s := value->>'changedAt';
      IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN false; END IF;
      PERFORM s::timestamptz;
      RETURN true;
    WHEN 'mentor_images' THEN
      IF NOT limitless_private.json_object(value, ARRAY['default','positive','negative','neutral'], ARRAY['default']) THEN RETURN false; END IF;
      FOR k, v IN SELECT * FROM jsonb_each(value) LOOP
        IF NOT limitless_private.json_text(v) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'mentor_phrases' THEN
      IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
      keys := ARRAY['id','event','mood','text'];
      FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
        IF NOT limitless_private.json_object(item, keys, keys) THEN RETURN false; END IF;
        FOREACH k IN ARRAY keys LOOP
          IF NOT limitless_private.json_text(item->k) THEN RETURN false; END IF;
        END LOOP;
        IF item->>'mood' NOT IN ('positive','negative','neutral')
          OR item->>'event' NOT IN ('idle','daily_completed','quest_completed','rank_up','rank_down','cross_reaction','workout_results_reminder')
          OR item->>'id' = ANY(seen_ids) THEN RETURN false; END IF;
        seen_ids := array_append(seen_ids, item->>'id');
      END LOOP;
      RETURN true;
    WHEN 'scenario_content' THEN
      keys := ARRAY['title','prompt','referenceAnswer','rewardXp'];
      RETURN limitless_private.json_object(value, keys, keys)
        AND limitless_private.json_text(value->'title')
        AND limitless_private.json_text(value->'prompt')
        AND limitless_private.json_text(value->'referenceAnswer')
        AND limitless_private.json_number(value->'rewardXp');
    ELSE RETURN false;
  END CASE;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
  RETURN false;
END;
$$;

-- Ядро: один профиль, пул дейликов, квесты, сохранённый фокус.
CREATE TABLE public.profiles (
  id smallint PRIMARY KEY CHECK (id = 1),
  name text NOT NULL CHECK (name ~ '[^[:space:]]'),
  avatar_url text,
  title text,
  timezone text NOT NULL DEFAULT 'Europe/Moscow' CHECK (timezone = 'Europe/Moscow'),
  training_days smallint[] NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_weekdays(training_days)),
  study_days smallint[] NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_weekdays(study_days)),
  study_breaks jsonb NOT NULL DEFAULT '[]' CHECK (limitless_private.valid_json(study_breaks, 'study_breaks')),
  planned_absences jsonb NOT NULL DEFAULT '[]' CHECK (limitless_private.valid_json(planned_absences, 'planned_absences')),
  total_exp numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_exp >= 0 AND total_exp < 'Infinity'::numeric),
  highest_rank text NOT NULL DEFAULT 'E' CHECK (highest_rank IN ('E','D','C','B','A','S','S+','SS','SSS')),
  stat_intelligence integer NOT NULL DEFAULT 0 CHECK (stat_intelligence >= 0),
  stat_strength integer NOT NULL DEFAULT 0 CHECK (stat_strength >= 0),
  stat_rationality integer NOT NULL DEFAULT 0 CHECK (stat_rationality >= 0),
  stat_ego integer NOT NULL DEFAULT 0 CHECK (stat_ego >= 0),
  stat_discipline integer NOT NULL DEFAULT 0 CHECK (stat_discipline >= 0),
  stat_energy integer NOT NULL DEFAULT 0 CHECK (stat_energy >= 0),
  login_streak integer NOT NULL DEFAULT 0 CHECK (login_streak >= 0),
  activity_streak integer NOT NULL DEFAULT 0 CHECK (activity_streak >= 0),
  last_login_date date CHECK (isfinite(last_login_date)),
  last_activity_date date CHECK (isfinite(last_activity_date)),
  day_activity_snapshot jsonb CHECK (day_activity_snapshot IS NULL OR limitless_private.valid_json(day_activity_snapshot, 'activity_snapshot')),
  current_day date CHECK (isfinite(current_day)),
  last_closed_day date CHECK (isfinite(last_closed_day)),
  daily_set_completed_at timestamptz CHECK (isfinite(daily_set_completed_at)),
  quest_counters jsonb NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_json(quest_counters, 'quest_counters')),
  nutrition_goal_calories numeric(10,2),
  nutrition_goal_protein numeric(10,2),
  nutrition_goal_fat numeric(10,2),
  nutrition_goal_carbs numeric(10,2),
  day_nutrition_goals jsonb CHECK (day_nutrition_goals IS NULL OR limitless_private.valid_json(day_nutrition_goals, 'nutrition_goals')),
  day_balance_version text CHECK (day_balance_version IS NULL OR day_balance_version ~ '[^[:space:]]'),
  last_mentor_popup_at timestamptz CHECK (isfinite(last_mentor_popup_at)),
  pending_rank_change jsonb CHECK (pending_rank_change IS NULL OR limitless_private.valid_json(pending_rank_change, 'rank_change')),
  created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  CONSTRAINT profiles_nutrition_goals_check CHECK (
    num_nonnulls(nutrition_goal_calories, nutrition_goal_protein, nutrition_goal_fat, nutrition_goal_carbs) = 0
    OR (num_nonnulls(nutrition_goal_calories, nutrition_goal_protein, nutrition_goal_fat, nutrition_goal_carbs) = 4
      AND nutrition_goal_calories > 0 AND nutrition_goal_calories < 'Infinity'::numeric
      AND nutrition_goal_protein > 0 AND nutrition_goal_protein < 'Infinity'::numeric
      AND nutrition_goal_fat > 0 AND nutrition_goal_fat < 'Infinity'::numeric
      AND nutrition_goal_carbs > 0 AND nutrition_goal_carbs < 'Infinity'::numeric)
  ),
  CONSTRAINT profiles_day_order_check CHECK (current_day IS NULL OR last_closed_day IS NULL OR last_closed_day < current_day)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (title ~ '[^[:space:]]'),
  description text NOT NULL,
  icon text,
  category text NOT NULL CHECK (category IN ('study','sport','health','work','rationality')),
  completion_action text CHECK (completion_action IS NULL OR (completion_action = 'log_gym_results' AND category = 'sport')),
  is_enabled boolean NOT NULL DEFAULT true,
  availability jsonb NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_json(availability, 'availability')),
  cooldown_days integer NOT NULL CHECK (cooldown_days >= 0),
  next_available_on date CHECK (isfinite(next_available_on)),
  reward_xp numeric(14,2) NOT NULL CHECK (reward_xp >= 0 AND reward_xp < 'Infinity'::numeric),
  reward_stats jsonb NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_json(reward_stats, 'stats')),
  penalty_xp numeric(14,2) NOT NULL CHECK (penalty_xp >= 0 AND penalty_xp < 'Infinity'::numeric),
  penalty_stats jsonb NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_json(penalty_stats, 'stats')),
  assignment_id uuid UNIQUE,
  assigned_for date CHECK (isfinite(assigned_for)),
  completed_at timestamptz CHECK (isfinite(completed_at)),
  assigned_effects jsonb CHECK (assigned_effects IS NULL OR limitless_private.valid_json(assigned_effects, 'assigned_effects')),
  applied_reward jsonb CHECK (applied_reward IS NULL OR limitless_private.valid_json(applied_reward, 'effect')),
  created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  CONSTRAINT tasks_assignment_check CHECK (num_nonnulls(assignment_id, assigned_for, assigned_effects) IN (0,3)),
  CONSTRAINT tasks_completion_check CHECK (
    num_nonnulls(completed_at, applied_reward) IN (0,2)
    AND (completed_at IS NULL OR assignment_id IS NOT NULL)
  )
);
CREATE INDEX tasks_available_idx ON public.tasks (category, next_available_on) WHERE is_enabled;
CREATE INDEX tasks_assigned_for_idx ON public.tasks (assigned_for) WHERE assignment_id IS NOT NULL;

CREATE TABLE public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (title ~ '[^[:space:]]'),
  description text NOT NULL,
  icon text,
  is_enabled boolean NOT NULL DEFAULT true,
  required_rank text NOT NULL CHECK (required_rank IN ('E','D','C','B','A','S','S+','SS','SSS')),
  unlocked_at timestamptz CHECK (isfinite(unlocked_at)),
  progress_mode text NOT NULL CHECK (progress_mode IN ('metric','manual')),
  metric_key text CHECK (metric_key IN ('daily_tasks_completed','daily_sets_completed','coding_tasks_solved','scenarios_completed',
    'books_read','pages_read','chapters_read','focus_seconds','gym_workouts','volleyball_attendances','lab_works_done','lab_works_passed','subjects_closed')),
  manual_progress integer NOT NULL DEFAULT 0 CHECK (manual_progress >= 0),
  target_count integer NOT NULL CHECK (target_count > 0),
  progress_unit text NOT NULL CHECK (progress_unit ~ '[^[:space:]]'),
  reward_xp numeric(14,2) NOT NULL CHECK (reward_xp >= 0 AND reward_xp < 'Infinity'::numeric),
  reward_stats jsonb NOT NULL DEFAULT '{}' CHECK (limitless_private.valid_json(reward_stats, 'stats')),
  completed_at timestamptz CHECK (isfinite(completed_at)),
  completed_on date CHECK (isfinite(completed_on)),
  applied_reward jsonb CHECK (applied_reward IS NULL OR limitless_private.valid_json(applied_reward, 'effect')),
  completion_seen_at timestamptz CHECK (isfinite(completion_seen_at)),
  created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  CONSTRAINT quests_progress_check CHECK (
    (progress_mode = 'metric' AND metric_key IS NOT NULL AND manual_progress = 0)
    OR (progress_mode = 'manual' AND metric_key IS NULL)
  ),
  CONSTRAINT quests_completion_check CHECK (
    num_nonnulls(completed_at, completed_on, applied_reward) IN (0,3)
    AND (completed_at IS NULL OR unlocked_at IS NOT NULL)
    AND (completion_seen_at IS NULL OR completed_at IS NOT NULL)
  )
);
CREATE INDEX quests_metric_idx ON public.quests (metric_key) WHERE completed_at IS NULL AND is_enabled;

CREATE INDEX quests_unseen_completion_idx ON public.quests (completed_at, id)
  WHERE completed_at IS NOT NULL AND completion_seen_at IS NULL;

CREATE TABLE public.focus_sessions (
  id uuid PRIMARY KEY,
  game_date date NOT NULL CHECK (isfinite(game_date)),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  credited_seconds integer NOT NULL CHECK (credited_seconds BETWEEN 0 AND duration_seconds AND credited_seconds <= 7200),
  awarded_xp numeric(14,2) NOT NULL CHECK (awarded_xp >= 0 AND awarded_xp < 'Infinity'::numeric),
  balance_version text NOT NULL CHECK (balance_version ~ '[^[:space:]]'),
  saved_at timestamptz NOT NULL CHECK (isfinite(saved_at)),
  created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  CONSTRAINT focus_sessions_zero_credit_check CHECK (credited_seconds > 0 OR awarded_xp = 0)
);
CREATE INDEX focus_sessions_game_date_idx ON public.focus_sessions (game_date);

-- Domain tables. Historical results reference catalogs, never mutable program membership.
CREATE TABLE public.mentors (
    id text PRIMARY KEY CHECK (id ~ '[^[:space:]]'),
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    section text NOT NULL CHECK (section IN ('home', 'study', 'sport', 'work', 'nutrition', 'rationality')),
    images jsonb NOT NULL CHECK (limitless_private.valid_json(images, 'mentor_images')),
    phrases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (limitless_private.valid_json(phrases, 'mentor_phrases')),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE public.workout_programs (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    description text,
    is_enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE public.exercises (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    equipment text,
    muscle_group text NOT NULL CHECK (muscle_group IN ('chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'other')),
    note text,
    is_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE public.program_exercises (
    program_id uuid NOT NULL REFERENCES public.workout_programs(id) ON DELETE RESTRICT,
    exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 0),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    PRIMARY KEY (program_id, exercise_id),
    UNIQUE (program_id, position)
);
CREATE INDEX program_exercises_exercise_idx ON public.program_exercises (exercise_id);

CREATE TABLE public.workouts (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('gym', 'volleyball')),
    performed_on date NOT NULL CHECK (isfinite(performed_on)),
    attended boolean NOT NULL,
    program_id uuid REFERENCES public.workout_programs(id) ON DELETE RESTRICT,
    program_name_snapshot text,
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT workouts_kind_state CHECK (
        (kind = 'gym' AND attended AND program_id IS NOT NULL
            AND program_name_snapshot IS NOT NULL AND program_name_snapshot ~ '[^[:space:]]')
        OR (kind = 'volleyball' AND program_id IS NULL AND program_name_snapshot IS NULL)
    )
);
CREATE UNIQUE INDEX workouts_volleyball_date_unique ON public.workouts (performed_on) WHERE kind = 'volleyball';
CREATE INDEX workouts_program_idx ON public.workouts (program_id) WHERE program_id IS NOT NULL;
CREATE INDEX workouts_performed_idx ON public.workouts (performed_on DESC, created_at DESC);
CREATE INDEX workouts_gym_recent_idx ON public.workouts (performed_on DESC, created_at DESC) WHERE kind = 'gym';

CREATE TABLE public.workout_exercises (
    workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE RESTRICT,
    exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
    exercise_name_snapshot text NOT NULL CHECK (exercise_name_snapshot ~ '[^[:space:]]'),
    weight_kg numeric(8,2) NOT NULL CHECK (weight_kg >= 0 AND weight_kg < 'Infinity'::numeric),
    repetitions integer NOT NULL CHECK (repetitions > 0),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    PRIMARY KEY (workout_id, exercise_id)
);
CREATE INDEX workout_exercises_exercise_idx ON public.workout_exercises (exercise_id, workout_id);

CREATE TABLE public.dishes (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    portion_label text NOT NULL DEFAULT '1 порция' CHECK (portion_label ~ '[^[:space:]]'),
    calories_per_portion numeric(10,2) NOT NULL CHECK (calories_per_portion >= 0 AND calories_per_portion < 'Infinity'::numeric),
    protein_per_portion numeric(10,2) NOT NULL CHECK (protein_per_portion >= 0 AND protein_per_portion < 'Infinity'::numeric),
    fat_per_portion numeric(10,2) NOT NULL CHECK (fat_per_portion >= 0 AND fat_per_portion < 'Infinity'::numeric),
    carbs_per_portion numeric(10,2) NOT NULL CHECK (carbs_per_portion >= 0 AND carbs_per_portion < 'Infinity'::numeric),
    is_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE public.nutrition_entries (
    id uuid PRIMARY KEY,
    game_date date NOT NULL CHECK (isfinite(game_date)),
    dish_id uuid REFERENCES public.dishes(id) ON DELETE RESTRICT,
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    portions numeric(8,3) NOT NULL DEFAULT 1 CHECK (portions > 0 AND portions < 'Infinity'::numeric),
    calories_per_portion numeric(10,2) NOT NULL CHECK (calories_per_portion >= 0 AND calories_per_portion < 'Infinity'::numeric),
    protein_per_portion numeric(10,2) NOT NULL CHECK (protein_per_portion >= 0 AND protein_per_portion < 'Infinity'::numeric),
    fat_per_portion numeric(10,2) NOT NULL CHECK (fat_per_portion >= 0 AND fat_per_portion < 'Infinity'::numeric),
    carbs_per_portion numeric(10,2) NOT NULL CHECK (carbs_per_portion >= 0 AND carbs_per_portion < 'Infinity'::numeric),
    deleted_at timestamptz CHECK (isfinite(deleted_at)),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT nutrition_entries_manual_portions CHECK (dish_id IS NOT NULL OR portions = 1)
);
CREATE INDEX nutrition_entries_date_idx ON public.nutrition_entries (game_date);
CREATE INDEX nutrition_entries_dish_idx ON public.nutrition_entries (dish_id) WHERE dish_id IS NOT NULL;
CREATE INDEX nutrition_entries_active_date_idx ON public.nutrition_entries (game_date) WHERE deleted_at IS NULL;

CREATE TABLE public.subjects (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    is_archived boolean NOT NULL DEFAULT false,
    closed_at timestamptz CHECK (isfinite(closed_at)),
    closed_awarded_xp numeric(14,2) NOT NULL DEFAULT 0 CHECK (closed_awarded_xp >= 0 AND closed_awarded_xp < 'Infinity'::numeric),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT subjects_closed_reward CHECK (closed_at IS NOT NULL OR closed_awarded_xp = 0)
);

CREATE TABLE public.lab_works (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    number integer NOT NULL CHECK (number > 0),
    done_at timestamptz CHECK (isfinite(done_at)),
    passed_at timestamptz CHECK (isfinite(passed_at)),
    done_awarded_xp numeric(14,2) NOT NULL DEFAULT 0 CHECK (done_awarded_xp >= 0 AND done_awarded_xp < 'Infinity'::numeric),
    passed_awarded_xp numeric(14,2) NOT NULL DEFAULT 0 CHECK (passed_awarded_xp >= 0 AND passed_awarded_xp < 'Infinity'::numeric),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE (subject_id, number),
    CONSTRAINT lab_works_passed_requires_done CHECK (passed_at IS NULL OR done_at IS NOT NULL),
    CONSTRAINT lab_works_done_reward CHECK (done_at IS NOT NULL OR done_awarded_xp = 0),
    CONSTRAINT lab_works_passed_reward CHECK (passed_at IS NOT NULL OR passed_awarded_xp = 0)
);

CREATE TABLE public.coding_tasks (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    url text NOT NULL UNIQUE CHECK (url ~ '[^[:space:]]'),
    difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium')),
    is_enabled boolean NOT NULL DEFAULT true,
    reward_xp numeric(14,2) NOT NULL CHECK (reward_xp >= 0 AND reward_xp < 'Infinity'::numeric),
    cooldown_days integer NOT NULL CHECK (cooldown_days >= 0),
    next_available_on date CHECK (next_available_on IS NULL OR isfinite(next_available_on)),
    assignment_id uuid,
    assigned_at timestamptz CHECK (isfinite(assigned_at)),
    assigned_reward_xp numeric(14,2) CHECK (assigned_reward_xp IS NULL OR (assigned_reward_xp >= 0 AND assigned_reward_xp < 'Infinity'::numeric)),
    result text CHECK (result IS NULL OR result IN ('solved', 'failed')),
    resolved_at timestamptz CHECK (isfinite(resolved_at)),
    awarded_xp numeric(14,2) NOT NULL DEFAULT 0 CHECK (awarded_xp >= 0 AND awarded_xp < 'Infinity'::numeric),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT coding_tasks_assignment_fields CHECK (num_nonnulls(assignment_id, assigned_at, assigned_reward_xp) IN (0, 3)),
    CONSTRAINT coding_tasks_result_fields CHECK (num_nonnulls(result, resolved_at) IN (0, 2)),
    CONSTRAINT coding_tasks_assignment_state CHECK (
        (assignment_id IS NULL AND result IS NULL AND resolved_at IS NULL AND awarded_xp = 0)
        OR (assignment_id IS NOT NULL AND (
            (result IS NULL AND resolved_at IS NULL AND awarded_xp = 0)
            OR (result IS NOT NULL AND resolved_at IS NOT NULL AND (result = 'solved' OR awarded_xp = 0))
        ))
    )
);
CREATE UNIQUE INDEX coding_tasks_assignment_unique ON public.coding_tasks (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX coding_tasks_one_current ON public.coding_tasks ((true)) WHERE assignment_id IS NOT NULL;
CREATE INDEX coding_tasks_availability_idx ON public.coding_tasks (next_available_on) WHERE is_enabled;

CREATE TABLE public.knowledge_entries (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('law', 'method', 'principle', 'other')),
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    content text NOT NULL CHECK (content ~ '[^[:space:]]'),
    source_url text,
    is_enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE public.books (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    author text,
    description text,
    source_url text,
    progress_unit text NOT NULL CHECK (progress_unit IN ('pages', 'chapters')),
    total_units integer NOT NULL CHECK (total_units > 0),
    read_units integer NOT NULL DEFAULT 0 CHECK (read_units >= 0 AND read_units <= total_units),
    completed_at timestamptz CHECK (isfinite(completed_at)),
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT books_completion_state CHECK ((completed_at IS NOT NULL) = (read_units = total_units))
);

CREATE TABLE public.scenarios (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    prompt text NOT NULL CHECK (prompt ~ '[^[:space:]]'),
    reference_answer text NOT NULL CHECK (reference_answer ~ '[^[:space:]]'),
    is_enabled boolean NOT NULL DEFAULT true,
    reward_xp numeric(14,2) NOT NULL CHECK (reward_xp >= 0 AND reward_xp < 'Infinity'::numeric),
    cooldown_days integer NOT NULL CHECK (cooldown_days >= 0),
    next_available_on date CHECK (next_available_on IS NULL OR isfinite(next_available_on)),
    attempt_id uuid,
    issued_at timestamptz CHECK (isfinite(issued_at)),
    assigned_content jsonb CHECK (assigned_content IS NULL OR limitless_private.valid_json(assigned_content, 'scenario_content')),
    user_answer text,
    answer_submitted_at timestamptz CHECK (isfinite(answer_submitted_at)),
    self_score smallint CHECK (self_score IS NULL OR self_score IN (0, 25, 50, 75, 100)),
    completed_at timestamptz CHECK (isfinite(completed_at)),
    awarded_xp numeric(14,2) NOT NULL DEFAULT 0 CHECK (awarded_xp >= 0 AND awarded_xp < 'Infinity'::numeric),
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT scenarios_attempt_fields CHECK (num_nonnulls(attempt_id, issued_at, assigned_content) IN (0, 3)),
    CONSTRAINT scenarios_completion_fields CHECK (num_nonnulls(self_score, completed_at) IN (0, 2)),
    CONSTRAINT scenarios_attempt_state CHECK (
        attempt_id IS NOT NULL
        OR (num_nonnulls(user_answer, answer_submitted_at, self_score, completed_at) = 0 AND awarded_xp = 0)
    ),
    CONSTRAINT scenarios_submitted_answer CHECK (
        answer_submitted_at IS NULL
        OR (user_answer IS NOT NULL AND user_answer ~ '[^[:space:]]')
    ),
    CONSTRAINT scenarios_scoring_state CHECK (
        (self_score IS NULL AND awarded_xp = 0)
        OR (self_score IS NOT NULL AND answer_submitted_at IS NOT NULL AND (self_score <> 0 OR awarded_xp = 0))
    )
);
CREATE UNIQUE INDEX scenarios_attempt_unique ON public.scenarios (attempt_id) WHERE attempt_id IS NOT NULL;
CREATE UNIQUE INDEX scenarios_one_current ON public.scenarios ((true)) WHERE attempt_id IS NOT NULL;
CREATE INDEX scenarios_availability_idx ON public.scenarios (next_available_on) WHERE is_enabled;

-- Версия принадлежит БД: бэкенд передаёт ожидаемую версию в WHERE и проверяет RETURNING.
-- Этот триггер сам по себе не заменяет проверку версии и транзакции начислений.
CREATE FUNCTION limitless_private.stamp_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 0;
    NEW.updated_at := NEW.created_at;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
    NEW.updated_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

-- Проверка с блокировкой родителя: результат нельзя привязать к волейболу.
CREATE FUNCTION limitless_private.require_gym_workout()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE workout_kind text;
BEGIN
  SELECT kind INTO workout_kind FROM public.workouts WHERE id = NEW.workout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Посещение не найдено.';
  END IF;
  IF workout_kind <> 'gym' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Результаты упражнений допустимы только для зала.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workout_exercises_require_gym
BEFORE INSERT OR UPDATE OF workout_id ON public.workout_exercises
FOR EACH ROW EXECUTE FUNCTION limitless_private.require_gym_workout();

-- Тип посещения фиксируется при создании. Это сохраняет правило «результаты
-- только у зала» даже при REPEATABLE READ и параллельном добавлении результатов.
-- Дату, посещение волейбола, программу и результаты исправлять по-прежнему можно.
CREATE FUNCTION limitless_private.protect_workout_kind()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Тип посещения фиксируется при создании и не изменяется.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workouts_protect_kind
BEFORE UPDATE OF kind ON public.workouts
FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind)
EXECUTE FUNCTION limitless_private.protect_workout_kind();

-- Закрытая по умолчанию схема. Никаких allow_all и доступа из браузера.
-- service_role обходит RLS в Supabase; секрет используется только будущим защищённым сервером.
GRANT USAGE ON SCHEMA public TO service_role;
DO $tables$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles','tasks','quests','focus_sessions','mentors','workout_programs','exercises',
    'program_exercises','workouts','workout_exercises','dishes','nutrition_entries',
    'subjects','lab_works','coding_tasks','knowledge_entries','books','scenarios'
  ] LOOP
    EXECUTE format('CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION limitless_private.stamp_row()', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END;
$tables$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA limitless_private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA limitless_private TO service_role;
COMMENT ON SCHEMA limitless_private IS 'Внутренние валидаторы и триггеры Limitless; не добавлять в Exposed schemas Data API.';
COMMENT ON TABLE public.profiles IS 'Единственный профиль (id = 1), общий XP и состояние игрового дня.';
COMMENT ON TABLE public.tasks IS 'Пул дейликов и текущее назначение; без истории выдач.';
COMMENT ON TABLE public.quests IS 'Однократные квесты и прогресс единственного пользователя.';
COMMENT ON TABLE public.focus_sessions IS 'Сохранённые фокус-сессии; дневной лимит начисления проверяет транзакция бэкенда.';
COMMENT ON TABLE public.mentors IS 'Менторы, изображения и готовые реплики, без переписки.';
COMMENT ON TABLE public.workout_programs IS 'Программы зала.';
COMMENT ON TABLE public.exercises IS 'Справочник упражнений.';
COMMENT ON TABLE public.program_exercises IS 'Состав и порядок упражнений программы.';
COMMENT ON TABLE public.workouts IS 'Посещения зала и отметки волейбола.';
COMMENT ON TABLE public.workout_exercises IS 'Рабочий вес и повторения упражнения за посещение зала.';
COMMENT ON TABLE public.dishes IS 'Каталог блюд с КБЖУ одной порции.';
COMMENT ON TABLE public.nutrition_entries IS 'Записи питания открытого дня; очищаются бэкендом после расчёта дня.';
COMMENT ON TABLE public.subjects IS 'Учебные предметы с ручным закрытием.';
COMMENT ON TABLE public.lab_works IS 'Лабораторные, выполнение и сдача.';
COMMENT ON TABLE public.coding_tasks IS 'Пул LeetCode и единственная текущая выдача.';
COMMENT ON TABLE public.knowledge_entries IS 'Справочник законов, методов и принципов.';
COMMENT ON TABLE public.books IS 'Книги и общий прогресс чтения, без дневника.';
COMMENT ON TABLE public.scenarios IS 'Ситуации и единственная текущая попытка самооценки.';

NOTIFY pgrst, 'reload schema';
COMMIT;
