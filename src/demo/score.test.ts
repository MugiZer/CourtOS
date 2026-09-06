import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMatch } from './fixtures';
import { labels, nextScore, normalizeCall, resolveCall } from './score';
import { compareSchedules } from './schedule';
import type { Match, Team } from './types';

function point(match: Match, winner: Team) { const score = nextScore(match, winner); assert.ok(score); match.score = score; if (score.winner !== null) match.phase = 'complete'; }

test('approved game finishes 6-4, 4-6, 6-4 only after the deciding point is accepted', () => {
  const match = initialMatch(1);
  for (const winner of [0, 1, 0, 1, 0, 1] as const) point(match, winner);
  assert.deepEqual(labels(match.score), ['40', '40']);
  assert.equal(match.score.winner, null);
  assert.equal(nextScore(match, 0), null, 'No-Ad receiver-side choice is required');
  match.receiverSide = 'ad'; point(match, 0);
  assert.equal(match.score.winner, 0);
  assert.deepEqual(match.score.sets, [[6, 4], [4, 6], [6, 4]]);
  assert.equal(nextScore(match, 1), null, 'completed matches reject further points');
});

test('Thirty-love is legal at 15-love, but blocked at 15-all without mutation', () => {
  const match = initialMatch(1); point(match, 0);
  assert.equal(resolveCall(match, 'Thirty-love'), 0);
  point(match, 1);
  const snapshot = structuredClone(match);
  assert.equal(resolveCall(match, 'Thirty-love'), null);
  assert.deepEqual(match, snapshot);
  assert.equal(resolveCall(match, 'Thirty-fifteen'), 0);
  assert.equal(resolveCall(match, 'Fifteen-thirty'), 1);
});

test('advantage doubles at deuce needs a two-point margin', () => {
  const match = initialMatch(2);
  for (let i = 0; i < 3; i++) { point(match, 0); point(match, 1); }
  point(match, 0); assert.deepEqual(labels(match.score), ['AD', '40']);
  point(match, 1); assert.deepEqual(labels(match.score), ['40', '40']);
  assert.equal(match.score.winner, null);
  point(match, 0); point(match, 0);
  assert.equal(match.score.winner, 0);
});

test('a dispute or changeover cannot accept a scoring event', () => {
  const match = initialMatch(2);
  for (const phase of ['dispute', 'changeover', 'warmup'] as const) { match.phase = phase; assert.equal(nextScore(match, 0), null); }
});

test('a ten-point match tiebreak does not end 10-9', () => {
  const match = initialMatch(2); match.score.matchTieBreak = true; match.score.points = [9, 9];
  point(match, 0); assert.equal(match.score.winner, null); assert.deepEqual(labels(match.score), ['10', '9']);
  point(match, 0); assert.equal(match.score.winner, 0);
});

test('a seven-point tiebreak requires a two-point margin', () => {
  const match = initialMatch(2); match.score.games = [6, 6]; match.score.tieBreak = true; match.score.points = [6, 6];
  point(match, 0); assert.equal(match.score.winner, null);
  point(match, 0); assert.equal(match.score.winner, 0); assert.deepEqual(match.score.sets.at(-1), [7, 6]);
});

test('calls normalize the narrow tennis vocabulary', () => {
  assert.equal(normalizeCall('Thirty-all.'), '30 30');
  assert.equal(normalizeCall('Fifteen love'), '15 0');
  assert.equal(normalizeCall('Deuce'), '40 40');
});

test('upcoming rules do not change a started match snapshot', () => {
  const first = initialMatch(1); const second = initialMatch(2);
  first.rules.noAd = false;
  assert.equal(second.rules.noAd, false); assert.equal(initialMatch(1).rules.noAd, true);
});

test('schedule baseline uses Court 2 at minute five, giving 55 vs 50', () => {
  const plans = compareSchedules();
  assert.equal(plans[0].finish, 55);
  assert.equal(plans[1].finish, 50);
  const semi = plans[0].items.find(m => m.match === 'M103')!;
  assert.equal(semi.court, 2); assert.equal(semi.start, 5);
  for (const plan of plans) {
    const final = plan.items.find(m => m.match === 'M105')!;
    const endA = plan.items.find(m => m.match === 'M103')!.end;
    const endB = plan.items.find(m => m.match === 'M102')!.end;
    assert.ok(final.start >= Math.max(endA, endB) + 10);
    for (const court of [1, 2]) {
      const items = plan.items.filter(i => i.court === court).sort((a,b) => a.start - b.start);
      for (let i = 1; i < items.length; i++) assert.ok(items[i].start >= items[i - 1].end);
    }
  }
});

test('changing consolation duration to sixty changes the winning choice', () => {
  const plans = compareSchedules(60);
  assert.deepEqual(plans.map(p => p.finish), [60, 65]);
  assert.equal(plans.reduce((a,b) => a.finish < b.finish ? a : b).first, 'consolation');
});
