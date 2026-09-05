# B03 — Rulesets + versioned push

**What to build:** one engine parameterized by declarative versioned rulesets, plus the organizer's 3 toggles publishing upcoming-only.

**Blocked by:** B01 (shapes frozen; runs parallel with B02, both conform to B01's `CompiledRuleset`).

**Status:** blocked

**Authority:** architecture.md §§7,15 + ADR-007/008 (compiler validates config; started matches pin version; scoring changes apply to upcoming matches only).

- [ ] `RulesetDefinition` + `compileRuleset()` rejecting impossible config (`gamesToWin<=0`, nonsense TB trigger, etc.)
- [ ] Presets: standard singles, standard doubles, No-Ad doubles, express variant (same model), 10-pt deciding match tiebreak as distinct phase (`10-8` over, `10-9` not over)
- [ ] Demo toggles → definitions: NO-AD ON/OFF, DECIDING SET full-set/10-pt-TB (a format choice), CHANGEOVER 90s/60s; one APPLY publishes vN+1 immediately
- [ ] Pinning proof: active match stays on vN, upcoming match starts on vN+1; court + dashboard agree on pending vs active

## Verification

- **Proof:** compiler table (good defs compile, bad defs rejected with reason) + pinning test (push mid-match changes nothing live; next match uses vN+1)
- **Affected regression:** B02 core tests still pass against compiled presets
