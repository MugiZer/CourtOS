import type { Court, CourtId, DemoState, Match, Rules } from './types';
import { freshScore } from './score';
import { paceRules } from './matchConfig';

export const standardRules: Rules = { version: 1, noAd: false, deciding: 'full', changeover: 90, pace: 'Standard', setRest: 120, matchRest: 10, estimatedMinutes: 20 };
export function initialMatch(id: CourtId, preview = false): Match {
  return {
    id: id === 1 ? 'M101' : 'M102',
    round: id === 1 ? 'Doubles' : 'Semifinal B',
    format: id === 1 ? 'Doubles' : 'Mixed doubles',
    teams: id === 1 ? [['Alex Roy', 'Sam Chen'], ['Morgan Dubois', 'Taylor Singh']] : [['Camille Martin', 'Jules Bernard'], ['Maya Laurent', 'Louis Pelletier']],
    rules: { ...standardRules, noAd: id === 1, estimatedMinutes: id === 2 ? 90 : 20 },
    score: id === 1 ? { ...freshScore(), games: [5, 4], sets: [[6, 4], [4, 6]] } : preview ? { ...freshScore(), points: [3, 2], games: [4, 4], sets: [[6, 4]] } : freshScore(),
    phase: 'playing',
    serverOrder: id === 1 ? ['Morgan Dubois', 'Alex Roy', 'Taylor Singh', 'Sam Chen'] : ['Maya Laurent', 'Camille Martin', 'Louis Pelletier', 'Jules Bernard'],
    firstServer: 1, receiverSide: null,
  };
}
export function initialCourt(id: CourtId, preview = true): Court {
  const match = initialMatch(id, preview);
  return { id, match, remoteMatch: structuredClone(match), online: true, pending: 0,
    events: preview && id === 2 ? [{ id: 'M102-opening-score', sequence: 1, kind: 'snapshot', title: 'Opening score · 40–30', detail: 'Accepted starting state. Available for dispute recovery.', at: Date.now(), source: 'Scenario', score: structuredClone(match.score), matchId: match.id, acknowledged: true }] : [], seenThrough: preview && id === 2 ? 1 : 0,
    decision: { type: 'ready', title: 'Ready for your call', detail: 'Call the score, or award a point below.' },
    changeoverEndsAt: null, timeCalled: false, rallyStartedAt: null };
}
export function initialState(preview = true): DemoState {
  return { schema: 1, revision: 0, courts: [initialCourt(1, preview), initialCourt(2, preview)], upcomingRules: { ...standardRules },
    upcomingMatches: initialUpcoming(), completedMatches: [], rulesPublished: false, plan: { status: 'idle', options: [], basedOnRevision: 0 },
    sponsor: { name: 'COURTSIDE CLUB', headline: 'A little rest.\nA better next set.', skipAds: false }, lastResult: null, storageError: false };
}
export function initialUpcoming(): Match[] {
  const express = paceRules(standardRules, 'Express', 'Mixed doubles');
  const semi = semifinal({ ...express, estimatedMinutes: 40 });
  return [semi, { ...semifinal({ ...standardRules, estimatedMinutes: 120 }), id: 'M104', round: 'Singles consolation', format: 'Singles', teams: [['Riley Tran'], ['Jordan Moreau']], serverOrder: ['Riley Tran', 'Jordan Moreau'] },
    { ...semifinal({ ...express, estimatedMinutes: 30 }), id: 'M105', round: 'Final', dependencies: ['M103', 'M102'] }];
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
