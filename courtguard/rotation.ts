// B04 doubles + tiebreak rotation — the ONE thing the compiler does not own.
// Authority: architecture.md §8 + shared/types.ts ServiceState (frozen, mirrored only).
// serviceOrder is the cyclic server rotation and MUST alternate teams (tennis
// invariant): singles [p1, p2], doubles [A1, B1, A2, B2]. Everything below is
// pure index math over (serviceOrder, server, point number) — no counters, no
// verdicts (game/set/TB winners stay in the CompiledRuleset).
// Erasable-syntax TS so `node --test` loads it directly. Zero deps.
import type { PlayerId, ServiceState, TeamId } from "../shared/types.ts";

const other = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

function posOf(order: PlayerId[], p: PlayerId): number {
  const i = order.indexOf(p);
  return i < 0 ? 0 : i;
}

// Receiving pair for the team NOT serving. Under the alternating-order
// invariant the serving team's players share serveIdx parity, so the receivers
// are the opposite-parity entries (singles: the one other player).
function receivers(order: PlayerId[], serveIdx: number): {
  deuceReceiver: PlayerId;
  adReceiver: PlayerId;
} {
  if (order.length <= 2) {
    const r = order[(serveIdx + 1) % order.length] ?? order[0] ?? "";
    return { deuceReceiver: r, adReceiver: r };
  }
  const rp = (serveIdx + 1) % 2;
  const d = order[rp] ?? order[0] ?? "";
  const a = order[rp + 2] ?? order[0] ?? "";
  return { deuceReceiver: d, adReceiver: a };
}

// Per-game advance: next server in the rotation, teams flip, receivers reset
// to the new receiving team's pair. Singles-identical to the old flip.
export function advanceGameService(service: ServiceState): ServiceState {
  const order = service.serviceOrder;
  const i = (posOf(order, service.server) + 1) % order.length;
  const receiving = receivers(order, i);
  return {
    servingTeam: other(service.servingTeam),
    server: order[i] ?? service.server,
    receivingTeam: service.servingTeam,
    deuceReceiver: receiving.deuceReceiver,
    adReceiver: receiving.adReceiver,
    serviceOrder: order,
  };
}

// Tiebreak 1-2-2-2: point 0 solo, then pairs. Steps in the rotation from the
// first TB server to point n's server.
const tbSteps = (n: number): number => (n === 0 ? 0 : 1 + ((n - 1) >> 1));

function tbServiceAt(
  order: PlayerId[],
  pos0: number,
  t0: TeamId,
  n: number,
): ServiceState {
  const i = (pos0 + tbSteps(n)) % order.length;
  const servingTeam: TeamId = i % 2 === pos0 % 2 ? t0 : other(t0);
  const receiving = receivers(order, i);
  return {
    servingTeam,
    server: order[i] ?? order[pos0] ?? "",
    receivingTeam: other(servingTeam),
    deuceReceiver: receiving.deuceReceiver,
    adReceiver: receiving.adReceiver,
    serviceOrder: order,
    tiebreakPointNumber: n,
  };
}

// First TB point: next in the rotation after the last game server.
export function enterTiebreakService(service: ServiceState): ServiceState {
  const order = service.serviceOrder;
  const pos0 = (posOf(order, service.server) + 1) % order.length;
  return tbServiceAt(order, pos0, other(service.servingTeam), 0);
}

// The live TB server is a pure function of (pos0, n), so the first-server
// context inverts exactly — no stored counter, zero drift by construction.
function tbContext(service: ServiceState, n: number): { pos0: number; t0: TeamId } {
  const order = service.serviceOrder;
  const pos = posOf(order, service.server);
  const pos0 = (((pos - tbSteps(n)) % order.length) + order.length) % order.length;
  const t0: TeamId = pos % 2 === pos0 % 2 ? service.servingTeam : other(service.servingTeam);
  return { pos0, t0 };
}

// Service for TB point nextPoint (points played so far), derived from the
// current service + rotation — never ad-hoc UI state.
export function advanceTiebreakService(service: ServiceState, nextPoint: number): ServiceState {
  const ctx = tbContext(service, nextPoint - 1);
  return tbServiceAt(service.serviceOrder, ctx.pos0, ctx.t0, nextPoint);
}

// Stable TB scoring reference: during a tiebreak, serverPoints counts the
// points won by the team that served the TB's first point (t0) — the frozen
// team B02's seeds already assume. Inverts exactly for engine-driven TBs;
// deterministic for mid-TB seeds (which carry no first-server memory).
export function tbFirstTeam(service: ServiceState, pointsPlayed: number): TeamId {
  return tbContext(service, pointsPlayed).t0;
}

// Post-TB restore: the TB's first server receives the next set's first game,
// so play resumes one rotation step after them (ITF order).
export function exitTiebreakService(service: ServiceState, lastPoint: number): ServiceState {
  const order = service.serviceOrder;
  const ctx = tbContext(service, lastPoint);
  const i = (ctx.pos0 + 1) % order.length;
  const receiving = receivers(order, i);
  return {
    servingTeam: other(ctx.t0),
    server: order[i] ?? service.server,
    receivingTeam: ctx.t0,
    deuceReceiver: receiving.deuceReceiver,
    adReceiver: receiving.adReceiver,
    serviceOrder: order,
  };
}

// Re-derive the TB service after an explicit point reset (SCORE_ROLLBACK):
// the first-server context inverts exactly from the pre-reset state, so the
// rotation re-syncs to the rollback target with zero drift.
export function resyncTiebreakService(
  service: ServiceState,
  fromPoint: number,
  toPoint: number,
): ServiceState {
  const ctx = tbContext(service, fromPoint);
  return tbServiceAt(service.serviceOrder, ctx.pos0, ctx.t0, toPoint);
}

// Side change every 6 TB points (ends swap at 6, 12, ...).
export const shouldChangeEnds = (tiebreakPointsPlayed: number): boolean =>
  tiebreakPointsPlayed > 0 && tiebreakPointsPlayed % 6 === 0;

// Deuce/ad receiver for the upcoming point: even totals → deuce court.
export function expectedReceiver(
  service: ServiceState,
  serverPoints: number,
  receiverPoints: number,
): PlayerId {
  return (serverPoints + receiverPoints) % 2 === 0 ? service.deuceReceiver : service.adReceiver;
}
