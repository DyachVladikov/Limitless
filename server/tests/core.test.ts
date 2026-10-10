import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cents, amount } from '../core/money';
import { date, integer, version, only, uuid } from '../core/validation';
import { moscowDate, addDays, weekday, inPeriods } from '../core/dates';

test('money converts exact decimal inputs without float accumulation or silent rounding', () => {
  assert.equal(cents('0.10') + cents('0.20'), 30);
  assert.equal(cents('999999999999.99'), 99999999999999);
  assert.equal(amount(-1), '-0.01');
  assert.equal(amount(30), '0.30');
  for (const value of ['0.001', 'NaN', 'Infinity', '1e3', '', null, {}, '1000000000000.00']) {
    assert.throws(() => cents(value));
  }
});
test('validation rejects ambiguous inputs and stale/unsafe versions', () => {
  assert.equal(integer(0, 'count'), 0);
  assert.throws(() => integer('1', 'count'));
  assert.throws(() => integer(1.2, 'count'));
  assert.equal(version('9223372036854775807'), '9223372036854775807');
  for (const value of [-1, 0.5, '01', '9223372036854775808', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => version(value));
  assert.throws(() => only({ totalExp: 100 }, ['name']));
  assert.throws(() => uuid('not-a-uuid'));
});
test('calendar handles Moscow midnight, leap dates, and inclusive periods', () => {
  assert.equal(moscowDate('2026-10-10T20:59:59Z'), '2026-10-10');
  assert.equal(moscowDate('2026-10-10T21:00:00Z'), '2026-10-11');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(weekday('2026-10-12'), 1);
  for (const value of ['2026-02-29', '2026-13-01', 'infinity', '2026-1-1']) assert.throws(() => date(value));
  assert.equal(inPeriods([{ startDate: '2026-10-10', endDate: '2026-10-12' }], '2026-10-12'), true);
  assert.equal(inPeriods([], '2026-10-12'), false);
});
