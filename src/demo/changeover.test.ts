import test from 'node:test';
import assert from 'node:assert/strict';
import { timeCallDue } from './changeover';

test('a 90-second rest calls Time at 80 seconds, once per display', () => {
  const end = 90_000;
  assert.equal(timeCallDue(end, 79_999, null), false);
  assert.equal(timeCallDue(end, 80_000, null), true);
  assert.equal(timeCallDue(end, 80_250, end), false);
  assert.equal(timeCallDue(end, 80_250, null), true, 'another display has its own audio delivery');
  assert.equal(timeCallDue(end, 89_999, null), true, 'a delayed timer can still call during the warning window');
  assert.equal(timeCallDue(end, 90_000, null), false, 'never play a stale rest alert');
  assert.equal(timeCallDue(null, 80_000, null), false);
  assert.equal(timeCallDue(150_000, 140_000, end), true, 'the next rest gets a new call');
  assert.equal(timeCallDue(60_000, 50_000, null), true, '60-second rests also warn ten seconds before play');
});
