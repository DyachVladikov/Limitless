import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite');
const migrationPath = new URL('../migrations/20261010000000_initial_schema.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const specification = await readFile(new URL('../../../../docs/backend-redesign.md', import.meta.url), 'utf8');
const tableNames = [
  'profiles', 'tasks', 'quests', 'focus_sessions', 'mentors', 'workout_programs',
  'exercises', 'program_exercises', 'workouts', 'workout_exercises', 'dishes',
  'nutrition_entries', 'subjects', 'lab_works', 'coding_tasks', 'knowledge_entries',
  'books', 'scenarios',
];
const stamp = '2026-10-10T09:00:00Z';
const day = '2026-10-10';
const json = JSON.stringify;
const reward = { xp: 0, stats: {} };
const effects = { reward, penalty: reward };
const scenarioContent = { title: 'Scenario', prompt: 'Prompt', referenceAnswer: 'Answer', rewardXp: 20 };
const fixtures = {
  profiles: () => ({ id: 1, name: 'Test profile', timezone: 'Europe/Moscow', training_days: '{}', study_days: '{}' }),
  tasks: () => ({ title: 'Daily', description: '', category: 'work', cooldown_days: 1, reward_xp: 10, penalty_xp: 2 }),
  quests: () => ({ title: 'Quest', description: '', required_rank: 'E', progress_mode: 'manual', target_count: 2, progress_unit: 'tasks', reward_xp: 10 }),
  focus_sessions: () => ({ id: randomUUID(), game_date: day, duration_seconds: 90, credited_seconds: 90, awarded_xp: 0.3, balance_version: 'test', saved_at: stamp }),
  mentors: () => ({ id: 'gojo', name: 'Gojo', section: 'home', images: json({ default: '/gojo.png' }) }),
  workout_programs: () => ({ name: 'Upper' }),
  exercises: () => ({ name: 'Press', muscle_group: 'chest' }),
  dishes: () => ({ name: 'Lunch', calories_per_portion: 100, protein_per_portion: 10, fat_per_portion: 2, carbs_per_portion: 15 }),
  nutrition_entries: () => ({ id: randomUUID(), game_date: day, title: 'Manual meal', calories_per_portion: 100, protein_per_portion: 10, fat_per_portion: 2, carbs_per_portion: 15 }),
  subjects: () => ({ name: 'Math' }),
  coding_tasks: () => ({ title: 'Two sum', url: `https://leetcode.com/problems/${randomUUID()}/`, difficulty: 'easy', reward_xp: 5, cooldown_days: 1 }),
  knowledge_entries: () => ({ kind: 'law', title: 'Law', content: 'Content' }),
  books: () => ({ title: 'Book', progress_unit: 'pages', total_units: 100 }),
  scenarios: () => ({ title: 'Scenario', prompt: 'Prompt', reference_answer: 'Answer', reward_xp: 20, cooldown_days: 1 }),
};
const bootstrap = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(bootstrap);
  if (migration) await db.exec(migration);
});
after(async () => { await db?.close(); });

test('contract: exactly 18 public application tables exist', async () => {
  const { rows } = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  assert.equal(rows.length, 18);
  assert.deepEqual(rows.map(row => row.tablename), [...tableNames].sort());
});

// Each behavioral check rolls back its fixtures. PGlite is always an in-memory
// instance: this runner accepts neither database URLs nor remote credentials.
function check(name, run) {
  test(name, { skip: !migration }, async () => {
    await db.exec('BEGIN');
    try { await run(); } finally { await db.exec('ROLLBACK'); }
  });
}

async function insert(table, values = {}) {
  const data = { ...fixtures[table]?.(), ...values };
  const keys = Object.keys(data);
  const result = await db.query(
    `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(data),
  );
  return result.rows[0];
}

async function update(table, row, values) {
  const entries = Object.entries(values);
  const { rows } = await db.query(
    `UPDATE public.${table} SET ${entries.map(([key], i) => `${key} = $${i + 1}`).join(', ')} WHERE id = $${entries.length + 1} RETURNING *`,
    [...entries.map(([, value]) => value), row.id],
  );
  return rows[0];
}

async function rejected(run, label, codes = ['23514', '23502', '23503', '23505', 'P0001']) {
  await db.exec('SAVEPOINT invalid_case');
  try {
    await assert.rejects(run, error => {
      assert.ok(codes.includes(error.code), `${label}: unexpected SQLSTATE ${error.code}: ${error.message}`);
      return true;
    }, label);
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT invalid_case; RELEASE SAVEPOINT invalid_case');
  }
}

async function invalidChanges(table, row, changes) {
  for (const values of changes) {
    await rejected(() => update(table, row, values), `${table}: ${json(values)}`);
  }
}

async function sportFixtures() {
  const program = await insert('workout_programs');
  const exercise = await insert('exercises');
  const membership = await insert('program_exercises', { program_id: program.id, exercise_id: exercise.id, position: 0 });
  const workout = await insert('workouts', { id: randomUUID(), kind: 'gym', performed_on: day, attended: true, program_id: program.id, program_name_snapshot: program.name });
  const result = await insert('workout_exercises', { workout_id: workout.id, exercise_id: exercise.id, exercise_name_snapshot: exercise.name, weight_kg: 20, repetitions: 10 });
  return { program, exercise, membership, workout, result };
}

async function seedEveryTable() {
  for (const table of Object.keys(fixtures)) await insert(table);
  // The relationship fixtures use their own parents, in addition to the catalogs.
  await sportFixtures();
  const { rows: [subject] } = await db.query('SELECT id FROM public.subjects LIMIT 1');
  await insert('lab_works', { subject_id: subject.id, number: 1 });
}

check('schema column names, PostgreSQL types, and nullability match the approved document', async () => {
  const types = { timestamptz: 'timestamp with time zone' };
  for (const table of tableNames) {
    const section = specification.split(`## ${table}\n`)[1]?.split('\n## ')[0];
    assert.ok(section, `documented section for ${table}`);
    const expected = [];
    for (const line of section.split('\n')) {
      const match = line.match(/^\| `([a-z_]+)` \| `([^`]+)`[^|]*\| (да|нет) \|/);
      if (match) expected.push({ name: match[1], type: types[match[2]] ?? match[2], nullable: match[3] === 'да' });
    }
    expected.push(
      { name: 'created_at', type: 'timestamp with time zone', nullable: false },
      { name: 'updated_at', type: 'timestamp with time zone', nullable: false },
      { name: 'version', type: 'bigint', nullable: false },
    );
    const { rows } = await db.query(`
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable
      FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attname
    `, [`public.${table}`]);
    assert.deepEqual(rows, expected.sort((a, b) => a.name.localeCompare(b.name)), table);
  }
});

check('installation has no data, one primary key per table, exactly seven restricted foreign keys', async () => {
  for (const table of tableNames) {
    const { rows: [result] } = await db.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
    assert.equal(result.count, 0, `${table} must be empty`);
  }
  const { rows: primaryKeys } = await db.query(`
    SELECT conrelid::regclass::text AS table_name FROM pg_constraint
    WHERE contype = 'p' AND connamespace = 'public'::regnamespace
  `);
  assert.equal(primaryKeys.length, 18);
  const { rows: foreignKeys } = await db.query(`
    SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent,
      confdeltype AS deletion, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, confrelid::regclass::text
  `);
  assert.equal(foreignKeys.length, 7);
  assert.deepEqual(foreignKeys.map(row => [row.child, row.parent]), [
    ['lab_works', 'subjects'], ['nutrition_entries', 'dishes'],
    ['program_exercises', 'exercises'], ['program_exercises', 'workout_programs'],
    ['workout_exercises', 'exercises'], ['workout_exercises', 'workouts'],
    ['workouts', 'workout_programs'],
  ]);
  assert.ok(foreignKeys.every(row => row.deletion === 'r'), 'all FK deletions use RESTRICT');
});

check('profile is a singleton with fixed timezone, valid schedules, rank, and all-or-none nutrition goals', async () => {
  const profile = await insert('profiles');
  await rejected(() => insert('profiles'), 'duplicate singleton');
  await invalidChanges('profiles', profile, [
    { id: 2 }, { timezone: 'UTC' }, { highest_rank: 'F' },
    { training_days: '{1,1}' }, { training_days: '{0}' }, { training_days: '{8}' },
    { training_days: '{NULL}' }, { study_days: '{{1,2},{3,4}}' },
    { stat_strength: -1 }, { login_streak: -1 }, { activity_streak: -1 },
    { nutrition_goal_calories: 2000 },
    { nutrition_goal_calories: 0, nutrition_goal_protein: 1, nutrition_goal_fat: 1, nutrition_goal_carbs: 1 },
  ]);
  await update('profiles', profile, { training_days: '{1,3,7}', study_days: '{}', highest_rank: 'S+', nutrition_goal_calories: 2000, nutrition_goal_protein: 100, nutrition_goal_fat: 60, nutrition_goal_carbs: 200 });
});

check('daily assignment and completion fields move together and accept a zero reward', async () => {
  const task = await insert('tasks');
  const assignment = { assignment_id: randomUUID(), assigned_for: day, assigned_effects: json(effects) };
  await invalidChanges('tasks', task, [
    { assignment_id: randomUUID() }, { assigned_for: day }, { assigned_effects: json(effects) },
    { completed_at: stamp }, { applied_reward: json(reward) },
    { completed_at: stamp, applied_reward: json(reward) },
    { completion_action: 'log_gym_results' }, { category: 'other' },
  ]);
  await update('tasks', task, assignment);
  await invalidChanges('tasks', task, [{ completed_at: stamp }, { applied_reward: json(reward) }, { assigned_for: null }]);
  await update('tasks', task, { completed_at: stamp, applied_reward: json(reward) });
  await rejected(() => insert('tasks', assignment), 'assignment IDs cannot be reused');
  await update('tasks', task, { assignment_id: null, assigned_for: null, assigned_effects: null, completed_at: null, applied_reward: null });
  await update('tasks', task, { category: 'sport', completion_action: 'log_gym_results' });
});

check('quests reject partial completion, unseen completion without a result, and inconsistent progress modes', async () => {
  const quest = await insert('quests');
  const completed = { completed_at: stamp, completed_on: day, applied_reward: json(reward) };
  await invalidChanges('quests', quest, [
    { progress_mode: 'metric' }, { metric_key: 'daily_tasks_completed' },
    { progress_mode: 'metric', metric_key: 'not_a_metric' },
    { progress_mode: 'metric', metric_key: 'daily_tasks_completed', manual_progress: 1 },
    { target_count: 0 }, { manual_progress: -1 }, { required_rank: 'F' },
    { completed_at: stamp }, { completed_on: day }, { applied_reward: json(reward) },
    { completion_seen_at: stamp }, completed,
  ]);
  await update('quests', quest, { progress_mode: 'metric', metric_key: 'daily_tasks_completed', unlocked_at: stamp });
  await update('quests', quest, completed);
  await update('quests', quest, { completion_seen_at: stamp });
  await invalidChanges('quests', quest, [{ completed_on: null }, { completed_at: null }, { applied_reward: null }, { unlocked_at: null }]);
});

check('coding task lifecycle retains a single current assignment even after completion', async () => {
  const task = await insert('coding_tasks');
  const next = await insert('coding_tasks');
  const assignment = { assignment_id: randomUUID(), assigned_at: stamp, assigned_reward_xp: 5 };
  await invalidChanges('coding_tasks', task, [
    { assignment_id: randomUUID() }, { assigned_at: stamp }, { assigned_reward_xp: 0 },
    { result: 'solved' }, { resolved_at: stamp }, { awarded_xp: 1 }, { difficulty: 'hard' },
  ]);
  await update('coding_tasks', task, assignment);
  await invalidChanges('coding_tasks', task, [{ result: 'solved' }, { resolved_at: stamp }, { awarded_xp: 1 }, { result: 'failed', resolved_at: stamp, awarded_xp: 1 }]);
  await update('coding_tasks', task, { result: 'solved', resolved_at: stamp, awarded_xp: 5 });
  await rejected(() => update('coding_tasks', next, { ...assignment, assignment_id: randomUUID() }), 'only one current coding assignment, including completed');
  await update('coding_tasks', task, { assignment_id: null, assigned_at: null, assigned_reward_xp: null, result: null, resolved_at: null, awarded_xp: 0 });
  await update('coding_tasks', next, { ...assignment, assignment_id: randomUUID(), result: 'failed', resolved_at: stamp, awarded_xp: 0 });
});

check('scenario lifecycle permits drafts, requires a submitted answer, and retains a single completed attempt', async () => {
  const scenario = await insert('scenarios');
  const next = await insert('scenarios');
  const attempt = { attempt_id: randomUUID(), issued_at: stamp, assigned_content: json(scenarioContent) };
  await invalidChanges('scenarios', scenario, [
    { attempt_id: randomUUID() }, { issued_at: stamp }, { assigned_content: json(scenarioContent) },
    { user_answer: 'Orphan draft' }, { answer_submitted_at: stamp }, { self_score: 0 }, { completed_at: stamp }, { awarded_xp: 1 },
  ]);
  await update('scenarios', scenario, attempt);
  await invalidChanges('scenarios', scenario, [{ answer_submitted_at: stamp }, { user_answer: '  ', answer_submitted_at: stamp }, { self_score: 50, completed_at: stamp }]);
  await update('scenarios', scenario, { user_answer: 'Draft answer' });
  await update('scenarios', scenario, { answer_submitted_at: stamp });
  await invalidChanges('scenarios', scenario, [{ self_score: 50 }, { completed_at: stamp }, { self_score: 33, completed_at: stamp }, { awarded_xp: 1 }]);
  await update('scenarios', scenario, { self_score: 0, completed_at: stamp, awarded_xp: 0 });
  await rejected(() => update('scenarios', next, { ...attempt, attempt_id: randomUUID() }), 'only one current scenario attempt, including completed');
  await update('scenarios', scenario, { attempt_id: null, issued_at: null, assigned_content: null, user_answer: null, answer_submitted_at: null, self_score: null, completed_at: null, awarded_xp: 0 });
  await update('scenarios', next, { ...attempt, attempt_id: randomUUID() });
});

check('JSON dictionaries reject null, unknown keys, wrong scalar types, and invalid rewards', async () => {
  const task = await insert('tasks');
  await invalidChanges('tasks', task, [
    ...['null', '[]', '1', '"text"', '{"unknown":1}', '{"strength":null}', '{"strength":-1}', '{"strength":0.5}', '{"strength":"1"}'].map(value => ({ reward_stats: value })),
    { penalty_stats: '{"discipline":-1}' },
    ...['null', '[]', '{"unknown":true}', '{"trainingDayOnly":null}', '{"trainingDayOnly":"true"}', '{"requiredStudyAction":"exam"}'].map(value => ({ availability: value })),
  ]);
  await update('tasks', task, { reward_stats: json({ strength: 0, intelligence: 2 }), availability: json({ trainingDayOnly: false, studyDayOnly: true, excludeStudyBreaks: true, requiredStudyAction: 'lab_done' }) });
  await update('tasks', task, { assignment_id: randomUUID(), assigned_for: day, assigned_effects: json(effects) });
  await invalidChanges('tasks', task, [
    ...['null', '{}', '{"reward":null,"penalty":{"xp":0,"stats":{}}}', '{"reward":{"xp":null,"stats":{}},"penalty":{"xp":0,"stats":{}}}'].map(value => ({ assigned_effects: value })),
    ...['null', '{}', '{"xp":0}', '{"xp":-1,"stats":{}}', '{"xp":0,"stats":null}', '{"xp":"1","stats":{}}'].map(value => ({ completed_at: stamp, applied_reward: value })),
  ]);
  const scenario = await insert('scenarios');
  await update('scenarios', scenario, { attempt_id: randomUUID(), issued_at: stamp, assigned_content: json(scenarioContent) });
  await invalidChanges('scenarios', scenario, [
    ...['null', '{}', json({ ...scenarioContent, rewardXp: null }), json({ ...scenarioContent, rewardXp: -1 }), json({ ...scenarioContent, prompt: null })].map(value => ({ assigned_content: value })),
  ]);
});

check('profile JSON validates periods, counters, snapshots, nutrition goals, and rank notifications', async () => {
  const profile = await insert('profiles');
  await invalidChanges('profiles', profile, [
    ...['null', '{}', '[null]', '[{}]', '[{"startDate":"2026-10-12","endDate":"2026-10-11"}]', '[{"startDate":"2026-02-30","endDate":"2026-03-01"}]', '[{"startDate":"2026-10-11","endDate":null}]', '[{"startDate":"2026-10-11","endDate":"2026-10-12","reason":42}]'].map(value => ({ planned_absences: value })),
    { study_breaks: '[{"startDate":"not-a-date","endDate":"2026-10-12"}]' },
    ...['null', '[]', '{"unknown":0}', '{"daily_tasks_completed":null}', '{"coding_tasks_solved":-1}', '{"scenarios_completed":1.5}'].map(value => ({ quest_counters: value })),
    ...['null', '{}', '{"streak":-1,"lastActiveDate":null}', '{"streak":0,"lastActiveDate":"2026-02-30"}'].map(value => ({ day_activity_snapshot: value })),
    ...['null', '{}', '{"calories":100,"protein":10,"fat":2}', '{"calories":0,"protein":10,"fat":2,"carbs":20}', '{"calories":100,"protein":null,"fat":2,"carbs":20}'].map(value => ({ day_nutrition_goals: value })),
    { pending_rank_change: 'null' },
    { pending_rank_change: json({ id: 'invalid', fromRank: 'E', toRank: 'D', changedAt: stamp }) },
    { pending_rank_change: json({ id: randomUUID(), fromRank: 'F', toRank: 'D', changedAt: stamp }) },
    { pending_rank_change: json({ id: randomUUID(), fromRank: 'E', toRank: 'D', changedAt: 'tomorrow' }) },
  ]);
  await update('profiles', profile, {
    study_breaks: json([{ startDate: '2027-01-01', endDate: '2027-01-15' }]),
    planned_absences: json([{ startDate: '2027-02-01', endDate: '2027-02-01', reason: 'Holiday' }]),
    quest_counters: json({ daily_tasks_completed: 3, daily_sets_completed: 0, coding_tasks_solved: 0, scenarios_completed: 0 }),
    day_activity_snapshot: json({ streak: 0, lastActiveDate: null }),
    day_nutrition_goals: json({ calories: 2000, protein: 100, fat: 60, carbs: 200 }),
    pending_rank_change: json({ id: randomUUID(), fromRank: 'E', toRank: 'D', changedAt: stamp }),
  });
});

check('mentor JSON requires default artwork and well-formed phrases with unique IDs', async () => {
  const mentor = await insert('mentors');
  const phrase = { id: 'first', event: 'idle', mood: 'neutral', text: 'Hello' };
  await invalidChanges('mentors', mentor, [
    ...['null', '{}', '[]', '{"default":null}', '{"default":""}', '{"default":"/x.png","positive":42}'].map(value => ({ images: value })),
    ...['null', '{}', '[null]', json([{}]), json([{ ...phrase, event: 'unknown' }]), json([{ ...phrase, mood: 'unknown' }]), json([{ ...phrase, text: '' }]), json([{ ...phrase, text: '\n\t ' }]), json([phrase, phrase])].map(value => ({ phrases: value })),
  ]);
  await update('mentors', mentor, { images: json({ default: '/default.png', positive: '/positive.png' }), phrases: json([phrase, { ...phrase, id: 'second', event: 'workout_results_reminder', mood: 'positive' }]) });
});

check('every exact numeric field rejects NaN and negative values', async () => {
  await seedEveryTable();
  // Make nullable numeric fields and reward snapshots active before testing
  // them, so rejection cannot be explained by an unrelated lifecycle check.
  await db.exec(`
    UPDATE public.profiles SET nutrition_goal_calories = 2000, nutrition_goal_protein = 100,
      nutrition_goal_fat = 60, nutrition_goal_carbs = 200;
    UPDATE public.coding_tasks SET assignment_id = gen_random_uuid(), assigned_at = '${stamp}',
      assigned_reward_xp = 5, result = 'solved', resolved_at = '${stamp}';
    UPDATE public.subjects SET closed_at = '${stamp}';
    UPDATE public.lab_works SET done_at = '${stamp}', passed_at = '${stamp}';
    UPDATE public.scenarios SET attempt_id = gen_random_uuid(), issued_at = '${stamp}',
      assigned_content = '${json(scenarioContent)}', user_answer = 'Answer',
      answer_submitted_at = '${stamp}', self_score = 100, completed_at = '${stamp}';
  `);
  const { rows } = await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'numeric'
    ORDER BY table_name, column_name
  `);
  assert.ok(rows.length > 20, 'exercise all numeric columns, including reward snapshots');
  for (const { table_name: table, column_name: column } of rows) {
    for (const value of ['NaN', '-1']) {
      await rejected(() => db.query(`UPDATE public.${table} SET ${column} = $1`, [value]), `${table}.${column} rejects ${value}`);
    }
  }
});

check('action IDs are required while UUID catalog IDs have defaults', async () => {
  const { rows } = await db.query(`
    SELECT table_name, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id' AND data_type = 'uuid'
  `);
  const actionTables = new Set(['focus_sessions', 'workouts', 'nutrition_entries']);
  for (const { table_name: table, column_default: value } of rows) {
    if (actionTables.has(table)) assert.equal(value, null, `${table} requires the client's stable ID`);
    else assert.match(value, /gen_random_uuid\(\)/, `${table} generates catalog IDs`);
  }
});

check('focus sessions require stable IDs and valid credited duration', async () => {
  const focus = await insert('focus_sessions');
  await rejected(() => insert('focus_sessions', { id: focus.id }), 'focus retry cannot duplicate a stable ID');
  await rejected(() => db.query(`INSERT INTO public.focus_sessions (game_date, duration_seconds, credited_seconds, awarded_xp, balance_version, saved_at) VALUES ($1, 60, 60, 0, 'test', $2)`, [day, stamp]), 'focus ID is client supplied', ['23502']);
  await invalidChanges('focus_sessions', focus, [{ duration_seconds: 0 }, { credited_seconds: -1 }, { credited_seconds: 91 }]);
  await insert('focus_sessions', { duration_seconds: 9000, credited_seconds: 0, awarded_xp: 0 });
});

check('gym history survives program edits, restricts parent deletion, and excludes volleyball results', async () => {
  const { program, exercise, workout } = await sportFixtures();
  await insert('workouts', { id: randomUUID(), kind: 'gym', performed_on: day, attended: true, program_id: program.id, program_name_snapshot: program.name });
  const volleyball = await insert('workouts', { id: randomUUID(), kind: 'volleyball', performed_on: day, attended: false });
  await rejected(() => insert('workouts', { id: randomUUID(), kind: 'volleyball', performed_on: day, attended: true }), 'one volleyball mark per date');
  await invalidChanges('workouts', workout, [
    { attended: false }, { program_id: null }, { program_name_snapshot: null },
    { kind: 'volleyball', program_id: null, program_name_snapshot: null, performed_on: '2026-10-11' },
  ]);
  await rejected(() => insert('workout_exercises', { workout_id: volleyball.id, exercise_id: exercise.id, exercise_name_snapshot: exercise.name, weight_kg: 20, repetitions: 10 }), 'volleyball cannot have strength results');
  await rejected(() => db.query('UPDATE public.workout_exercises SET workout_id = $1', [volleyball.id]), 'cannot move a result to volleyball');
  await rejected(() => db.query('UPDATE public.workout_exercises SET repetitions = 0'), 'positive repetitions');
  await rejected(() => insert('program_exercises', { program_id: program.id, exercise_id: exercise.id, position: 1 }), 'unique exercise in program');
  const secondExercise = await insert('exercises', { name: 'Row' });
  await rejected(() => insert('program_exercises', { program_id: program.id, exercise_id: secondExercise.id, position: 0 }), 'unique position in program');
  await rejected(() => db.query('DELETE FROM public.workout_programs WHERE id = $1', [program.id]), 'used program deletion is restricted', ['23503']);
  await rejected(() => db.query('DELETE FROM public.exercises WHERE id = $1', [exercise.id]), 'used exercise deletion is restricted', ['23503']);
  await db.query('DELETE FROM public.program_exercises WHERE program_id = $1', [program.id]);
  const { rows: [result] } = await db.query('SELECT * FROM public.workout_exercises WHERE workout_id = $1', [workout.id]);
  assert.equal(result.exercise_id, exercise.id);
  assert.equal(result.exercise_name_snapshot, exercise.name);
  assert.equal(Number(result.weight_kg), 20);
});

check('workout kind is immutable even when no exercise results exist', async () => {
  const program = await insert('workout_programs');
  const gym = await insert('workouts', { id: randomUUID(), kind: 'gym', performed_on: day, attended: true, program_id: program.id, program_name_snapshot: program.name });
  const volleyball = await insert('workouts', { id: randomUUID(), kind: 'volleyball', performed_on: '2026-10-11', attended: false });
  await update('workouts', gym, { kind: 'gym', program_name_snapshot: 'Corrected name' });
  await update('workouts', volleyball, { kind: 'volleyball', attended: true });
  await invalidChanges('workouts', gym, [{ kind: 'volleyball', program_id: null, program_name_snapshot: null }]);
  await invalidChanges('workouts', volleyball, [{ kind: 'gym', program_id: program.id, program_name_snapshot: program.name }]);
});

check('all game-calendar dates reject positive and negative infinity in otherwise valid states', async () => {
  await seedEveryTable();
  await db.query(`UPDATE public.tasks SET assignment_id = gen_random_uuid(), assigned_for = $1, assigned_effects = $2`, [day, json(effects)]);
  await db.query(`UPDATE public.quests SET unlocked_at = $1, completed_at = $1, completed_on = $2, applied_reward = $3`, [stamp, day, json(reward)]);
  const { rows } = await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'date'
    ORDER BY table_name, column_name
  `);
  assert.ok(rows.length >= 10, 'calendar-date coverage includes optional core dates');
  for (const { table_name: table, column_name: column } of rows) {
    for (const value of ['infinity', '-infinity']) {
      await rejected(() => db.query(`UPDATE public.${table} SET ${column} = $1`, [value]), `${table}.${column} rejects ${value}`);
    }
  }
});

check('creation and event timestamps reject positive and negative infinity', async () => {
  const focus = await insert('focus_sessions');
  for (const value of ['infinity', '-infinity']) {
    await rejected(() => db.query(`INSERT INTO public.books (title, progress_unit, total_units, created_at) VALUES ('Book', 'pages', 100, $1)`, [value]), `created_at rejects ${value}`);
    await rejected(() => db.query('UPDATE public.focus_sessions SET saved_at = $1 WHERE id = $2', [value, focus.id]), `saved_at rejects ${value}`);
  }
});

check('nutrition allows fractional catalog portions and requires one portion for manual totals', async () => {
  const dish = await insert('dishes');
  const manual = await insert('nutrition_entries');
  await invalidChanges('nutrition_entries', manual, [{ portions: 0 }, { portions: 0.5 }, { portions: 1.5 }]);
  const entry = await insert('nutrition_entries', { dish_id: dish.id, portions: 0.5 });
  await update('nutrition_entries', entry, { portions: 1.5, deleted_at: stamp });
  await update('dishes', dish, { calories_per_portion: 999 });
  const { rows: [snapshot] } = await db.query('SELECT calories_per_portion FROM public.nutrition_entries WHERE id = $1', [entry.id]);
  assert.equal(Number(snapshot.calories_per_portion), 100);
  await rejected(() => db.query('DELETE FROM public.dishes WHERE id = $1', [dish.id]), 'referenced dish deletion is restricted', ['23503']);
  await rejected(() => insert('nutrition_entries', { id: entry.id }), 'nutrition retry cannot duplicate a stable ID');
});

check('laboratory submission requires completion and snapshots disappear with the matching mark', async () => {
  const subject = await insert('subjects');
  const lab = await insert('lab_works', { subject_id: subject.id, number: 1 });
  await invalidChanges('lab_works', lab, [{ number: 0 }, { passed_at: stamp }, { done_awarded_xp: 1 }, { passed_awarded_xp: 1 }]);
  await update('lab_works', lab, { done_at: stamp, done_awarded_xp: 2 });
  await update('lab_works', lab, { passed_at: stamp, passed_awarded_xp: 3 });
  await invalidChanges('lab_works', lab, [{ done_at: null, done_awarded_xp: 0 }, { passed_at: null }]);
  await update('lab_works', lab, { passed_at: null, passed_awarded_xp: 0 });
  await update('lab_works', lab, { done_at: null, done_awarded_xp: 0 });
  await rejected(() => insert('lab_works', { subject_id: subject.id, number: 1 }), 'lab numbers are unique within subject');
  await invalidChanges('subjects', subject, [{ closed_awarded_xp: 1 }]);
  await update('subjects', subject, { closed_at: stamp, closed_awarded_xp: 0 });
  await rejected(() => db.query('DELETE FROM public.subjects WHERE id = $1', [subject.id]), 'subject with labs cannot be deleted', ['23503']);
});

check('book progress and completion remain consistent', async () => {
  const book = await insert('books');
  await invalidChanges('books', book, [{ total_units: 0 }, { read_units: -1 }, { read_units: 101 }, { read_units: 100 }, { completed_at: stamp }, { progress_unit: 'hours' }]);
  await update('books', book, { read_units: 100, completed_at: stamp });
  await invalidChanges('books', book, [{ completed_at: null }, { read_units: 99 }]);
  await update('books', book, { read_units: 99, completed_at: null });
});

check('all table updates increment version, preserve creation time, and use the current statement timestamp', async () => {
  await seedEveryTable();
  for (const table of tableNames) {
    const { rows: initial } = await db.query(`SELECT version, created_at FROM public.${table}`);
    assert.ok(initial.every(row => Number(row.version) === 0), `${table} starts at version zero`);
    const { rows: first } = await db.query(`
      UPDATE public.${table} SET version = 900, created_at = '2000-01-01T00:00:00Z', updated_at = '2000-01-01T00:00:00Z'
      RETURNING version, created_at, updated_at = statement_timestamp() AS clock_matches
    `);
    assert.ok(first.every(row => Number(row.version) === 1), `${table} derives version from old row`);
    assert.ok(first.every(row => row.clock_matches), `${table} updated_at is current statement time`);
    assert.deepEqual(first.map(row => row.created_at), initial.map(row => row.created_at), `${table} created_at is immutable`);
    const { rows: second } = await db.query(`UPDATE public.${table} SET version = version RETURNING version`);
    assert.ok(second.every(row => Number(row.version) === 2), `${table} increments on every update`);
  }
});

check('all tables enable RLS and deny both client roles table and helper access', async () => {
  const { rows } = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`);
  assert.equal(rows.length, 18);
  assert.ok(rows.every(row => row.relrowsecurity), 'RLS enabled on every application table');
  for (const role of ['anon', 'authenticated']) {
    for (const table of tableNames) {
      const { rows: [privileges] } = await db.query(`SELECT has_table_privilege($1, $2, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS permitted`, [role, `public.${table}`]);
      assert.equal(privileges.permitted, false, `${role} has no table privileges on ${table}`);
    }
    const { rows: [schema] } = await db.query(`SELECT has_schema_privilege($1, 'limitless_private', 'USAGE') AS permitted`, [role]);
    assert.equal(schema.permitted, false, `${role} cannot use private schema`);
    const { rows: funcs } = await db.query(`SELECT p.oid::regprocedure::text AS name, has_function_privilege($1, p.oid, 'EXECUTE') AS permitted FROM pg_proc p WHERE p.pronamespace = 'limitless_private'::regnamespace`, [role]);
    assert.ok(funcs.length > 0);
    assert.ok(funcs.every(func => !func.permitted), `${role} cannot execute helpers`);
    await db.exec(`SET LOCAL ROLE ${role}`);
    try {
      for (const table of tableNames) await rejected(() => db.query(`SELECT * FROM public.${table}`), `${role} read is denied`, ['42501']);
      await rejected(() => insert('profiles'), `${role} write is denied`, ['42501']);
    } finally { await db.exec('RESET ROLE'); }
  }
});

check('service_role can create, read, and update valid data under RLS', async () => {
  await db.exec('SET LOCAL ROLE service_role');
  try {
    await seedEveryTable();
    for (const table of tableNames) {
      const { rows: [result] } = await db.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
      assert.ok(result.count > 0, `${table} is readable by service_role`);
      await db.query(`UPDATE public.${table} SET version = version`);
    }
    await db.query('DELETE FROM public.knowledge_entries');
  } finally { await db.exec('RESET ROLE'); }
});

async function freshDatabase(run) {
  const isolated = new PGlite();
  try { await isolated.exec(bootstrap); await run(isolated); } finally { await isolated.close(); }
}

async function inventory(connection) {
  const { rows } = await connection.query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'limitless_private') ORDER BY n.nspname, c.relname
  `);
  return rows;
}

test('preflight refuses legacy public tables without modifying old data or objects', { skip: !migration }, async () => {
  await freshDatabase(async connection => {
    await connection.exec(`CREATE TABLE public.daily_tasks (marker text); INSERT INTO public.daily_tasks VALUES ('preserve me')`);
    const before = await inventory(connection);
    await assert.rejects(() => connection.exec(migration), error => error.code === '55000');
    await connection.exec('ROLLBACK');
    assert.deepEqual(await inventory(connection), before);
    assert.deepEqual((await connection.query('SELECT * FROM public.daily_tasks')).rows, [{ marker: 'preserve me' }]);
    assert.equal((await connection.query(`SELECT count(*)::int AS count FROM pg_namespace WHERE nspname = 'limitless_private'`)).rows[0].count, 0);
  });
});

test('preflight refuses an existing helper schema and preserves its functions', { skip: !migration }, async () => {
  await freshDatabase(async connection => {
    await connection.exec(`CREATE SCHEMA limitless_private; CREATE FUNCTION limitless_private.keep_me() RETURNS text LANGUAGE sql AS $$ SELECT 'preserve me'::text $$`);
    await assert.rejects(() => connection.exec(migration), error => error.code === '55000');
    await connection.exec('ROLLBACK');
    assert.deepEqual(await inventory(connection), []);
    assert.deepEqual((await connection.query('SELECT limitless_private.keep_me() AS marker')).rows, [{ marker: 'preserve me' }]);
  });
});

test('a late migration error rolls the whole installation back', { skip: !migration }, async () => {
  await freshDatabase(async connection => {
    assert.match(migration, /\bCOMMIT\s*;\s*$/i, 'baseline has an explicit final commit');
    const brokenMigration = migration.replace(/\bCOMMIT\s*;\s*$/i, 'SELECT 1 / 0; COMMIT;');
    await assert.rejects(() => connection.exec(brokenMigration), error => error.code === '22012');
    await connection.exec('ROLLBACK');
    assert.deepEqual(await inventory(connection), []);
    assert.equal((await connection.query(`SELECT count(*)::int AS count FROM pg_namespace WHERE nspname = 'limitless_private'`)).rows[0].count, 0);
  });
});

test('a second migration application fails without changing existing data or metadata', { skip: !migration }, async () => {
  await freshDatabase(async connection => {
    await connection.exec(migration);
    await connection.exec(`INSERT INTO public.profiles (id, name, timezone, training_days, study_days) VALUES (1, 'Preserve me', 'Europe/Moscow', '{}', '{}')`);
    const before = await inventory(connection);
    const profile = (await connection.query('SELECT * FROM public.profiles')).rows;
    await assert.rejects(() => connection.exec(migration), error => error.code === '55000');
    await connection.exec('ROLLBACK');
    assert.deepEqual(await inventory(connection), before);
    assert.deepEqual((await connection.query('SELECT * FROM public.profiles')).rows, profile);
  });
});
