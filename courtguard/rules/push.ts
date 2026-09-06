// B03 — demo toggles -> definitions + versioned push with upcoming-only pinning.
// Authority: architecture.md §15 (3 toggles, APPLY publishes vN+1 immediately;
// active matches stay pinned, upcoming matches use the new version).
// Changeover 90s cues "Time" at 80s (§19) -> timeCueAtSec = durationSec - 10.
import type {
  ChangeoverInfo,
  CompiledRuleset,
  MatchState,
  RulesetDefinition,
} from "../../shared/types.ts";
import { compileRuleset } from "./compiler.ts";

export interface DemoToggles {
  mode: "SINGLES" | "DOUBLES";
  noAd: boolean;
  deciding: "FULL_SET" | "MATCH_TIEBREAK";
  changeoverSec: 60 | 90;
}

export interface RulesetStore {
  current: CompiledRuleset;
  history: CompiledRuleset[];
  changeover: ChangeoverInfo;
}

export function definitionFromToggles(
  t: DemoToggles,
  id: string,
  version: number,
): RulesetDefinition {
  if (t.deciding !== "FULL_SET" && t.deciding !== "MATCH_TIEBREAK")
    throw new Error(`invalid toggles: deciding must be FULL_SET|MATCH_TIEBREAK, got ${t.deciding}`);
  if (t.changeoverSec !== 60 && t.changeoverSec !== 90)
    throw new Error(`invalid toggles: changeoverSec must be 60|90, got ${t.changeoverSec}`);
  if (t.mode !== "SINGLES" && t.mode !== "DOUBLES")
    throw new Error(`invalid toggles: mode must be SINGLES|DOUBLES, got ${t.mode}`);
  return {
    id,
    version,
    participants: { mode: t.mode },
    game: { scoring: t.noAd ? "NO_AD" : "ADVANTAGE" },
    set: {
      gamesToWin: 6,
      winByGames: 2,
      tiebreak: { atGames: [6, 6], pointsToWin: 7, winByPoints: 2 },
    },
    decidingSet:
      t.deciding === "MATCH_TIEBREAK"
        ? { kind: "MATCH_TIEBREAK", pointsToWin: 10, winByPoints: 2 }
        : { kind: "NORMAL_SET" },
  };
}

function changeoverFor(durationSec: number, startedAt: number): ChangeoverInfo {
  return { startedAt, durationSec, timeCueAtSec: durationSec - 10 };
}

export function createStore(definition: RulesetDefinition, changeoverSec: 60 | 90 = 90): RulesetStore {
  return {
    current: compileRuleset(definition),
    history: [],
    changeover: changeoverFor(changeoverSec, Date.now()),
  };
}

// Organizer hits APPLY: compile toggles as vN+1 of the SAME id, publish
// immediately. Previously started matches keep referencing the old compiled
// object, so nothing live mutates (ADR-008).
export function publish(store: RulesetStore, toggles: DemoToggles): RulesetStore {
  const next = compileRuleset(
    definitionFromToggles(toggles, store.current.definition.id, store.current.definition.version + 1),
  );
  return {
    current: next,
    history: [...store.history, store.current],
    changeover: changeoverFor(toggles.changeoverSec, Date.now()),
  };
}

// Upcoming matches pin the CURRENT published version at start; the pinned
// (id, version) travels on MatchState, so court + dashboard read the same pin.
export function startMatch(
  store: RulesetStore,
  opts: { matchId: string; courtId: string; players: string[] },
): MatchState {
  const [p1, p2] = opts.players;
  if (!p1 || !p2) throw new Error("invalid match: need at least 2 players");
  const d = store.current.definition;
  return {
    matchId: opts.matchId,
    courtId: opts.courtId,
    rulesetId: d.id,
    rulesetVersion: d.version,
    phase: "PLAYING",
    serverPoints: 0,
    receiverPoints: 0,
    games: [0, 0],
    sets: [],
    inTiebreak: false,
    service: {
      servingTeam: "A",
      server: p1,
      receivingTeam: "B",
      deuceReceiver: p2,
      adReceiver: opts.players[3] ?? p2,
      serviceOrder: d.participants.mode === "DOUBLES" ? opts.players.slice(0, 4) : [p1, p2],
    },
    winner: null,
  };
}

// Dashboard/court agreement view: every active match shows its PINNED version,
// pending shows what the NEXT match will use. After a push they differ by
// exactly the pin — that is the proof, not a bug.
export function versionView(store: RulesetStore, active: MatchState[]): {
  active: Array<{ matchId: string; courtId: string; version: number }>;
  pending: number;
} {
  return {
    active: active.map((m) => ({ matchId: m.matchId, courtId: m.courtId, version: m.rulesetVersion })),
    pending: store.current.definition.version,
  };
}
