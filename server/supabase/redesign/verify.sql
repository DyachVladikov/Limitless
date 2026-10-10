-- Только чтение. Выполнить сразу после миграции в SQL Editor от postgres.
-- Ожидается: 18 таблиц, 0 строк в каждой, RLS=true, доступ клиентов=false, сервера=true.
WITH row_counts AS (
  SELECT 'profiles' AS table_name, count(*) AS row_count FROM public.profiles
  UNION ALL
  SELECT 'tasks' AS table_name, count(*) AS row_count FROM public.tasks
  UNION ALL
  SELECT 'quests' AS table_name, count(*) AS row_count FROM public.quests
  UNION ALL
  SELECT 'focus_sessions' AS table_name, count(*) AS row_count FROM public.focus_sessions
  UNION ALL
  SELECT 'mentors' AS table_name, count(*) AS row_count FROM public.mentors
  UNION ALL
  SELECT 'workout_programs' AS table_name, count(*) AS row_count FROM public.workout_programs
  UNION ALL
  SELECT 'exercises' AS table_name, count(*) AS row_count FROM public.exercises
  UNION ALL
  SELECT 'program_exercises' AS table_name, count(*) AS row_count FROM public.program_exercises
  UNION ALL
  SELECT 'workouts' AS table_name, count(*) AS row_count FROM public.workouts
  UNION ALL
  SELECT 'workout_exercises' AS table_name, count(*) AS row_count FROM public.workout_exercises
  UNION ALL
  SELECT 'dishes' AS table_name, count(*) AS row_count FROM public.dishes
  UNION ALL
  SELECT 'nutrition_entries' AS table_name, count(*) AS row_count FROM public.nutrition_entries
  UNION ALL
  SELECT 'subjects' AS table_name, count(*) AS row_count FROM public.subjects
  UNION ALL
  SELECT 'lab_works' AS table_name, count(*) AS row_count FROM public.lab_works
  UNION ALL
  SELECT 'coding_tasks' AS table_name, count(*) AS row_count FROM public.coding_tasks
  UNION ALL
  SELECT 'knowledge_entries' AS table_name, count(*) AS row_count FROM public.knowledge_entries
  UNION ALL
  SELECT 'books' AS table_name, count(*) AS row_count FROM public.books
  UNION ALL
  SELECT 'scenarios' AS table_name, count(*) AS row_count FROM public.scenarios
)
SELECT r.table_name, r.row_count, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS anon_has_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS authenticated_has_access,
  (has_table_privilege('service_role', c.oid, 'SELECT')
   AND has_table_privilege('service_role', c.oid, 'INSERT')
   AND has_table_privilege('service_role', c.oid, 'UPDATE')
   AND has_table_privilege('service_role', c.oid, 'DELETE')) AS server_has_crud
FROM row_counts r
JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = r.table_name
ORDER BY r.table_name;

-- Ожидается 7 внешних ключей.
SELECT count(*) AS foreign_key_count
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'f';
