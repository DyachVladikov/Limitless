-- Limitless: демонстрационное наполнение ВСЕХ 18 прикладных таблиц.
-- Для новой схемы 20261010000000_initial_schema.sql / replace-legacy.sql.
-- Supabase -> SQL Editor -> роль postgres -> вставить ВЕСЬ файл -> Run.
-- На пустой новой схеме: 87 строк (profiles: 1, mentors: 6, остальные: по 5).
-- Существующие строки не изменяются; повторный запуск пропускает конфликты.
-- Это примеры, включая историю тренировок/фокуса и питание на сегодня.
-- Они участвуют в статистике и могут продвинуть существующие квесты через API.
-- Сам SQL не начисляет XP, не завершает задания и не меняет права доступа.
-- Системные таблицы auth/storage не затрагиваются.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'Europe/Moscow';

-- Тот же замок, что у серверных транзакций: не пересекаемся с записью API.
SELECT pg_advisory_xact_lock(1869376617, 1);

DO $preflight$
DECLARE
  expected_table text;
BEGIN
  FOREACH expected_table IN ARRAY ARRAY[
    'profiles','tasks','quests','focus_sessions','mentors','workout_programs',
    'exercises','program_exercises','workouts','workout_exercises','dishes',
    'nutrition_entries','subjects','lab_works','coding_tasks','knowledge_entries',
    'books','scenarios'
  ] LOOP
    IF to_regclass('public.' || expected_table) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE =
        'Limitless: отсутствует таблица public.' || expected_table || '. Сначала установите новую схему 20261010000000_initial_schema.sql; наполнение не подходит для старых миграций 001–012.';
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'id' AND data_type = 'smallint'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE =
      'Limitless: несовместимая схема profiles. Нужна новая схема с единственным профилем id = 1.';
  END IF;
END;
$preflight$;

-- 1. Единственный профиль. Имя можно изменить в настройках приложения.
-- Текущий день, выдачу дейликов и серии инициализирует штатный API.
INSERT INTO public.profiles (id, name, avatar_url, title, training_days, study_days)
VALUES (1, 'Игрок', '/avatar.png', 'Начало пути', ARRAY[1,3,5], ARRAY[1,2,3,4,5])
ON CONFLICT DO NOTHING;

-- 2. Пять дейликов: по одному в каждой категории, доступны каждый день.
INSERT INTO public.tasks
  (id, title, description, icon, category, availability, cooldown_days,
   reward_xp, reward_stats, penalty_xp, penalty_stats)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Повторить учебную тему', 'Выделить 25 минут на конспект и решить один пример.', 'book-open', 'study', '{}', 0, 30, '{"intelligence":1}', 5, '{}'),
  ('10000000-0000-4000-8000-000000000002', 'Разминка и движение', 'Сделать привычную разминку и отметить выполнение.', 'dumbbell', 'sport', '{}', 0, 25, '{"strength":1}', 5, '{}'),
  ('10000000-0000-4000-8000-000000000003', 'Записать приём пищи', 'Добавить съеденное блюдо в раздел питания.', 'utensils', 'health', '{}', 0, 20, '{"discipline":1}', 5, '{}'),
  ('10000000-0000-4000-8000-000000000004', 'Поработать над проектом', 'Закрыть одну небольшую задачу и записать результат.', 'code', 'work', '{}', 0, 40, '{"intelligence":1,"discipline":1}', 5, '{}'),
  ('10000000-0000-4000-8000-000000000005', 'Разобрать своё решение', 'Отделить факты от предположений и сформулировать следующий шаг.', 'brain', 'rationality', '{}', 0, 25, '{"rationality":1}', 5, '{}')
ON CONFLICT DO NOTHING;

-- 3. Квесты. Пороги выше демонстрационных метрик; награды выдаст API.
INSERT INTO public.quests
  (id, title, description, icon, required_rank, progress_mode, metric_key,
   target_count, progress_unit, reward_xp, reward_stats)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Первый устойчивый ритм', 'Выполнить 25 ежедневных задач.', 'flame', 'E', 'metric', 'daily_tasks_completed', 25, 'задач', 150, '{"discipline":3}'),
  ('20000000-0000-4000-8000-000000000002', 'Пять часов фокуса', 'Накопить пять часов сохранённых фокус-сессий.', 'target', 'E', 'metric', 'focus_seconds', 18000, 'секунд', 200, '{"intelligence":3}'),
  ('20000000-0000-4000-8000-000000000003', 'Десять посещений зала', 'Записать десять тренировок в зале.', 'dumbbell', 'E', 'metric', 'gym_workouts', 10, 'тренировок', 200, '{"strength":3}'),
  ('20000000-0000-4000-8000-000000000004', 'Алгоритмическая практика', 'Решить десять задач из пула LeetCode.', 'code', 'E', 'metric', 'coding_tasks_solved', 10, 'задач', 200, '{"intelligence":3}'),
  ('20000000-0000-4000-8000-000000000005', 'Мини-релиз проекта', 'Вручную отметить три этапа: план, реализация, проверка.', 'rocket', 'D', 'manual', NULL, 3, 'этапа', 300, '{"ego":2,"discipline":2}')
ON CONFLICT DO NOTHING;

-- 4. Примеры импортированной истории: длительность есть, начисления XP нет.
-- Это не обычные сессии API: credited_seconds = 0 специально для демоданных.
INSERT INTO public.focus_sessions
  (id, game_date, duration_seconds, credited_seconds, awarded_xp, balance_version, saved_at, created_at)
SELECT id::uuid, CURRENT_DATE - days_ago, 1500, 0, 0, '2026-10-10-v1',
       (CURRENT_DATE - days_ago) + time '18:00', (CURRENT_DATE - days_ago) + time '18:00'
FROM (VALUES
  ('30000000-0000-4000-8000-000000000001', 5),
  ('30000000-0000-4000-8000-000000000002', 4),
  ('30000000-0000-4000-8000-000000000003', 3),
  ('30000000-0000-4000-8000-000000000004', 2),
  ('30000000-0000-4000-8000-000000000005', 1)
) AS seed(id, days_ago)
ON CONFLICT DO NOTHING;

-- 5. Шесть менторов, чтобы покрыть все шесть разделов.
-- Общий avatar.png используется как имеющееся в проекте изображение-заглушка.
INSERT INTO public.mentors (id, name, section, images, phrases)
VALUES
  ('gojo', 'Годжо', 'home', '{"default":"/assets/coaches/mainCoach/1.png"}', '[
    {"id":"gojo-idle","event":"idle","mood":"neutral","text":"Выбери одну задачу и начни с первого шага."},
    {"id":"gojo-quest","event":"quest_completed","mood":"positive","text":"Квест завершён. Зафиксируй, что помогло дойти до результата."},
    {"id":"gojo-up","event":"rank_up","mood":"positive","text":"Новый ранг. Продолжай в своём темпе."},
    {"id":"gojo-down","event":"rank_down","mood":"negative","text":"Ранг снизился. Вернись к посильной задаче сегодня."},
    {"id":"gojo-cross","event":"cross_reaction","mood":"positive","text":"Ещё один выполненный шаг в общей картине."}
  ]'),
  ('l', 'L', 'study', '{"default":"/avatar.png"}', '[
    {"id":"l-idle","event":"idle","mood":"neutral","text":"Попробуй объяснить тему своими словами."},
    {"id":"l-daily","event":"daily_completed","mood":"positive","text":"Учебный шаг выполнен. Проверь себя на новом примере."},
    {"id":"l-cross","event":"cross_reaction","mood":"positive","text":"Результат есть. Полезно понять, как ты его получил."}
  ]'),
  ('jin_woo', 'Джин Ву', 'sport', '{"default":"/avatar.png"}', '[
    {"id":"jin-idle","event":"idle","mood":"neutral","text":"Открой свою программу и посмотри прошлые результаты."},
    {"id":"jin-daily","event":"daily_completed","mood":"positive","text":"Тренировочная задача отмечена. Сохрани результат."},
    {"id":"jin-reminder","event":"workout_results_reminder","mood":"neutral","text":"Запиши упражнения, веса и повторения в разделе спорта."},
    {"id":"jin-cross","event":"cross_reaction","mood":"positive","text":"Последовательность складывается из небольших действий."}
  ]'),
  ('senku', 'Сэнку', 'work', '{"default":"/avatar.png"}', '[
    {"id":"senku-idle","event":"idle","mood":"neutral","text":"Сформулируй проверяемый результат рабочего блока."},
    {"id":"senku-daily","event":"daily_completed","mood":"positive","text":"Рабочий шаг завершён. Запиши следующий эксперимент."},
    {"id":"senku-cross","event":"cross_reaction","mood":"positive","text":"Теперь есть новый результат, на который можно опереться."}
  ]'),
  ('soma', 'Сома', 'nutrition', '{"default":"/avatar.png"}', '[
    {"id":"soma-idle","event":"idle","mood":"neutral","text":"В каталоге можно выбрать блюдо или записать своё."},
    {"id":"soma-daily","event":"daily_completed","mood":"positive","text":"Запись готова. Проверь название и размер порции."},
    {"id":"soma-cross","event":"cross_reaction","mood":"positive","text":"Хороший момент отметить сделанное и продолжить день."}
  ]'),
  ('ayanokoji', 'Аянокоджи', 'rationality', '{"default":"/avatar.png"}', '[
    {"id":"aya-idle","event":"idle","mood":"neutral","text":"Что здесь факт, а что пока лишь предположение?"},
    {"id":"aya-daily","event":"daily_completed","mood":"positive","text":"Разбор завершён. Сохрани вывод, который можно проверить."},
    {"id":"aya-cross","event":"cross_reaction","mood":"positive","text":"Небольшой результат тоже даёт полезные данные."}
  ]')
ON CONFLICT DO NOTHING;

-- 6–8. Минимальные демонстрационные программы и их состав.
INSERT INTO public.workout_programs (id, name, description, sort_order)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'Демо: грудь', 'Одно упражнение для знакомства с журналом тренировок.', 1),
  ('40000000-0000-4000-8000-000000000002', 'Демо: спина', 'Одно упражнение для знакомства с журналом тренировок.', 2),
  ('40000000-0000-4000-8000-000000000003', 'Демо: ноги', 'Одно упражнение для знакомства с журналом тренировок.', 3),
  ('40000000-0000-4000-8000-000000000004', 'Демо: плечи', 'Одно упражнение для знакомства с журналом тренировок.', 4),
  ('40000000-0000-4000-8000-000000000005', 'Демо: руки', 'Одно упражнение для знакомства с журналом тренировок.', 5)
ON CONFLICT DO NOTHING;

INSERT INTO public.exercises (id, name, equipment, muscle_group, note)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'Жим гантелей лёжа', 'Гантели, скамья', 'chest', 'Пример записи в справочнике.'),
  ('50000000-0000-4000-8000-000000000002', 'Тяга верхнего блока', 'Блочный тренажёр', 'back', 'Пример записи в справочнике.'),
  ('50000000-0000-4000-8000-000000000003', 'Жим ногами', 'Тренажёр', 'legs', 'Пример записи в справочнике.'),
  ('50000000-0000-4000-8000-000000000004', 'Подъём гантелей в стороны', 'Гантели', 'shoulders', 'Пример записи в справочнике.'),
  ('50000000-0000-4000-8000-000000000005', 'Сгибание рук с гантелями', 'Гантели', 'arms', 'Пример записи в справочнике.')
ON CONFLICT DO NOTHING;

INSERT INTO public.program_exercises (program_id, exercise_id, position)
VALUES
  ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 0),
  ('40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 0),
  ('40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 0),
  ('40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 0),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 0)
ON CONFLICT DO NOTHING;

-- 9–10. Пять прошлых посещений и пять связанных результатов.
INSERT INTO public.workouts (id, kind, performed_on, attended, program_id, program_name_snapshot)
SELECT seed.id::uuid, 'gym', CURRENT_DATE - seed.days_ago, true, p.id, p.name
FROM (VALUES
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 10),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 8),
  ('60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 6),
  ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 4),
  ('60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 2)
) AS seed(id, program_id, days_ago)
JOIN public.workout_programs p ON p.id = seed.program_id::uuid
ON CONFLICT DO NOTHING;

INSERT INTO public.workout_exercises (workout_id, exercise_id, exercise_name_snapshot, weight_kg, repetitions)
SELECT seed.workout_id::uuid, e.id, e.name, seed.weight_kg, seed.repetitions
FROM (VALUES
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 12, 10),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 30, 12),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 50, 10),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 5, 12),
  ('60000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 8, 10)
) AS seed(workout_id, exercise_id, weight_kg, repetitions)
JOIN public.exercises e ON e.id = seed.exercise_id::uuid
ON CONFLICT DO NOTHING;

-- 11–12. КБЖУ условные, для демонстрации полей, не индивидуальный план питания.
INSERT INTO public.dishes
  (id, name, portion_label, calories_per_portion, protein_per_portion, fat_per_portion, carbs_per_portion)
VALUES
  ('70000000-0000-4000-8000-000000000001', 'Овсянка с бананом', '1 миска, 300 г', 350, 12, 10, 53),
  ('70000000-0000-4000-8000-000000000002', 'Курица с рисом', '1 тарелка, 350 г', 510, 40, 10, 65),
  ('70000000-0000-4000-8000-000000000003', 'Творог с ягодами', '1 миска, 200 г', 240, 24, 8, 18),
  ('70000000-0000-4000-8000-000000000004', 'Омлет с овощами', '1 тарелка, 250 г', 300, 20, 20, 10),
  ('70000000-0000-4000-8000-000000000005', 'Рыба с картофелем', '1 тарелка, 350 г', 450, 32, 18, 40)
ON CONFLICT DO NOTHING;

INSERT INTO public.nutrition_entries
  (id, game_date, dish_id, title, portions, calories_per_portion, protein_per_portion, fat_per_portion, carbs_per_portion)
SELECT seed.id::uuid, CURRENT_DATE, d.id, d.name, 1,
       d.calories_per_portion, d.protein_per_portion, d.fat_per_portion, d.carbs_per_portion
FROM (VALUES
  ('80000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003'),
  ('80000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004'),
  ('80000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000005')
) AS seed(id, dish_id)
JOIN public.dishes d ON d.id = seed.dish_id::uuid
ON CONFLICT DO NOTHING;

-- 13–14. Пять предметов, по одной ещё не выполненной лабораторной.
INSERT INTO public.subjects (id, name)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'Базы данных'),
  ('90000000-0000-4000-8000-000000000002', 'Алгоритмы и структуры данных'),
  ('90000000-0000-4000-8000-000000000003', 'Компьютерные сети'),
  ('90000000-0000-4000-8000-000000000004', 'Операционные системы'),
  ('90000000-0000-4000-8000-000000000005', 'Программная инженерия')
ON CONFLICT DO NOTHING;

INSERT INTO public.lab_works (id, subject_id, number)
VALUES
  ('a0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 1),
  ('a0000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', 1),
  ('a0000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000003', 1),
  ('a0000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000004', 1),
  ('a0000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000005', 1)
ON CONFLICT DO NOTHING;

-- 15. Пул LeetCode; текущую задачу выбирает API.
-- DO NOTHING учитывает и уникальность URL, если задача уже есть с другим ID.
INSERT INTO public.coding_tasks (id, title, url, difficulty, reward_xp, cooldown_days)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Two Sum', 'https://leetcode.com/problems/two-sum/', 'easy', 30, 7),
  ('b0000000-0000-4000-8000-000000000002', 'Valid Parentheses', 'https://leetcode.com/problems/valid-parentheses/', 'easy', 30, 7),
  ('b0000000-0000-4000-8000-000000000003', 'Merge Two Sorted Lists', 'https://leetcode.com/problems/merge-two-sorted-lists/', 'easy', 30, 7),
  ('b0000000-0000-4000-8000-000000000004', 'Longest Substring Without Repeating Characters', 'https://leetcode.com/problems/longest-substring-without-repeating-characters/', 'medium', 50, 7),
  ('b0000000-0000-4000-8000-000000000005', 'Group Anagrams', 'https://leetcode.com/problems/group-anagrams/', 'medium', 50, 7)
ON CONFLICT DO NOTHING;

-- 16. Короткие оригинальные заметки для справочника.
INSERT INTO public.knowledge_entries (id, kind, title, content, sort_order)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'method', 'Факты и предположения', 'Раздели запись на две колонки: наблюдаемые факты и возможные объяснения. Для каждого объяснения придумай проверку.', 1),
  ('c0000000-0000-4000-8000-000000000002', 'principle', 'Следующее конкретное действие', 'Переформулируй большую цель в одно действие, у которого понятен результат и есть условие завершения.', 2),
  ('c0000000-0000-4000-8000-000000000003', 'method', 'Короткий разбор результата', 'Запиши, что ожидалось, что получилось и какой один шаг стоит изменить в следующей попытке.', 3),
  ('c0000000-0000-4000-8000-000000000004', 'principle', 'Проверка альтернатив', 'Перед выбором перечисли хотя бы два варианта и сравни их по одному важному для задачи критерию.', 4),
  ('c0000000-0000-4000-8000-000000000005', 'method', 'Объяснение без конспекта', 'Закрой источник и объясни идею простыми словами. Места, где объяснение обрывается, отметь для повторения.', 5)
ON CONFLICT DO NOTHING;

-- 17. Демонстрационные названия и объёмы; замени своими книгами в приложении.
INSERT INTO public.books (id, title, author, description, progress_unit, total_units)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Демо: основы алгоритмов', 'Limitless', 'Пример книги с учётом прочитанных страниц.', 'pages', 240),
  ('d0000000-0000-4000-8000-000000000002', 'Демо: проектирование баз данных', 'Limitless', 'Пример книги с учётом прочитанных страниц.', 'pages', 180),
  ('d0000000-0000-4000-8000-000000000003', 'Демо: ясное мышление', 'Limitless', 'Пример книги с учётом прочитанных глав.', 'chapters', 12),
  ('d0000000-0000-4000-8000-000000000004', 'Демо: привычка учиться', 'Limitless', 'Пример книги с учётом прочитанных страниц.', 'pages', 160),
  ('d0000000-0000-4000-8000-000000000005', 'Демо: практика разработки', 'Limitless', 'Пример книги с учётом прочитанных глав.', 'chapters', 15)
ON CONFLICT DO NOTHING;

-- 18. Ситуации без текущей попытки. Выдачу, ответ и самооценку ведёт API.
INSERT INTO public.scenarios (id, title, prompt, reference_answer, reward_xp, cooldown_days)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'Задача не помещается в день', 'Ты запланировал пять крупных дел, но после первого понял, что времени не хватит. Как пересмотришь план?', 'Оценить оставшееся время, выбрать главное по последствиям и срокам, сократить объём и явно перенести остальные дела.', 30, 7),
  ('e0000000-0000-4000-8000-000000000002', 'Ошибка после изменения кода', 'После небольшого изменения перестал работать экран. Какие шаги помогут найти причину?', 'Воспроизвести ошибку, сохранить наблюдения, сравнить рабочее и текущее состояние, проверить одну гипотезу небольшим изменением.', 30, 7),
  ('e0000000-0000-4000-8000-000000000003', 'Сложная тема перед лабораторной', 'Ты прочитал материал, но не можешь самостоятельно решить первый пример. Что сделаешь дальше?', 'Найти конкретный непонятный шаг, разобрать минимальный пример, объяснить решение своими словами и проверить себя на похожей задаче.', 30, 7),
  ('e0000000-0000-4000-8000-000000000004', 'Несогласие в команде', 'Коллега предлагает другой вариант реализации. Данных для уверенного выбора пока мало. Как продолжить обсуждение?', 'Уточнить общую цель и критерии выбора, записать допущения обоих вариантов и договориться о небольшой проверке наиболее важного предположения.', 30, 7),
  ('e0000000-0000-4000-8000-000000000005', 'Пропущенный день', 'Вчера план не получился, и сегодня хочется отказаться от всей системы. Как выбрать следующий шаг?', 'Разобрать причину без обобщений о себе, выбрать посильное действие на сегодня и изменить одно условие, которое мешало вчера.', 30, 7)
ON CONFLICT DO NOTHING;

COMMIT;

-- Итог после успешной записи: 18 строк с фактическими размерами таблиц.
SELECT 'profiles' AS table_name, count(*) AS row_count FROM public.profiles
UNION ALL SELECT 'tasks', count(*) FROM public.tasks
UNION ALL SELECT 'quests', count(*) FROM public.quests
UNION ALL SELECT 'focus_sessions', count(*) FROM public.focus_sessions
UNION ALL SELECT 'mentors', count(*) FROM public.mentors
UNION ALL SELECT 'workout_programs', count(*) FROM public.workout_programs
UNION ALL SELECT 'exercises', count(*) FROM public.exercises
UNION ALL SELECT 'program_exercises', count(*) FROM public.program_exercises
UNION ALL SELECT 'workouts', count(*) FROM public.workouts
UNION ALL SELECT 'workout_exercises', count(*) FROM public.workout_exercises
UNION ALL SELECT 'dishes', count(*) FROM public.dishes
UNION ALL SELECT 'nutrition_entries', count(*) FROM public.nutrition_entries
UNION ALL SELECT 'subjects', count(*) FROM public.subjects
UNION ALL SELECT 'lab_works', count(*) FROM public.lab_works
UNION ALL SELECT 'coding_tasks', count(*) FROM public.coding_tasks
UNION ALL SELECT 'knowledge_entries', count(*) FROM public.knowledge_entries
UNION ALL SELECT 'books', count(*) FROM public.books
UNION ALL SELECT 'scenarios', count(*) FROM public.scenarios
ORDER BY table_name;
