import type { Match, Team } from './types';

// Presentation outcomes and checkpoints from demo_flow.md, section 4.
export const RALLY_WINNERS: Team[] = [0, 1, 0, 1, 0, 1, 0];
const checkpoints = ['0,0', '1,0', '1,1', '2,1', '2,2', '3,2', '3,3'];
export const RESET_SECONDS = 1.2;
export function rallyIndex(match: Match) {
  return match.id === 'M101' ? checkpoints.indexOf(match.score.points.join(',')) : match.score.points.reduce((a, b) => a + b, 0);
}
export type Position = [number, number, number];
export interface Contact { at: number; player: number; position: Position }
export function makeRally(index: number, server: number, receiver: number, ad: boolean, winner: Team, singles = false) {
  const near = server < 2 ? 1 : -1;
  const lane = ad ? 1 : -1;
  const serverPartner = singles ? server : server ^ 1;
  const receiverPartner = singles ? receiver : receiver ^ 1;
  const serverWins = (server < 2 ? 0 : 1) === winner;
  const contacts: Contact[] = [
    { at: 0.75, player: server, position: [lane * near * 1.7, 2.65, near * 12.35] },
    { at: 1.85, player: receiver, position: [-lane * near * 3.1, 1.05, -near * 10.7] },
    { at: 2.9, player: index % 2 ? serverPartner : server, position: [lane * near * 2.5, 1.15, near * (index % 2 ? 3.2 : 10.8)] },
  ];
  if (!serverWins) contacts.push({ at: 3.65, player: receiverPartner, position: [-lane * near * 1.9, 1.35, -near * 3.4] });
  const last = contacts.at(-1)!;
  const end = serverWins ? 4.15 : 4.85;
  const destination: Position = [(index % 2 ? -1 : 1) * (singles ? 3.8 : 4.8), 0.09, last.position[2] > 0 ? -9.8 : 9.8];
  return { contacts, end, destination, winner };
}
export type Rally = ReturnType<typeof makeRally>;
export function rallyDuration(winner: Team, serverTeam: Team) {
  return ((winner === serverTeam ? 4.15 : 4.85) + RESET_SECONDS) * 1000;
}
export function arc(from: Position, to: Position, t: number, duration: number): Position {
  const u = Math.max(0, Math.min(1, t));
  return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + 4.905 * duration * duration * u * (1 - u), from[2] + (to[2] - from[2]) * u];
}
export function ballAt(rally: Rally, time: number): Position {
  const first = rally.contacts[0];
  if (time < first.at) return arc([first.position[0], 1.1, first.position[2]], first.position, time / first.at, first.at);
  const index = rally.contacts.findLastIndex(c => c.at <= time);
  const hit = rally.contacts[index];
  const next = rally.contacts[index + 1];
  const end = next?.at ?? rally.end;
  const target = next?.position ?? rally.destination;
  const duration = end - hit.at;
  if (next && Math.abs(next.position[2]) < 6) return arc(hit.position, next.position, (time - hit.at) / duration, duration);
  const bounceAt = hit.at + duration * 0.72;
  const bounce: Position = next ? [hit.position[0] + (target[0] - hit.position[0]) * (index === 0 ? 0.68 : 0.82), 0.09, index === 0 ? -Math.sign(hit.position[2]) * 4.7 : target[2] * 0.72] : target;
  if (time <= bounceAt) return arc(hit.position, bounce, (time - hit.at) / (bounceAt - hit.at), bounceAt - hit.at);
  const after: Position = next ? target : [target[0] * 1.06, 0.09, target[2] + Math.sign(target[2]) * 1.4];
  return arc(bounce, after, (time - bounceAt) / (end - bounceAt), end - bounceAt);
}
