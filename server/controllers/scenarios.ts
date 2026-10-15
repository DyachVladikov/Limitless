import type { GameContext, Input, Row } from '../core/types';
import { one, update } from '../core/sql';
import { boolean, expectVersion, integer, only, optionalText, text, uuid } from '../core/validation';
import { conflict, counter, invalid, rowById } from '../core/inputs';
import { addDays } from '../core/dates';
import { amount, cents } from '../core/money';
import { applyEffect } from '../game/effects';
import { scenarioView } from './scenarios/view';

async function currentScenario(ctx: GameContext): Promise<Row | undefined> {
  return one(ctx.db, 'SELECT * FROM scenarios WHERE attempt_id IS NOT NULL');
}

export async function getCurrentScenario(ctx: GameContext): Promise<Row | null> {
  const current = await currentScenario(ctx);
  return scenarioView(current);
}

export async function drawScenario(ctx: GameContext, { body }: Input): Promise<Row | null> {
  only(body, ['attemptId', 'expectedPreviousAttemptId', 'version']);
  const attemptId = uuid(body.attemptId, 'attemptId');
  const current = await currentScenario(ctx);
  if (current?.attempt_id === attemptId) {
    return scenarioView(current);
  }

  const previousId =
    body.expectedPreviousAttemptId === null
      ? null
      : uuid(body.expectedPreviousAttemptId, 'expectedPreviousAttemptId');
  if (previousId !== (current?.attempt_id ?? null)) {
    conflict('The current assignment changed; reload before drawing again');
  }
  if (current) {
    expectVersion(current, body.version);
    if (!current.completed_at) {
      conflict('Score the current scenario before drawing the next one');
    }
  }

  const selected = await one(
    ctx.db,
    `
    SELECT * FROM scenarios
    WHERE is_enabled AND (next_available_on IS NULL OR next_available_on <= $1)
    ORDER BY random() LIMIT 1
  `,
    [ctx.today],
  );
  if (!selected) {
    return { available: false, current: scenarioView(current) };
  }

  if (current) {
    await update(
      ctx.db,
      'scenarios',
      { id: current.id },
      {
        attempt_id: null,
        issued_at: null,
        assigned_content: null,
        user_answer: null,
        answer_submitted_at: null,
        self_score: null,
        completed_at: null,
        awarded_xp: '0.00',
      },
    );
  }

  const assigned = await update(
    ctx.db,
    'scenarios',
    { id: selected.id },
    {
      attempt_id: attemptId,
      issued_at: ctx.now,
      assigned_content: {
        title: selected.title,
        prompt: selected.prompt,
        referenceAnswer: selected.reference_answer,
        rewardXp: Number(selected.reward_xp),
      },
      user_answer: null,
      answer_submitted_at: null,
      self_score: null,
      completed_at: null,
      awarded_xp: '0.00',
      next_available_on: addDays(ctx.today, selected.cooldown_days),
    },
  );
  return scenarioView(assigned);
}

export async function saveScenarioAnswer(ctx: GameContext, { body, params }: Input): Promise<Row | null> {
  only(body, ['version', 'attemptId', 'userAnswer', 'submit']);
  const scenario = await rowById(ctx, 'scenarios', uuid(params.id));
  expectVersion(scenario, body.version);
  if (scenario.attempt_id !== uuid(body.attemptId, 'attemptId')) {
    conflict('This scenario attempt is no longer current');
  }
  if (scenario.answer_submitted_at) {
    conflict('A submitted answer cannot be changed');
  }

  const submit = boolean(body.submit === undefined ? false : body.submit, 'submit');
  if (typeof body.userAnswer !== 'string') {
    invalid('userAnswer must be a string');
  }
  const answer = submit
    ? text(body.userAnswer, 'userAnswer', 20000)
    : optionalText(body.userAnswer, 'userAnswer', 20000);
  const saved = await update(
    ctx.db,
    'scenarios',
    { id: scenario.id },
    {
      user_answer: answer,
      answer_submitted_at: submit ? ctx.now : null,
    },
  );
  return scenarioView(saved);
}

export async function scoreScenario(ctx: GameContext, { body, params }: Input): Promise<Row | null> {
  only(body, ['version', 'attemptId', 'selfScore']);
  const scenario = await rowById(ctx, 'scenarios', uuid(params.id));
  expectVersion(scenario, body.version);
  if (scenario.attempt_id !== uuid(body.attemptId, 'attemptId')) {
    conflict('This scenario attempt is no longer current');
  }

  const score = integer(body.selfScore, 'selfScore', 0, 100);
  if (![0, 25, 50, 75, 100].includes(score)) {
    invalid('selfScore must be 0, 25, 50, 75 or 100');
  }
  if (!scenario.answer_submitted_at) {
    conflict('Submit a nonempty answer before scoring');
  }
  if (scenario.completed_at) {
    if (scenario.self_score !== score) {
      conflict('A completed scenario score cannot be changed');
    }
    return scenarioView(scenario);
  }

  // Награда берётся из снимка выдачи и округляется вниз до сотых.
  const promisedXp = amount(Math.floor((cents(scenario.assigned_content.rewardXp) * score) / 100));
  const reward = await applyEffect(ctx, { xp: promisedXp, stats: {} });
  await counter(ctx, 'scenarios_completed');
  const completed = await update(
    ctx.db,
    'scenarios',
    { id: scenario.id },
    {
      self_score: score,
      completed_at: ctx.now,
      awarded_xp: String(reward.xp),
    },
  );
  return scenarioView(completed);
}
