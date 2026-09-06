import type { Match, MatchFormat, Rules } from './types';

export function serviceOrder(teams: Match['teams']): string[] {
  return teams[0].flatMap((player, i) => [player, teams[1][i]]);
}

export function validateMatch(match: Match): void {
  const size = match.format === 'Singles' ? 1 : 2;
  const players = match.teams.flat();
  if (match.teams.some(team => team.length !== size) || players.some(p => !p.trim()) || new Set(players).size !== size * 2)
    throw new Error(`${match.format} requires ${size * 2} distinct players.`);
  if (match.serverOrder.length !== players.length || new Set(match.serverOrder).size !== players.length || match.serverOrder.some(p => !players.includes(p)))
    throw new Error('Service order must contain every player once.');
  if (match.serverOrder.some((p, i, order) => match.teams[0].includes(p) === match.teams[0].includes(order[(i + 1) % order.length])))
    throw new Error('Service order must alternate teams.');
  if (!Number.isInteger(match.firstServer) || match.firstServer < 0 || match.firstServer >= players.length) throw new Error('Choose a valid first server.');
  validateRules(match.rules);
}

export function validateRules(rules: Rules): void {
  if (![0, 60, 90].includes(rules.changeover) || ![rules.setRest, rules.matchRest].every(n => Number.isFinite(n) && n >= 0) || !Number.isFinite(rules.estimatedMinutes) || rules.estimatedMinutes <= 0)
    throw new Error('Duration must be positive and rest periods cannot be negative.');
  if (rules.pace === 'Express' && (rules.changeover !== 0 || rules.setRest !== 0 || rules.matchRest !== 0))
    throw new Error('Express has no scheduled rest periods. Choose Standard to configure rest.');
}

export function defaultDuration(format: MatchFormat, pace: Rules['pace']): number {
  return format === 'Singles' ? pace === 'Express' ? 8 : 10 : pace === 'Express' ? 15 : 20;
}

export function paceRules(rules: Rules, pace: Rules['pace'], format: MatchFormat = 'Doubles'): Rules {
  return { ...rules, pace, estimatedMinutes: defaultDuration(format, pace), ...(pace === 'Express' ? { noAd: true, deciding: 'tiebreak' as const, changeover: 0 as const, setRest: 0, matchRest: 0 } : { changeover: 90 as const, setRest: 120, matchRest: 10 }) };
}

export function formatTeams(teams: Match['teams'], format: MatchFormat): Match['teams'] {
  return teams.map(team => format === 'Singles' ? team.slice(0, 1) : [team[0], team[1] ?? '']) as Match['teams'];
}

export function breakAfter(before: Match, after: Match['score']): number {
  if (after.winner !== null) return 0;
  if (after.sets.length > before.score.sets.length) return before.rules.setRest;
  const games = after.games[0] + after.games[1];
  return after.serviceGame !== before.score.serviceGame && games > 1 && games % 2 === 1 ? before.rules.changeover : 0;
}
