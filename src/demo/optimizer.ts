import type { CourtId, DemoState, Match, Plan, ScheduledItem } from './types';
import { serviceOrder } from './matchConfig';

export interface SchedulingMatch {
  id: string; label: string; players: string[]; duration: number; rest: number;
  dependencies: string[]; readyAt?: number;
}
export interface OccupiedCourt { match: string; label: string; court: CourtId; end: number; players: string[] }

// Enumerate the small demo horizon, retaining the best continuation for each first match.
export function optimize(matches: SchedulingMatch[], occupied: OccupiedCourt[], courts: CourtId[] = [1, 2], playerReady: Record<string, number> = {}): Plan[] {
  const best = new Map<string, Plan>();
  const initial: ScheduledItem[] = occupied.map(m => ({ ...m, start: 0, projected: true }));
  const playersByMatch = new Map([...matches.map(m => [m.id, m.players] as const), ...occupied.map(m => [m.match, m.players] as const)]);
  function visit(pending: SchedulingMatch[], items: ScheduledItem[]) {
    if (!pending.length) {
      const first = items.filter(i => matches.some(m => m.id === i.match)).sort((a, b) => a.start - b.start)[0]?.match;
      if (!first) return;
      const finish = Math.max(0, ...items.map(m => m.end));
      if (!best.has(first) || best.get(first)!.finish > finish) best.set(first, { first: first === 'M104' ? 'consolation' : 'semifinal', firstMatch: first, finish, items });
      return;
    }
    for (const match of pending) {
      if (match.dependencies.some(id => !items.some(item => item.match === id))) continue;
      for (const court of courts) {
        const courtEnd = Math.max(0, ...items.filter(i => i.court === court).map(i => i.end));
        const prior = items.filter(i => match.dependencies.includes(i.match) || playersByMatch.get(i.match)?.some(p => match.players.includes(p)));
        const start = Math.max(courtEnd, match.readyAt ?? 0, ...match.players.map(p => playerReady[p] ?? 0), ...prior.map(i => i.end + match.rest));
        const item = { match: match.id, label: match.label, court, start, end: start + match.duration, projected: true };
        visit(pending.filter(m => m !== match), [...items, item]);
      }
    }
  }
  if (matches.some(m => !Number.isFinite(m.duration) || m.duration <= 0 || !Number.isFinite(m.rest) || m.rest < 0)) throw new Error('Invalid scheduling duration or rest.');
  visit(matches, initial);
  return [...best.values()].sort((a, b) => a.finish - b.finish || (matches.find(m => m.id === b.firstMatch)?.duration ?? 0) - (matches.find(m => m.id === a.firstMatch)?.duration ?? 0));
}

export function resolvedMatch(state: DemoState, match: Match): Match | null {
  if (!match.dependencies?.length) return match;
  const predecessors = match.dependencies.map(id => state.completedMatches.find(r => r.match.id === id)?.match ?? state.courts.find(c => c.match.id === id && c.match.phase === 'complete')?.match);
  if (predecessors.some(m => !m || m.score.winner === null)) return null;
  const teams = predecessors.map(m => [...m!.teams[m!.score.winner!]]) as Match['teams'];
  if (teams.some(t => t.length !== (match.format === 'Singles' ? 1 : 2))) return null;
  if (new Set(teams.flat()).size !== teams.flat().length) return null;
  return { ...match, teams, serverOrder: serviceOrder(teams) };
}

export function remainingMinutes(match: Match): number {
  if (match.phase === 'complete') return 0;
  if (match.phase === 'warmup') return match.rules.estimatedMinutes;
  const completed = match.score.sets.reduce((n, set) => n + Math.min(12, set[0] + set[1]), 0) + match.score.games[0] + match.score.games[1];
  return Math.max(1, Math.ceil(match.rules.estimatedMinutes * Math.max(0.05, 1 - completed / 36)));
}

export function scheduleState(state: DemoState, now = Date.now()): Plan[] {
  const completed = new Map(state.completedMatches.map(r => [r.match.id, r]));
  const occupied = state.courts.filter(c => c.match.phase !== 'complete').map(c => ({ match: c.match.id, label: c.match.round, court: c.id, end: Math.max(remainingMinutes(c.match), ((c.changeoverEndsAt ?? now) - now) / 60000), players: c.match.teams.flat() }));
  const all = [...state.upcomingMatches, ...state.courts.map(c => c.match), ...state.completedMatches.map(r => r.match)];
  function participants(match: Match): string[] {
    const resolved = resolvedMatch(state, match);
    if (resolved) return resolved.teams.flat();
    return (match.dependencies ?? []).flatMap(id => { const parent = all.find(m => m.id === id); return parent ? participants(parent) : []; });
  }
  const pending = state.upcomingMatches.filter(m => !completed.has(m.id) && !state.courts.some(c => c.match.id === m.id));
  const jobs = pending.map(m => {
    const players = participants(m);
    const readyAt = Math.max(0, ...state.completedMatches.filter(r => r.match.teams.flat().some(p => players.includes(p))).map(r => (r.finishedAt - now) / 60000 + m.rules.matchRest));
    return { id: m.id, label: m.round, players, duration: m.rules.estimatedMinutes, rest: m.rules.matchRest, readyAt,
      dependencies: (m.dependencies ?? []).filter(id => !completed.has(id)) };
  });
  return optimize(jobs, occupied, state.courts.filter(c => c.online && c.match.phase !== 'dispute').map(c => c.id));
}
