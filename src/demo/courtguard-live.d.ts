// Types for ./courtguard-live.js (see its header for why the runtime crosses
// a `.js` re-export). Shared shapes come from shared/types.ts (tsc-clean);
// the two push.ts shapes are mirrored structurally (no logic) — the adapter
// and differential tests exercise the real runtime, so drift breaks loudly.
import type {
  ChangeoverInfo,
  CompiledRuleset,
  MatchState,
  PlayerId,
  RulesetDefinition,
  ServiceState,
  TennisIntent,
} from '../../shared/types.ts';

export interface DemoToggles {
  mode: 'SINGLES' | 'DOUBLES';
  noAd: boolean;
  deciding: 'FULL_SET' | 'MATCH_TIEBREAK';
  changeoverSec: 60 | 90;
}

export interface RulesetStore {
  current: CompiledRuleset;
  history: CompiledRuleset[];
  changeover: ChangeoverInfo;
}

export type GuardResult =
  | { accepted: true; state: MatchState }
  | { accepted: false; reason: string; state: MatchState };

export function transition(state: MatchState, intent: TennisIntent, rules?: CompiledRuleset): GuardResult;
export function compileRuleset(definition: RulesetDefinition): CompiledRuleset;
export function definitionFromToggles(t: DemoToggles, id: string, version: number): RulesetDefinition;
export function createStore(definition: RulesetDefinition, changeoverSec?: 60 | 90): RulesetStore;
export function publish(store: RulesetStore, toggles: DemoToggles): RulesetStore;
export function startMatch(
  store: RulesetStore,
  opts: { matchId: string; courtId: string; players: string[] },
): MatchState;
export function expectedReceiver(
  service: ServiceState,
  serverPoints: number,
  receiverPoints: number,
): PlayerId;
