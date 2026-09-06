import type { Court, CourtId, DemoState, Match, Rules } from './types';
import { freshScore } from './score';

export const standardRules: Rules = { version: 1, noAd: false, deciding: 'full', changeover: 90 };
export function initialMatch(id: CourtId): Match {
  return {
    id: id === 1 ? 'M101' : 'M102',
    round: id === 1 ? 'Doubles' : 'Semifinal B',
    format: id === 1 ? 'Doubles' : 'Mixed doubles',
    teams: id === 1 ? [['Alex Roy', 'Sam Chen'], ['Morgan Dubois', 'Taylor Singh']] : [['Camille Martin', 'Jules Bernard'], ['Maya Laurent', 'Louis Pelletier']],
    rules: { ...standardRules, noAd: id === 1 },
    score: { ...freshScore(), games: [5, 4], sets: [[6, 4], [4, 6]] },
    phase: 'playing',
    serverOrder: id === 1 ? ['Morgan Dubois', 'Alex Roy', 'Taylor Singh', 'Sam Chen'] : ['Maya Laurent', 'Camille Martin', 'Louis Pelletier', 'Jules Bernard'],
    firstServer: 1, receiverSide: null,
  };
}
export function initialCourt(id: CourtId): Court {
  const match = initialMatch(id);
  return { id, match, remoteMatch: structuredClone(match), online: true, pending: 0, events: [], seenThrough: 0,
    decision: { type: 'ready', title: 'Ready for your call', detail: 'Call the score, or award a point below.' },
    changeoverEndsAt: null, timeCalled: false, rallyStartedAt: null };
}
export function initialState(): DemoState {
  return { schema: 1, revision: 0, courts: [initialCourt(1), initialCourt(2)], upcomingRules: { ...standardRules },
    rulesPublished: false, plan: { status: 'idle', options: [], basedOnRevision: 0 },
    sponsor: { name: 'COURTSIDE CLUB', headline: 'A little rest.\nA better next set.' }, lastResult: null, storageError: false };
}
export function semifinal(rules: Rules): Match {
  return { id: 'M103', round: 'Semifinal A', format: 'Mixed doubles', teams: [['Noor Ali', 'Émile Gagnon'], ['Léa Tremblay', 'Owen Park']], rules: { ...rules },
    score: freshScore(), phase: 'warmup', serverOrder: ['Noor Ali', 'Léa Tremblay', 'Émile Gagnon', 'Owen Park'], firstServer: 0, receiverSide: null };
}
export const upcoming = [
  { id: 'M103', title: 'Semifinal A', format: 'Mixed doubles', teams: ['Ali / Gagnon', 'Tremblay / Park'], status: 'Ready to play', estimate: 20 },
  { id: 'M104', title: 'Consolation', format: 'Singles', teams: ['Riley Tran', 'Jordan Moreau'], status: 'Waiting longest', estimate: 10 },
  { id: 'M105', title: 'Final', format: 'Mixed doubles', teams: ['Winner of Semifinal A', 'Winner of Semifinal B'], status: 'Awaiting results', estimate: 20 },
];
