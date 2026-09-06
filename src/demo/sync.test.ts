// Sync against a REAL in-process server (createCourtServer loopback):
// loopback accept, kill+reconnect with zero loss, duplicate with no double-apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Socket } from 'socket.io-client';
import { createCourtServer } from '../../server/index.ts';
import type { CourtServer } from '../../server/index.ts';
import { initialMatch } from './fixtures';
import { commitPoint, confirmAll, noteAccepted, pendingFor } from './guard-adapter';
import { connect, disconnect, emitCourtEvent, syncCourt } from './sync';
import type { Match } from './types';

async function online(url: string): Promise<Socket> {
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

async function liveServer(): Promise<CourtServer> {
  const server = await createCourtServer({ seed: { courts: ['c1', 'c2'] } });
  await online(server.url);
  return server;
}

async function shutdown(server: CourtServer) {
  disconnect();
  await server.close();
}

function point(match: Match, team: 0 | 1, seq: number, id: string) {
  const c = commitPoint(match, 'c2', team);
  assert.equal(c.accepted, true);
  match.score = c.score!;
  return noteAccepted({ matchId: match.id, id, sequence: seq, courtId: 'c2', source: 'Touch', commit: c });
}

test('loopback: an accepted point lands in the twin log and state', async () => {
  const server = await liveServer();
  try {
    const m = initialMatch(2);
    const rec = point(m, 0, 1, 'loop-1');
    const ack = await emitCourtEvent(rec);
    assert.equal(ack.ok, true);
    const log = server.twin.logs.get('M102')!;
    assert.equal(log.length, 1);
    assert.equal(log[0].id, 'loop-1');
    assert.deepEqual(server.twin.matches.get('M102'), log[0].resultingState);
  } finally {
    confirmAll('M102');
    await shutdown(server);
  }
});

test('kill+reconnect: offline points queue and flush with zero loss, in order', async () => {
  let server = await liveServer();
  const m = initialMatch(2);
  try {
    const first = point(m, 0, 1, 'kill-1');
    const ack = await emitCourtEvent(first);
    assert.equal(ack.ok, true);
  } finally {
    confirmAll('M102');
  }
  disconnect();
  await server.close();

  // Offline: emits fail fast, records stay queued.
  const second = point(m, 1, 2, 'kill-2');
  await assert.rejects(emitCourtEvent(second), /OFFLINE/);
  const third = point(m, 0, 3, 'kill-3');
  await assert.rejects(emitCourtEvent(third), /OFFLINE/);
  assert.deepEqual(pendingFor('M102').map((r) => r.id), ['kill-2', 'kill-3']);

  // Reconnect to a fresh server: the full offline batch arrives once, ordered.
  server = await liveServer();
  try {
    const res = await syncCourt('c2', 'M102', pendingFor('M102'));
    assert.equal(res.ok, true);
    assert.equal(res.applied, 2);
    confirmAll('M102');
    const log = server.twin.logs.get('M102')!;
    assert.deepEqual(log.map((e) => e.id), ['kill-2', 'kill-3']);
    assert.deepEqual(log.map((e) => e.sequence), [2, 3]);
    assert.deepEqual(log[1].resultingState, third.resultingState);
  } finally {
    confirmAll('M102');
    await shutdown(server);
  }
});

test('duplicate: resend is flagged and never double-applied', async () => {
  const server = await liveServer();
  try {
    const m = initialMatch(2);
    const rec = point(m, 0, 1, 'dupe-1');
    const first = await emitCourtEvent(rec);
    assert.equal(first.ok, true);
    const second = await emitCourtEvent(rec);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(server.twin.logs.get('M102')!.length, 1);
    const resync = await syncCourt('c2', 'M102', [rec]);
    assert.equal(resync.ok, true);
    assert.equal(resync.applied, 0);
    assert.equal(resync.duplicates, 1);
    assert.equal(server.twin.logs.get('M102')!.length, 1);
  } finally {
    confirmAll('M102');
    await shutdown(server);
  }
});
