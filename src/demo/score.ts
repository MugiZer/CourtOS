import type { Match, Pair, Score, Team } from './types';

// A deterministic scorer for the local frontend preview. React only renders its
// results. Replace the demo adapter with CourtGuard events for production.
export function freshScore(): Score {
  return { points: [0, 0], games: [0, 0], sets: [], winner: null, tieBreak: false, matchTieBreak: false, serviceGame: 0 };
}
export function setWins(sets: Pair[]): Pair {
  return sets.reduce<Pair>((wins, set) => { wins[set[0] > set[1] ? 0 : 1]++; return wins; }, [0, 0]);
}
export function labels(score: Score): [string, string] {
  if (score.winner !== null) return ['—', '—'];
  if (score.tieBreak || score.matchTieBreak) return score.points.map(String) as [string, string];
  const [a, b] = score.points;
  if (a >= 3 && b >= 3) return a === b ? ['40', '40'] : a > b ? ['AD', '40'] : ['40', 'AD'];
  return [String([0, 15, 30, 40][Math.min(a, 3)]), String([0, 15, 30, 40][Math.min(b, 3)])];
}
export function scoreText(score: Score) { return labels(score).join('–'); }
export function nextScore(match: Match, team: Team): Score | null {
  if (match.phase !== 'playing' || match.score.winner !== null) return null;
  if (match.rules.noAd && match.score.points.every(p => p >= 3) && !match.score.tieBreak && !match.score.matchTieBreak && !match.receiverSide) return null;
  const s = structuredClone(match.score);
  const other: Team = team === 0 ? 1 : 0;
  s.points[team]++;
  if (s.matchTieBreak) {
    if (s.points[team] >= 10 && s.points[team] - s.points[other] >= 2) { s.winner = team; s.sets.push([...s.points]); }
    return s;
  }
  if (s.tieBreak) {
    if (s.points[team] >= 7 && s.points[team] - s.points[other] >= 2) {
      s.games[team]++;
      s.serviceGame++;
      finishSet(s, match);
    }
    return s;
  }
  if (s.points[team] >= 4 && (match.rules.noAd || s.points[team] - s.points[other] >= 2)) {
    s.points = [0, 0]; s.games[team]++; s.serviceGame++;
    if (s.games[team] >= 6 && s.games[team] - s.games[other] >= 2) finishSet(s, match);
    else if (s.games[0] === 6 && s.games[1] === 6) s.tieBreak = true;
  }
  return s;
}
function finishSet(s: Score, match: Match) {
  s.sets.push([...s.games]); const wins = setWins(s.sets);
  s.points = [0, 0]; s.tieBreak = false;
  if (wins[0] === 2 || wins[1] === 2) { s.winner = wins[0] === 2 ? 0 : 1; return; }
  s.games = [0, 0];
  if (s.sets.length === 2 && match.rules.deciding === 'tiebreak') s.matchTieBreak = true;
}
export function serverName(match: Match) {
  let turn = match.score.serviceGame;
  if (match.score.tieBreak || match.score.matchTieBreak) {
    const point = match.score.points[0] + match.score.points[1];
    turn += point === 0 ? 0 : Math.floor((point - 1) / 2) + 1;
  }
  return match.serverOrder[(match.firstServer + turn) % match.serverOrder.length];
}
export function serverTeam(match: Match): Team { return match.teams[0].includes(serverName(match)) ? 0 : 1; }
export function receiverName(match: Match) {
  const opponents = match.teams[serverTeam(match) === 0 ? 1 : 0];
  const side = match.receiverSide ?? ((match.score.points[0] + match.score.points[1]) % 2 === 0 ? 'deuce' : 'ad');
  return opponents[side === 'deuce' ? 0 : Math.min(1, opponents.length - 1)];
}
export function isDecidingPoint(match: Match) {
  return match.rules.noAd && match.phase === 'playing' && match.score.points.every(p => p >= 3) && !match.score.tieBreak && !match.score.matchTieBreak;
}
const spokenPoints = new Set(['0', '15', '30', '40']);
function splitCompactScore(value: string) {
  if (!/^\d{4}$/.test(value)) return value;
  const left = value.slice(0, 2); const right = value.slice(2);
  return spokenPoints.has(left) && spokenPoints.has(right) ? left + ' ' + right : value;
}
export function normalizeCall(value: string): string {
  return value.toLowerCase().trim().replace(/[.!?]/g, '').replace(/thirty/g, '30').replace(/fifteen/g, '15').replace(/forty/g, '40').replace(/love/g, '0').replace(/advantage/g, 'ad').replace(/deuce/g, '40 40').replace(/[-–—,]/g, ' ').replace(/\s+/g, ' ').replace(/^(\d+) all$/, '$1 $1').split(' ').map(splitCompactScore).join(' ');
}
export function resolveCall(match: Match, call: string): Team | null {
  const normalized = normalizeCall(call); const order = serverTeam(match);
  for (const team of [0, 1] as const) {
    const candidate = nextScore(match, team); if (!candidate) continue;
    const scores = labels(candidate); const spoken = order === 0 ? scores : [...scores].reverse();
    if (spoken.join(' ').toLowerCase() === normalized) return team;
  }
  return null;
}
