// Socket.IO sync for accepted court events — thin client over server/'s
// protocol (court:event with ACK, court:sync batch flush). Dormant until
// connect() is called, so the preview works standalone; offline keeps local
// scoring. No dashboard listeners (follow-up).
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { CourtId, MatchEventRecord, MatchId } from '../../shared/types.ts';

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
