import { useSyncExternalStore } from 'react';
import { initialState, initialCourt, semifinal } from './fixtures';
import { freshScore, isDecidingPoint, labels, normalizeCall, scoreText } from './score';
import { ackRecord, commitDispute, commitPoint, commitRollback, commitScoreCall, confirmAll, engineOptions, noteAccepted, noteRejected, pendingFor, publishDemoRules, toDisplay } from './guard-adapter';
import type { GuardCommit } from './guard-adapter';
import { emitCourtEvent, isConnected, onAssignmentUpdate, onCourtUpdate, onRulesetPublished, onTournamentUpdate, syncCourt } from './sync';
import type { MatchEventRecord, MatchState } from '../../shared/types.ts';
import { compareSchedules } from './schedule';
import { timeCallDue } from './changeover';
import type { Court, CourtEvent, CourtId, DemoState, EventKind, Rules, Team } from './types';

const KEY = 'courtos.frontend-preview.v1';
function readStored(): DemoState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.schema === 1 && Array.isArray(saved.courts) && saved.courts.length === 2 && saved.courts.every((c: Court) => c.match?.score && Array.isArray(c.events))) return saved;
  } catch { /* An incompatible preview snapshot is safe to reset. */ }
  return initialState();
}
let state = readStored();
const listeners = new Set<() => void>();
let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => listeners.forEach(fn => fn());
function update(fn: (draft: DemoState) => void) {
  const draft = structuredClone(state); fn(draft); draft.revision++;
  try { localStorage.setItem(KEY, JSON.stringify(draft)); draft.storageError = false; }
  catch { draft.storageError = true; }
  state = draft; notify();
}
window.addEventListener('storage', e => {
  if (e.key === KEY && e.newValue) { state = readStored(); notify(); }
});
window.addEventListener('offline', () => { for (const id of [1, 2] as const) setOnline(id, false); });
window.addEventListener('online', () => { for (const id of [1, 2] as const) setOnline(id, true); });
export function useDemo() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state); }
export function getState() { return state; }
export function unread(c: Court) { return c.events.filter(e => e.sequence > c.seenThrough && ['point', 'correction', 'blocked', 'dispute', 'resumed', 'assignment'].includes(e.kind)).length; }
function event(c: Court, kind: EventKind, title: string, detail: string, source: CourtEvent['source']) {
  c.events.push({ id: crypto.randomUUID(), sequence: (c.events.at(-1)?.sequence ?? 0) + 1, kind, title, detail, at: Date.now(), source, score: structuredClone(c.match.score), matchId: c.match.id, acknowledged: c.online });
  if (!c.online) c.pending++; else c.remoteMatch = structuredClone(c.match);
  return c.events.at(-1)!;
}
const courtKey = (id: CourtId) => 'c' + id;
// Build the server envelope for an accepted commit (same demo event id +
// sequence, single sequence space) and emit it when a server is connected.
// The demo event stays unacknowledged until the server ACKs it.
function trackAccepted(id: CourtId, source: CourtEvent['source'], commit: GuardCommit, heard?: string) {
  const ev = state.courts[id - 1].events.at(-1)!;
  const record: MatchEventRecord = noteAccepted({ matchId: ev.matchId, id: ev.id, sequence: ev.sequence, courtId: courtKey(id), source, commit, transcript: heard });
  if (state.courts[id - 1].online && isConnected()) {
    emitCourtEvent(record).then(
      () => { ackRecord(record.matchId, ev.id); markAcknowledged(id, ev.id); },
      () => { markUnacked(id, ev.id); },
    );
  }
}
function trackRejected(id: CourtId, source: CourtEvent['source'], commit: GuardCommit, heard?: string) {
  const ev = state.courts[id - 1].events.at(-1)!;
  const record: MatchEventRecord = noteRejected({ matchId: ev.matchId, id: ev.id, sequence: ev.sequence, courtId: courtKey(id), source, commit, transcript: heard });
  if (state.courts[id - 1].online && isConnected()) {
    emitCourtEvent(record).then(
      () => { ackRecord(record.matchId, ev.id); markAcknowledged(id, ev.id); },
      () => { markUnacked(id, ev.id); },
    );
  }
}
export function markAcknowledged(id: CourtId, eventId: string) {
  update(s => { const e = s.courts[id - 1].events.find(e => e.id === eventId); if (e) e.acknowledged = true; });
}
function markUnacked(id: CourtId, eventId: string) {
  update(s => { const c = s.courts[id - 1]; const e = c.events.find(e => e.id === eventId); if (e) { e.acknowledged = false; c.pending++; } });
}
export function markSeen(id: CourtId) { update(s => { const c = s.courts[id - 1]; c.seenThrough = c.events.at(-1)?.sequence ?? 0; }); }
export function selectReceiver(id: CourtId, side: 'deuce' | 'ad') {
  update(s => { const c = s.courts[id - 1]; c.match.receiverSide = side; if (c.online) c.remoteMatch = structuredClone(c.match); });
}
export function awardPoint(id: CourtId, team: Team, source: CourtEvent['source'] = 'Touch', heard?: string) {
  const before = state.courts[id - 1];
  if (before.rallyStartedAt && Date.now() - before.rallyStartedAt < 4200) return;
  if (before.match.phase !== 'playing' && before.match.phase !== 'dispute') return;
  if (before.match.phase === 'playing' && isDecidingPoint(before.match) && !before.match.receiverSide) {
    update(s => { s.courts[id - 1].decision = { type: 'unclear', title: 'Choose the receiving side', detail: 'The receiving team chooses the side for the deciding point.' }; });
    return;
  }
  const commit = commitPoint(before.match, courtKey(id), team);
  const next = commit.score;
  if (!commit.accepted || !next || !commit.nextMs) {
    const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
    update(s => {
      const c = s.courts[id - 1];
      c.decision = { type: 'blocked', title: 'Call blocked', detail: 'CourtGuard rejected the point (' + reason + '). Score unchanged.', heard };
      event(c, 'blocked', 'Score call blocked', 'Reason ' + reason + '. Score unchanged.', source);
    });
    trackRejected(id, source, commit, heard);
    return;
  }
  const willEmit = isConnected() && before.online;
  update(s => {
    const c = s.courts[id - 1]; const previous = scoreText(c.match.score);
    const gamesChanged = c.match.score.serviceGame !== next.serviceGame;
    c.match.score = next; c.rallyStartedAt = null;
    c.match.receiverSide = null;
    if (next.winner !== null) c.match.phase = 'complete';
    c.decision = { type: 'accepted', title: next.winner !== null ? 'Game. Set. Match.' : gamesChanged ? 'Game won' : 'Point accepted',
      detail: heard ? 'Heard: “' + heard + '”' : 'Point for ' + c.match.teams[team].map(name => name.split(' ').at(-1)).join(' / '), heard };
    const accepted = event(c, 'point', next.winner !== null ? 'Match complete' : 'Point accepted', previous + ' → ' + (next.winner !== null ? 'Match complete' : scoreText(next)), source);
    accepted.previousScore = structuredClone(before.match.score);
    if (willEmit) accepted.acknowledged = false;
    if (next.winner !== null && id === 1 && c.match.id === 'M101') {
      s.lastResult = 'Roy / Chen · ' + next.sets.map(set => set.join('–')).join(', ');
    }
  });
  trackAccepted(id, source, commit, heard);
  if (next.winner !== null && id === 1 && before.match.id === 'M101' && before.online) scheduleNext();
}
export function submitCall(id: CourtId, text: string) {
  const call = normalizeCall(text);
  if (call === 'correction' || call === 'undo') { openCorrection(id, 'Voice preview'); return; }
  if (call === 'yes' && state.courts[id - 1].decision.type === 'confirmation') { confirmCall(id); return; }
  if (call === 'no') { dismissDecision(id); return; }
  // Voice resolves against the engine only: spoken result vs legalNextStates.
  const before = state.courts[id - 1];
  const options = engineOptions(before.match, courtKey(id));
  const hits = options.filter(o => o.spoken === call);
  if (hits.length === 1) {
    const target = hits[0].nextMs;
    const commit = commitScoreCall(before.match, courtKey(id), { serverPoints: target.serverPoints, receiverPoints: target.receiverPoints }, text);
    const next = commit.score;
    if (!commit.accepted || !next || !commit.nextMs) {
      const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
      update(s => {
        const c = s.courts[id - 1];
        c.decision = { type: 'blocked', title: 'Call blocked', detail: 'That score is not a legal next point from ' + scoreText(c.match.score) + '. CourtGuard rejected the call (' + reason + ').', heard: text };
        event(c, 'blocked', 'Score call blocked', 'Heard “' + text + '”. Reason ' + reason + '. Score unchanged.', 'Voice preview');
      });
      trackRejected(id, 'Voice preview', commit, text);
      return;
    }
    const willEmit = isConnected() && before.online;
    update(s => {
      const c = s.courts[id - 1]; const previous = scoreText(c.match.score);
      const gamesChanged = c.match.score.serviceGame !== next.serviceGame;
      c.match.score = next; c.rallyStartedAt = null;
      c.match.receiverSide = null;
      if (next.winner !== null) c.match.phase = 'complete';
      c.decision = { type: 'accepted', title: next.winner !== null ? 'Game. Set. Match.' : gamesChanged ? 'Game won' : 'Point accepted',
        detail: 'Heard: “' + text + '”', heard: text };
      const accepted = event(c, 'point', next.winner !== null ? 'Match complete' : 'Point accepted', previous + ' → ' + (next.winner !== null ? 'Match complete' : scoreText(next)), 'Voice preview');
      accepted.previousScore = structuredClone(before.match.score);
      if (willEmit) accepted.acknowledged = false;
      if (next.winner !== null && id === 1 && c.match.id === 'M101') {
        s.lastResult = 'Roy / Chen · ' + next.sets.map(set => set.join('–')).join(', ');
      }
    });
    trackAccepted(id, 'Voice preview', commit, text);
    if (next.winner !== null && id === 1 && before.match.id === 'M101' && before.online) scheduleNext();
    return;
  }
  if (hits.length > 1) {
    const candidate = scoreText(hits[0].score);
    update(s => { s.courts[id - 1].decision = { type: 'confirmation', title: 'Did you say ' + candidate + '?', detail: 'Two interpretations are plausible. Your score has not changed.', candidate, heard: text }; });
    return;
  }
  const probe = commitScoreCall(before.match, courtKey(id), { serverPoints: 999, receiverPoints: 999 }, text);
  const reason = probe.reason ?? 'ILLEGAL_TRANSITION';
  update(s => {
    const c = s.courts[id - 1];
    c.decision = { type: 'blocked', title: 'Call blocked', detail: 'That score is not a legal next point from ' + scoreText(c.match.score) + '. CourtGuard rejected the call (' + reason + ').', heard: text };
    event(c, 'blocked', 'Score call blocked', 'Heard “' + text + '”. Reason ' + reason + '. Score unchanged.', 'Voice preview');
  });
  trackRejected(id, 'Voice preview', probe, text);
}
export function openCorrection(id: CourtId, source: CourtEvent['source'] = 'Touch') {
  if (state.courts[id - 1].match.phase !== 'playing') return;
  update(s => {
    const c = s.courts[id - 1]; c.rallyStartedAt = null;
    c.decision = { type: 'correction', title: 'Correct the last point', detail: 'Undo the point, then award it to the correct team. Score is unchanged until you act.' };
    event(c, 'correction', 'Correction requested', 'Touch controls opened. Score unchanged.', source);
  });
}
export function undoPoint(id: CourtId) {
  const c = state.courts[id - 1];
  if (c.match.phase === 'dispute' || c.match.phase === 'warmup') return;
  // Roll back to the snapshot immediately before the latest point. Existing
  // events, including the mistaken point, remain in the append-only history.
  const reverted = new Set(c.events.map(e => e.reverts).filter(Boolean));
  const index = c.events.findLastIndex(e => e.kind === 'point' && e.matchId === c.match.id && !reverted.has(e.id));
  if (index < 0) return;
  const previous = c.events[index].previousScore ?? c.events.slice(0, index).findLast(e => e.matchId === c.match.id)?.score ?? (c.match.id === 'M103' ? freshScore() : initialCourt(id).match.score);
  const commit = commitRollback(c.match, courtKey(id), previous);
  if (!commit.accepted || !commit.score || !commit.nextMs) {
    const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
    update(s => {
      const court = s.courts[id - 1];
      court.decision = { type: 'blocked', title: 'Correction blocked', detail: 'CourtGuard rejected the rollback (' + reason + '). Score unchanged.' };
      event(court, 'blocked', 'Correction blocked', 'Reason ' + reason + '. Score unchanged.', 'Touch');
    });
    trackRejected(id, 'Touch', commit);
    return;
  }
  const restored = commit.score;
  const willEmit = isConnected() && c.online;
  update(s => {
    const court = s.courts[id - 1]; court.match.score = structuredClone(restored); court.match.phase = 'playing'; court.rallyStartedAt = null;
    court.decision = { type: 'ready', title: 'Point undone', detail: 'Now award the point to the correct team.' };
    const correction = event(court, 'correction', 'Point undone', 'Restored ' + scoreText(restored) + '. Original event retained.', 'Touch');
    correction.reverts = c.events[index].id;
    if (willEmit) correction.acknowledged = false;
  });
  trackAccepted(id, 'Touch', commit);
}
export function dismissDecision(id: CourtId) {
  update(s => { s.courts[id - 1].decision = { type: 'ready', title: 'Ready for your call', detail: 'Call the score, or award a point below.' }; });
}
export function setUnclear(id: CourtId, detail: string) {
  update(s => { s.courts[id - 1].decision = { type: 'unclear', title: 'Use touch or enter a call', detail }; });
}
export function requestConfirmation(id: CourtId) {
  const c = state.courts[id - 1];
  const opt = engineOptions(c.match, courtKey(id)).find(o => o.team === 0);
  if (!opt) return;
  const candidate = scoreText(opt.score);
  update(s => { s.courts[id - 1].decision = { type: 'confirmation', title: 'Did you say ' + candidate + '?', detail: 'Two interpretations are plausible. Your score has not changed.', candidate }; });
}
export function confirmCall(id: CourtId) { const c = state.courts[id - 1]; if (c.decision.candidate) submitCall(id, c.decision.candidate); }
export function setOnline(id: CourtId, online: boolean) {
  if (state.courts[id - 1].online === online) return;
  update(s => {
    const c = s.courts[id - 1]; c.online = online;
    if (online) { c.events.forEach(e => { e.acknowledged = true; }); c.pending = 0; c.remoteMatch = structuredClone(c.match); }
    event(c, 'connection', online ? 'Preview synchronized' : 'Court connection paused', online ? 'Local preview displays agree. Queued events retained once.' : 'Scoring continues on the court. Organizer shows the last received score.', 'Demo');
  });
  const c = state.courts[id - 1];
  if (online && id === 1 && c.match.id === 'M101' && c.match.phase === 'complete' && state.plan.status === 'idle') scheduleNext();
  if (online && isConnected()) {
    const batch = pendingFor(c.match.id);
    if (batch.length) void syncCourt(courtKey(id), c.match.id, batch).then(() => { confirmAll(c.match.id); }, () => {});
  }
}
export function dispute(id: CourtId) {
  const before = state.courts[id - 1];
  if (before.match.phase !== 'playing') return;
  const commit = commitDispute(before.match, courtKey(id));
  if (!commit.accepted || !commit.nextMs) {
    const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
    update(s => {
      const c = s.courts[id - 1];
      c.decision = { type: 'blocked', title: 'Dispute blocked', detail: 'CourtGuard rejected the freeze (' + reason + ').' };
      event(c, 'blocked', 'Dispute blocked', 'Reason ' + reason + '. Score unchanged.', 'Organizer');
    });
    trackRejected(id, 'Organizer', commit);
    return;
  }
  const willEmit = isConnected() && before.online;
  update(s => {
    const c = s.courts[id - 1]; c.match.phase = 'dispute'; c.rallyStartedAt = null;
    const ev = event(c, 'dispute', 'Players disputed a point', 'Scoring frozen at ' + scoreText(c.match.score) + '.', 'Organizer');
    if (willEmit) ev.acknowledged = false;
  });
  trackAccepted(id, 'Organizer', commit);
}
export function restoreEvent(id: CourtId, eventId: string) {
  const c = state.courts[id - 1]; if (!c.online || c.match.phase !== 'dispute') return;
  const target = c.events.find(e => e.id === eventId && e.matchId === c.match.id && e.kind === 'point'); if (!target || target.score.winner !== null) return;
  const commit = commitRollback(c.match, courtKey(id), target.score);
  if (!commit.accepted || !commit.score || !commit.nextMs) {
    const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
    update(s => {
      const court = s.courts[id - 1];
      court.decision = { type: 'blocked', title: 'Restore blocked', detail: 'CourtGuard rejected the rollback (' + reason + '). Still frozen.' };
      event(court, 'blocked', 'Restore blocked', 'Reason ' + reason + '. Still frozen.', 'Organizer');
    });
    trackRejected(id, 'Organizer', commit);
    return;
  }
  const restored = commit.score;
  const willEmit = isConnected() && c.online;
  update(s => {
    const court = s.courts[id - 1]; court.match.score = structuredClone(restored); court.match.phase = 'playing';
    court.decision = { type: 'accepted', title: 'Dispute resolved', detail: 'Restored ' + scoreText(restored) + '. Play can resume.' };
    const ev = event(court, 'resumed', 'Score restored · play resumed', 'Returned to event ' + target.sequence + ' (' + scoreText(restored) + '). History retained.', 'Organizer');
    if (willEmit) ev.acknowledged = false;
  });
  trackAccepted(id, 'Organizer', commit);
}
export function publishRules(rules: Omit<Rules, 'version'>) {
  publishDemoRules({ ...rules, version: state.upcomingRules.version + 1 });
  update(s => {
    s.upcomingRules = { ...rules, version: s.upcomingRules.version + 1 }; s.rulesPublished = true;
    for (const c of s.courts) event(c, 'rules', 'Upcoming rules published', 'Active match keeps v' + c.match.rules.version + '. ' + (c.online ? 'Policy received.' : 'Delivery pending.'), 'Organizer');
  });
}
export function updateSponsor(name: string, headline: string, media?: string, mediaType?: 'image' | 'video') {
  update(s => { s.sponsor = { name: name.trim() || 'COURTSIDE CLUB', headline: headline.trim() || 'Your next set starts here.', media, mediaType }; });
}
export function startChangeover(id: CourtId) {
  update(s => {
    const c = s.courts[id - 1]; if (c.match.phase !== 'playing') return;
    c.match.phase = 'changeover'; c.changeoverEndsAt = Date.now() + c.match.rules.changeover * 1000; c.timeCalled = false; c.rallyStartedAt = null;
    event(c, 'changeover', 'Changeover started', c.match.rules.changeover + ' seconds. Sponsor creative playing.', 'Demo');
  });
}
export function tickChangeover(id: CourtId) {
  const c = state.courts[id - 1]; if (c.match.phase !== 'changeover' || !c.changeoverEndsAt) return;
  const remaining = c.changeoverEndsAt - Date.now();
  const shouldCall = !c.timeCalled && timeCallDue(c.changeoverEndsAt, Date.now(), null);
  if (shouldCall || remaining <= 0) update(s => {
    const court = s.courts[id - 1]; if (shouldCall) court.timeCalled = true;
    if (remaining <= 0) {
      court.match.phase = 'playing'; court.changeoverEndsAt = null;
      event(court, 'changeover', 'Time to play', 'Changeover complete. Match resumed.', 'Demo');
    }
  });
}
export function startRally(id: CourtId) {
  const c = state.courts[id - 1]; if (c.match.phase !== 'playing' || ['correction', 'blocked', 'confirmation'].includes(c.decision.type)) return;
  update(s => { s.courts[id - 1].rallyStartedAt = Date.now(); });
}
export function endRally(id: CourtId) {
  update(s => { const c = s.courts[id - 1]; c.rallyStartedAt = null; c.decision = { type: 'ready', title: 'Waiting for the score', detail: 'The rally has finished. Call the score or use touch.' }; });
}
export function beginWarmupMatch(id: CourtId) {
  update(s => {
    const c = s.courts[id - 1]; if (c.match.phase !== 'warmup') return;
    c.match.phase = 'playing'; c.decision = { type: 'ready', title: 'Ready for your call', detail: 'New match. New possibilities.' };
    event(c, 'assignment', 'Match started', c.match.id + ' is playing under v' + c.match.rules.version + '.', 'Organizer');
  });
}
function scheduleNext() {
  clearTimeout(scheduleTimer);
  update(s => { s.plan = { status: 'solving', options: [], basedOnRevision: s.revision + 1 }; });
  const revision = state.revision;
  scheduleTimer = setTimeout(() => {
    if (state.courts[0].match.phase !== 'complete' || !state.courts[0].online) return;
    if (state.revision !== revision) { scheduleNext(); return; }
    update(s => { s.plan.status = 'validated'; s.plan.options = compareSchedules(); });
    const validatedRevision = state.revision;
    scheduleTimer = setTimeout(() => {
      if (state.revision !== validatedRevision) { scheduleNext(); return; }
      update(s => {
        const c = s.courts[0]; c.match = semifinal(s.upcomingRules); c.decision = { type: 'ready', title: 'Semifinal A is on your court', detail: 'New players assigned. Warmup can begin.' }; s.plan.status = 'assigned';
        event(c, 'assignment', 'Semifinal A assigned', 'M103 · Ali / Gagnon vs Tremblay / Park. Published rules v' + s.upcomingRules.version + '.', 'Demo');
      });
    }, 1500);
  }, 1200);
}
export function resetDemo() {
  clearTimeout(scheduleTimer); update(s => { Object.assign(s, initialState()); });
}
export function loadScenario(which: 'blocked' | 'dispute' | 'deciding' | 'offline' | 'live') {
  resetDemo();
  if (which === 'live') { startChangeover(2); return; }
  if (which === 'blocked') { awardPoint(1, 0, 'Demo'); awardPoint(1, 1, 'Demo'); submitCall(1, 'Thirty-love'); }
  if (which === 'deciding') {
    for (let i = 0; i < 3; i++) { awardPoint(1, 0, 'Demo'); awardPoint(1, 1, 'Demo'); }
  }
  if (which === 'offline') { awardPoint(1, 0, 'Demo'); awardPoint(1, 1, 'Demo'); awardPoint(1, 0, 'Demo'); setOnline(1, false); awardPoint(1, 1, 'Demo'); }
  if (which === 'dispute') {
    for (let i = 0; i < 3; i++) { awardPoint(2, 0, 'Demo'); awardPoint(2, 1, 'Demo'); }
    dispute(2);
  }
}
export function legalChoices(c: Court) {
  const byTeam = new Map(engineOptions(c.match, courtKey(c.id)).map(o => [o.team, o] as const));
  return ([0, 1] as const).map(team => {
    const opt = byTeam.get(team);
    if (!opt) return null;
    const next = opt.score;
    return next.winner !== null ? 'Match' : next.serviceGame !== c.match.score.serviceGame ? 'Game' : labels(next).join('–');
  });
}

// Organizer-dashboard routing: server broadcasts land in the existing fields
// the organizer views already render (remoteMatch, plan options, upcoming
// rules). No new components; the second tab just catches up.
function applyEngineRemote(id: CourtId, ms: MatchState) {
  update(s => {
    const c = s.courts[id - 1];
    c.remoteMatch.id = ms.matchId;
    c.remoteMatch.score = toDisplay(ms, c.remoteMatch.score, c.remoteMatch.rules);
    c.remoteMatch.phase = ms.phase === 'DISPUTE' ? 'dispute' : ms.phase === 'CHANGEOVER' ? 'changeover' : ms.phase === 'COMPLETE' ? 'complete' : 'playing';
  });
}
function idxForCourt(courtId: string): CourtId | null {
  return courtId === 'c1' ? 1 : courtId === 'c2' ? 2 : null;
}
export function applyCourtUpdate(p: { courtId: string; matchId: string; state: MatchState | null }) {
  if (!p.state) return;
  const id = idxForCourt(p.courtId);
  if (id) applyEngineRemote(id, p.state);
}
export function applyTournamentUpdate(p: { matches: Record<string, MatchState> }) {
  for (const c of state.courts) {
    const ms = p.matches[c.match.id] ?? p.matches[c.remoteMatch.id];
    if (ms) applyEngineRemote(c.id, ms);
  }
}
export function applyAssignmentUpdate() {
  update(s => {
    if (s.plan.options.length === 0) { s.plan.status = 'validated'; s.plan.options = compareSchedules(); s.plan.basedOnRevision = s.revision; }
  });
}
export function applyRulesetPublished(def: { version: number; game: { scoring: string }; decidingSet: { kind: string } }) {
  update(s => {
    s.upcomingRules = {
      ...s.upcomingRules,
      noAd: def.game.scoring === 'NO_AD',
      deciding: def.decidingSet.kind === 'MATCH_TIEBREAK' ? 'tiebreak' : 'full',
      version: def.version,
    };
    s.rulesPublished = true;
    for (const c of s.courts) event(c, 'rules', 'Upcoming rules published', 'Active match keeps v' + c.match.rules.version + '. Policy received.', 'Organizer');
  });
}
export function subscribeDashboard(): () => void {
  const offs = [
    onCourtUpdate(p => applyCourtUpdate(p)),
    onTournamentUpdate(p => applyTournamentUpdate(p)),
    onAssignmentUpdate(() => applyAssignmentUpdate()),
    onRulesetPublished(p => applyRulesetPublished(p)),
  ];
  return () => offs.forEach(off => off());
}
