// B03 proof — versioned push pinning: mid-match push changes nothing live,
// next match starts on vN+1; court + dashboard agree via the same version view.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { standardSingles } from "./presets.ts";
import { createStore, definitionFromToggles, publish, startMatch, versionView } from "./push.ts";

const v1toggles = { mode: "SINGLES", noAd: false, deciding: "FULL_SET", changeoverSec: 90 } as const;

describe("versioned push (upcoming-only)", () => {
  it("APPLY publishes vN+1 immediately with new policy + changeover", () => {
    const v1 = createStore(structuredClone(standardSingles), 90);
    const v2 = publish(v1, { mode: "SINGLES", noAd: true, deciding: "MATCH_TIEBREAK", changeoverSec: 60 });
    assert.equal(v2.current.definition.version, 2);
    assert.equal(v2.current.definition.id, "standard-singles");
    assert.equal(v2.current.definition.game.scoring, "NO_AD");
    assert.equal(v2.current.definition.decidingSet.kind, "MATCH_TIEBREAK");
    assert.equal(v2.changeover.durationSec, 60);
    assert.equal(v2.changeover.timeCueAtSec, 50);
    assert.equal(v2.history.length, 1);
    // Old store object untouched by the push.
    assert.equal(v1.current.definition.version, 1);
  });

  it("pinning: active stays vN, next starts vN+1, court+dashboard agree", () => {
    let store = createStore(structuredClone(standardSingles), 90);
    const active = startMatch(store, { matchId: "m1", courtId: "c1", players: ["p1", "p2"] });
    assert.equal(active.rulesetVersion, 1);

    store = publish(store, { mode: "SINGLES", noAd: true, deciding: "MATCH_TIEBREAK", changeoverSec: 60 });

    // Live match object unchanged by the push (pinned at start).
    assert.equal(active.rulesetVersion, 1);
    assert.equal(active.rulesetId, "standard-singles");

    const upcoming = startMatch(store, { matchId: "m2", courtId: "c2", players: ["p3", "p4"] });
    assert.equal(upcoming.rulesetVersion, 2);

    // One shared view: dashboard pending == court next, active still vN.
    const view = versionView(store, [active]);
    assert.deepEqual(view, {
      active: [{ matchId: "m1", courtId: "c1", version: 1 }],
      pending: 2,
    });

    // Policy proof: old pin still plays ADV (4-3 undecided), new pin plays
    // No-Ad (4-3 deciding point won) — same point score, different rules.
    const oldPin = store.history[0];
    const atAdvantage = { ...active, serverPoints: 4, receiverPoints: 3 };
    assert.equal(oldPin.gameWinner(atAdvantage), null);
    assert.equal(store.current.gameWinner({ ...upcoming, serverPoints: 4, receiverPoints: 3 }), "A");
  });

  it("toggles reject out-of-range values with reasons", () => {
    assert.throws(() => definitionFromToggles({ ...v1toggles, changeoverSec: 45 as any }, "x", 2), /changeoverSec/);
    assert.throws(() => definitionFromToggles({ ...v1toggles, deciding: "SHORT_SET" as any }, "x", 2), /deciding/);
    assert.throws(() => startMatch(createStore(structuredClone(standardSingles)), { matchId: "m", courtId: "c", players: ["solo"] }), /2 players/);
  });
});
