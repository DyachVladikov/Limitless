import type { GameContext, Input, Row } from '../core/types';
import { update } from '../core/sql';
import { boolean, expectVersion, only, uuid } from '../core/validation';
import { conflict, rowById } from '../core/inputs';
import { BALANCE } from '../config/balance';
import { applyEffect } from '../game/effects';

export async function setLabDone(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'done']);
  const lab = await rowById(ctx, 'lab_works', uuid(params.id));
  expectVersion(lab, body.version);
  const done = boolean(body.done, 'done');
  if (Boolean(lab.done_at) === done) {
    return lab;
  }
  if (!done && lab.passed_at) {
    conflict('Undo passing before undoing completion');
  }

  if (done) {
    const reward = await applyEffect(ctx, BALANCE.study.labDone);
    return update(
      ctx.db,
      'lab_works',
      { id: lab.id },
      {
        done_at: ctx.now,
        done_awarded_xp: String(reward.xp),
      },
    );
  }

  await applyEffect(ctx, { xp: lab.done_awarded_xp, stats: {} }, -1);
  return update(
    ctx.db,
    'lab_works',
    { id: lab.id },
    {
      done_at: null,
      done_awarded_xp: '0.00',
    },
  );
}

export async function setLabPassed(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'passed']);
  const lab = await rowById(ctx, 'lab_works', uuid(params.id));
  expectVersion(lab, body.version);
  const passed = boolean(body.passed, 'passed');
  if (Boolean(lab.passed_at) === passed) {
    return lab;
  }
  if (passed && !lab.done_at) {
    conflict('Mark the lab done before marking it passed');
  }

  if (passed) {
    const reward = await applyEffect(ctx, BALANCE.study.labPassed);
    return update(
      ctx.db,
      'lab_works',
      { id: lab.id },
      {
        passed_at: ctx.now,
        passed_awarded_xp: String(reward.xp),
      },
    );
  }

  await applyEffect(ctx, { xp: lab.passed_awarded_xp, stats: {} }, -1);
  return update(
    ctx.db,
    'lab_works',
    { id: lab.id },
    {
      passed_at: null,
      passed_awarded_xp: '0.00',
    },
  );
}
