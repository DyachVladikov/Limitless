import type { GameContext, Input, Row } from '../core/types';
import { all, insert, one, update } from '../core/sql';
import { boolean, expectVersion, integer, only, text, uuid } from '../core/validation';
import { conflict, rowById, sameValues } from '../core/inputs';
import { BALANCE } from '../config/balance';
import { applyEffect } from '../game/effects';

async function subjectView(ctx: GameContext, subject: Row): Promise<Row> {
  const labs = await all(ctx.db, 'SELECT * FROM lab_works WHERE subject_id = $1 ORDER BY number', [
    subject.id,
  ]);
  return { ...subject, labs };
}

export async function listSubjects(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const includeArchived = query.get('includeArchived') === 'true';
  return all(
    ctx.db,
    `
    SELECT s.*,
      (SELECT COUNT(*)::integer FROM lab_works l WHERE l.subject_id = s.id) AS lab_count
    FROM subjects s
    WHERE ($1::boolean OR NOT s.is_archived)
    ORDER BY s.created_at, s.id
  `,
    [includeArchived],
  );
}

export async function getSubject(ctx: GameContext, { params }: Input): Promise<Row> {
  const subject = await rowById(ctx, 'subjects', uuid(params.id));
  return subjectView(ctx, subject);
}

export async function createSubject(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', 'name', 'labCount']);
  const id = uuid(body.id);
  const name = text(body.name, 'name');
  const labCount = integer(body.labCount, 'labCount', 0, 500);
  const existing = await one(ctx.db, 'SELECT * FROM subjects WHERE id = $1', [id]);

  if (existing) {
    sameValues(existing, { name });
    const subject = await subjectView(ctx, existing);
    if (subject.labs.length !== labCount) {
      conflict('This subject ID has a different number of labs');
    }
    return subject;
  }

  const subject = await insert(ctx.db, 'subjects', { id, name });
  await ctx.db.query(
    `
    INSERT INTO lab_works(subject_id, number)
    SELECT $1, number FROM generate_series(1, $2::integer) number
  `,
    [id, labCount],
  );
  return subjectView(ctx, subject);
}

export async function updateSubject(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'name', 'isArchived']);
  const subject = await rowById(ctx, 'subjects', uuid(params.id));
  expectVersion(subject, body.version);

  const patch: Row = {};
  if (body.name !== undefined) {
    patch.name = text(body.name, 'name');
  }
  if (body.isArchived !== undefined) {
    patch.is_archived = boolean(body.isArchived, 'isArchived');
  }
  if (Object.keys(patch).length === 0) {
    return subject;
  }
  return update(ctx.db, 'subjects', { id: subject.id }, patch);
}

export async function archiveSubject(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version']);
  const subject = await rowById(ctx, 'subjects', uuid(params.id));
  expectVersion(subject, body.version);
  return update(ctx.db, 'subjects', { id: subject.id }, { is_archived: true });
}

export async function setSubjectClosed(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'closed']);
  const subject = await rowById(ctx, 'subjects', uuid(params.id));
  expectVersion(subject, body.version);
  const closed = boolean(body.closed, 'closed');
  if (Boolean(subject.closed_at) === closed) {
    return subject;
  }

  if (closed) {
    // Предмет закрывается вручную; состояние лабораторных этого не ограничивает.
    const reward = await applyEffect(ctx, BALANCE.study.subjectClosed);
    return update(
      ctx.db,
      'subjects',
      { id: subject.id },
      {
        closed_at: ctx.now,
        closed_awarded_xp: String(reward.xp),
      },
    );
  }

  // Отмена вычитает сохранённую награду, даже если баланс с тех пор изменился.
  await applyEffect(ctx, { xp: subject.closed_awarded_xp, stats: {} }, -1);
  return update(
    ctx.db,
    'subjects',
    { id: subject.id },
    {
      closed_at: null,
      closed_awarded_xp: '0.00',
    },
  );
}
