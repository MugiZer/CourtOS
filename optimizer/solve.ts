// B07 optimizer — global receding-horizon re-solve, exhaustive over <=2 courts.
// Authority: architecture.md §13 + ADR-010/011. Stdlib only, no solver library.
// Pure: solve() NEVER mutates the Twin (fresh objects out, reads only).
// Frozen I/O: TournamentTwinSnapshot -> AssignmentPlan (shared/types.ts, READ-ONLY).
//
// Frozen-shape derivations (the snapshot carries no bracket graph / surface map):
// - participants(m) = match.service.serviceOrder (the only player list per match).
// - prereqs = participants resolved (>=2); the single seam prereqsMet() is where a
//   future dependency map plugs in. Unknown-winner (symbolic, <2 participants)
//   matches are projected over but never committed (arch §13).
// - rest/readiness = players[pid].available + restUntil vs now (missing entry = ok).
// - compat = connectivity ONLINE (no surface data in frozen shape; seam courtCompatible()).
// - live = hosted on a court (currentMatchId / PLAYING assignment) or in
//   DISPUTE/CHANGEOVER. Live PLAYING is pinned immutable; COMPLETE never assigns.
import type {
  Assignment,
  AssignmentPlan,
  AssignmentStatus,
  MatchState,
  TournamentTwinSnapshot,
} from "../shared/types.ts";

// §25 open choices: duration estimates + objective weights live here, nowhere else.
export const EST_MATCH_MS = 45 * 60 * 1000;
export const REMAINING_MS = 20 * 60 * 1000;
const MIN = 60 * 1000;
export const CHURN_WEIGHT: Record<AssignmentStatus, number> = {
  PLANNED: 1,
  ANNOUNCED: 10,
  WARMUP: 100,
  PLAYING: Infinity, // fixed — never moved (arch §13 churn semantics)
};

export interface SolveOptions {
  now?: number;
}

export interface ViolationCounts {
  courtConflict: number;
  playerOverlap: number;
  prereq: number;
  rest: number;
  compat: number;
  readiness: number;
  playingChanged: number;
  total: number;
}

export type CommitResult =
  | { ok: true }
  | { ok: false; reason: "STALE_PLAN" | "CONSTRAINT_VIOLATION"; violations?: ViolationCounts };

export function participants(m: MatchState): string[] {
  return (m.service?.serviceOrder ?? []).filter(Boolean);
}

// Seam: frozen shape has no bracket graph, so "prereqs met" == participants resolved.
export function prereqsMet(m: MatchState): boolean {
  return participants(m).length >= 2;
}

// Seam: frozen shape has no surface/division data, so compat == court online.
export function courtCompatible(twin: TournamentTwinSnapshot, courtId: string): boolean {
  return (twin.connectivity ?? {})[courtId] !== "OFFLINE";
}

function playerReady(twin: TournamentTwinSnapshot, pid: string, now: number): boolean {
  const p = (twin.players ?? {})[pid];
  if (!p) return true;
  return p.available !== false && (p.restUntil ?? 0) <= now;
}

function hostedCourts(twin: TournamentTwinSnapshot): Map<string, string> {
  // matchId -> courtId hosting it (court record or PLAYING assignment, whichever says so)
  const host = new Map<string, string>();
  for (const c of Object.values(twin.courts ?? {})) {
    if (c.currentMatchId) host.set(c.currentMatchId, c.courtId);
  }
  for (const a of Object.values(twin.assignments ?? {})) {
    if (a.status === "PLAYING" && !host.has(a.matchId)) host.set(a.matchId, a.courtId);
  }
  return host;
}

function isLive(m: MatchState, host: Map<string, string>): boolean {
  if (m.phase === "COMPLETE") return false;
  return host.has(m.matchId) || m.phase === "DISPUTE" || m.phase === "CHANGEOVER";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Exhaustive: every candidate order x every court choice. Demo scale only.
// ponytail: factorial ceiling — fine for 2 courts + tiny queues; cap the queue or
// go heuristic if tournament scale ever makes this measurable.
function permutations(arr: string[]): string[][] {
  const out: string[][] = [];
  const a = arr.slice();
  const c = new Array<number>(a.length).fill(0);
  out.push(a.slice());
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      out.push(a.slice());
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return out;
}

interface Sim {
  order: string[];
  courtOf: Record<string, string>;
  starts: Record<string, number>;
  ends: Record<string, number>;
  makespan: number;
}

function simulate(
  order: string[],
  courts: string[],
  choice: number,
  courtFreeInit: Record<string, number>,
  playerFreeInit: Record<string, number>,
  matches: Record<string, MatchState>,
): Sim {
  const courtFree: Record<string, number> = { ...courtFreeInit };
  const playerFree: Record<string, number> = { ...playerFreeInit };
  const courtOf: Record<string, string> = {};
  const starts: Record<string, number> = {};
  const ends: Record<string, number> = {};
  let makespan = 0;
  for (const c of courts) makespan = Math.max(makespan, courtFreeInit[c] ?? 0);
  for (let k = 0; k < order.length; k++) {
    const m = order[k];
    const c = courts[Math.floor(choice / Math.pow(courts.length, k)) % courts.length];
    const parts = participants(matches[m]);
    let s = courtFree[c] ?? 0;
    for (const p of parts) s = Math.max(s, playerFree[p] ?? 0);
    const e = s + EST_MATCH_MS;
    courtOf[m] = c;
    starts[m] = s;
    ends[m] = e;
    courtFree[c] = e;
    for (const p of parts) playerFree[p] = e;
    makespan = Math.max(makespan, e);
  }
  return { order: order.slice(), courtOf, starts, ends, makespan };
}

export function solve(twin: TournamentTwinSnapshot, opts?: SolveOptions): AssignmentPlan {
  const now = opts?.now ?? Date.now();
  const matches = twin.matches ?? {};
  const host = hostedCourts(twin);

  // Pinned: PLAYING assignments for unfinished matches stay exactly as-is.
  const pinned: Assignment[] = Object.values(twin.assignments ?? {})
    .filter((a) => a.status === "PLAYING" && matches[a.matchId]?.phase !== "COMPLETE")
    .map((a) => ({ matchId: a.matchId, courtId: a.courtId, status: a.status }))
    .sort((x, y) => (x.courtId < y.courtId ? -1 : 1));

  // Courts busy with live matches free at now + remaining estimate.
  const courtFreeInit: Record<string, number> = {};
  const busyCourts = new Set<string>();
  for (const [mid, cid] of host) {
    const m = matches[mid];
    if (m && isLive(m, host)) {
      busyCourts.add(cid);
      courtFreeInit[cid] = Math.max(courtFreeInit[cid] ?? now, now + REMAINING_MS);
    }
  }
  const playerFreeInit: Record<string, number> = {};
  for (const [mid] of host) {
    const m = matches[mid];
    if (m && isLive(m, host)) {
      for (const p of participants(m)) {
        playerFreeInit[p] = Math.max(playerFreeInit[p] ?? now, now + REMAINING_MS);
      }
    }
  }
  const freeCourts = Object.values(twin.courts ?? {})
    .filter((c) => !busyCourts.has(c.courtId) && courtCompatible(twin, c.courtId))
    .map((c) => c.courtId)
    .sort();
  for (const c of freeCourts) courtFreeInit[c] ??= now;

  // Candidates: unhosted, unfinished, resolved participants, all players ready/rested.
  const candidates = Object.values(matches)
    .filter(
      (m) =>
        m.phase !== "COMPLETE" &&
        m.phase !== "DISPUTE" &&
        m.phase !== "CHANGEOVER" &&
        !isLive(m, host) &&
        prereqsMet(m) &&
        participants(m).every((p) => playerReady(twin, p, now)),
    )
    .map((m) => m.matchId)
    .sort();

  // Old non-PLAYING assignments: moving/dropping one costs its status weight.
  const oldByMatch = new Map<string, { courtId: string; status: AssignmentStatus }>();
  for (const a of Object.values(twin.assignments ?? {})) {
    if (a.status !== "PLAYING") oldByMatch.set(a.matchId, { courtId: a.courtId, status: a.status });
  }

  let best: Sim | null = null;
  let bestTotal = Infinity;
  let bestBreakdown = { makespan: 0, wait: 0, idle: 0, churn: 0, total: 0 };
  let bestCommit: Assignment[] = [];

  const score = (sim: Sim): { total: number; bd: typeof bestBreakdown; commit: Assignment[] } => {
    const makespanMin = (sim.makespan - now) / MIN;
    let waitMin = 0;
    for (const m of sim.order) waitMin += (sim.starts[m] - now) / MIN;
    const busyPerCourt: Record<string, number> = {};
    for (const c of freeCourts) busyPerCourt[c] = (courtFreeInit[c] ?? now) - now;
    for (const m of sim.order) busyPerCourt[sim.courtOf[m]] += EST_MATCH_MS;
    let idleMin = 0;
    for (const c of freeCourts) idleMin += Math.max(0, sim.makespan - now - busyPerCourt[c]) / MIN;
    // Commit = first match per free court, conflict-free prefix (pairwise player-
    // disjoint + disjoint from live). Deferred matches stay projected, next horizon.
    const firstPerCourt = new Map<string, string>();
    for (const m of sim.order) {
      const c = sim.courtOf[m];
      if (!firstPerCourt.has(c)) firstPerCourt.set(c, m);
    }
    const firsts = [...firstPerCourt.entries()]
      .map(([c, m]) => ({ c, m, s: sim.starts[m] }))
      .sort((x, y) => x.s - y.s || (x.m < y.m ? -1 : 1));
    const used = new Set<string>(Object.keys(playerFreeInit));
    const commit: Assignment[] = [];
    const committedIds = new Set<string>();
    for (const f of firsts) {
      const parts = participants(matches[f.m]);
      if (parts.every((p) => !used.has(p))) {
        parts.forEach((p) => used.add(p));
        commit.push({ matchId: f.m, courtId: f.c, status: "PLANNED" });
        committedIds.add(f.m);
      }
    }
    commit.sort((x, y) => (x.courtId < y.courtId ? -1 : 1));
    let churn = 0;
    for (const a of commit) {
      const old = oldByMatch.get(a.matchId);
      if (old && old.courtId !== a.courtId) churn += CHURN_WEIGHT[old.status];
    }
    for (const [mid, old] of oldByMatch) {
      if (!committedIds.has(mid) && matches[mid]?.phase !== "COMPLETE") churn += CHURN_WEIGHT[old.status];
    }
    const total = makespanMin + waitMin + idleMin + churn;
    return { total, bd: { makespan: round2(makespanMin), wait: round2(waitMin), idle: round2(idleMin), churn, total: round2(total) }, commit };
  };

  if (candidates.length > 0 && freeCourts.length > 0) {
    const nCourtsPow = Math.pow(freeCourts.length, candidates.length);
    for (const perm of permutations(candidates)) {
      for (let choice = 0; choice < nCourtsPow; choice++) {
        const sim = simulate(perm, freeCourts, choice, courtFreeInit, playerFreeInit, matches);
        const { total, bd, commit } = score(sim);
        if (total < bestTotal) {
          bestTotal = total;
          best = sim;
          bestBreakdown = bd;
          bestCommit = commit;
        }
      }
    }
  } else {
    const makespan = Math.max(now, ...Object.values(courtFreeInit));
    const mm = (makespan - now) / MIN;
    bestBreakdown = { makespan: round2(mm), wait: 0, idle: 0, churn: 0, total: round2(mm) };
    best = { order: [], courtOf: {}, starts: {}, ends: {}, makespan };
  }

  const plan: AssignmentPlan = {
    basedOnStateVersion: twin.version,
    assignments: [...pinned, ...bestCommit],
    projectedFinishTime: best?.makespan ?? now,
    objectiveBreakdown: bestBreakdown,
  };
  return plan;
}

export function countViolations(
  twin: TournamentTwinSnapshot,
  assignments: Assignment[],
  now: number,
): ViolationCounts {
  const v: ViolationCounts = {
    courtConflict: 0,
    playerOverlap: 0,
    prereq: 0,
    rest: 0,
    compat: 0,
    readiness: 0,
    playingChanged: 0,
    total: 0,
  };
  const matches = twin.matches ?? {};
  const seenCourt = new Map<string, number>();
  for (const a of assignments) {
    seenCourt.set(a.courtId, (seenCourt.get(a.courtId) ?? 0) + 1);
    const m = matches[a.matchId];
    if (!m || !prereqsMet(m)) v.prereq++;
    if (!courtCompatible(twin, a.courtId)) v.compat++;
    if (m) {
      for (const p of participants(m)) {
        const ps = (twin.players ?? {})[p];
        if (ps) {
          if ((ps.restUntil ?? 0) > now) v.rest++;
          else if (ps.available === false) v.readiness++;
        }
      }
    }
  }
  for (const n of seenCourt.values()) if (n > 1) v.courtConflict += n - 1;
  // Committed assignments start concurrently across courts; live matches still run.
  // Keyed by match so a pinned PLAYING assignment never counts against its own live match.
  const byMatch = new Map<string, string[]>();
  for (const a of assignments) {
    if (matches[a.matchId] && !byMatch.has(a.matchId)) byMatch.set(a.matchId, participants(matches[a.matchId]));
  }
  const hosts = hostedCourts(twin);
  for (const [mid] of hosts) {
    const m = matches[mid];
    if (m && isLive(m, hosts) && !byMatch.has(mid)) byMatch.set(mid, participants(m));
  }
  const entries = [...byMatch.values()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i].some((p) => entries[j].includes(p))) v.playerOverlap++;
    }
  }
  for (const a of Object.values(twin.assignments ?? {})) {
    if (
      a.status === "PLAYING" &&
      matches[a.matchId]?.phase !== "COMPLETE" &&
      !assignments.some((n) => n.matchId === a.matchId && n.courtId === a.courtId)
    ) {
      v.playingChanged++;
    }
  }
  v.total =
    v.courtConflict + v.playerOverlap + v.prereq + v.rest + v.compat + v.readiness + v.playingChanged;
  return v;
}

// Stale-plan discard (arch §13): version moved since solve -> discard, re-solve.
// Pure: validates only, never touches the Twin (B06 server owns the append).
export function commitPlan(
  twin: TournamentTwinSnapshot,
  plan: AssignmentPlan,
  opts?: SolveOptions,
): CommitResult {
  if (twin.version !== plan.basedOnStateVersion) return { ok: false, reason: "STALE_PLAN" };
  const violations = countViolations(twin, plan.assignments, opts?.now ?? Date.now());
  if (violations.total > 0) return { ok: false, reason: "CONSTRAINT_VIOLATION", violations };
  return { ok: true };
}
