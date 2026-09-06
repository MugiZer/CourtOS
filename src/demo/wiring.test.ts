// F1–F4 wiring: engine voice path + dashboard listeners (colocated).
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
import { scoreText } from './score';
import { initialMatch } from './fixtures';
import { commitPoint, commitScoreCall, confirmAll, engineOptions, noteAccepted, noteRejected, pendingFor, toDefinition } from './guard-adapter';
import { connect, disconnect, syncCourt } from './sync';
import { createCourtServer } from '../../server/index.ts';
import type { CourtServer } from '../../server/index.ts';
import { replay } from '../../courtguard/events.ts';
import { transition } from '../../courtguard/guard.ts';
import { compiledFor } from './guard-adapter';
import { io } from 'socket.io-client';

beforeEach(() => {
  store.resetDemo(false);
  confirmAll('M101');
  confirmAll('M102');
  confirmAll('M103');
  disconnect();
});

function freshNoAd4040() {
  const s = store.getState();
  const m = s.courts[0].match;
  m.score = { points: [3, 3], games: [0, 0], sets: [], winner: null, tieBreak: false, matchTieBreak: false, serviceGame: 0 };
  m.phase = 'playing';
  m.receiverSide = null;
}

test('voice-resolve-via-engine: golden calls commit as SCORE_CALL', () => {
  store.submitCall(2, 'Fifteen-love');
  let c = store.getState().courts[1];
  assert.deepEqual(c.match.score.points, [1, 0]);
  assert.equal(c.decision.type, 'accepted');
  assert.equal(c.events.at(-1)?.kind, 'point');
  const rec = pendingFor('M102').at(-1)!;
  assert.equal(rec.decision, 'ACCEPTED');
  assert.equal((rec.proposedIntent as { type: string }).type, 'SCORE_CALL');
  store.resetDemo(false);
  confirmAll('M102');
  store.submitCall(2, 'Love-fifteen');
  c = store.getState().courts[1];
  assert.deepEqual(c.match.score.points, [0, 1]);
  assert.equal((pendingFor('M102').at(-1)!.proposedIntent as { type: string }).type, 'SCORE_CALL');
});

test('voice-resolve-via-engine: impossible call blocked WITH engine reason', () => {
  store.awardPoint(2, 0);
  store.awardPoint(2, 1);
  store.submitCall(2, 'Thirty-love');
  const c = store.getState().courts[1];
  assert.equal(c.decision.type, 'blocked');
  assert.ok(c.decision.detail.includes('ILLEGAL_TRANSITION'));
  assert.deepEqual(c.match.score.points, [1, 1]);
  assert.equal(c.events.at(-1)?.kind, 'blocked');
  const rej = pendingFor('M102').at(-1)!;
  assert.equal(rej.decision, 'REJECTED');
  assert.equal(rej.rejectionReason, 'ILLEGAL_TRANSITION');
});

test('voice-resolve-via-engine: ambiguity goes to confirmation', () => {
  freshNoAd4040();
  const opts = engineOptions(store.getState().courts[0].match, 'c1');
  assert.equal(opts.length, 2);
  assert.equal(opts[0].spoken, opts[1].spoken);
  store.submitCall(1, 'Love-all');
  const c = store.getState().courts[0];
  assert.equal(c.decision.type, 'confirmation');
  assert.ok(c.decision.candidate);
  assert.deepEqual(c.match.score.points, [3, 3]);
});

test('voice shortcuts stay identical (correction/yes/no)', () => {
  store.submitCall(2, 'correction');
  assert.equal(store.getState().courts[1].decision.type, 'correction');
  store.resetDemo(false);
  confirmAll('M102');
  store.requestConfirmation(2);
  assert.equal(store.getState().courts[1].decision.type, 'confirmation');
  const candidate = store.getState().courts[1].decision.candidate!;
  assert.equal(candidate, scoreText(engineOptions(store.getState().courts[1].match, 'c2').find(o => o.team === 0)!.score));
  store.submitCall(2, 'yes');
  assert.equal(store.getState().courts[1].decision.type, 'accepted');
  store.requestConfirmation(2);
  store.submitCall(2, 'no');
  assert.equal(store.getState().courts[1].decision.type, 'ready');
});

test('choices-from-engine: same labels, engine underneath', () => {
  const start = store.legalChoices(store.getState().courts[1]);
  assert.deepEqual(start, ['15–0', '0–15']);
  freshNoAd4040();
  const deciding = store.legalChoices(store.getState().courts[0]);
  assert.deepEqual(deciding, ['Game', 'Game']);
  store.resetDemo(false);
  store.requestConfirmation(2);
  assert.equal(store.getState().courts[1].decision.candidate, '15–0');
});

async function waitFor(fn: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 50));
  }
}

async function online(url: string) {
  const s = connect(url);
  if (s.connected) return s;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), 10000);
    s.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    s.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return s;
}

test('reject-emitted-and-replayed: REJECTED lands in the twin log and replays', async () => {
  const server: CourtServer = await createCourtServer({ seed: { courts: ['c1', 'c2'] } });
  await online(server.url);
  try {
    store.awardPoint(2, 0);
    store.dispute(2);
    store.awardPoint(2, 0);
    const c = store.getState().courts[1];
    assert.equal(c.decision.type, 'blocked');
    assert.ok(c.decision.detail.includes('DISPUTE_FROZEN'));
    await waitFor(() => (server.twin.logs.get('M102') ?? []).length >= 3);
    const log = server.twin.logs.get('M102')!;
    assert.equal(log[2].decision, 'REJECTED');
    assert.equal(log[2].rejectionReason, 'DISPUTE_FROZEN');
    const match = store.getState().courts[1].match;
    const state = replay(log, transition, compiledFor(match));
    assert.deepEqual(state, log[log.length - 1].resultingState);
    const r = transition(log[2].previousState, log[2].proposedIntent as never, compiledFor(match));
    assert.equal(r.accepted, false);
    if (!r.accepted) {
      assert.equal(r.reason, 'DISPUTE_FROZEN');
      assert.deepEqual(r.state, log[2].resultingState);
    }
  } finally {
    confirmAll('M102');
    disconnect();
    await server.close();
    store.resetDemo(false);
  }
});

test('dashboard shows remote rejected-call alert with engine reason', async () => {
  const server: CourtServer = await createCourtServer({ seed: { courts: ['c1', 'c2'] } });
  await online(server.url);
  const off = store.subscribeDashboard();
  const scorer = io(server.url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SCORER_TIMEOUT')), 10000);
    if (scorer.connected) {
      clearTimeout(timer);
      resolve();
    } else {
      scorer.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    }
  });
  try {
    await syncCourt('c2', 'M102', []);
    // Court tab: one legal point, then an impossible call the engine rejects.
    const m = initialMatch(2);
    const first = commitPoint(m, 'c2', 0);
    assert.equal(first.accepted, true);
    m.score = first.score!;
    const rec1 = noteAccepted({ matchId: m.id, id: 'dash-rej-1', sequence: 1, courtId: 'c2', source: 'Touch', commit: first });
    const a1 = await new Promise<{ ok: boolean }>((resolve, reject) => {
      scorer.emit('court:event', { event: rec1 }, (res: { ok: boolean }) => resolve(res));
      setTimeout(() => reject(new Error('EMIT_TIMEOUT')), 5000);
    });
    assert.equal(a1.ok, true);
    await waitFor(() => store.getState().courts[1].remoteMatch.score.points.join(',') === '1,0');
    const bad = commitScoreCall(m, 'c2', { serverPoints: 999, receiverPoints: 999 }, 'Thirty-love');
    assert.equal(bad.accepted, false);
    const reason = bad.reason ?? 'ILLEGAL_TRANSITION';
    const rec2 = noteRejected({ matchId: m.id, id: 'dash-rej-2', sequence: 2, courtId: 'c2', source: 'Touch', commit: bad, transcript: 'Thirty-love' });
    const a2 = await new Promise<{ ok: boolean }>((resolve, reject) => {
      scorer.emit('court:event', { event: rec2 }, (res: { ok: boolean }) => resolve(res));
      setTimeout(() => reject(new Error('EMIT_TIMEOUT')), 5000);
    });
    assert.equal(a2.ok, true);
    // Dashboard tab catches up: blocked card carries the engine reason.
    await waitFor(() => store.getState().courts[1].decision.type === 'blocked');
    const d = store.getState().courts[1].decision;
    assert.equal(d.title, 'Call blocked');
    assert.ok(d.detail.includes(reason));
    confirmAll('M102');
  } finally {
    off();
    scorer.disconnect();
    disconnect();
    await server.close();
    store.resetDemo(false);
    confirmAll('M102');
  }
});
 
test('two-tab dashboard catch-up vs real in-process server', async () => {
  const server: CourtServer = await createCourtServer({ seed: { courts: ['c1', 'c2'] } });
  await online(server.url);
  const off = store.subscribeDashboard();
  const scorer = io(server.url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SCORER_TIMEOUT')), 10000);
    if (scorer.connected) {
      clearTimeout(timer);
      resolve();
    } else {
      scorer.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    }
  });
  try {
    await syncCourt('c2', 'M102', []);
    const m = initialMatch(2);
    const commit = commitPoint(m, 'c2', 0);
    assert.equal(commit.accepted, true);
    m.score = commit.score!;
    const rec = noteAccepted({ matchId: m.id, id: 'dash-1', sequence: 1, courtId: 'c2', source: 'Touch', commit });
    const acked = await new Promise<{ ok: boolean }>((resolve, reject) => {
      scorer.emit('court:event', { event: rec }, (res: { ok: boolean }) => resolve(res));
      setTimeout(() => reject(new Error('EMIT_TIMEOUT')), 5000);
    });
    assert.equal(acked.ok, true);
    await waitFor(() => store.getState().courts[1].remoteMatch.score.points.join(',') === '1,0');
    server.submitPlan({ basedOnStateVersion: server.twin.version, assignments: [], projectedFinishTime: Date.now(), objectiveBreakdown: {} });
    await waitFor(() => store.getState().plan.options.length > 0);
    const def = toDefinition({ version: 2, noAd: true, deciding: 'tiebreak', changeover: 60 }, ['a', 'b', 'c', 'd']);
    server.publishRuleset(def);
    await waitFor(() => store.getState().upcomingRules.version === 2);
    assert.equal(store.getState().upcomingRules.noAd, true);
    assert.equal(store.getState().rulesPublished, true);
    confirmAll('M102');
  } finally {
    off();
    scorer.disconnect();
    disconnect();
    await server.close();
    store.resetDemo(false);
    confirmAll('M102');
  }
});
