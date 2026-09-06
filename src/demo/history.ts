import type { Court, CourtEvent, Team } from './types';
import { scoreText } from './score';

export interface PointHistoryRow {
  point: number;
  score: string;
  scorer: string;
}

function inferredScoringTeam(event: CourtEvent): Team | null {
  if (event.scoringTeam !== undefined) return event.scoringTeam;
  const before = event.previousScore;
  if (!before) return event.score.winner;

  for (const team of [0, 1] as const) {
    if (event.score.points[team] > before.points[team]) return team;
  }
  for (const team of [0, 1] as const) {
    if (event.score.games[team] > before.games[team]) return team;
  }
  if (event.score.sets.length > before.sets.length) {
    const set = event.score.sets.at(-1);
    if (set && set[0] !== set[1]) return set[0] > set[1] ? 0 : 1;
  }
  return null;
}

export function pointHistory(court: Court): PointHistoryRow[] {
  return court.events
    .filter(event => event.kind === 'point' && event.matchId === court.match.id)
    .map((event, index) => {
      const team = inferredScoringTeam(event);
      return {
        point: index + 1,
        score: scoreText(event.score),
        scorer: team === null ? 'Unresolved' : court.match.teams[team].join(' / '),
      };
    });
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function pointHistoryCsv(court: Court) {
  const rows = pointHistory(court);
  return [
    ['Match', 'Point', 'Score after point', 'Scored by'],
    ...rows.map(row => [court.match.id, row.point, row.score, row.scorer]),
  ].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function downloadPointHistory(court: Court) {
  const blob = new Blob([pointHistoryCsv(court)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${court.match.id}-point-history.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
