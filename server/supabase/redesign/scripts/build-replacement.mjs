import { readFile, writeFile } from 'node:fs/promises';

// A single copy/paste artifact, assembled from the reviewed baseline.
// Keep this destructive entry point OUTSIDE migrations/.
const baselinePath = new URL('../migrations/20261010000000_initial_schema.sql', import.meta.url);
const outputPath = new URL('../replace-legacy.sql', import.meta.url);
const baseline = await readFile(baselinePath, 'utf8');
const start = baseline.indexOf('\nBEGIN;\n');
const marker = '\nDO $preflight$\n';
if (start < 0 || baseline.split(marker).length !== 2 || !/\nCOMMIT;\s*$/.test(baseline)) {
  throw new Error('Структура начальной миграции изменилась: проверь сборку replace-legacy.sql.');
}

const header = `-- Limitless: УДАЛИТЬ прежние данные приложения и создать новую пустую БД.
-- Запускать целиком в SQL Editor существующего проекта Supabase от роли postgres.
-- Удаляются 15 старых таблиц Limitless и две служебные функции из миграций 001–012.
-- Создаются 18 новых таблиц БЕЗ ДАННЫХ. Старый API после замены несовместим.
-- Auth, Storage, расширения и история Supabase CLI сохраняются.
-- У старого Auth удаляется только наш триггер создания прежнего профиля.
-- Очистка и создание — одна транзакция: ошибка отменяет обе части.
-- После успешной установки повторный запуск запрещён, чтобы не стереть новый прогресс.
-- Сгенерировано scripts/build-replacement.mjs; этот файл не редактировать вручную.
-- Инструкция: README.md. После запуска можно выполнить verify.sql.
`;

const cleanup = `
-- 1. Защита от повторного удаления уже установленного редизайна.
DO $replacement_guard$
BEGIN
  IF to_regnamespace('limitless_private') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'profiles'
      AND a.attname = 'id' AND NOT a.attisdropped
      AND a.atttypid = 'smallint'::regtype
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Limitless: новая схема уже существует. Повторная очистка отклонена; данные сохранены.',
      HINT = 'Для дальнейших изменений используй новые миграции, а не replace-legacy.sql.';
  END IF;
END;
$replacement_guard$;

-- 2. Убираем только триггер Limitless, оставшийся при установке до миграции 009.
-- Пользователей Auth и содержимое Storage не удаляем.
DO $remove_legacy_signup$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users RESTRICT';
  END IF;
END;
$remove_legacy_signup$;

-- 3. Одна команда учитывает связи между всеми старыми таблицами.
-- RESTRICT остановит операцию при неизвестной внешней зависимости.
-- Вместе с таблицами удалятся их данные, индексы, ограничения, политики и триггеры.
DROP TABLE IF EXISTS
  public.quest_completions,
  public.daily_logs,
  public.academy_labs,
  public.academy_courses,
  public.pet_projects,
  public.mental_laws,
  public.rationality_books,
  public.coach_dialogues,
  public.daily_tasks,
  public.user_quest_progress,
  public.focus_sessions,
  public.quest_templates,
  public.tasks,
  public.quests,
  public.profiles
RESTRICT;

DROP FUNCTION IF EXISTS public.handle_new_user() RESTRICT;
DROP FUNCTION IF EXISTS public.handle_updated_at() RESTRICT;

-- 4. Далее — неизменённое создание согласованной схемы из начальной миграции.
-- Если осталась неизвестная прикладная таблица/представление/последовательность,
-- проверка ниже отклонит установку; удаление старых таблиц также откатится.
`;

const output = header + baseline.slice(start + 1).replace(marker, cleanup + marker);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Использование: node scripts/build-replacement.mjs [--check]');
}
if (args[0] === '--check') {
  const saved = await readFile(outputPath, 'utf8');
  if (saved !== output) throw new Error('replace-legacy.sql устарел: запусти сборку без --check.');
  console.log('replace-legacy.sql соответствует исходникам.');
} else {
  await writeFile(outputPath, output);
  console.log('Создан replace-legacy.sql (очистка + начальная миграция, одна транзакция).');
}
