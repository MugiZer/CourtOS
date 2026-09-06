// B06 Tournament Twin — one Node process, in-memory Maps (architecture.md §12).
// Authority: architecture.md §§3,4,11,12 + shared/types.ts (frozen, read-only).
// Scoring math is NEVER computed here: court records arrive authoritative and are
// stored verbatim; replay()/appendEvent (courtguard) are integrity black boxes,
// commitPlan() (optimizer) is the plan consume-seam. Erasable-syntax TS only.
import { replay } from "../courtguard/events.ts";
import type { TransitionFn } from "../courtguard/events.ts";
import { commitPlan } from "../optimizer/solve.ts";
import type { CommitResult } from "../optimizer/solve.ts";
import type {
  Assignment,
  AssignmentPlan,
  ChangeoverInfo,
  CompiledRuleset,
  ConnectivityState,
  CourtId,
  CourtStatus,
  MatchEventRecord,
  MatchId,
  MatchState,
  PlayerState,
  RulesetDefinition,
  SponsorState,
  TournamentTwinSnapshot,
} from "../shared/types.ts";

// §12 Twin with Maps (snapshot() flattens to Records for the wire).
export interface Twin {
  version: number;
  courts: Map<CourtId, { courtId: CourtId; status: CourtStatus; currentMatchId: MatchId | null }>;
  matches: Map<MatchId, MatchState>;
  players: Map<string, PlayerState>;
  assignments: Map<CourtId, Assignment>;
  rulesets: Map<string, RulesetDefinition>;
  connectivity: Map<CourtId, ConnectivityState>;
  sponsor: SponsorState;
  logs: Map<MatchId, MatchEventRecord[]>;
  seen: Set<string>; // deterministic-id dedupe
  reconcile: Map<MatchId, string>; // explicit reconcile state — never silent
  changeovers: Map<CourtId, ChangeoverInfo>;
}

export interface TwinSeed {
  courts?: CourtId[];
  matches?: MatchState[];
  rulesets?: RulesetDefinition[];
}

export function createTwin(seed: TwinSeed = {}): Twin {
  const courts: Twin["courts"] = new Map();
  for (const courtId of seed.courts ?? ["c1", "c2"])
    courts.set(courtId, { courtId, status: "FREE", currentMatchId: null });
  const matches = new Map<MatchId, MatchState>();
  for (const m of seed.matches ?? []) matches.set(m.matchId, m);
  const rulesets = new Map<string, RulesetDefinition>();
  for (const r of seed.rulesets ?? []) rulesets.set(r.id, r);
  const connectivity = new Map<CourtId, ConnectivityState>();
  for (const courtId of courts.keys()) connectivity.set(courtId, "ONLINE");
  return {
    version: 0, courts, matches, players: new Map(), assignments: new Map(),
    rulesets, connectivity, sponsor: { creativeId: null },
    logs: new Map(), seen: new Set(), reconcile: new Map(), changeovers: new Map(),
  };
}

export interface IngestResult {
  applied: boolean;
  duplicate: boolean;
  missing: number[];
  reconcile: string | null;
  version: number;
}

// Court-authoritative ingest (§11 conflict policy): the record is stored verbatim,
// never reinterpreted. Duplicates (same id OR same match+sequence) are ignored.
// Gaps are accepted but reported so the server can request them; a gapless log
// whose chain replay() rejects is surfaced as explicit reconcile state.
export function ingest(
  twin: Twin,
  record: MatchEventRecord,
  opts: { transition?: TransitionFn; rules?: CompiledRuleset } = {},
): IngestResult {
  const log = twin.logs.get(record.matchId) ?? [];
  if (twin.seen.has(record.id) || log.some((e) => e.sequence === record.sequence)) {
    twin.logs.set(record.matchId, log);
    return { applied: false, duplicate: true, missing: missingSequences(twin, record.matchId), reconcile: twin.reconcile.get(record.matchId) ?? null, version: twin.version };
  }
  log.push(record);
  log.sort((a, b) => a.sequence - b.sequence);
  twin.logs.set(record.matchId, log);
  twin.seen.add(record.id);
  twin.version += 1;
  // Mirror the court's truth: highest-sequence resultingState (no math here).
  twin.matches.set(record.matchId, log[log.length - 1].resultingState);
  const missing = missingSequences(twin, record.matchId);
  if (missing.length > 0)
    return { applied: true, duplicate: false, missing, reconcile: null, version: twin.version };
  try {
    if (opts.transition) replay(log, opts.transition, opts.rules);
    else replay(log);
    twin.reconcile.delete(record.matchId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "REPLAY_DIVERGED";
    twin.reconcile.set(record.matchId, reason);
    return { applied: true, duplicate: false, missing, reconcile: reason, version: twin.version };
  }
  return { applied: true, duplicate: false, missing, reconcile: null, version: twin.version };
}

// Sequences in 1..max absent from the log — the "request missing ranges" half of §11.
export function missingSequences(twin: Twin, matchId: MatchId): number[] {
  const log = twin.logs.get(matchId) ?? [];
  if (!log.length) return [];
  const have = new Set(log.map((e) => e.sequence));
  const max = log.reduce((m, e) => Math.max(m, e.sequence), 0);
  const missing: number[] = [];
  for (let s = 1; s <= max; s++) if (!have.has(s)) missing.push(s);
  return missing;
}

export function orderedLog(twin: Twin, matchId: MatchId): MatchEventRecord[] {
  return [...(twin.logs.get(matchId) ?? [])].sort((a, b) => a.sequence - b.sequence);
}

// §13 consume-seam: plans go through optimizer commitPlan, never around it.
// commitPlan is pure (validates only) — the Twin append happens here on ok.
export function submitPlan(
  twin: Twin,
  plan: AssignmentPlan,
  opts: { now?: number } = {},
): CommitResult {
  const result = commitPlan(snapshot(twin), plan, opts.now === undefined ? undefined : { now: opts.now });
  if (!result.ok) return result;
  for (const a of plan.assignments) twin.assignments.set(a.courtId, { ...a });
  twin.version += 1;
  return result;
}

// §15 rule push: versioned publish only; active matches keep their pinned version
// (nothing here touches a live match's rulesetVersion — pinning is structural).
export function publishRuleset(twin: Twin, def: RulesetDefinition): RulesetDefinition {
  twin.rulesets.set(def.id, def);
  twin.version += 1;
  return def;
}

export function setCourtStatus(
  twin: Twin,
  courtId: CourtId,
  status: CourtStatus,
  connectivity?: ConnectivityState,
  currentMatchId?: MatchId | null,
): void {
  twin.courts.set(courtId, {
    courtId,
    status,
    currentMatchId: currentMatchId ?? twin.courts.get(courtId)?.currentMatchId ?? null,
  });
  if (connectivity) twin.connectivity.set(courtId, connectivity);
  twin.version += 1;
}

// §19 changeover: authoritative start timestamp (refresh-safe) + "Time" cue at
// duration-10 (90s → 80s per fixture). Pure derivation — a refresh recomputes
// from the same startedAt instead of restarting a counter.
export const CHANGEOVER_DEFAULT_SEC = 90;

export function startChangeover(
  twin: Twin,
  courtId: CourtId,
  opts: { startedAt?: number; durationSec?: number } = {},
): ChangeoverInfo {
  const durationSec = opts.durationSec ?? CHANGEOVER_DEFAULT_SEC;
  const info: ChangeoverInfo = {
    startedAt: opts.startedAt ?? Date.now(),
    durationSec,
    timeCueAtSec: durationSec - 10,
  };
  twin.changeovers.set(courtId, info);
  twin.version += 1;
  return info;
}

export interface ChangeoverStatus {
  elapsedSec: number;
  remainingSec: number;
  timeCue: boolean; // "Time" cue — play the audio cue when true
  done: boolean;
}

export function changeoverStatus(info: ChangeoverInfo, now: number = Date.now()): ChangeoverStatus {
  const elapsedSec = Math.max(0, Math.floor((now - info.startedAt) / 1000));
  return {
    elapsedSec,
    remainingSec: Math.max(0, info.durationSec - elapsedSec),
    timeCue: elapsedSec >= info.timeCueAtSec,
    done: elapsedSec >= info.durationSec,
  };
}

// One Map→Record copy: clone=true shallow-copies values (courts/players/
// assignments), clone=false keeps references (matches/rulesets/connectivity)
// — identical to the seven hand-rolled loops this replaces.
function toRecord(map: Map<string, any>, clone = false): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of map) out[k] = clone ? { ...v } : v;
  return out;
}

// §12 JSON-friendly snapshot (Records, not Maps) for tournament:update.
export function snapshot(twin: Twin): TournamentTwinSnapshot {
  return {
    version: twin.version,
    courts: toRecord(twin.courts, true),
    matches: toRecord(twin.matches),
    players: toRecord(twin.players, true),
    assignments: toRecord(twin.assignments, true),
    rulesets: toRecord(twin.rulesets),
    connectivity: toRecord(twin.connectivity),
    sponsor: { ...twin.sponsor },
  };
}
