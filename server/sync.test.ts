// B06 proofs — in-process server + two socket clients over loopback (arch §3:
// Socket.IO, not raw WS; no real-network flakiness). Required ticket proofs:
// kill-connection (score offline → reconnect → zero lost points) and
// duplicate-delivery (no double-apply), plus ACK policy, gap request,
// changeover timing, and the optimizer/commitPlan consume-seam.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { io as clientIO } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { appendEvent, replay } from "../courtguard/events.ts";
import type {
  AssignmentPlan,
  CompiledRuleset,
  MatchEventRecord,
  MatchState,
  TeamId,
  TennisIntent,
} from "../shared/types.ts";
import { createCourtServer } from "./index.ts";
import type { CourtServer } from "./index.ts";
import { changeoverStatus } from "./twin.ts";

const RULES = {} as CompiledRuleset;
let ts = 1725460000000;

function mkState(matchId: string, courtId: string, players: [string, string] = ["p1", "p2"]): MatchState {
  return {
    matchId, courtId, rulesetId: "standard-singles", rulesetVersion: 1,
    phase: "PLAYING", serverPoints: 0, receiverPoints: 0, games: [0, 0], sets: [],
    inTiebreak: false,
    service: { servingTeam: "A", server: players[0], receivingTeam: "B", deuceReceiver: players[1], adReceiver: players[1], serviceOrder: [...players] },
    winner: null,
  };
}

// Minimal court-side guard (same role as B05's stub): local scoring math lives
// in the court client, never on the server.
function stubTransition(state: MatchState, intent: TennisIntent, _rules?: CompiledRuleset) {
  if (intent.type === "POINT_WON") {
    const s = { ...state };
    if (intent.winner === state.service.servingTeam) s.serverPoints += 1;
    else s.receiverPoints += 1;
    return { decision: "ACCEPTED" as const, resultingState: s };
  }
  return { decision: "ACCEPTED" as const, resultingState: { ...state } };
}

function emitAck(socket: Socket, event: string, payload: unknown, ms = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event} ACK`)), ms);
    socket.emit(event, payload, (res: unknown) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function onceConnect(socket: Socket, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for connect")), ms);
    socket.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

// Server→client broadcasts flush asynchronously — poll instead of asserting sync.
function waitFor(cond: () => boolean, what: string, ms = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (cond()) resolve();
      else if (Date.now() - start > ms) reject(new Error(`timeout waiting for ${what}`));
      else setTimeout(poll, 10);
    };
    poll();
  });
}

// Court tablet: local append-first log (synced lives on the envelope per §4),
// ACK flips synced:false → true; reconnect resends unsynced in sequence order.
class Court {
  log: MatchEventRecord[] = [];
  synced = new Map<string, boolean>();
  socket: Socket | null = null;
  url: string;
  courtId: string;
  matchId: string;
  players: [string, string];
  constructor(url: string, courtId: string, matchId: string, players: [string, string] = ["p1", "p2"]) {
    this.url = url;
    this.courtId = courtId;
    this.matchId = matchId;
    this.players = players;
  }
  async connect(): Promise<void> {
    this.socket = clientIO(this.url, { reconnection: false });
    await onceConnect(this.socket);
    await emitAck(this.socket, "court:status", { courtId: this.courtId, status: "PLAYING", connectivity: "ONLINE", currentMatchId: this.matchId });
  }
  kill(): void {
    this.socket?.disconnect(); // network dies; local log + scoring survive
    this.socket = null;
  }
  score(winner: TeamId): MatchEventRecord {
    const prev = this.log.length ? this.log[this.log.length - 1].resultingState : mkState(this.matchId, this.courtId, this.players);
    const r = stubTransition(prev, { type: "POINT_WON", winner }, RULES);
    const rec = appendEvent(this.log, {
      courtId: this.courtId, matchId: this.matchId, source: "TOUCH",
      proposedIntent: { type: "POINT_WON", winner },
      previousState: prev, decision: r.decision, resultingState: r.resultingState, timestamp: (ts += 1000),
    });
    this.synced.set(rec.id, false);
    return rec;
  }
  unsynced(): MatchEventRecord[] {
    return this.log.filter((e) => !this.synced.get(e.id)).sort((a, b) => a.sequence - b.sequence);
  }
  async send(rec: MatchEventRecord): Promise<any> {
    const ack = await emitAck(this.socket!, "court:event", { event: rec });
    assert.equal(ack.ok, true);
    this.synced.set(rec.id, true);
    return ack;
  }
  async resend(): Promise<any> {
    const batch = this.unsynced();
    const ack = await emitAck(this.socket!, "court:sync", { courtId: this.courtId, matchId: this.matchId, events: batch });
    assert.equal(ack.ok, true);
    for (const e of batch) this.synced.set(e.id, true);
    return ack;
  }
}

let server: CourtServer;
const sockets: Socket[] = [];
// Dashboard watcher: second client capturing all server→client families.
const dash: Record<string, any[]> = { "tournament:update": [], "court:update": [], "ruleset:published": [], "assignment:update": [] };
let dashSocket: Socket;

function courtUpdatesFor(matchId: string): any[] {
  return dash["court:update"].filter((u) => u.matchId === matchId);
}

before(async () => {
  server = await createCourtServer({ seed: { courts: ["c1", "c2"], matches: [mkState("m-plan", "c2", ["p3", "p4"])] } });
  dashSocket = clientIO(server.url, { reconnection: false });
  sockets.push(dashSocket);
  await onceConnect(dashSocket);
  for (const e of Object.keys(dash)) dashSocket.on(e, (p: unknown) => dash[e].push(p));
});

after(async () => {
  for (const s of sockets) s.disconnect();
  await server.close();
});

describe("B06 twin + sync", () => {
  it("ACK policy: events stay synced:false until server ACK", async () => {
    const court = new Court(server.url, "c1", "m-ack", ["p11", "p12"]);
    await court.connect();
    sockets.push(court.socket!);
    const r = court.score("A");
    assert.equal(court.synced.get(r.id), false, "unsynced before ACK");
    const ack = await court.send(r);
    assert.deepEqual({ ok: ack.ok, duplicate: ack.duplicate, missing: ack.missing }, { ok: true, duplicate: false, missing: [] });
    assert.equal(court.synced.get(r.id), true, "synced after ACK");
  });

  it("kill-connection: score offline → reconnect → zero lost points, dashboard catches up", async () => {
    const court = new Court(server.url, "c1", "m-kill", ["p21", "p22"]);
    await court.connect();
    sockets.push(court.socket!);
    await court.send(court.score("A")); // seq 1 acked while online
    court.kill(); // network dies
    const o2 = court.score("B"); // seqs 2..4 scored fully offline
    const o3 = court.score("A");
    const o4 = court.score("A");
    assert.deepEqual(court.unsynced().map((e) => e.sequence), [2, 3, 4]);
    assert.equal((server.twin.logs.get("m-kill") ?? []).length, 1, "server saw only pre-kill events");
    // Dashboard joins the court room via court:sync and takes what the server has.
    const pre = await emitAck(dashSocket, "court:sync", { courtId: "c1", matchId: "m-kill", have: [] });
    assert.equal(pre.events.length, 1);
    await court.connect(); // reconnect (new socket, same local log)
    sockets.push(court.socket!);
    const ack = await court.resend(); // unsynced in sequence order
    assert.deepEqual({ applied: ack.applied, duplicates: ack.duplicates, missing: ack.missing }, { applied: 3, duplicates: 0, missing: [] });
    assert.deepEqual(court.unsynced(), [], "all marked synced after reconnect");
    const serverLog = server.twin.logs.get("m-kill")!;
    assert.deepEqual(serverLog.map((e) => e.sequence), [1, 2, 3, 4]);
    assert.deepStrictEqual(replay(serverLog), replay(court.log), "server replay converges with court log");
    assert.deepStrictEqual([o4.resultingState.serverPoints, o4.resultingState.receiverPoints], [3, 1]);
    const updates = courtUpdatesFor("m-kill");
    await waitFor(() => {
      const u = courtUpdatesFor("m-kill");
      return u.length > 0 && u[u.length - 1].events.length === 4;
    }, "dashboard court:update catch-up");
    const caughtUp = courtUpdatesFor("m-kill").at(-1)!;
    assert.equal(caughtUp.events.length, 4, "dashboard caught up via court:update");
    assert.deepStrictEqual(replay(caughtUp.events), replay(court.log));
  });

  it("duplicate-delivery: redelivered events are ignored, never double-applied", async () => {
    const court = new Court(server.url, "c1", "m-dup", ["p31", "p32"]);
    await court.connect();
    sockets.push(court.socket!);
    const r = court.score("A");
    await court.send(r);
    const before = replay(server.twin.logs.get("m-dup")!);
    const dup = await court.send(r); // same deterministic id, redelivered
    assert.equal(dup.duplicate, true);
    const batch = await emitAck(court.socket!, "court:sync", { courtId: "c1", matchId: "m-dup", events: [r, r] });
    assert.deepEqual({ applied: batch.applied, duplicates: batch.duplicates }, { applied: 0, duplicates: 2 });
    const log = server.twin.logs.get("m-dup")!;
    assert.equal(log.length, 1, "log grew zero on duplicates");
    assert.deepStrictEqual(replay(log), before, "no double-apply");
    assert.deepStrictEqual([before.serverPoints, before.receiverPoints], [1, 0]);
  });

  it("gaps: missing sequences requested, late arrival accepted", async () => {
    const court = new Court(server.url, "c2", "m-gap", ["p41", "p42"]);
    await court.connect();
    sockets.push(court.socket!);
    const r1 = court.score("A");
    court.score("B"); // seq 2 held back
    const r3 = court.score("A");
    await court.send(r1);
    const ack = await court.send(r3); // seq 3 arrives before seq 2
    assert.deepEqual(ack.missing, [2], "server requests the missing range");
    const fix = await court.resend(); // only seq 2 still unsynced
    assert.deepEqual(fix.missing, []);
    const log = server.twin.logs.get("m-gap")!;
    assert.deepEqual(log.map((e) => e.sequence), [1, 2, 3]);
    assert.doesNotThrow(() => replay(log), "gapless log replays clean");
  });

  it("changeover: authoritative start timestamp (refresh-safe), Time cue at duration-10", () => {
    const T = 1725461000000;
    const info = server.startChangeover("c1", { startedAt: T, durationSec: 90 });
    assert.equal(info.timeCueAtSec, 80, "90s changeover cues at 80s");
    assert.equal(changeoverStatus(info, T + 79_000).timeCue, false);
    assert.deepEqual(changeoverStatus(info, T + 85_000), { elapsedSec: 85, remainingSec: 5, timeCue: true, done: false });
    // Refresh/backgrounding: recompute from the same startedAt — nothing resets.
    assert.equal(changeoverStatus(info, T + 88_000).elapsedSec, 88);
    assert.equal(changeoverStatus(info, T + 90_000).done, true);
    const info60 = server.startChangeover("c2", { startedAt: T, durationSec: 60 });
    assert.equal(info60.timeCueAtSec, 50);
    assert.deepStrictEqual(server.twin.changeovers.get("c1"), info);
  });

  it("consume-seam: stale plans discarded, fresh plans commit via commitPlan + assignment:update", async () => {
    const staleVersion = server.twin.version;
    await emitAck(dashSocket, "court:status", { courtId: "c1", status: "PLAYING", connectivity: "ONLINE", currentMatchId: "m-kill" }); // Twin moves on
    const stale: AssignmentPlan = {
      basedOnStateVersion: staleVersion,
      assignments: [{ matchId: "m-plan", courtId: "c2", status: "PLANNED" }],
      projectedFinishTime: Date.now(), objectiveBreakdown: null,
    };
    const nAssignBefore = server.twin.assignments.size;
    const rejected = server.submitPlan(stale);
    assert.deepEqual(rejected, { ok: false, reason: "STALE_PLAN" });
    assert.equal(server.twin.assignments.size, nAssignBefore, "stale plan mutates nothing");
    const fresh: AssignmentPlan = { ...stale, basedOnStateVersion: server.twin.version };
    const seen = dash["assignment:update"].length;
    const committed = server.submitPlan(fresh);
    assert.equal(committed.ok, true);
    assert.deepEqual(server.twin.assignments.get("c2"), fresh.assignments[0]);
    await waitFor(() => dash["assignment:update"].length === seen + 1, "assignment:update broadcast");
  });

  it("ruleset publish: versioned broadcast, pinned matches untouched", async () => {
    const seen = dash["ruleset:published"].length;
    server.publishRuleset({ id: "standard-singles", version: 2, participants: { mode: "SINGLES" }, game: { scoring: "NO_AD" }, set: { gamesToWin: 6, winByGames: 2 }, decidingSet: { kind: "NORMAL_SET" } });
    await waitFor(() => dash["ruleset:published"].length === seen + 1, "ruleset:published broadcast");
    assert.equal(server.twin.rulesets.get("standard-singles")?.version, 2);
    assert.equal(server.twin.matches.get("m-kill")?.rulesetVersion, 1, "live match stays pinned");
  });
});
