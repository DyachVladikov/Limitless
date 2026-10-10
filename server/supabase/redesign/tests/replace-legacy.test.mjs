import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite');
const replacement = await readFile(new URL('../replace-legacy.sql', import.meta.url), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const legacyDirectory = new URL('../../migrations/', import.meta.url);
const legacyMigrations = await Promise.all((await readdir(legacyDirectory))
  .filter(name => /^0(?:0[1-9]|1[0-2])_.*\.sql$/.test(name)).sort()
  .map(name => readFile(new URL(name, legacyDirectory), 'utf8')));
assert.equal(legacyMigrations.length, 12, 'exercise all twelve original migration files');
const baseline = await readFile(new URL('../migrations/20261010000000_initial_schema.sql', import.meta.url), 'utf8');
const verification = await readFile(new URL('../verify.sql', import.meta.url), 'utf8');
const userId = '10000000-0000-0000-0000-000000000001';
const courseId = '10000000-0000-0000-0000-000000000002';
const tableNames = [
  'profiles', 'tasks', 'quests', 'focus_sessions', 'mentors', 'workout_programs',
  'exercises', 'program_exercises', 'workouts', 'workout_exercises', 'dishes',
  'nutrition_entries', 'subjects', 'lab_works', 'coding_tasks', 'knowledge_entries',
  'books', 'scenarios',
].sort();
const managedSchemas = ['auth', 'storage', 'realtime', 'vault', 'supabase_migrations'];
const bootstrap = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION auth.keep_user_marker() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RETURN NEW; END;
  $$;
  CREATE TRIGGER keep_user_marker BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION auth.keep_user_marker();
  INSERT INTO auth.users VALUES ('${userId}', '{"username":"legacy_player"}');
  CREATE SCHEMA storage;
  CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text NOT NULL);
  INSERT INTO storage.objects VALUES ('${userId}', 'keep/avatar.png');
  CREATE SCHEMA realtime;
  CREATE TABLE realtime.messages (id integer PRIMARY KEY, payload text NOT NULL);
  INSERT INTO realtime.messages VALUES (1, 'keep realtime data');
  CREATE SCHEMA vault;
  CREATE TABLE vault.secrets (id integer PRIMARY KEY, value text NOT NULL);
  INSERT INTO vault.secrets VALUES (1, 'test marker only');
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
  INSERT INTO supabase_migrations.schema_migrations VALUES ('keep migration history');
`;

// Every instance is in memory. No connection strings or remote credentials are used.
async function withDatabase(run, { legacyThrough = 12 } = {}) {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    for (const migration of legacyMigrations.slice(0, legacyThrough)) await db.exec(migration);
    if (legacyThrough) await populateLegacy(db, legacyThrough);
    await run(db);
  } finally {
    await db.close();
  }
}

async function populateLegacy(db, through) {
  await db.exec(`
    INSERT INTO public.profiles (id, username) VALUES ('${userId}', 'legacy_player');
    INSERT INTO public.quest_completions (user_id, quest_id, target_date)
      SELECT '${userId}', id, '2026-10-10' FROM public.quest_templates LIMIT 1;
    INSERT INTO public.daily_logs (user_id, log_date) VALUES ('${userId}', '2026-10-10');
    INSERT INTO public.academy_courses (id, user_id, title) VALUES ('${courseId}', '${userId}', 'Old course');
    INSERT INTO public.academy_labs (course_id, title) VALUES ('${courseId}', 'Old lab');
    INSERT INTO public.pet_projects (user_id, title) VALUES ('${userId}', 'Old project');
    INSERT INTO public.mental_laws (user_id, title, description) VALUES ('${userId}', 'Old law', 'Old description');
    INSERT INTO public.rationality_books (user_id, title, total_pages) VALUES ('${userId}', 'Old book', 200);
  `);
  if (through >= 11) {
    await db.exec(`
      INSERT INTO public.daily_tasks (user_id, task_id, task_date)
        SELECT '${userId}', id, '2026-10-10' FROM public.tasks LIMIT 1;
      INSERT INTO public.user_quest_progress (user_id, quest_id)
        SELECT '${userId}', id FROM public.quests LIMIT 1;
      INSERT INTO public.focus_sessions (user_id, minutes) VALUES ('${userId}', 25);
    `);
  }
  const existing = await publicData(db);
  assert.equal(Object.keys(existing).length, through >= 11 ? 15 : 10);
  for (const [table, rows] of Object.entries(existing)) {
    assert.ok(rows.length > 0, `legacy ${table} contains data before replacement`);
  }
}

async function publicData(db) {
  const { rows: tables } = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  const result = {};
  for (const { tablename } of tables) {
    result[tablename] = (await db.query(`
      SELECT to_jsonb(t) AS row FROM public."${tablename}" t ORDER BY to_jsonb(t)::text
    `)).rows;
  }
  return result;
}

async function columns(db) {
  return (await db.query(`
    SELECT c.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum
  `)).rows;
}

async function managedSnapshot(db) {
  const relations = (await db.query(`
    SELECT n.nspname, n.oid AS schema_oid, c.relname, c.oid AS relation_oid
    FROM pg_namespace n JOIN pg_class c ON c.relnamespace = n.oid
    WHERE n.nspname = ANY($1::text[]) ORDER BY n.nspname, c.relname
  `, [managedSchemas])).rows;
  const records = {};
  for (const table of ['auth.users', 'storage.objects', 'realtime.messages', 'vault.secrets', 'supabase_migrations.schema_migrations']) {
    records[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  }
  return {
    relations, records,
    extensions: (await db.query('SELECT oid, extname, extnamespace, extversion FROM pg_extension ORDER BY extname')).rows,
    roles: (await db.query('SELECT oid, rolname, rolbypassrls FROM pg_roles ORDER BY rolname')).rows,
    retainedTrigger: (await db.query(`
      SELECT oid, pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE tgrelid = 'auth.users'::regclass AND tgname = 'keep_user_marker'
    `)).rows,
  };
}

async function legacySnapshot(db) {
  return {
    data: await publicData(db),
    columns: await columns(db),
    functions: (await db.query(`
      SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' ORDER BY p.proname, p.oid
    `)).rows,
    triggers: (await db.query(`
      SELECT t.oid, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'auth') AND NOT t.tgisinternal ORDER BY t.oid
    `)).rows,
    managed: await managedSnapshot(db),
  };
}

async function verifyReplacement(db) {
  const { rows: tables } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  assert.equal(tables.length, 18, 'the old tables must be replaced with the agreed 18 tables');
  assert.deepEqual(tables.map(row => row.tablename), tableNames);
  const [tableCheck, foreignKeyCheck] = await db.exec(verification);
  assert.equal(tableCheck.rows.length, 18);
  for (const row of tableCheck.rows) {
    assert.equal(Number(row.row_count), 0, `${row.table_name} starts empty`);
    assert.equal(row.rls_enabled, true, row.table_name);
    assert.equal(row.anon_has_access, false, row.table_name);
    assert.equal(row.authenticated_has_access, false, row.table_name);
    assert.equal(row.server_has_crud, true, row.table_name);
  }
  assert.equal(Number(foreignKeyCheck.rows[0].foreign_key_count), 7);
  assert.equal((await db.query(`
    SELECT count(*)::int AS count FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND confdeltype = 'r'
  `)).rows[0].count, 7, 'all seven foreign keys use RESTRICT');
  assert.equal((await db.query(`
    SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user', 'handle_updated_at')
  `)).rows[0].count, 0, 'legacy functions are removed');
  assert.equal((await db.query(`
    SELECT count(*)::int AS count FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'
  `)).rows[0].count, 0, 'legacy signup trigger is removed');
}

async function rejectAndRollback(db, sql, codes) {
  try {
    await assert.rejects(() => db.exec(sql), error => {
      assert.ok(codes.includes(error.code), `expected SQLSTATE ${codes.join(' or ')}, got ${error.code}: ${error.message}`);
      return true;
    });
  } finally {
    // SQL Editor may leave a failed explicit transaction open. The documented
    // ROLLBACK must recover the entire legacy database, including its data.
    await db.exec('ROLLBACK');
  }
}

test('replacement installs the empty baseline over all 15 populated legacy tables', async () => {
  await withDatabase(async db => {
    const managed = await managedSnapshot(db);
    await db.exec(replacement);
    await verifyReplacement(db);
    assert.deepEqual(await managedSnapshot(db), managed, 'managed schemas, rows, roles and extensions are retained');
    await withDatabase(async reference => {
      await reference.exec(baseline);
      assert.deepEqual(await columns(db), await columns(reference), 'column definitions match the approved baseline');
    }, { legacyThrough: 0 });
    const inserted = (await db.query(`
      INSERT INTO public.profiles (id, name, timezone, training_days, study_days)
      VALUES (1, 'New profile', 'Europe/Moscow', '{}', '{}') RETURNING version
    `)).rows[0];
    assert.equal(Number(inserted.version), 0);
    const updated = (await db.query("UPDATE public.profiles SET name = 'Updated profile' WHERE id = 1 RETURNING version")).rows[0];
    assert.equal(Number(updated.version), 1, 'replacement installs working version triggers');
  });
});

test('replacement also cleans the original auth signup trigger after migrations 001–008', { skip: !replacement }, async () => {
  await withDatabase(async db => {
    assert.equal((await db.query(`
      SELECT count(*)::int AS count FROM pg_trigger
      WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'
    `)).rows[0].count, 1, 'exercise the legacy state before 009 removes the auth trigger');
    const managed = await managedSnapshot(db);
    await db.exec(replacement);
    await verifyReplacement(db);
    assert.deepEqual(await managedSnapshot(db), managed);
    await db.exec("INSERT INTO auth.users (id) VALUES ('10000000-0000-0000-0000-000000000003')");
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.profiles')).rows[0].count, 0,
      'new auth users no longer invoke the legacy profile initializer');
  }, { legacyThrough: 8 });
});

test('a late failure rolls back legacy data, dropped functions and triggers, and the new schema', { skip: !replacement }, async () => {
  await withDatabase(async db => {
    const before = await legacySnapshot(db);
    const failing = replacement.replace(/\bCOMMIT;\s*$/i, 'SELECT 1 / 0;\nCOMMIT;\n');
    assert.notEqual(failing, replacement, 'inject failure immediately before the final COMMIT');
    await rejectAndRollback(db, failing, ['22012']);
    assert.deepEqual(await legacySnapshot(db), before);
    assert.equal((await db.query("SELECT to_regnamespace('limitless_private') AS schema")).rows[0].schema, null);
  }, { legacyThrough: 8 });
});

for (const scenario of [
  {
    name: 'unknown public table',
    setup: "CREATE TABLE public.unrelated_notes (id integer PRIMARY KEY, body text); INSERT INTO public.unrelated_notes VALUES (1, 'keep me');",
    check: "SELECT body FROM public.unrelated_notes WHERE id = 1",
    expected: [{ body: 'keep me' }],
    codes: ['55000'],
  },
  {
    name: 'unknown public view',
    setup: "CREATE VIEW public.unrelated_view AS SELECT 'keep view'::text AS marker;",
    check: 'SELECT marker FROM public.unrelated_view',
    expected: [{ marker: 'keep view' }],
    codes: ['55000'],
  },
  {
    name: 'foreign key from another schema',
    setup: `CREATE SCHEMA integration; CREATE TABLE integration.profile_links (
      profile_id uuid PRIMARY KEY REFERENCES public.profiles(id));
      INSERT INTO integration.profile_links VALUES ('${userId}');`,
    check: 'SELECT profile_id FROM integration.profile_links',
    expected: [{ profile_id: userId }],
    codes: ['55000', '2BP01'],
  },
]) {
  test(`replacement refuses ${scenario.name} without losing legacy data`, { skip: !replacement }, async () => {
    await withDatabase(async db => {
      await db.exec(scenario.setup);
      const before = await legacySnapshot(db);
      await rejectAndRollback(db, replacement, scenario.codes);
      assert.deepEqual(await legacySnapshot(db), before);
      assert.deepEqual((await db.query(scenario.check)).rows, scenario.expected);
    });
  });
}

test('replacement refuses an already redesigned database and preserves its profile', { skip: !replacement }, async () => {
  await withDatabase(async db => {
    await db.exec(baseline);
    await db.exec(`INSERT INTO public.profiles (id, name, timezone, training_days, study_days)
      VALUES (1, 'Keep my new profile', 'Europe/Moscow', '{}', '{}')`);
    const before = await legacySnapshot(db);
    await rejectAndRollback(db, replacement, ['55000']);
    assert.deepEqual(await legacySnapshot(db), before);
  }, { legacyThrough: 0 });
});
