import type { Plan } from './types';

// Explicit, tiny fixture comparison; not a replacement for the global optimizer.
// Both rows evaluate the best continuation conditional on the first choice.
export function compareSchedules(consolationDuration = 10, semifinalDuration = 20, court2Remaining = 5, rest = 10, finalDuration = 20): Plan[] {
  const semiCourt: 1 | 2 = consolationDuration < court2Remaining ? 1 : 2;
  const semiStart = Math.min(consolationDuration, court2Remaining);
  const semiEnd = semiStart + semifinalDuration;
  const finalStartA = Math.max(semiEnd, court2Remaining) + rest;
  const consolationCourt: 1 | 2 = semifinalDuration < court2Remaining ? 1 : 2;
  const consolationStart = Math.min(semifinalDuration, court2Remaining);
  const finalStartB = Math.max(semifinalDuration, court2Remaining) + rest;
  return [
    { first: 'consolation', finish: Math.max(finalStartA + finalDuration, consolationDuration), items: [
      { match: 'M104', label: 'Consolation', court: 1, start: 0, end: consolationDuration, projected: true },
      { match: 'M102', label: 'Semifinal B', court: 2, start: 0, end: court2Remaining, projected: true },
      { match: 'M103', label: 'Semifinal A', court: semiCourt, start: semiStart, end: semiEnd, projected: true },
      { match: 'M105', label: 'Final', court: semiCourt, start: finalStartA, end: finalStartA + finalDuration, projected: true },
    ]},
    { first: 'semifinal', finish: Math.max(finalStartB + finalDuration, consolationStart + consolationDuration), items: [
      { match: 'M103', label: 'Semifinal A', court: 1, start: 0, end: semifinalDuration, projected: false },
      { match: 'M102', label: 'Semifinal B', court: 2, start: 0, end: court2Remaining, projected: true },
      { match: 'M104', label: 'Consolation', court: consolationCourt, start: consolationStart, end: consolationStart + consolationDuration, projected: true },
      { match: 'M105', label: 'Final', court: 1, start: finalStartB, end: finalStartB + finalDuration, projected: true },
    ]},
  ];
}
