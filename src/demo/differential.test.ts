// DIFFERENTIAL test: scripted point sequences through the legacy demo scorer
// (score.nextScore) vs the adapter + real CourtGuard (commitPoint). Every step
// must agree, or the exact divergence is asserted with its reason below.
//
// Known divergences (engine is authority; store preserves legacy UX around them):
//   D1 No-Ad 40-40 without a receiver side: legacy returns null (the touch UI
//      forces a receiver-side choice first); the engine has no receiverSide
//      and accepts. store.awardPoint keeps the gate before calling the engine.
//   D2 Deciding match-tiebreak completion: legacy appends the MTB points as a
//      third set (e.g. [11,9]); the engine records a distinct phase with no
//      third set (guard.test.ts: "no third set recorded").
//   D3 Set-tiebreak match completion: legacy keeps the final games (7-6); the
//      engine resets games to 0-0 on a deciding tiebreak win.
//   D4 Match-winning game in a full set: legacy appends the final set to sets;
//      the engine keeps the final set in `games` and never pushes it
//      (guard.ts: "Match-winning game keeps the final set in `games`").
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMatch } from './fixtures';
import { freshScore, labels, nextScore } from './score';
import { commitPoint } from './guard-adapter';
import type { Match, Team } from './types';

function stepBoth(legacy: Match, live: Match, team: Team) {
  const s = nextScore(legacy, team);
  assert.ok(s, 'legacy scorer must accept this point');
  legacy.score = s;
  if (s.winner !== null) legacy.phase = 'complete';
  const c = commitPoint(live, 'c1', team);
  assert.equal(c.accepted, true, `engine rejected: ${c.reason}`);
  live.score = c.score!;
  if (c.score!.winner !== null) live.phase = 'complete';
  assert.deepEqual(live.score, legacy.score);
  assert.deepEqual(labels(live.score), labels(legacy.score));
}

test('full deciding set M101 agrees to deuce; the winner differs only by D4', () => {
  const legacy = initialMatch(1);
  const live = initialMatch(1);
  for (const winner of [0, 1, 0, 1, 0, 1] as const) stepBoth(legacy, live, winner);
  assert.deepEqual(labels(live.score), ['40', '40']);
  legacy.receiverSide = 'ad';
  live.receiverSide = 'ad';
  const s = nextScore(legacy, 0);
  assert.ok(s);
  legacy.score = s;
  legacy.phase = 'complete';
  const c = commitPoint(live, 'c1', 0);
  assert.equal(c.accepted, true);
  live.score = c.score!;
  live.phase = 'complete';
  assert.equal(live.score.winner, 0);
  assert.deepEqual(live.score.points, [0, 0]);
  assert.deepEqual(live.score.games, [6, 4]);
  assert.equal(live.score.serviceGame, legacy.score.serviceGame);
  assert.deepEqual(legacy.score.sets, [[6, 4], [4, 6], [6, 4]]);
  assert.deepEqual(live.score.sets, [[6, 4], [4, 6]]);
});

test('advantage doubles play a full set plus tiebreak identically (60+ points)', () => {
  const base = initialMatch(2);
  base.score = freshScore();
  const legacy = structuredClone(base);
  const live = structuredClone(base);
  for (let g = 0; g < 12; g++) for (let p = 0; p < 4; p++) stepBoth(legacy, live, (g % 2) as Team);
  assert.equal(live.score.tieBreak, true);
  for (let p = 0; p < 5; p++) {
    stepBoth(legacy, live, 0);
    stepBoth(legacy, live, 1);
  }
  stepBoth(legacy, live, 0);
  stepBoth(legacy, live, 0);
  assert.deepEqual(live.score.sets, [[7, 6]]);
  assert.equal(live.score.winner, null);
  stepBoth(legacy, live, 1);
  stepBoth(legacy, live, 1);
});

test('D1: No-Ad 40-40 without receiver side — legacy null, engine accepts', () => {
  const legacy = initialMatch(1);
  const live = initialMatch(1);
  for (const winner of [0, 1, 0, 1, 0, 1] as const) stepBoth(legacy, live, winner);
  assert.equal(nextScore(legacy, 0), null);
  const c = commitPoint(live, 'c1', 0);
  assert.equal(c.accepted, true);
});

test('D2: deciding match-tiebreak completion differs only in the recorded sets', () => {
  const base = initialMatch(2);
  base.rules.deciding = 'tiebreak';
  base.score.sets = [[6, 4], [4, 6]];
  base.score.matchTieBreak = true;
  base.score.points = [9, 9];
  const legacy = structuredClone(base);
  const live = structuredClone(base);
  for (const team of [0, 0] as const) {
    const s = nextScore(legacy, team);
    assert.ok(s);
    legacy.score = s;
    const c = commitPoint(live, 'c1', team);
    assert.equal(c.accepted, true);
    live.score = c.score!;
  }
  assert.equal(legacy.score.winner, 0);
  assert.equal(live.score.winner, 0);
  assert.deepEqual(live.score.points, legacy.score.points);
  assert.deepEqual(legacy.score.sets, [[6, 4], [4, 6], [11, 9]]);
  assert.deepEqual(live.score.sets, [[6, 4], [4, 6]]);
});

test('D3: set-tiebreak match completion differs only in the kept games', () => {
  const base = initialMatch(2);
  base.score.sets = [[6, 4]];
  base.score.games = [6, 6];
  base.score.tieBreak = true;
  base.score.points = [6, 6];
  const legacy = structuredClone(base);
  const live = structuredClone(base);
  for (const team of [0, 0] as const) {
    const s = nextScore(legacy, team);
    assert.ok(s);
    legacy.score = s;
    if (s.winner !== null) legacy.phase = 'complete';
    const c = commitPoint(live, 'c1', team);
    assert.equal(c.accepted, true);
    live.score = c.score!;
    if (c.score!.winner !== null) live.phase = 'complete';
  }
  assert.equal(legacy.score.winner, 0);
  assert.equal(live.score.winner, 0);
  assert.deepEqual(legacy.score.sets, live.score.sets);
  assert.deepEqual(legacy.score.games, [7, 6]);
  assert.deepEqual(live.score.games, [0, 0]);
});
