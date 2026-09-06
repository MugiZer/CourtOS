// B01 conformance proof — stdlib only (`node --test` + `assert/strict`).
// Run: node --test shared/conformance.test.ts
// The value import below forces Node to parse shared/types.ts (type-stripping),
// so this single command proves both: types.ts is valid TS AND every fixture
// conforms to it. No typescript dep, no test framework (YAGNI).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOCKET_EVENTS } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "fixtures");
const load = (n: string): any => JSON.parse(readFileSync(join(dir, n), "utf8"));
// CompiledRuleset holds functions (not JSON-serializable), so its contract is
// proven by asserting the policy signatures are present in the frozen source.
const typesSrc = readFileSync(join(here, "types.ts"), "utf8");

const PHASES = ["PLAYING", "DISPUTE", "CHANGEOVER", "COMPLETE"];
const SOURCES = ["VOICE", "TOUCH", "ORGANIZER", "SYSTEM"];
const COURT_STATUSES = ["FREE", "WARMUP", "PLAYING", "CHANGEOVER", "COMPLETE"];
const CONNECTIVITY = ["ONLINE", "OFFLINE"];
const ASSIGN_STATUSES = ["PLANNED", "ANNOUNCED", "WARMUP", "PLAYING"];
const INTENT_TYPES = ["SCORE_CALL", "POINT_WON", "FAULT", "LET", "CORRECTION",
  "CONFIRM_YES", "CONFIRM_NO", "DISPUTE_START", "SCORE_ROLLBACK"];

function assertMatchState(s: any, label: string): void {
  assert.ok(s && typeof s === "object", `${label}: must be object`);
  for (const k of ["matchId", "courtId", "rulesetId", "rulesetVersion", "phase",
    "serverPoints", "receiverPoints", "games", "sets", "inTiebreak", "service", "winner"])
    assert.ok(k in s, `${label}: missing ${k}`);
  for (const k of ["matchId", "courtId", "rulesetId"])
    assert.ok(typeof s[k] === "string" && s[k].length > 0, `${label}: bad ${k}`);
  assert.ok(Number.isInteger(s.rulesetVersion) && s.rulesetVersion >= 1, `${label}: bad rulesetVersion`);
  assert.ok(PHASES.includes(s.phase), `${label}: bad phase ${s.phase}`);
  for (const k of ["serverPoints", "receiverPoints"])
    assert.ok(Number.isInteger(s[k]) && s[k] >= 0, `${label}: bad ${k}`);
  assert.ok(Array.isArray(s.games) && s.games.length === 2 &&
    s.games.every((g: any) => Number.isInteger(g) && g >= 0), `${label}: bad games`);
  assert.ok(Array.isArray(s.sets) &&
    s.sets.every((st: any) => Array.isArray(st) && st.length === 2 &&
      st.every((g: any) => Number.isInteger(g) && g >= 0)), `${label}: bad sets`);
  assert.equal(typeof s.inTiebreak, "boolean", `${label}: bad inTiebreak`);
  const sv = s.service;
  assert.ok(sv && typeof sv === "object", `${label}: bad service`);
  assert.ok(sv.servingTeam === "A" || sv.servingTeam === "B", `${label}: bad servingTeam`);
  assert.equal(sv.servingTeam === "A" ? "B" : "A", sv.receivingTeam, `${label}: service teams`);
  for (const k of ["server", "deuceReceiver", "adReceiver"])
    assert.ok(typeof sv[k] === "string" && sv[k].length > 0, `${label}: bad service.${k}`);
  assert.ok(Array.isArray(sv.serviceOrder) && sv.serviceOrder.length >= 2 &&
    sv.serviceOrder.every((p: any) => typeof p === "string"), `${label}: serviceOrder`);
  if (sv.tiebreakPointNumber !== undefined)
    assert.ok(Number.isInteger(sv.tiebreakPointNumber) && sv.tiebreakPointNumber >= 0, `${label}: bad tiebreakPointNumber`);
  assert.ok(s.winner === null || s.winner === "A" || s.winner === "B", `${label}: bad winner`);
  if (s.phase === "COMPLETE") assert.ok(s.winner !== null, `${label}: COMPLETE needs winner`);
}

function assertCanonicalScore(v: any, label: string): void {
  assert.ok(v && typeof v === "object", `${label}: must be object`);
  for (const k of ["serverPoints", "receiverPoints"])
    assert.ok(Number.isInteger(v[k]) && v[k] >= 0, `${label}: bad ${k}`);
}

function assertTennisIntent(v: any, label: string): void {
  assert.ok(v && typeof v === "object", `${label}: must be object`);
  switch (v.type) {
    case "SCORE_CALL":
      assertCanonicalScore(v.score, `${label}.score`);
      if ("transcript" in v) assert.ok(typeof v.transcript === "string", `${label}: bad transcript`);
      break;
    case "POINT_WON":
      assert.ok(v.winner === "A" || v.winner === "B", `${label}: bad winner`);
      break;
    case "FAULT":
    case "LET":
    case "CORRECTION":
    case "CONFIRM_YES":
    case "CONFIRM_NO":
      break;
    case "DISPUTE_START":
      if ("reason" in v) assert.ok(typeof v.reason === "string", `${label}: bad reason`);
      break;
    case "SCORE_ROLLBACK":
      assertCanonicalScore(v.to, `${label}.to`);
      break;
    default:
      assert.fail(`${label}: unknown intent type ${v.type}`);
  }
}

function assertEventRecord(r: any, label: string): void {
  assert.ok(r && typeof r === "object", `${label}: must be object`);
  for (const k of ["id", "courtId", "matchId", "sequence", "timestamp", "source",
    "proposedIntent", "previousState", "decision", "resultingState"])
    assert.ok(k in r, `${label}: missing ${k}`);
  for (const k of ["id", "courtId", "matchId"])
    assert.ok(typeof r[k] === "string" && r[k].length > 0, `${label}: bad ${k}`);
  assert.ok(Number.isInteger(r.sequence) && r.sequence > 0, `${label}: bad sequence`);
  assert.ok(typeof r.timestamp === "number" && r.timestamp > 0, `${label}: bad timestamp`);
  assert.ok(SOURCES.includes(r.source), `${label}: bad source`);
  if (r.proposedIntent !== undefined) assertTennisIntent(r.proposedIntent, `${label}.proposedIntent`);
  if (r.candidates !== undefined) assert.ok(Array.isArray(r.candidates), `${label}: bad candidates`);
  if (typeof r.transcript !== "undefined") assert.ok(typeof r.transcript === "string", `${label}: bad transcript`);
  assert.ok(r.decision === "ACCEPTED" || r.decision === "REJECTED", `${label}: bad decision`);
  if (r.decision === "REJECTED") assert.ok(typeof r.rejectionReason === "string" && r.rejectionReason.length > 0, `${label}: REJECTED needs reason`);
  assertMatchState(r.previousState, `${label}.previousState`);
  assertMatchState(r.resultingState, `${label}.resultingState`);
}

function assertRulesetDefinition(r: any, label: string): void {
  assert.ok(r && typeof r === "object", `${label}: must be object`);
  assert.ok(typeof r.id === "string" && r.id.length > 0, `${label}: bad id`);
  assert.ok(Number.isInteger(r.version) && r.version >= 1, `${label}: bad version`);
  assert.ok(r.participants?.mode === "SINGLES" || r.participants?.mode === "DOUBLES", `${label}: bad participants.mode`);
  assert.ok(r.game?.scoring === "ADVANTAGE" || r.game?.scoring === "NO_AD", `${label}: bad game.scoring`);
  assert.ok(Number.isInteger(r.set?.gamesToWin) && r.set.gamesToWin > 0, `${label}: bad set.gamesToWin`);
  assert.ok(Number.isInteger(r.set?.winByGames) && r.set.winByGames > 0, `${label}: bad set.winByGames`);
  if (r.set?.tiebreak !== undefined) {
    const t = r.set.tiebreak;
    assert.ok(Array.isArray(t.atGames) && t.atGames.length === 2 &&
      t.atGames.every((g: any) => Number.isInteger(g) && g >= 0), `${label}: bad set.tiebreak.atGames`);
    assert.ok(Number.isInteger(t.pointsToWin) && t.pointsToWin > 0, `${label}: bad set.tiebreak.pointsToWin`);
    assert.ok(Number.isInteger(t.winByPoints) && t.winByPoints > 0, `${label}: bad set.tiebreak.winByPoints`);
  }
  const d = r.decidingSet;
  assert.ok(d?.kind === "NORMAL_SET" || d?.kind === "MATCH_TIEBREAK", `${label}: bad decidingSet.kind`);
  if (d?.kind === "MATCH_TIEBREAK") {
    assert.ok(Number.isInteger(d.pointsToWin) && d.pointsToWin > 0, `${label}: bad decidingSet.pointsToWin`);
    assert.ok(Number.isInteger(d.winByPoints) && d.winByPoints > 0, `${label}: bad decidingSet.winByPoints`);
  }
}

function assertCompiledRulesetSignatures(): void {
  assert.ok(typesSrc.includes("interface CompiledRuleset"), "types.ts: missing CompiledRuleset");
  for (const sig of [
    "definition: RulesetDefinition",
    "gameWinner(state: MatchState): TeamId | null",
    "setWinner(state: MatchState): TeamId | null",
    "shouldStartTiebreak(state: MatchState): boolean",
    "shouldStartMatchTiebreak(state: MatchState): boolean",
    "tiebreakWinner(state: MatchState): TeamId | null",
    "legalEvents(state: MatchState): TennisIntent[]",
    "nextPhase(state: MatchState): MatchPhase",
  ]) assert.ok(typesSrc.includes(sig), `CompiledRuleset: missing policy signature ${sig}`);
}

function assertCourtState(c: any, label: string): void {
  assert.ok(c && typeof c === "object", `${label}: must be object`);
  assert.ok(typeof c.courtId === "string" && c.courtId.length > 0, `${label}: bad courtId`);
  assert.ok(COURT_STATUSES.includes(c.status), `${label}: bad status ${c.status}`);
  assert.ok(typeof c.currentMatchId === "string" || c.currentMatchId === null, `${label}: bad currentMatchId`);
}

function assertPlayerState(p: any, label: string): void {
  assert.ok(p && typeof p === "object", `${label}: must be object`);
  assert.ok(typeof p.playerId === "string" && p.playerId.length > 0, `${label}: bad playerId`);
  assert.equal(typeof p.available, "boolean", `${label}: bad available`);
  if (p.restUntil !== undefined) assert.ok(typeof p.restUntil === "number" && p.restUntil > 0, `${label}: bad restUntil`);
}

function assertAssignment(a: any, label: string): void {
  assert.ok(a && typeof a === "object", `${label}: must be object`);
  assert.ok(typeof a.matchId === "string" && a.matchId.length > 0, `${label}: bad matchId`);
  assert.ok(typeof a.courtId === "string" && a.courtId.length > 0, `${label}: bad courtId`);
  assert.ok(ASSIGN_STATUSES.includes(a.status), `${label}: bad status ${a.status}`);
}

function assertAssignmentPlan(p: any, label: string): void {
  assert.ok(p && typeof p === "object", `${label}: must be object`);
  assert.ok(Number.isInteger(p.basedOnStateVersion) && p.basedOnStateVersion >= 0, `${label}: bad basedOnStateVersion`);
  assert.ok(Array.isArray(p.assignments) && p.assignments.length >= 1, `${label}: bad assignments`);
  p.assignments.forEach((a: any, i: number) => assertAssignment(a, `${label}.assignments[${i}]`));
  assert.ok(typeof p.projectedFinishTime === "number" && p.projectedFinishTime > 0, `${label}: bad projectedFinishTime`);
  assert.ok("objectiveBreakdown" in p, `${label}: missing objectiveBreakdown`);
}

function assertTwinSnapshot(t: any, label: string): void {
  assert.ok(t && typeof t === "object", `${label}: must be object`);
  assert.ok(Number.isInteger(t.version) && t.version >= 0, `${label}: bad version`);
  assert.ok(t.courts && typeof t.courts === "object", `${label}: bad courts`);
  for (const [k, c] of Object.entries(t.courts)) {
    assertCourtState(c, `${label}.courts[${k}]`);
    assert.equal((c as any).courtId, k, `${label}: court key must match courtId`);
  }
  assert.ok(t.matches && typeof t.matches === "object", `${label}: bad matches`);
  for (const [k, m] of Object.entries(t.matches)) {
    assertMatchState(m, `${label}.matches[${k}]`);
    assert.equal((m as any).matchId, k, `${label}: match key must match matchId`);
  }
  assert.ok(t.players && typeof t.players === "object", `${label}: bad players`);
  for (const [k, p] of Object.entries(t.players)) {
    assertPlayerState(p, `${label}.players[${k}]`);
    assert.equal((p as any).playerId, k, `${label}: player key must match playerId`);
  }
  assert.ok(t.assignments && typeof t.assignments === "object", `${label}: bad assignments`);
  for (const [k, a] of Object.entries(t.assignments)) {
    assertAssignment(a, `${label}.assignments[${k}]`);
    assert.equal((a as any).courtId, k, `${label}: assignment key must match courtId`);
  }
  assert.ok(t.rulesets && typeof t.rulesets === "object", `${label}: bad rulesets`);
  for (const [k, r] of Object.entries(t.rulesets)) {
    assertRulesetDefinition(r, `${label}.rulesets[${k}]`);
    assert.equal((r as any).id, k, `${label}: ruleset key must match id`);
  }
  for (const [k, c] of Object.entries(t.connectivity))
    assert.ok(CONNECTIVITY.includes(c as string), `${label}: bad connectivity[${k}]`);
  assert.ok(t.sponsor && typeof t.sponsor === "object", `${label}: bad sponsor`);
  assert.ok(typeof t.sponsor.creativeId === "string" || t.sponsor.creativeId === null, `${label}: bad sponsor.creativeId`);
}

function assertChangeoverInfo(c: any, label: string): void {
  assert.ok(c && typeof c === "object", `${label}: must be object`);
  assert.ok(typeof c.startedAt === "number" && c.startedAt > 0, `${label}: bad startedAt`);
  assert.ok(typeof c.durationSec === "number" && c.durationSec > 0, `${label}: bad durationSec`);
  assert.ok(typeof c.timeCueAtSec === "number" && c.timeCueAtSec >= 0, `${label}: bad timeCueAtSec`);
  assert.ok(c.timeCueAtSec < c.durationSec, `${label}: Time cue precedes end`);
}

function assertSponsorCreative(s: any, label: string): void {
  assert.ok(s && typeof s === "object", `${label}: must be object`);
  assert.ok(typeof s.id === "string" && s.id.length > 0, `${label}: bad id`);
  assert.ok(["image", "video", "audio"].includes(s.type), `${label}: bad type`);
  assert.ok(typeof s.src === "string" && s.src.length > 0, `${label}: bad src`);
  assert.ok(typeof s.durationSec === "number" && s.durationSec > 0, `${label}: bad durationSec`);
}

describe("B01 frozen contract", () => {
  it("socket protocol exposes exactly the 7 frozen event names", () => {
    assert.deepEqual([...SOCKET_EVENTS], ["court:event", "court:sync", "court:status",
      "tournament:update", "court:update", "ruleset:published", "assignment:update"]);
  });

  it("ships exactly 7 fixtures", () => {
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".json")).sort(), [
      "blocked-call.json", "changeover-sponsor.json", "contract-shapes.json",
      "dispute-frozen.json", "match-complete-next-assignment.json", "mid-game-30-15.json",
      "offline-unsynced-batch.json",
    ]);
  });

  it("mid-game 30-15", () => {
    const f = load("mid-game-30-15.json");
    assertMatchState(f.state, "mid-game");
    assert.equal(f.state.phase, "PLAYING");
    assert.equal(f.state.serverPoints, 2);
    assert.equal(f.state.receiverPoints, 1);
  });

  it("blocked-call: 40-love heard from 30-15 is rejected, state unchanged", () => {
    const f = load("blocked-call.json");
    assertMatchState(f.previousState, "blocked.previous");
    assert.equal(f.previousState.serverPoints, 2);
    assert.equal(f.previousState.receiverPoints, 1);
    assertEventRecord(f.record, "blocked.record");
    assert.equal(f.record.decision, "REJECTED");
    assertTennisIntent(f.record.proposedIntent, "blocked.proposedIntent");
    assert.equal(f.record.proposedIntent.type, "SCORE_CALL");
    assert.deepEqual(f.record.resultingState, f.record.previousState);
  });

  it("offline-unsynced batch: monotonic sequences, chained states", () => {
    const f = load("offline-unsynced-batch.json");
    assert.equal(f.events.length, 3);
    assert.deepEqual(f.unsyncedSequences, f.events.map((e: any) => e.sequence));
    f.events.forEach((e: any, i: number) => {
      assertEventRecord(e, `batch[${i}]`);
      assert.equal(e.decision, "ACCEPTED");
      if (i > 0) {
        assert.equal(e.sequence, f.events[i - 1].sequence + 1, "sequences must be consecutive");
        assert.deepEqual(e.previousState, f.events[i - 1].resultingState, "states must chain");
      }
    });
  });

  it("dispute-frozen: scoring frozen, history intact", () => {
    const f = load("dispute-frozen.json");
    assertMatchState(f.state, "dispute");
    assert.equal(f.state.phase, "DISPUTE");
    assert.ok(f.recentHistory.length >= 1);
    f.recentHistory.forEach((e: any, i: number) => assertEventRecord(e, `dispute[${i}]`));
    const last = f.recentHistory[f.recentHistory.length - 1];
    assert.equal(f.frozenAtSequence, last.sequence);
    assert.deepEqual(last.resultingState, f.state);
  });

  it("changeover-sponsor: countdown + creative attached", () => {
    const f = load("changeover-sponsor.json");
    assertMatchState(f.state, "changeover");
    assert.equal(f.state.phase, "CHANGEOVER");
    assertChangeoverInfo(f.changeover, "changeover");
    assertSponsorCreative(f.sponsor, "sponsor");
  });

  it("match-complete + next-assignment: winner set, version-bound plan", () => {
    const f = load("match-complete-next-assignment.json");
    assertMatchState(f.state, "complete");
    assert.equal(f.state.phase, "COMPLETE");
    assert.equal(f.state.winner, "A");
    assertEventRecord(f.finalRecord, "complete.final");
    assert.deepEqual(f.finalRecord.resultingState, f.state);
    assertAssignmentPlan(f.plan, "complete.plan");
    assert.ok(f.plan.assignments.some((a: any) => a.courtId === f.state.courtId), "freed court reassigned");
  });

  it("contract-shapes: RulesetDefinition deep, coherent with match fixtures", () => {
    const f = load("contract-shapes.json");
    assertRulesetDefinition(f.ruleset, "shapes.ruleset");
    assertRulesetDefinition(f.twin.rulesets["standard-singles"], "shapes.twin.rulesets");
    assert.deepEqual(f.twin.rulesets["standard-singles"], f.ruleset);
    const mid = load("mid-game-30-15.json");
    assert.equal(mid.state.rulesetId, f.ruleset.id, "match rulesetId resolves to frozen definition");
    assert.equal(mid.state.rulesetVersion, f.ruleset.version, "match rulesetVersion resolves to frozen definition");
  });

  it("contract-shapes: CompiledRuleset exposes all 8 policy signatures", () => {
    assertCompiledRulesetSignatures();
  });

  it("contract-shapes: Twin snapshot deep, coherent with match fixture", () => {
    const f = load("contract-shapes.json");
    assertTwinSnapshot(f.twin, "shapes.twin");
    const mid = load("mid-game-30-15.json");
    assert.deepEqual(f.twin.matches["m1"], mid.state, "twin match mirrors frozen mid-game state");
    assert.equal(f.twin.assignments["c1"].matchId, "m1");
    assert.equal(f.twin.courts["c1"].currentMatchId, "m1");
  });

  it("contract-shapes: every TennisIntent variant validates, incl. ResolutionIntent", () => {
    const f = load("contract-shapes.json");
    assert.equal(f.intents.length, 9);
    f.intents.forEach((v: any, i: number) => assertTennisIntent(v, `shapes.intents[${i}]`));
    assert.deepEqual(f.intents.map((v: any) => v.type).sort(), [...INTENT_TYPES].sort());
    const rollback = f.intents.find((v: any) => v.type === "SCORE_ROLLBACK");
    assertCanonicalScore(rollback.to, "shapes.resolution.to");
  });
});
