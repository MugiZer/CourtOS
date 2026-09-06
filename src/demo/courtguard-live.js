// One door for the real CourtGuard runtime. A direct `.ts` import would drag
// courtguard/rules/compiler.ts:87 (pre-existing `never`-narrowed template arg)
// into `tsc -b`, red-ing the build while backend stays read-only — so this
// file re-exports (zero logic) and courtguard-live.d.ts carries the types.
// Runtime is 100% the real engine; the differential test proves it.
export { transition } from '../../courtguard/guard.ts';
export { compileRuleset } from '../../courtguard/rules/compiler.ts';
export { createStore, definitionFromToggles, publish, startMatch } from '../../courtguard/rules/push.ts';
export { expectedReceiver } from '../../courtguard/rotation.ts';
