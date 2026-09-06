import test from 'node:test';
import assert from 'node:assert/strict';
import { ballAt, makeRally, rallyDuration, RALLY_WINNERS } from './rallies';
import { serverTeam } from './score';

test('scripted rallies land on the racket, clear the net and finish within five seconds', () => {
  assert.deepEqual(RALLY_WINNERS, [0, 1, 0, 1, 0, 1, 0]);
  for (let i = 0; i < 7; i++) for (const server of [0, 1, 2, 3]) {
    const rally = makeRally(i, server, server < 2 ? 2 : 0, i % 2 === 1, RALLY_WINNERS[i]);
    assert.ok(rally.end >= 3 && rally.end <= 5);
    assert.equal(rally.contacts.at(-1)!.player < 2 ? 0 : 1, RALLY_WINNERS[i]);
    for (const hit of rally.contacts) {
      assert.deepEqual(ballAt(rally, hit.at), hit.position);
      const before = ballAt(rally, hit.at - 0.00001);
      assert.ok(Math.hypot(...before.map((n, axis) => n - hit.position[axis])) < 0.01, 'ball cannot teleport at contact');
    }
    let previous = ballAt(rally, 0);
    for (let t = 0.01; t < rally.end; t += 0.01) {
      const position = ballAt(rally, t);
      assert.ok(position.every(Number.isFinite) && position[1] >= 0.085);
      if (previous[2] * position[2] < 0) assert.ok(position[1] > 1.02, 'shot must clear the net');
      previous = position;
    }
  }
});

test('demo_flow checkpoints: correction, rejection, local R5, ACK, deuce and completion', async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {} } });
  const store = await import('./store');
  let now = 100000;
  const originalNow = Date.now; Date.now = () => now;
  const court = () => store.getState().courts[0];
  const finish = (id: 1 | 2 = 1) => {
    const c = store.getState().courts[id - 1];
    assert.ok(c.rallyStartedAt);
    now += rallyDuration(c.rallyWinner ?? 0, serverTeam(c.match)) + 10;
    store.tickRallies();
  };
  try {
    store.resetDemo(); store.startRally(1);
    assert.deepEqual(store.getState().courts[1].match.score.points, [3, 2], 'Court 2 opens at 40–30');
    assert.equal(store.unread(store.getState().courts[1]), 0, 'the opening snapshot is not a new-point notification');
    store.awardPoint(1, 0); assert.deepEqual(court().match.score.points, [0, 0]);
    finish(); assert.deepEqual(court().match.score.points, [0, 0], 'animation never scores Court 1');
    store.startRally(1); assert.equal(court().rallyStartedAt, null, 'cannot replay while waiting');
    store.submitCall(1, 'Fifteen-love');
    assert.deepEqual(store.getState().courts[1].match.score.points, [3, 3], 'the first accepted point triggers Court 2 deuce immediately');
    assert.equal(store.getState().courts[1].match.phase, 'dispute');
    assert.ok(store.unread(store.getState().courts[1]) > 0);
    store.startRally(1); assert.equal(court().rallyIndex, 1); finish();
    store.submitCall(1, 'Thirty-love'); store.startRally(1); assert.equal(court().rallyStartedAt, null);
    assert.deepEqual(store.getState().courts[1].match.score.points, [3, 3], 'Court 2 remains frozen while Court 1 continues');
    store.submitCall(1, 'Correction'); store.undoPoint(1); store.startRally(1); assert.equal(court().rallyStartedAt, null, 'undo alone cannot release R3');
    store.awardPoint(1, 1); store.startRally(1); assert.equal(court().rallyIndex, 2); finish();
    store.submitCall(1, 'Thirty-love'); store.startRally(1); assert.equal(court().rallyStartedAt, null);
    assert.deepEqual(court().match.score.points, [1, 1]);
    store.awardPoint(1, 0); store.setOnline(1, false); store.startRally(1); finish();
    store.submitCall(1, 'Thirty-all'); assert.equal(court().rallyIndex, 4); assert.ok(court().rallyStartedAt, 'R5 starts before ACK');
    assert.deepEqual(court().remoteMatch.score.points, [2, 1]);
    finish(); const index = court().rallyIndex;
    store.setOnline(1, true); assert.equal(court().rallyIndex, index); assert.equal(court().rallyStartedAt, null);
    store.submitCall(1, 'Forty-thirty'); store.startRally(1); finish(); store.submitCall(1, 'Deuce');
    store.startRally(1); assert.equal(court().rallyStartedAt, null, 'receiver side is required');
    const disputed = store.getState().courts[1];
    assert.equal(disputed.match.phase, 'dispute');
    assert.deepEqual(disputed.match.score.points, [3, 3], 'Court 2 retains its early dispute');
    assert.ok(store.unread(disputed) > 0, 'Court 2 raises the existing notification');
    store.selectReceiver(1, 'ad'); store.startRally(1); assert.equal(court().rallyStartedAt, null, 'manual override precedes the final rally');
    store.restoreEvent(2, disputed.events.findLast(e => e.kind === 'snapshot' && e.score.points.join() === '3,2')!.id);
    store.startRally(1); assert.equal(court().rallyIndex, 6); finish();
    assert.equal(court().match.phase, 'playing'); store.awardPoint(1, 0); assert.equal(court().match.phase, 'complete');
    assert.deepEqual(court().match.score.sets, [[6, 4], [4, 6], [6, 4]]);
    store.resetDemo(); store.startChangeover(2);
    for (let i = 0; i < 3; i++) { store.awardPoint(1, 0); store.awardPoint(1, 1); }
    assert.deepEqual(store.getState().courts[1].match.score.points, [3, 2], 'an explicitly started sponsor break remains a break');
    store.selectReceiver(1, 'deuce'); store.startRally(1); assert.equal(court().rallyStartedAt, null);
    now += 90000; store.tickChangeover(2);
    for (let i = 0; i < 6; i++) {
      now += 1200; store.tickRallies();
      assert.deepEqual(store.getState().courts[1].match.score.points, [3, 3]);
      assert.equal(store.getState().courts[1].rallyStartedAt, null, 'score progression needs no animation');
      store.tickRallies(); assert.equal(store.getState().courts[1].events.filter(e => e.kind === 'point').length, 1, 'repeated ticks cannot double-score');
    }
    const second = store.getState().courts[1];
    assert.equal(second.match.phase, 'dispute'); assert.deepEqual(second.match.score.points, [3, 3]);
    store.markSeen(2); now += 1200; store.tickRallies();
    assert.equal(store.unread(store.getState().courts[1]), 0, 'the dispute notification is not retriggered');
    const prior = second.events.findLast(e => e.kind === 'snapshot' && e.score.points.join() === '3,2')!;
    store.restoreEvent(2, prior.id); assert.ok(store.getState().courts[1].rallyStartedAt);
    assert.equal(store.getState().courts[1].rallyWinner, 1); finish(2);
    assert.equal(store.getState().courts[1].match.phase, 'playing', 'restored deuce is legal');
  } finally { store.resetDemo(); Date.now = originalNow; }
});
