// Adapter round-trips: mappings agree with the fixtures and with the real
// push.startMatch, rollbacks gate through SCORE_ROLLBACK, publishes pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMatch, semifinal, standardRules } from './fixtures';
import {
  ackRecord,
  commitDispute,
  commitPoint,
  commitRollback,
  compiledFor,
  confirmAll,
  noteAccepted,
  pendingFor,
  publishDemoRules,
  receiverFromState,
  serverFromState,
  toDefinition,
  toDisplay,
  toMatchState,
} from './guard-adapter';
import { createStore, definitionFromToggles, startMatch } from './courtguard-live.js';

test('toDefinition maps demo rules onto the declarative model', () => {
  const d = toDefinition({ version: 3, noAd: true, deciding: 'tiebreak', changeover: 60 }, ['a', 'b', 'c', 'd']);
  assert.equal(d.id, 'demo');
  assert.equal(d.version, 3);
  assert.equal(d.participants.mode, 'DOUBLES');
  assert.equal(d.game.scoring, 'NO_AD');
  assert.deepEqual(d.decidingSet, { kind: 'MATCH_TIEBREAK', pointsToWin: 10, winByPoints: 2 });
  const s = toDefinition({ version: 1, noAd: false, deciding: 'full', changeover: 90 }, ['a', 'b']);
  assert.equal(s.participants.mode, 'SINGLES');
  assert.equal(s.game.scoring, 'ADVANTAGE');
  assert.deepEqual(s.decidingSet, { kind: 'NORMAL_SET' });
});

for (const [name, id] of [['M101', 1], ['M102', 2]] as const) {
  test(`toMatchState/toDisplay round-trips the ${name} fixture exactly`, () => {
    const m = initialMatch(id);
    const ms = toMatchState(m, 'c' + id);
    assert.equal(ms.matchId, name === 'M101' ? 'M101' : 'M102');
    assert.equal(ms.rulesetId, 'demo');
    assert.equal(ms.rulesetVersion, m.rules.version);
    assert.equal(ms.phase, 'PLAYING');
    assert.deepEqual(toDisplay(ms, m.score, m.rules), m.score);
  });
}

test('toMatchState/toDisplay round-trips a warmup match (warmup has no engine phase)', () => {
  const m = semifinal(standardRules);
  assert.equal(toMatchState(m, 'c1').phase, 'PLAYING');
  assert.deepEqual(toDisplay(toMatchState(m, 'c1'), m.score, m.rules), m.score);
});

test('service init mirrors push.startMatch exactly when anchored at firstServer 0', () => {
  const m = semifinal(standardRules);
  const store = createStore(
    definitionFromToggles({ mode: 'DOUBLES', noAd: false, deciding: 'FULL_SET', changeoverSec: 90 }, 'demo', 1),
  );
  const real = startMatch(store, { matchId: 'M103', courtId: 'c1', players: m.serverOrder });
  assert.deepEqual(toMatchState(m, 'c1').service, real.service);
});

test('service anchors at serverOrder[firstServer]; names come from ms.service', () => {
  const ms = toMatchState(initialMatch(1), 'c1');
  assert.equal(ms.service.server, 'Alex Roy');
  assert.equal(ms.service.servingTeam, 'A');
  assert.deepEqual(ms.service.serviceOrder, initialMatch(1).serverOrder);
  assert.equal(serverFromState(ms), 'Alex Roy');
  assert.equal(receiverFromState(ms), 'Morgan Dubois');
});

test('commitPoint accepts legal points and rejects completed matches with the engine reason', () => {
  const m = initialMatch(2);
  const ok = commitPoint(m, 'c2', 0);
  assert.equal(ok.accepted, true);
  assert.deepEqual(ok.score?.points, [1, 0]);
  m.score.winner = 0;
  m.phase = 'complete';
  const done = commitPoint(m, 'c2', 0);
  assert.equal(done.accepted, false);
  assert.equal(done.reason, 'MATCH_COMPLETE');
});

test('dispute freezes scoring; only a rollback resolves it', () => {
  const m = initialMatch(2);
  const frozen = commitDispute(m, 'c2');
  assert.equal(frozen.accepted, true);
  assert.equal(frozen.nextMs?.phase, 'DISPUTE');
  const playing = { ...m, phase: 'dispute' as const };
  const blocked = commitPoint(playing, 'c2', 0);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, 'DISPUTE_FROZEN');
  const target = structuredClone(m.score);
  const freed = commitRollback(playing, 'c2', target);
  assert.equal(freed.accepted, true);
  assert.equal(freed.nextMs?.phase, 'PLAYING');
  assert.deepEqual(freed.score, target);
});

test('publishDemoRules versions upcoming while active matches stay pinned', () => {
  const before = JSON.stringify(compiledFor(initialMatch(1)));
  const def = publishDemoRules({ noAd: true, deciding: 'tiebreak', changeover: 60, version: 2 });
  assert.equal(def.version, 2);
  assert.equal(def.game.scoring, 'NO_AD');
  assert.equal(JSON.stringify(compiledFor(initialMatch(1))), before);
});

test('outbox tracks accepted records until the server ACKs them', () => {
  const m = initialMatch(2);
  const commit = commitPoint(m, 'c2', 1);
  assert.equal(commit.accepted, true);
  const rec = noteAccepted({ matchId: 'M102', id: 'e1', sequence: 7, courtId: 'c2', source: 'Touch', commit });
  assert.equal(rec.sequence, 7);
  assert.equal(rec.decision, 'ACCEPTED');
  assert.deepEqual(rec.resultingState, commit.nextMs);
  assert.deepEqual(pendingFor('M102').map((r) => r.id), ['e1']);
  ackRecord('M102', 'e1');
  assert.deepEqual(pendingFor('M102'), []);
  noteAccepted({ matchId: 'M102', id: 'e2', sequence: 8, courtId: 'c2', source: 'Touch', commit });
  confirmAll('M102');
  assert.deepEqual(pendingFor('M102'), []);
  const rejected = commitPoint({ ...m, phase: 'complete', score: { ...m.score, winner: 0 } }, 'c2', 0);
  assert.throws(() => noteAccepted({ matchId: 'M102', id: 'x', sequence: 9, courtId: 'c2', source: 'Touch', commit: rejected }), /not accepted/);
});
