import { useSyncExternalStore } from 'react';
import { initialState, initialCourt, semifinal } from './fixtures';
import { freshScore, isDecidingPoint, labels, nextScore, normalizeCall, resolveCall, scoreText } from './score';
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
export function markSeen(id: CourtId) { update(s => { const c = s.courts[id - 1]; c.seenThrough = c.events.at(-1)?.sequence ?? 0; }); }
export function selectReceiver(id: CourtId, side: 'deuce' | 'ad') {
  update(s => { const c = s.courts[id - 1]; c.match.receiverSide = side; if (c.online) c.remoteMatch = structuredClone(c.match); });
}
export function awardPoint(id: CourtId, team: Team, source: CourtEvent['source'] = 'Touch', heard?: string) {
  const before = state.courts[id - 1];
  if (before.rallyStartedAt && Date.now() - before.rallyStartedAt < 4200) return;
  const next = nextScore(before.match, team);
  if (!next) {
    if (isDecidingPoint(before.match) && !before.match.receiverSide) update(s => { s.courts[id - 1].decision = { type: 'unclear', title: 'Choose the receiving side', detail: 'The receiving team chooses the side for the deciding point.' }; });
    return;
  }
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
    if (next.winner !== null && id === 1 && c.match.id === 'M101') {
      s.lastResult = 'Roy / Chen · ' + next.sets.map(set => set.join('–')).join(', ');
    }
  });
  if (next.winner !== null && id === 1 && before.match.id === 'M101' && before.online) scheduleNext();
}
export function submitCall(id: CourtId, text: string) {
  const call = normalizeCall(text);
  if (call === 'correction' || call === 'undo') { openCorrection(id, 'Voice preview'); return; }
  if (call === 'yes' && state.courts[id - 1].decision.type === 'confirmation') { confirmCall(id); return; }
  if (call === 'no') { dismissDecision(id); return; }
  const match = state.courts[id - 1].match;
  if (match.phase !== 'playing') return;
  const team = resolveCall(match, text);
  if (team !== null) { awardPoint(id, team, 'Voice preview', text); return; }
  update(s => {
    const c = s.courts[id - 1];
    c.decision = { type: 'blocked', title: 'Call blocked', detail: 'That score is not a legal next point from ' + scoreText(c.match.score) + '.', heard: text };
    event(c, 'blocked', 'Score call blocked', 'Heard “' + text + '”. Score unchanged.', 'Voice preview');
  });
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
  update(s => {
    const court = s.courts[id - 1]; court.match.score = structuredClone(previous); court.match.phase = 'playing'; court.rallyStartedAt = null;
    court.decision = { type: 'ready', title: 'Point undone', detail: 'Now award the point to the correct team.' };
    const correction = event(court, 'correction', 'Point undone', 'Restored ' + scoreText(previous) + '. Original event retained.', 'Touch');
    correction.reverts = c.events[index].id;
  });
}
export function dismissDecision(id: CourtId) {
  update(s => { s.courts[id - 1].decision = { type: 'ready', title: 'Ready for your call', detail: 'Call the score, or award a point below.' }; });
}
export function setUnclear(id: CourtId, detail: string) {
  update(s => { s.courts[id - 1].decision = { type: 'unclear', title: 'Use touch or enter a call', detail }; });
}
export function requestConfirmation(id: CourtId) {
  const c = state.courts[id - 1]; const next = nextScore(c.match, 0); if (!next) return;
  update(s => { s.courts[id - 1].decision = { type: 'confirmation', title: 'Did you say ' + scoreText(next) + '?', detail: 'Two interpretations are plausible. Your score has not changed.', candidate: scoreText(next) }; });
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
}
export function dispute(id: CourtId) {
  if (state.courts[id - 1].match.phase !== 'playing') return;
  update(s => {
    const c = s.courts[id - 1]; c.match.phase = 'dispute'; c.rallyStartedAt = null;
    event(c, 'dispute', 'Players disputed a point', 'Scoring frozen at ' + scoreText(c.match.score) + '.', 'Organizer');
  });
}
export function restoreEvent(id: CourtId, eventId: string) {
  const c = state.courts[id - 1]; if (!c.online || c.match.phase !== 'dispute') return;
  const target = c.events.find(e => e.id === eventId && e.matchId === c.match.id && e.kind === 'point'); if (!target || target.score.winner !== null) return;
  update(s => {
    const court = s.courts[id - 1]; court.match.score = structuredClone(target.score); court.match.phase = 'playing';
    court.decision = { type: 'accepted', title: 'Dispute resolved', detail: 'Restored ' + scoreText(target.score) + '. Play can resume.' };
    event(court, 'resumed', 'Score restored · play resumed', 'Returned to event ' + target.sequence + ' (' + scoreText(target.score) + '). History retained.', 'Organizer');
  });
}
export function publishRules(rules: Omit<Rules, 'version'>) {
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
  return ([0, 1] as const).map(team => { const next = nextScore(c.match, team); return next ? (next.winner !== null ? 'Match' : next.serviceGame !== c.match.score.serviceGame ? 'Game' : labels(next).join('–')) : null; });
}
