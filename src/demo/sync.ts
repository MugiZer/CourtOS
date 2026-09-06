// Socket.IO sync for court events — thin client over server's protocol
// (court:event with ACK, court:sync batch flush) plus organizer-dashboard
// listeners (tournament/court/assignment/ruleset broadcasts route into the
// store via subscribeDashboard). Dormant until connect() is called.
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Assignment, CourtId, MatchEventRecord, MatchId, MatchState, RulesetDefinition, TournamentTwinSnapshot } from '../../shared/types.ts';

let socket: Socket | null = null;

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function connect(url: string): Socket {
  disconnect();
  socket = io(url, { reconnection: true });
  return socket;
}

export function disconnect(): void {
  socket?.disconnect();
  socket = null;
}

const ACK_TIMEOUT_MS = 5000;

function withAck<T>(emit: (ack: (res: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ACK_TIMEOUT')), ACK_TIMEOUT_MS);
    emit((res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export interface EmitAck {
  ok: boolean;
  duplicate?: boolean;
  missing?: number[];
  reconcile?: string | null;
  version?: number;
  reason?: string;
}

export function emitCourtEvent(record: MatchEventRecord): Promise<EmitAck> {
  if (!socket) return Promise.reject(new Error('OFFLINE'));
  const s: Socket = socket;
  return withAck<EmitAck>((ack) => {
    s.emit('court:event', { event: record }, ack);
  });
}

export interface SyncAck {
  ok: boolean;
  applied?: number;
  duplicates?: number;
  missing?: number[];
  version?: number;
  reason?: string;
}

export function syncCourt(courtId: CourtId, matchId: MatchId, events: MatchEventRecord[]): Promise<SyncAck> {
  if (!socket) return Promise.reject(new Error('OFFLINE'));
  const s: Socket = socket;
  return withAck<SyncAck>((ack) => {
    s.emit('court:sync', { courtId, matchId, events }, ack);
  });
}

export interface CourtUpdate { courtId: CourtId; matchId: MatchId; events: MatchEventRecord[]; state: MatchState | null; reconcile: string | null; version: number }
export interface AssignmentUpdate { assignments: Assignment[]; version: number }

export function onCourtUpdate(cb: (p: CourtUpdate) => void): () => void {
  if (!socket) return () => {};
  const s: Socket = socket;
  s.on('court:update', cb);
  return () => { s.off('court:update', cb); };
}
export function onTournamentUpdate(cb: (p: TournamentTwinSnapshot) => void): () => void {
  if (!socket) return () => {};
  const s: Socket = socket;
  s.on('tournament:update', cb);
  return () => { s.off('tournament:update', cb); };
}
export function onAssignmentUpdate(cb: (p: AssignmentUpdate) => void): () => void {
  if (!socket) return () => {};
  const s: Socket = socket;
  s.on('assignment:update', cb);
  return () => { s.off('assignment:update', cb); };
}
export function onRulesetPublished(cb: (p: RulesetDefinition) => void): () => void {
  if (!socket) return () => {};
  const s: Socket = socket;
  s.on('ruleset:published', cb);
  return () => { s.off('ruleset:published', cb); };
}
