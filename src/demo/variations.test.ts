import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMatch, initialState, initialUpcoming } from './fixtures';
import { breakAfter, paceRules, serviceOrder, validateMatch } from './matchConfig';
import { freshScore, nextScore, receiverName, serverName } from './score';
import { optimize, resolvedMatch, scheduleState } from './optimizer';
import { ballAt, makeRally } from './rallies';
import type { Match } from './types';

for (const format of ['Singles', 'Doubles', 'Mixed doubles'] as const) {
  test(`${format}: service order survives games, tiebreaks, and rollback snapshots`, () => {
    const match = initialMatch(2); match.format = format;
    match.teams = format === 'Singles' ? [['A'], ['B']] : [['A1', 'A2'], ['B1', 'B2']];
    match.serverOrder = serviceOrder(match.teams); match.firstServer = 0; match.score = freshScore();
    validateMatch(match);
    for (let game = 0; game < 4; game++) {
      assert.equal(serverName(match), match.serverOrder[game % match.serverOrder.length]);
      for (let point = 0; point < 4; point++) match.score = nextScore(match, 0)!;
    }
    match.score = { ...freshScore(), games: [6, 6], tieBreak: true };
    const snapshot = structuredClone(match.score);
    for (let point = 0; point < 7; point++) {
      const turn = point === 0 ? 0 : Math.floor((point - 1) / 2) + 1;
      assert.equal(serverName(match), match.serverOrder[turn % match.serverOrder.length]);
      match.score = nextScore(match, 0)!;
    }
    assert.equal(match.score.tieBreak, false);
    assert.equal(serverName(match), match.serverOrder[1], 'the next set starts with the other team');
    match.score = snapshot;
    assert.equal(serverName(match), match.serverOrder[0], 'restoring the score restores service rotation');
    assert.equal(receiverName(match), match.teams[1][0]);
  });
}

test('invalid roster and same-team service turns are rejected', () => {
  const match = initialMatch(1); match.format = 'Singles';
  assert.throws(() => validateMatch(match), /distinct players/);
  match.format = 'Doubles'; match.serverOrder = match.teams.flat();
  assert.throws(() => validateMatch(match), /alternate teams/);
});

test('Express skips all scheduled rests; Standard keeps set and changeover timing separate', () => {
  const match = initialMatch(2); match.score = { ...freshScore(), games: [2, 0], points: [3, 0] };
  const thirdGame = nextScore(match, 0)!;
  assert.equal(breakAfter(match, thirdGame), 90);
  match.score = { ...freshScore(), games: [5, 0], points: [3, 0] };
  const set = nextScore(match, 0)!;
  assert.equal(breakAfter(match, set), 120);
  match.rules = paceRules(match.rules, 'Express');
  assert.equal(breakAfter(match, set), 0);
  assert.equal(match.rules.matchRest, 0);
  assert.equal(match.rules.deciding, 'tiebreak');
  assert.equal(match.rules.noAd, true);
});

test('shared players cannot overlap across singles and doubles, including zero rest', () => {
  const jobs = [
    { id: 'S', label: 'Singles', players: ['A', 'B'], duration: 10, rest: 0, dependencies: [] },
    { id: 'D', label: 'Doubles', players: ['A', 'C', 'D', 'E'], duration: 20, rest: 0, dependencies: [] },
  ];
  for (const plan of optimize(jobs, [])) {
    const [a, b] = plan.items;
    assert.ok(b.start >= a.end);
    assert.equal(plan.finish, 30);
  }
  jobs[1].rest = 5;
  const firstSingles = optimize(jobs, []).find(p => p.firstMatch === 'S')!;
  assert.equal(firstSingles.items.find(i => i.match === 'D')!.start, 15);
});

test('duration changes can reverse the selected first assignment', () => {
  const jobs = [
    { id: 'M103', label: 'Semi', players: ['A', 'B'], duration: 20, rest: 0, dependencies: [] },
    { id: 'M104', label: 'Consolation', players: ['C', 'D'], duration: 10, rest: 0, dependencies: [] },
    { id: 'M105', label: 'Final', players: ['A', 'B', 'E', 'F'], duration: 20, rest: 10, dependencies: ['M103', 'M102'] },
  ];
  const occupied = [{ match: 'M102', label: 'Other semi', court: 2 as const, end: 5, players: ['E', 'F'] }];
  assert.equal(optimize(jobs, occupied)[0].firstMatch, 'M103');
  jobs[1].duration = 60;
  assert.equal(optimize(jobs, occupied)[0].firstMatch, 'M104');
});

test('finals stay projections until winners resolve and all players finish recovery', () => {
  const state = initialState(); const final = state.upcomingMatches[2];
  final.rules = { ...final.rules, pace: 'Standard', matchRest: 10 };
  assert.equal(resolvedMatch(state, final), null);
  const now = 1000000;
  for (const match of [state.upcomingMatches[0], state.courts[1].match]) {
    const finished = structuredClone(match); finished.score.winner = 0; finished.phase = 'complete';
    state.completedMatches.push({ match: finished, finishedAt: now });
  }
  state.courts.forEach(c => { c.match.phase = 'complete'; });
  assert.deepEqual(resolvedMatch(state, final)!.teams, [state.upcomingMatches[0].teams[0], state.courts[1].match.teams[0]]);
  const plan = scheduleState(state, now)[0];
  assert.ok(plan.items.find(i => i.match === final.id)!.start >= 10);
  final.rules = paceRules(final.rules, 'Express');
  assert.equal(scheduleState(state, now)[0].items.find(i => i.match === final.id)!.start, 0);
});

test('singles animation only uses the two roster slots', () => {
  for (let i = 0; i < 4; i++) for (const winner of [0, 1] as const) for (const server of [0, 2]) {
    const rally = makeRally(i, server, server === 0 ? 2 : 0, false, winner, true);
    assert.ok(rally.contacts.every(c => c.player === 0 || c.player === 2));
    assert.equal(rally.contacts[0].player, server);
    for (let time = 0; time <= rally.end; time += 0.02) assert.ok(Math.abs(ballAt(rally, time)[0]) <= 4.115, 'singles shots stay inside the singles sidelines');
  }
});

test('the featured scenario saves forty minutes against the best semifinal-first continuation', () => {
  const state = initialState(); state.courts[0].match.phase = 'complete';
  const plans = scheduleState(state);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].firstMatch, 'M104');
  assert.equal(plans[0].finish, 120);
  assert.equal(plans[1].finish, 160);
  assert.equal((plans[1].finish - plans[0].finish) / plans[1].finish, 0.25);
  assert.deepEqual(plans[0].items.find(i => i.match === 'M104'), { match: 'M104', label: 'Singles consolation', court: 1, start: 0, end: 120, projected: true });
  assert.equal(plans[0].items.find(i => i.match === 'M103')!.court, 2);
  assert.equal(plans[0].items.find(i => i.match === 'M105')!.court, 2);
  for (const plan of plans) {
    for (const court of [1, 2]) {
      const items = plan.items.filter(i => i.court === court).sort((a, b) => a.start - b.start);
      for (let i = 1; i < items.length; i++) assert.ok(items[i].start >= items[i - 1].end);
    }
    const final = plan.items.find(i => i.match === 'M105')!;
    for (const semi of ['M102', 'M103']) assert.ok(final.start >= plan.items.find(i => i.match === semi)!.end);
  }
});

test('the live scenario commits singles, preserves the savings comparison, and waits without playing', async (t) => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {} } });
  const store = await import('./store');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    store.resetDemo();
    store.submitCall(1, 'Forty-love');
    assert.deepEqual(store.getState().courts[1].match.score.points, [3, 2], 'rejected calls cannot trigger the dispute');
    store.awardPoint(1, 0);
    assert.equal(store.getState().courts[1].match.phase, 'dispute');
    store.restoreEvent(2, 'M102-opening-score');
    for (const team of [1, 0, 1, 0, 1] as const) store.awardPoint(1, team);
    store.selectReceiver(1, 'deuce'); store.awardPoint(1, 0);
    t.mock.timers.tick(1200);
    t.mock.timers.tick(3500);
    const state = store.getState();
    assert.equal(state.courts[0].match.id, 'M104');
    assert.equal(state.courts[0].match.format, 'Singles');
    assert.equal(state.courts[0].match.teams.flat().length, 2);
    assert.deepEqual(state.optimizationDecision!.options.map(p => p.finish), [120, 160]);
    const decision = structuredClone(state.optimizationDecision);
    for (let tick = 0; tick < 10; tick++) store.tickRallies();
    assert.equal(store.getState().courts[0].match.phase, 'warmup');
    assert.equal(store.getState().courts[0].rallyStartedAt, null);
    assert.deepEqual(store.getState().courts[0].match.score.points, [0, 0]);
    assert.deepEqual(store.getState().optimizationDecision, decision);
    t.mock.timers.tick(0);
    assert.deepEqual(JSON.parse(memory.get('courtos.frontend-preview.v2')!).optimizationDecision, decision);
  } finally { store.resetDemo(); t.mock.timers.tick(0); }
});

test('configuration persists, active rules remain pinned, and zero rest never starts a timer', async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {} } });
  const store = await import('./store');
  const active = structuredClone(store.getState().courts[0].match);
  const match: Match = initialUpcoming()[1]; match.rules = paceRules(match.rules, 'Express');
  store.configureMatch(match);
  assert.deepEqual(store.getState().courts[0].match, active);
  assert.equal(store.getState().upcomingMatches[1].rules.pace, 'Express');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(JSON.parse(memory.values().next().value!).upcomingMatches[1].rules.pace, 'Express');
  store.startChangeover(1, 0);
  assert.equal(store.getState().courts[0].match.phase, 'playing');
  assert.equal(store.getState().courts[0].changeoverEndsAt, null);
  assert.throws(() => store.configureMatch(active), /Assigned matches/);
  match.rules.estimatedMinutes = 60;
  store.configureMatch(match);
  for (const team of [0, 1, 0, 1, 0, 1] as const) store.awardPoint(1, team);
  store.selectReceiver(1, 'deuce'); store.awardPoint(1, 0);
  const revision = store.getState().revision;
  assert.equal(store.assignReadyMatch(revision - 1), false, 'stale assignments cannot commit');
  assert.equal(store.assignReadyMatch(revision), true);
  assert.equal(store.getState().courts[0].match.id, 'M104', 'commit follows the winning plan rather than always assigning the semifinal');
  store.beginWarmupMatch(1);
  for (let point = 0; point < 12; point++) store.awardPoint(1, 0);
  store.startChangeover(1);
  assert.equal(store.getState().courts[0].match.score.games[0], 3);
  assert.equal(store.getState().courts[0].match.phase, 'playing');
  assert.equal(store.getState().courts[0].changeoverEndsAt, null);
  store.resetDemo();
});
