// Store seam over the real engine (browser seams stubbed; no server, so the
// preview behaves exactly as before: local scoring, no emits).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as unknown as { window: unknown }).window = { addEventListener() {} };
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, String(v));
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
};

const store = await import('./store.ts');
import { labels } from './score';

beforeEach(() => store.resetDemo(false));

test('touch awards route through CourtGuard and record the point', () => {
  store.awardPoint(2, 0);
  const c = store.getState().courts[1];
  assert.deepEqual(c.match.score.points, [1, 0]);
  assert.deepEqual(labels(c.match.score), ['15', '0']);
  assert.equal(c.events.at(-1)?.kind, 'point');
  assert.equal(c.decision.type, 'accepted');
});

test('points during a dispute are blocked with the engine reason', () => {
  store.awardPoint(2, 0);
  store.dispute(2);
  assert.equal(store.getState().courts[1].match.phase, 'dispute');
  store.awardPoint(2, 0);
  const c = store.getState().courts[1];
  assert.deepEqual(c.match.score.points, [1, 0]);
  assert.equal(c.decision.type, 'blocked');
  assert.ok(c.decision.detail.includes('DISPUTE_FROZEN'));
  assert.equal(c.events.at(-1)?.kind, 'blocked');
});

test('dispute restore returns to the prior accepted score and resumes', () => {
  store.awardPoint(2, 0);
  store.awardPoint(2, 1);
  store.dispute(2);
  const target = store.getState().courts[1].events.find((e) => e.kind === 'point')!;
  store.restoreEvent(2, target.id);
  const c = store.getState().courts[1];
  assert.equal(c.match.phase, 'playing');
  assert.deepEqual(c.match.score.points, [1, 0]);
  assert.equal(c.events.at(-1)?.kind, 'resumed');
});

test('M101 finishes through the engine and records the result', () => {
  for (const winner of [0, 1, 0, 1, 0, 1] as const) store.awardPoint(1, winner);
  store.selectReceiver(1, 'ad');
  store.awardPoint(1, 0);
  const c = store.getState().courts[0];
  assert.equal(c.match.phase, 'complete');
  assert.equal(c.match.score.winner, 0);
  assert.ok(store.getState().lastResult?.startsWith('Roy / Chen'));
  store.resetDemo(false);
});

test('undo restores the previous score and retains history', () => {
  store.awardPoint(2, 0);
  store.awardPoint(2, 1);
  store.undoPoint(2);
  const c = store.getState().courts[1];
  assert.deepEqual(c.match.score.points, [1, 0]);
  assert.equal(c.match.phase, 'playing');
  const last = c.events.at(-1)!;
  assert.equal(last.kind, 'correction');
  assert.ok(last.reverts);
  assert.equal(c.events.filter((e) => e.kind === 'point').length, 2);
});

test('publishRules versions upcoming without touching live matches', () => {
  store.publishRules({ noAd: true, deciding: 'tiebreak', changeover: 60 });
  const s = store.getState();
  assert.equal(s.upcomingRules.version, 2);
  assert.ok(s.courts.every((c) => c.match.rules.version === 1));
  assert.equal(s.courts[0].events.at(-1)?.kind, 'rules');
});

test('illegal score calls block without mutation', () => {
  const before = structuredClone(store.getState().courts[1].match.score);
  store.submitCall(2, 'Thirty-love');
  const c = store.getState().courts[1];
  assert.equal(c.decision.type, 'blocked');
  assert.deepEqual(c.match.score, before);
});
