// B06 Socket.IO sync server — the one Node process (architecture.md §§3,11,12).
// In:  court:event / court:sync / court:status
// Out: tournament:update / court:update / ruleset:published / assignment:update
// Courts join `court:{id}` rooms (arch §3: Socket.IO removes reconnect/naming/
// ack/broadcast glue). There is NO organizer scoring-mutation path: organizer
// influence flows only through submitPlan (commitPlan-validated) and
// publishRuleset (upcoming matches only), so an offline court can never be
// silently mutated — divergence surfaces as explicit reconcile state.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import {
  createTwin,
  ingest,
  missingSequences,
  orderedLog,
  publishRuleset,
  setCourtStatus,
  snapshot,
  startChangeover,
  submitPlan,
} from "./twin.ts";
import type { Twin, TwinSeed } from "./twin.ts";
import type { TransitionFn } from "../courtguard/events.ts";
import type {
  AssignmentPlan,
  ChangeoverInfo,
  CompiledRuleset,
  ConnectivityState,
  CourtId,
  CourtStatus,
  MatchEventRecord,
  MatchId,
  RulesetDefinition,
} from "../shared/types.ts";
import type { CommitResult } from "../optimizer/solve.ts";

const room = (courtId: CourtId): string => `court:${courtId}`;

export interface CourtServer {
  url: string;
  twin: Twin;
  close(): Promise<void>;
  publishRuleset(def: RulesetDefinition): void;
  submitPlan(plan: AssignmentPlan, opts?: { now?: number }): CommitResult;
  startChangeover(courtId: CourtId, opts?: { startedAt?: number; durationSec?: number }): ChangeoverInfo;
}

export function createCourtServer(
  opts: { seed?: TwinSeed; transition?: TransitionFn; rules?: CompiledRuleset; port?: number } = {},
): Promise<CourtServer> {
  const twin = createTwin(opts.seed);
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });

  const courtUpdate = (courtId: CourtId, matchId: MatchId): void => {
    io.to(room(courtId)).emit("court:update", {
      courtId,
      matchId,
      events: orderedLog(twin, matchId),
      state: twin.matches.get(matchId) ?? null,
      reconcile: twin.reconcile.get(matchId) ?? null,
      changeover: twin.changeovers.get(courtId) ?? null,
      version: twin.version,
    });
  };
  const tournamentUpdate = (): void => {
    io.emit("tournament:update", snapshot(twin));
  };

  io.on("connection", (socket) => {
    // Court → server: single authoritative event. ACK carries the sync verdict
    // so the court can flip synced:false → true (or learn what's missing).
    socket.on("court:event", (payload: { event: MatchEventRecord }, ack?: (res: unknown) => void) => {
      const record = payload?.event;
      if (!record?.id || !record?.matchId || !record?.courtId) {
        if (typeof ack === "function") ack({ ok: false, reason: "MALFORMED_EVENT" });
        return;
      }
      socket.join(room(record.courtId));
      const r = ingest(twin, record, { transition: opts.transition, rules: opts.rules });
      if (typeof ack === "function")
        ack({ ok: true, duplicate: r.duplicate, missing: r.missing, reconcile: r.reconcile, version: r.version });
      courtUpdate(record.courtId, record.matchId);
      tournamentUpdate();
    });

    // Court → server: reconnect resend (sequence-ordered batch) AND dashboard
    // catch-up (have:[] → full log back). Joining the room here is what puts
    // dashboards on court:update without any extra event family.
    socket.on(
      "court:sync",
      (
        payload: { courtId: CourtId; matchId: MatchId; have?: number[]; events?: MatchEventRecord[] },
        ack?: (res: unknown) => void,
      ) => {
        if (!payload?.matchId || !payload?.courtId) {
          if (typeof ack === "function") ack({ ok: false, reason: "MALFORMED_SYNC" });
          return;
        }
        socket.join(room(payload.courtId));
        let applied = 0;
        let duplicates = 0;
        for (const e of [...(payload.events ?? [])].sort((a, b) => a.sequence - b.sequence)) {
          const r = ingest(twin, e, { transition: opts.transition, rules: opts.rules });
          if (r.duplicate) duplicates += 1;
          else applied += 1;
        }
        const log = orderedLog(twin, payload.matchId);
        if (typeof ack === "function")
          ack({
            ok: true, applied, duplicates,
            missing: missingSequences(twin, payload.matchId),
            events: log,
            state: twin.matches.get(payload.matchId) ?? null,
            reconcile: twin.reconcile.get(payload.matchId) ?? null,
            version: twin.version,
          });
        courtUpdate(payload.courtId, payload.matchId);
        tournamentUpdate();
      },
    );

    socket.on(
      "court:status",
      (
        payload: { courtId: CourtId; status: CourtStatus; connectivity?: ConnectivityState; currentMatchId?: MatchId | null },
        ack?: (res: unknown) => void,
      ) => {
        if (!payload?.courtId || !payload?.status) {
          if (typeof ack === "function") ack({ ok: false, reason: "MALFORMED_STATUS" });
          return;
        }
        socket.join(room(payload.courtId));
        setCourtStatus(twin, payload.courtId, payload.status, payload.connectivity, payload.currentMatchId);
        if (typeof ack === "function") ack({ ok: true, version: twin.version });
        tournamentUpdate();
      },
    );
  });

  return new Promise((resolve) => {
    http.listen(opts.port ?? 0, "127.0.0.1", () => {
      const { port } = http.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        twin,
        close: () =>
          new Promise<void>((res, rej) => {
            io.close((err?: unknown) => {
              if (err) rej(err);
              else res();
            });
          }),
        publishRuleset: (def: RulesetDefinition) => {
          publishRuleset(twin, def);
          io.emit("ruleset:published", def);
          tournamentUpdate();
        },
        submitPlan: (plan: AssignmentPlan, planOpts: { now?: number } = {}) => {
          const result = submitPlan(twin, plan, planOpts);
          if (result.ok) {
            io.emit("assignment:update", { assignments: plan.assignments, version: twin.version });
            tournamentUpdate();
          }
          return result;
        },
        startChangeover: (courtId: CourtId, coOpts: { startedAt?: number; durationSec?: number } = {}) => {
          const info = startChangeover(twin, courtId, coOpts);
          const matchId = twin.courts.get(courtId)?.currentMatchId;
          if (matchId) courtUpdate(courtId, matchId);
          tournamentUpdate();
          return info;
        },
      });
    });
  });
}
