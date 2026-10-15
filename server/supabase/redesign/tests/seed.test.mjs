import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite');
const schema = await readFile(new URL('../migrations/20261010000000_initial_schema.sql', import.meta.url), 'utf8');
const seed = await readFile(new URL('../migrations/20261015000000_seed_demo_data.sql', import.meta.url), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const tables = [
  'profiles', 'tasks', 'quests', 'focus_sessions', 'mentors', 'workout_programs',
  'exercises', 'program_exercises', 'workouts', 'workout_exercises', 'dishes',
  'nutrition_entries', 'subjects', 'lab_works', 'coding_tasks', 'knowledge_entries',
  'books', 'scenarios',
];
const bootstrap = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
`;

// Every case uses local in-memory PostgreSQL; no live database or credentials.
async function database(run, installSchema = true) {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    if (installSchema) await db.exec(schema);
    await run(db);
  } finally {
    await db.close();
  }
}

async function rows(db, table) {
  // JSON text keeps timestamp precision and gives composite-key tables a stable order.
  return (await db.query(`SELECT to_jsonb(t)::text AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows;
}

async function snapshot(db) {
  const result = {};
  for (const table of tables) result[table] = await rows(db, table);
  return result;
}

async function schemaSnapshot(db) {
  const queries = [
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    `SELECT conrelid::regclass::text AS table_name, conname, contype, convalidated, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conrelid::regclass::text, conname`,
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    `SELECT tgrelid::regclass::text AS table_name, tgname, tgenabled, pg_get_triggerdef(oid) AS definition
     FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
     ORDER BY tgrelid::regclass::text, tgname`,
    `SELECT relname, relrowsecurity, relacl FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`,
    `SELECT oid::regprocedure::text AS name, pg_get_functiondef(oid) AS definition FROM pg_proc
     WHERE pronamespace = 'limitless_private'::regnamespace ORDER BY oid::regprocedure::text`,
  ];
  const result = [];
  for (const query of queries) result.push((await db.query(query)).rows);
  return result;
}

async function assertCounts(db) {
  for (const table of tables) {
    const expected = table === 'profiles' ? 1 : table === 'mentors' ? 6 : 5;
    const { rows: [result] } = await db.query(`SELECT count(*)::int AS count FROM public.${table}`);
    assert.equal(result.count, expected, `${table} demo row count`);
  }
}

test('seed populates all 18 redesigned tables with valid relationships and leaves the schema intact', async () => {
  await database(async db => {
    const before = await schemaSnapshot(db);
    for (const table of tables) assert.deepEqual(await rows(db, table), [], `${table} starts empty`);
    await db.exec(seed);
    await assertCounts(db);
    assert.deepEqual(await schemaSnapshot(db), before);
    const foreignKeys = before[1].filter(constraint => constraint.contype === 'f');
    assert.equal(foreignKeys.length, 7);
    assert.ok(foreignKeys.every(constraint => constraint.convalidated));
    const { rows: mentors } = await db.query('SELECT section FROM public.mentors ORDER BY section');
    assert.deepEqual(mentors.map(mentor => mentor.section), ['home', 'nutrition', 'rationality', 'sport', 'study', 'work']);
  });
});

test('demo history leaves rewards and completion state uncredited and nutrition uses the current Moscow day', async () => {
  await database(async db => {
    // Pick a timezone whose date differs from Moscow at any time of day.
    await db.query(`SELECT set_config('TimeZone', CASE
      WHEN (now() AT TIME ZONE 'Etc/GMT+12')::date <> (now() AT TIME ZONE 'Europe/Moscow')::date
      THEN 'Etc/GMT+12' ELSE 'Pacific/Kiritimati' END, false)`);
    const { rows: [start] } = await db.query(`SELECT (now() AT TIME ZONE 'Europe/Moscow')::date::text AS day`);
    await db.exec(seed);
    const { rows: [end] } = await db.query(`SELECT (now() AT TIME ZONE 'Europe/Moscow')::date::text AS day`);
    const { rows: [profile] } = await db.query('SELECT * FROM public.profiles');
    assert.ok(profile, 'seed creates the singleton profile');
    for (const key of ['total_exp', 'stat_intelligence', 'stat_strength', 'stat_rationality', 'stat_ego', 'stat_discipline', 'stat_energy', 'login_streak', 'activity_streak']) {
      assert.equal(Number(profile[key]), 0, `profile.${key}`);
    }
    assert.equal(profile.highest_rank, 'E');
    assert.ok(Object.values(profile.quest_counters).every(value => value === 0), 'no quest counters awarded');
    const { rows: meals } = await db.query('SELECT game_date::text AS day, deleted_at FROM public.nutrition_entries');
    assert.equal(meals.length, 5);
    assert.ok(meals.every(meal => [start.day, end.day].includes(meal.day) && meal.deleted_at === null));
    const { rows: sessions } = await db.query(`
      SELECT credited_seconds, awarded_xp, duration_seconds,
        game_date < (now() AT TIME ZONE 'Europe/Moscow')::date AS historical,
        saved_at < now() AS saved_in_past FROM public.focus_sessions
    `);
    assert.equal(sessions.length, 5);
    assert.ok(sessions.every(session => session.historical && session.saved_in_past && session.duration_seconds > 0
      && session.credited_seconds === 0 && Number(session.awarded_xp) === 0));
    const unfinished = {
      tasks: 'assignment_id IS NULL AND assigned_for IS NULL AND assigned_effects IS NULL AND completed_at IS NULL AND applied_reward IS NULL',
      quests: 'manual_progress = 0 AND completed_at IS NULL AND completed_on IS NULL AND applied_reward IS NULL AND completion_seen_at IS NULL',
      subjects: 'closed_at IS NULL AND closed_awarded_xp = 0',
      lab_works: 'done_at IS NULL AND passed_at IS NULL AND done_awarded_xp = 0 AND passed_awarded_xp = 0',
      coding_tasks: 'assignment_id IS NULL AND assigned_at IS NULL AND assigned_reward_xp IS NULL AND result IS NULL AND resolved_at IS NULL AND awarded_xp = 0',
      books: 'read_units = 0 AND completed_at IS NULL',
      scenarios: 'attempt_id IS NULL AND issued_at IS NULL AND assigned_content IS NULL AND user_answer IS NULL AND answer_submitted_at IS NULL AND self_score IS NULL AND completed_at IS NULL AND awarded_xp = 0',
    };
    for (const [table, condition] of Object.entries(unfinished)) {
      const { rows: [result] } = await db.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${condition})::int AS unfinished FROM public.${table}`);
      assert.deepEqual(result, { total: 5, unfinished: 5 }, table);
    }
  });
});

test('reapplying seed preserves every row, user edits, versions, and exact timestamps', async () => {
  await database(async db => {
    await db.exec(seed);
    await assertCounts(db);
    for (const table of tables) await db.exec(`UPDATE public.${table} SET version = version`);
    await db.exec(`
      UPDATE public.profiles SET name = 'My existing profile', total_exp = 321.50, stat_strength = 7,
        quest_counters = '{"daily_tasks_completed":9,"coding_tasks_solved":3}';
      UPDATE public.books SET title = 'User edited title', read_units = 1;
      UPDATE public.tasks SET title = 'User edited task', is_enabled = false;
      UPDATE public.lab_works SET done_at = '2026-01-01T09:00:00Z', done_awarded_xp = 12;
      INSERT INTO public.knowledge_entries (id, kind, title, content)
      VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'other', 'User addition', 'Preserve my content');
    `);
    const before = await snapshot(db);
    await db.exec(seed);
    assert.deepEqual(await snapshot(db), before);
    await db.exec(seed);
    assert.deepEqual(await snapshot(db), before);
  });
});

test('existing profile progress and a coding URL owned by another ID survive initial seeding', async () => {
  let collision;
  await database(async db => {
    await db.exec(seed);
    const { rows: [task] } = await db.query('SELECT id, url FROM public.coding_tasks ORDER BY id LIMIT 1');
    assert.ok(task, 'seed provides a coding URL to exercise collision handling');
    collision = task;
  });
  await database(async db => {
    await db.exec(`
      INSERT INTO public.profiles (id, name, total_exp, highest_rank, stat_intelligence, login_streak,
        activity_streak, current_day, quest_counters)
      VALUES (1, 'Existing account', 987.65, 'A', 42, 3, 2, '2026-01-02', '{"daily_tasks_completed":17,"scenarios_completed":2}');
      UPDATE public.profiles SET title = 'Keep my progress';
    `);
    const existingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    assert.notEqual(collision.id, existingId);
    await db.query(`INSERT INTO public.coding_tasks (id, title, url, difficulty, reward_xp, cooldown_days)
      VALUES ($1, 'My task with the same URL', $2, 'medium', 27, 3)`, [existingId, collision.url]);
    const beforeProfile = await rows(db, 'profiles');
    const beforeTask = (await db.query('SELECT to_jsonb(t)::text AS row FROM public.coding_tasks t WHERE id = $1', [existingId])).rows;
    await db.exec(seed);
    await assertCounts(db);
    assert.deepEqual(await rows(db, 'profiles'), beforeProfile);
    assert.deepEqual((await db.query('SELECT to_jsonb(t)::text AS row FROM public.coding_tasks t WHERE id = $1', [existingId])).rows, beforeTask);
    assert.deepEqual((await db.query('SELECT id FROM public.coding_tasks WHERE id = $1', [collision.id])).rows, []);
    const beforeRepeat = await snapshot(db);
    await db.exec(seed);
    assert.deepEqual(await snapshot(db), beforeRepeat);
  });
});

test('a later insert failure rolls back all demo rows while retaining existing data', async () => {
  await database(async db => {
    await db.exec(`INSERT INTO public.profiles (id, name, total_exp) VALUES (1, 'Keep me', 123)`);
    const before = await snapshot(db);
    // Sequence increments survive rollback, proving the failure happened after earlier rows were attempted.
    await db.exec(`
      CREATE SEQUENCE public.seed_insert_attempts;
      CREATE FUNCTION public.reject_late_seed_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF nextval('public.seed_insert_attempts') = 12 THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Deliberate late seed insert failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    for (const table of tables) {
      await db.exec(`CREATE TRIGGER reject_late_seed_insert BEFORE INSERT ON public.${table}
        FOR EACH ROW EXECUTE FUNCTION public.reject_late_seed_insert()`);
    }
    await assert.rejects(() => db.exec(seed), error => error.code === '23514' && /Deliberate late seed insert failure/.test(error.message));
    await db.exec('ROLLBACK');
    assert.equal(Number((await db.query('SELECT last_value FROM public.seed_insert_attempts')).rows[0].last_value), 12);
    assert.deepEqual(await snapshot(db), before);
  });
});

test('incompatible legacy tables produce a clear preflight error without changing their data', async () => {
  await database(async db => {
    await db.exec(`
      CREATE TABLE public.profiles (id integer PRIMARY KEY, legacy_name text);
      INSERT INTO public.profiles VALUES (1, 'Existing legacy profile');
      CREATE TABLE public.daily_tasks (id integer PRIMARY KEY, title text);
      INSERT INTO public.daily_tasks VALUES (3, 'Existing legacy task');
    `);
    const beforeProfile = await rows(db, 'profiles');
    const beforeTasks = await rows(db, 'daily_tasks');
    const inventory = async () => (await db.query(`SELECT relname, relkind FROM pg_class
      WHERE relnamespace = 'public'::regnamespace ORDER BY relname`)).rows;
    const beforeInventory = await inventory();
    await assert.rejects(() => db.exec(seed), error => {
      assert.equal(error.code, '55000', 'preflight must explain an incompatible schema');
      assert.match(error.message, /20261010000000|redesign|несовместим|схем|schema/i);
      return true;
    });
    await db.exec('ROLLBACK');
    assert.deepEqual(await inventory(), beforeInventory);
    assert.deepEqual(await rows(db, 'profiles'), beforeProfile);
    assert.deepEqual(await rows(db, 'daily_tasks'), beforeTasks);
  }, false);
});
