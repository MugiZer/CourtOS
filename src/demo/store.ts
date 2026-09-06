import { useSyncExternalStore } from 'react';
import { initialState, initialCourt, initialUpcoming, standardRules } from './fixtures';
import { freshScore, isDecidingPoint, labels, normalizeCall, scoreText } from './score';
import { resolvedMatch, scheduleState } from './optimizer';
import { breakAfter, paceRules, serviceOrder, validateMatch, validateRules } from './matchConfig';
import { timeCallDue } from './changeover';
import { rallyIndex, rallyDuration, RALLY_WINNERS } from './rallies';
import { serverTeam } from './score';
import { emitCourtEvent, isConnected, onAssignmentUpdate, onCourtUpdate, onRulesetPublished, onTournamentUpdate, syncCourt } from './sync';
import { ackRecord, commitDispute, commitPoint, commitRollback, commitScoreCall, confirmAll, engineOptions, noteAccepted, noteRejected, pendingFor, publishDemoRules, toDisplay } from './guard-adapter';
import type { GuardCommit } from './guard-adapter';
import type { MatchEventRecord, MatchState } from '../../shared/types.ts';
import type { Court, CourtEvent, CourtId, DemoState, EventKind, Match, MatchFormat, Rules, Score, Team } from './types';

const KEY = 'courtos.frontend-preview.v2';
function readStored(): DemoState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.schema === 1 && Array.isArray(saved.courts) && saved.courts.length === 2 && saved.courts.every((c: Court) => c.match?.score && Array.isArray(c.events))) {
      if (!saved.upcomingMatches) {
        saved.upcomingMatches = initialUpcoming().map(m => m.format === 'Singles' ? m : { ...m, rules: { ...standardRules, ...saved.upcomingRules } });
        saved.plan = { status: 'idle', options: [], basedOnRevision: saved.revision };
      }
      saved.completedMatches ??= [];
      saved.upcomingRules = { ...standardRules, ...saved.upcomingRules };
      for (const c of saved.courts) {
        for (const m of [c.match, c.remoteMatch]) m.rules = { ...standardRules, ...m.rules };
        for (const e of c.events) {
          if (e.source === 'Demo') e.source = 'Scenario';
          if (e.source === 'Voice preview') e.source = 'Voice input';
          if (e.title === 'Preview synchronized') e.title = 'Court connection restored';
          if (e.detail === 'Local preview displays agree. Queued events retained once.') e.detail = 'Both browser displays agree. Queued events were delivered.';
        }
      }
      for (const m of saved.upcomingMatches) m.rules = { ...standardRules, ...m.rules };
      return saved;
    }
  } catch { /* An incompatible preview snapshot is safe to reset. */ }
  return initialState();
}
let state = readStored();
const listeners = new Set<() => void>();
let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => listeners.forEach(fn => fn());
function persist() {
  persistTimer = undefined;
  try {
    const snapshot = state.storageError ? { ...state, storageError: false } : state;
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    if (state.storageError) { state = snapshot; notify(); }
  } catch {
    if (!state.storageError) { state = { ...state, storageError: true }; notify(); }
  }
}
function queuePersist() { if (!persistTimer) persistTimer = setTimeout(persist, 0); }
function update(fn: (draft: DemoState) => void) {
  const draft = structuredClone(state); fn(draft); draft.revision++;
  state = draft; notify(); queuePersist();
}
window.addEventListener('pagehide', persist);
window.addEventListener('storage', e => {
  if (e.key === KEY && e.newValue) { state = readStored(); notify(); }
});
window.addEventListener('offline', () => { for (const id of [1, 2] as const) setOnline(id, false); });
window.addEventListener('online', () => { for (const id of [1, 2] as const) setOnline(id, true); });
export function useDemo() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state); }
export function getState() { return state; }
export function unread(c: Court) { return c.events.filter(e => e.sequence > c.seenThrough && ['point', 'correction', 'blocked', 'dispute', 'resumed', 'assignment'].includes(e.kind)).length; }
function isTiedDecidingSet(match: Match, score: Match['score']) {
  return match.rules.deciding === 'full' && score.sets.length === 2 && score.games[0] === 5 && score.games[1] === 5 && score.winner === null;
}
export function requiresDecidingTiebreakOverride(court: Court) {
  return court.match.phase === 'dispute' && isTiedDecidingSet(court.match, court.match.score);
}
function event(c: Court, kind: EventKind, title: string, detail: string, source: CourtEvent['source']) {
  c.events.push({ id: crypto.randomUUID(), sequence: (c.events.at(-1)?.sequence ?? 0) + 1, kind, title, detail, at: Date.now(), source, score: structuredClone(c.match.score), matchId: c.match.id, acknowledged: c.online });
  if (!c.online) c.pending++; else c.remoteMatch = structuredClone(c.match);
  return c.events.at(-1)!;
}
const courtKey = (id: CourtId) => 'c' + id;
function track(id: CourtId, source: CourtEvent['source'], commit: GuardCommit, heard?: string) {
  const ev = state.courts[id - 1].events.at(-1)!;
  const record: MatchEventRecord = commit.accepted
    ? noteAccepted({ matchId: ev.matchId, id: ev.id, sequence: ev.sequence, courtId: courtKey(id), source, commit, transcript: heard })
    : noteRejected({ matchId: ev.matchId, id: ev.id, sequence: ev.sequence, courtId: courtKey(id), source, commit, transcript: heard });
  if (state.courts[id - 1].online && isConnected()) {
    emitCourtEvent(record).then(
      () => { ackRecord(record.matchId, ev.id); markAcknowledged(id, ev.id); },
      () => { markUnacked(id, ev.id); },
    );
  }
}
function displayScore(next: Score, previous: Score): Score {
  const score = structuredClone(next);
  // The engine keeps the final normal set in `games`; the local preview keeps
  // the legacy scorecard's completed-set row for its existing result UI.
  if (next.winner !== null && !next.matchTieBreak && !previous.tieBreak && next.sets.length === previous.sets.length && next.games.some((game, i) => game > previous.games[i])) {
    score.sets.push([...next.games]);
  }
  return score;
}
function applyAccepted(id: CourtId, source: CourtEvent['source'], commit: GuardCommit, next: Score, before: Court, team: Team, heard?: string) {
  const willEmit = isConnected() && before.online;
  const displayed = displayScore(next, before.match.score);
  update(s => {
    const c = s.courts[id - 1]; const previous = scoreText(c.match.score);
    const gamesChanged = c.match.score.serviceGame !== displayed.serviceGame;
    c.match.score = displayed; c.rallyStartedAt = null; c.match.receiverSide = null;
    if (displayed.winner !== null) c.match.phase = 'complete';
    if (displayed.winner !== null) {
      if (displayed.matchTieBreak) { c.resultDeliveryRequired = true; c.resultDelivered = false; }
      s.completedMatches = s.completedMatches.filter(r => r.match.id !== c.match.id);
      s.completedMatches.push({ match: structuredClone(c.match), finishedAt: Date.now() });
    }
    c.decision = { type: 'accepted', title: displayed.winner !== null ? 'Game. Set. Match.' : gamesChanged ? 'Game won' : 'Point accepted',
      detail: displayed.winner !== null && displayed.matchTieBreak ? 'Match complete. Send the result to Tennis Canada before the next game.' : heard ? 'Heard: “' + heard + '”' : 'Point for ' + c.match.teams[team].map(name => name.split(' ').at(-1)).join(' / '), heard };
    const accepted = event(c, 'point', displayed.winner !== null ? 'Match complete' : 'Point accepted', previous + ' → ' + (displayed.winner !== null ? 'Match complete' : scoreText(displayed)), source);
    accepted.scoringTeam = team; accepted.previousScore = structuredClone(before.match.score);
    if (willEmit) accepted.acknowledged = false;
    if (displayed.winner !== null && id === 1 && c.match.id === 'M101') s.lastResult = 'Roy / Chen · ' + displayed.sets.map(set => set.join('–')).join(', ');
  });
  track(id, source, commit, heard);
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
  if (before.rallyStartedAt || before.resultDeliveryRequired) return;
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
    track(id, source, commit, heard);
    return;
  }
  const needsOverride = isTiedDecidingSet(before.match, next);
  if (needsOverride) {
    update(s => {
      const c = s.courts[id - 1]; c.match.score = next; c.match.phase = 'dispute'; c.match.receiverSide = null;
      c.decision = { type: 'correction', title: 'Manual rule override required', detail: 'The deciding set is tied at 5–5. Choose a 10-point match tiebreak before play continues.' };
      const accepted = event(c, 'point', 'Point accepted', scoreText(before.match.score) + ' → ' + scoreText(next), source);
      accepted.scoringTeam = team; accepted.previousScore = structuredClone(before.match.score);
      event(c, 'dispute', 'Deciding set tied at 5–5', 'Manual rule override required: choose a 10-point match tiebreak before play continues.', 'Organizer');
    });
    track(id, source, commit, heard);
    return;
  }
  applyAccepted(id, source, commit, next, before, team, heard);
  if (id === 1) advanceCourt2Demo();
  const rest = breakAfter(before.match, next);
  if (rest > 0) startChangeover(id, rest);
  if (next.winner !== null && before.online) scheduleNext();
  if (id === 1 && before.match.id === 'M101' && before.rallyIndex === 3 && before.rallyFinished && next.points.join() === '2,2') startRally(1);
}
export function submitCall(id: CourtId, text: string) {
  if (state.courts[id - 1].rallyStartedAt || state.courts[id - 1].resultDeliveryRequired) return;
  const call = normalizeCall(text);
  if (call === 'correction' || call === 'undo') { openCorrection(id, 'Voice input'); return; }
  if (call === 'yes' && state.courts[id - 1].decision.type === 'confirmation') { confirmCall(id); return; }
  if (call === 'no') { dismissDecision(id); return; }
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
        event(c, 'blocked', 'Score call blocked', 'Heard “' + text + '”. Reason ' + reason + '. Score unchanged.', 'Voice input');
      });
      track(id, 'Voice input', commit, text);
      return;
    }
    applyAccepted(id, 'Voice input', commit, next, before, hits[0].team, text);
    if (id === 1) advanceCourt2Demo();
    const rest = breakAfter(before.match, next);
    if (rest > 0) startChangeover(id, rest);
    if (next.winner !== null && before.online) scheduleNext();
    if (id === 1 && before.match.id === 'M101' && before.rallyIndex === 3 && before.rallyFinished && next.points.join() === '2,2') startRally(1);
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
    event(c, 'blocked', 'Score call blocked', 'Heard “' + text + '”. Reason ' + reason + '. Score unchanged.', 'Voice input');
  });
  track(id, 'Voice input', probe, text);
}
export function openCorrection(id: CourtId, source: CourtEvent['source'] = 'Touch') {
  if (state.courts[id - 1].match.phase !== 'playing' || state.courts[id - 1].rallyStartedAt || state.courts[id - 1].resultDeliveryRequired) return;
  update(s => {
    const c = s.courts[id - 1]; c.rallyStartedAt = null;
    c.decision = { type: 'correction', title: 'Correct the last point', detail: 'Undo the point, then award it to the correct team. Score is unchanged until you act.' };
    event(c, 'correction', 'Correction requested', 'Touch controls opened. Score unchanged.', source);
  });
}
export function undoPoint(id: CourtId) {
  const c = state.courts[id - 1];
  if (c.rallyStartedAt) return;
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
    track(id, 'Touch', commit);
    return;
  }
  const restored = commit.score;
  const willEmit = isConnected() && c.online;
  update(s => {
    const court = s.courts[id - 1]; court.match.score = structuredClone(restored); court.match.phase = 'playing'; court.rallyStartedAt = null;
    court.changeoverEndsAt = null; court.timeCalled = false;
    s.completedMatches = s.completedMatches.filter(r => r.match.id !== court.match.id);
    court.decision = { type: 'ready', title: 'Point undone', detail: 'Now award the point to the correct team.' };
    const correction = event(court, 'correction', 'Point undone', 'Restored ' + scoreText(restored) + '. Original event retained.', 'Touch');
    correction.reverts = c.events[index].id;
    if (willEmit) correction.acknowledged = false;
  });
  track(id, 'Touch', commit);
}
export function dismissDecision(id: CourtId) {
  update(s => { s.courts[id - 1].decision = { type: 'ready', title: 'Ready for your call', detail: 'Call the score, or award a point below.' }; });
}
export function setUnclear(id: CourtId, detail: string) {
  update(s => { s.courts[id - 1].decision = { type: 'unclear', title: 'Use touch or enter a call', detail }; });
}
export function requestConfirmation(id: CourtId) {
  const c = state.courts[id - 1]; const opt = engineOptions(c.match, courtKey(id)).find(o => o.team === 0); if (!opt) return;
  const candidate = scoreText(opt.score);
  update(s => { s.courts[id - 1].decision = { type: 'confirmation', title: 'Did you say ' + candidate + '?', detail: 'Two interpretations are plausible. Your score has not changed.', candidate }; });
}
export function confirmCall(id: CourtId) { const c = state.courts[id - 1]; if (c.decision.candidate) submitCall(id, c.decision.candidate); }
export function setOnline(id: CourtId, online: boolean) {
  if (state.courts[id - 1].online === online) return;
  update(s => {
    const c = s.courts[id - 1]; c.online = online;
    if (online) { c.events.forEach(e => { e.acknowledged = true; }); c.pending = 0; c.remoteMatch = structuredClone(c.match); }
    event(c, 'connection', online ? 'Court connection restored' : 'Court connection paused', online ? 'Both browser displays agree. Queued events were delivered.' : 'Scoring continues on the court. Organizer shows the last received score.', 'Scenario');
  });
  const c = state.courts[id - 1];
  if (online && id === 1 && c.match.id === 'M101' && c.match.phase === 'complete' && state.plan.status === 'idle') scheduleNext();
  if (online && isConnected()) {
    const batch = pendingFor(c.match.id);
    if (batch.length) void syncCourt(courtKey(id), c.match.id, batch).then(() => confirmAll(c.match.id), () => {});
  }
}
export function applyDecidingTiebreak(id: CourtId) {
  if (!requiresDecidingTiebreakOverride(state.courts[id - 1])) return;
  update(s => {
    const c = s.courts[id - 1];
    c.match.rules = { ...c.match.rules, deciding: 'tiebreak', version: c.match.rules.version + 1 };
    c.match.score.points = [0, 0]; c.match.score.matchTieBreak = true; c.match.phase = 'playing';
    c.resultDeliveryRequired = false; c.resultDelivered = false;
    c.decision = { type: 'accepted', title: '10-point match tiebreak applied', detail: 'Finish the deciding tiebreak. Send the result to Tennis Canada before the next game.' };
    event(c, 'rules', 'Deciding format changed', '10-point match tiebreak selected at 5–5. Rules v' + c.match.rules.version + '.', 'Organizer');
  });
}
export function markResultDelivered(id: CourtId) {
  const c = state.courts[id - 1];
  if (c.match.phase !== 'complete' && !c.resultDeliveryRequired) return;
  update(s => {
    const court = s.courts[id - 1]; court.resultDeliveryRequired = false; court.resultDelivered = true;
    court.decision = { type: 'accepted', title: 'Result sent to Tennis Canada', detail: 'The next game can be scheduled.' };
    event(court, 'connection', 'Result sent to Tennis Canada', 'Local browser receipt recorded for ' + court.match.id + '.', 'Organizer');
  });
  scheduleNext();
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
    track(id, 'Organizer', commit);
    return;
  }
  const willEmit = isConnected() && before.online;
  update(s => {
    const c = s.courts[id - 1]; c.match.phase = 'dispute'; c.rallyStartedAt = null;
    const ev = event(c, 'dispute', 'Players disputed a point', 'Scoring frozen at ' + scoreText(c.match.score) + '.', 'Organizer');
    if (willEmit) ev.acknowledged = false;
  });
  track(id, 'Organizer', commit);
}
export function restoreEvent(id: CourtId, eventId: string) {
  const c = state.courts[id - 1]; if (!c.online || c.match.phase !== 'dispute') return;
  const target = c.events.find(e => e.id === eventId && e.matchId === c.match.id && (e.kind === 'point' || e.kind === 'snapshot')); if (!target || target.score.winner !== null) return;
  const commit = commitRollback(c.match, courtKey(id), target.score);
  if (!commit.accepted || !commit.score || !commit.nextMs) {
    const reason = commit.reason ?? 'ILLEGAL_TRANSITION';
    update(s => {
      const court = s.courts[id - 1];
      court.decision = { type: 'blocked', title: 'Restore blocked', detail: 'CourtGuard rejected the rollback (' + reason + '). Still frozen.' };
      event(court, 'blocked', 'Restore blocked', 'Reason ' + reason + '. Still frozen.', 'Organizer');
    });
    track(id, 'Organizer', commit);
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
  track(id, 'Organizer', commit);
  if (id === 2) startRally(2);
}
export function publishRules(rules: Partial<Omit<Rules, 'version'>>) {
  const published: Rules = { ...state.upcomingRules, ...rules, version: state.upcomingRules.version + 1 };
  validateRules(published);
  publishDemoRules(published);
  update(s => {
    s.upcomingRules = published; s.rulesPublished = true;
    for (const m of s.upcomingMatches) if (!s.courts.some(c => c.match.id === m.id) && !s.completedMatches.some(r => r.match.id === m.id)) m.rules = { ...s.upcomingRules };
    for (const c of s.courts) event(c, 'rules', 'Upcoming rules published', 'Active match keeps v' + c.match.rules.version + '. ' + (c.online ? 'Policy received.' : 'Delivery pending.'), 'Organizer');
  });
  scheduleNext();
}
export function addQueuedMatch(input: { round: string; format: MatchFormat; teams: [string[], string[]]; pace: Rules['pace']; estimatedMinutes: number; matchRest: number }): string {
  const id = 'M' + (Math.max(105, ...[...state.upcomingMatches, ...state.courts.map(c => c.match), ...state.completedMatches.map(r => r.match)].map(match => Number(match.id.slice(1)) || 0)) + 1);
  const rules = { ...paceRules(standardRules, input.pace, input.format), estimatedMinutes: input.estimatedMinutes, matchRest: input.pace === 'Express' ? 0 : input.matchRest };
  const teams = input.teams.map(team => team.map(player => player.trim())) as Match['teams'];
  const match: Match = { id, round: input.round.trim() || 'New match', format: input.format, teams, rules,
    score: freshScore(), phase: 'warmup', serverOrder: serviceOrder(teams), firstServer: 0, receiverSide: null };
  validateMatch(match);
  update(s => { s.upcomingMatches.push(match); s.rulesPublished = true; delete s.optimizationDecision; });
  scheduleNext();
  return id;
}
export function cancelQueuedMatch(id: string): { ok: boolean; message: string } {
  if (state.courts.some(c => c.match.id === id) || state.completedMatches.some(result => result.match.id === id)) return { ok: false, message: 'That match is already active or complete.' };
  const dependent = state.upcomingMatches.find(match => match.dependencies?.includes(id));
  if (dependent) return { ok: false, message: `${dependent.id} depends on ${id}. Cancel the dependent match first.` };
  const index = state.upcomingMatches.findIndex(match => match.id === id);
  if (index < 0) return { ok: false, message: 'Match is no longer in the queue.' };
  update(s => { s.upcomingMatches.splice(index, 1); delete s.optimizationDecision; });
  scheduleNext();
  return { ok: true, message: `${id} cancelled. The horizon is being replanned.` };
}
export function configureMatch(match: Match) {
  if (state.courts.some(c => c.match.id === match.id) || state.completedMatches.some(r => r.match.id === match.id)) throw new Error('Assigned matches keep their configuration.');
  validateMatch(match);
  for (const final of state.upcomingMatches.filter(m => m.dependencies?.includes(match.id))) {
    for (const id of final.dependencies ?? []) {
      if (id === match.id) continue;
      const sibling = state.courts.find(c => c.match.id === id)?.match ?? state.upcomingMatches.find(m => m.id === id);
      if (sibling && sibling.format !== match.format) throw new Error('Semifinals feeding the same final must use the same format. The other semifinal is already assigned.');
    }
  }
  update(s => {
    const index = s.upcomingMatches.findIndex(m => m.id === match.id);
    if (index < 0) throw new Error('Unknown match.');
    const previous = s.upcomingMatches[index];
    s.upcomingMatches[index] = { ...structuredClone(match), dependencies: previous.dependencies, rules: { ...match.rules, version: previous.rules.version + 1 } };
    for (const final of s.upcomingMatches.filter(m => m.dependencies?.includes(match.id))) {
      if (!s.courts.some(c => c.match.id === final.id) && final.format !== match.format) { final.format = match.format; final.rules.version++; }
    }
    s.rulesPublished = true;
    delete s.optimizationDecision;
  });
  scheduleNext();
}
export function updateSponsor(name: string, headline: string, media?: string, mediaType?: 'image' | 'video', clickUrl?: string, audio?: string, skipAds = false) {
  update(s => { s.sponsor = { name: name.trim() || 'COURTSIDE CLUB', headline: headline.trim() || 'Your next set starts here.', media, mediaType, clickUrl: clickUrl?.trim() || undefined, audio: audio?.trim() || undefined, skipAds }; });
}
export function startChangeover(id: CourtId, seconds: number = state.courts[id - 1].match.rules.changeover) {
  if (seconds <= 0 || state.courts[id - 1].match.rules.pace === 'Express') return;
  update(s => {
    const c = s.courts[id - 1]; if (c.match.phase !== 'playing') return;
    c.match.phase = 'changeover'; c.changeoverEndsAt = Date.now() + seconds * 1000; c.timeCalled = false; c.rallyStartedAt = null;
    c.changeoverSeconds = seconds;
    event(c, 'changeover', 'Rest started', seconds + ' seconds. Sponsor creative playing.', 'Scenario');
  });
}
export function tickChangeover(id: CourtId) {
  const c = state.courts[id - 1]; if (c.match.phase !== 'changeover' || !c.changeoverEndsAt) return false;
  const remaining = c.changeoverEndsAt - Date.now();
  const shouldCall = !c.timeCalled && timeCallDue(c.changeoverEndsAt, Date.now(), null);
  if (shouldCall || remaining <= 0) update(s => {
    const court = s.courts[id - 1]; if (shouldCall) court.timeCalled = true;
    if (remaining <= 0) {
      court.match.phase = 'playing'; court.changeoverEndsAt = null;
      event(court, 'changeover', 'Time to play', 'Changeover complete. Match resumed.', 'Scenario');
    }
  });
  if (remaining <= 0 && id === 2) {
    if (c.events.some(e => e.kind === 'resumed')) startRally(2);
    else advanceCourt2Demo();
  }
  return shouldCall;
}
function advanceCourt2Demo() {
  const [first, second] = state.courts;
  if (second.match.id !== 'M102' || second.match.phase !== 'playing' || second.events.some(e => e.kind === 'resumed' && e.matchId === 'M102')) return;
  if (second.rallyStartedAt) update(s => { s.courts[1].rallyStartedAt = null; });
  if (!first.events.some(e => e.kind === 'point' && e.matchId === 'M101')) return;
  if (second.match.score.serviceGame !== 0 || second.match.score.points.join() !== '3,2') return;
  awardPoint(2, 1, 'Scenario');
  if (state.courts[1].match.score.points.join() === '3,3') dispute(2);
}
export function canStartRally(c: Court) {
  if (c.match.phase !== 'playing' || c.rallyStartedAt || c.resultDeliveryRequired || ['correction', 'blocked', 'confirmation', 'unclear'].includes(c.decision.type)) return false;
  if (isDecidingPoint(c.match) && !c.match.receiverSide) return false;
  const index = rallyIndex(c.match);
  if (c.id === 2 && c.match.id === 'M102' && !c.events.some(e => e.kind === 'resumed' && e.matchId === 'M102')) return false;
  if (c.id === 1 && c.match.id === 'M101' && index === 6 && state.courts[1].match.id === 'M102' && !state.courts[1].events.some(e => e.kind === 'resumed' && e.matchId === 'M102')) return false;
  return index >= 0 && !(c.match.id === 'M101' && c.rallyFinished && c.rallyIndex === index);
}
export function startRally(id: CourtId) {
  const c = state.courts[id - 1]; if (!canStartRally(c)) return;
  update(s => {
    const court = s.courts[id - 1], index = rallyIndex(court.match);
    court.rallyIndex = index; court.rallyFinished = false; court.rallyStartedAt = Date.now();
    court.rallyWinner = court.match.id === 'M101' ? RALLY_WINNERS[index] : court.match.id === 'M102' && court.events.some(e => e.kind === 'resumed' && e.matchId === court.match.id) && court.match.score.serviceGame === 0 ? 1 : index % 2 === 0 ? 0 : 1;
    court.decision = { type: 'ready', title: 'Rally in play', detail: 'Players will reset before the score is called.' };
  });
}
export function endRally(id: CourtId) {
  const before = state.courts[id - 1];
  if (!before.rallyStartedAt || Date.now() - before.rallyStartedAt < rallyDuration(before.rallyWinner ?? 0, serverTeam(before.match))) return;
  update(s => { const c = s.courts[id - 1]; c.rallyStartedAt = null; c.rallyFinished = true; c.decision = { type: 'ready', title: 'Waiting for the score', detail: 'The rally has finished. Call the score or use touch.' }; });
  if (id === 2 && before.match.id === 'M102') {
    awardPoint(id, before.rallyWinner ?? 0, 'Scenario');
    const c = state.courts[1];
    if (c.match.score.points.join() === '3,3' && !c.events.some(e => e.kind === 'resumed')) dispute(2);
    else if (c.match.phase === 'playing') {
      startRally(2);
    }
  }
}
export function tickRallies() {
  advanceCourt2Demo();
  for (const id of [1, 2] as const) if (state.courts[id - 1].rallyStartedAt) endRally(id);
  if (!scheduleTimer && state.courts.some(c => c.online && c.match.phase === 'complete') && state.upcomingMatches.some(m => !state.courts.some(c => c.match.id === m.id) && !state.completedMatches.some(r => r.match.id === m.id))) scheduleNext();
}
export function beginWarmupMatch(id: CourtId) {
  update(s => {
    const c = s.courts[id - 1]; if (c.match.phase !== 'warmup') return;
    c.match.phase = 'playing'; c.decision = { type: 'ready', title: 'Ready for your call', detail: 'New match. Score the first point when play begins.' };
    event(c, 'assignment', 'Match started', c.match.id + ' is playing under v' + c.match.rules.version + '.', 'Organizer');
  });
}
function scheduleNext() {
  clearTimeout(scheduleTimer);
  scheduleTimer = undefined;
  if (state.courts.some(c => c.resultDeliveryRequired)) return;
  if (!state.courts.some(c => c.online && c.match.phase === 'complete')) {
    update(s => { s.plan = { status: 'idle', options: scheduleState(s), basedOnRevision: s.revision + 1 }; });
    return;
  }
  update(s => { s.plan = { status: 'solving', options: [], basedOnRevision: s.revision + 1 }; });
  const revision = state.revision;
  scheduleTimer = setTimeout(() => {
    scheduleTimer = undefined;
    if (state.revision !== revision) { scheduleNext(); return; }
    update(s => { s.plan.status = 'validated'; s.plan.options = scheduleState(s); });
    const validatedRevision = state.revision;
    scheduleTimer = setTimeout(() => {
      scheduleTimer = undefined;
      if (state.revision !== validatedRevision) { scheduleNext(); return; }
      assignReadyMatch(validatedRevision);
    }, 3500);
  }, 1200);
}
export function assignReadyMatch(expectedRevision: number): boolean {
  if (state.revision !== expectedRevision) return false;
  if (state.courts.some(c => c.resultDeliveryRequired)) return false;
  const plans = scheduleState(state);
  const candidate = plans[0]?.items.filter(i => i.start === 0 && state.upcomingMatches.some(m => m.id === i.match)).find(i => state.courts[i.court - 1].online && state.courts[i.court - 1].match.phase === 'complete' && resolvedMatch(state, state.upcomingMatches.find(m => m.id === i.match)!));
  if (!candidate) return false;
  const match = resolvedMatch(state, state.upcomingMatches.find(m => m.id === candidate.match)!)!;
  validateMatch(match);
  update(s => {
    const c = s.courts[candidate.court - 1]; c.match = structuredClone(match); c.match.phase = 'warmup'; c.rallyIndex = -1; c.rallyFinished = false; c.rallyStartedAt = null; c.changeoverEndsAt = null;
    c.decision = { type: 'ready', title: match.round + ' is on your court', detail: 'Players assigned. Warmup can begin.' }; s.plan.status = 'assigned'; s.plan.options = plans;
    if (plans.length > 1 && plans.at(-1)!.finish > plans[0].finish) s.optimizationDecision = { options: structuredClone(plans), at: Date.now(), assignedMatch: match.id, court: candidate.court };
    for (const plan of s.plan.options) for (const item of plan.items) if (item.match === match.id) item.projected = false;
    event(c, 'assignment', match.round + ' assigned', match.id + ' · ' + match.format + ' · ' + match.rules.pace + ' · rules v' + match.rules.version, 'Scenario');
  });
  return true;
}
export function resetDemo(preview = true) {
  clearTimeout(scheduleTimer); scheduleTimer = undefined; update(s => { delete s.optimizationDecision; Object.assign(s, initialState(preview)); });
}
export function loadScenario(which: 'blocked' | 'dispute' | 'deciding' | 'offline' | 'live' | 'finish') {
  resetDemo();
  if (which === 'live') { startRally(1); return; }
  if (which === 'blocked') { awardPoint(1, 0, 'Scenario'); awardPoint(1, 1, 'Scenario'); submitCall(1, 'Thirty-love'); }
  if (which === 'deciding') {
    for (let i = 0; i < 3; i++) { awardPoint(1, 0, 'Scenario'); awardPoint(1, 1, 'Scenario'); }
  }
  if (which === 'finish') update(s => {
    const c = s.courts[0]; c.match.score.points = [2, 3]; c.match.phase = 'playing'; c.decision = { type: 'ready', title: 'Ready to finish the deciding set', detail: 'Court 1 is at 30–40 in the last set. Award the next point to tie games at 5–5.' };
  });
  if (which === 'offline') { awardPoint(1, 0, 'Scenario'); awardPoint(1, 1, 'Scenario'); awardPoint(1, 0, 'Scenario'); setOnline(1, false); awardPoint(1, 1, 'Scenario'); }
  if (which === 'dispute') {
    awardPoint(1, 0, 'Scenario'); awardPoint(1, 1, 'Scenario'); awardPoint(1, 0, 'Scenario');
    for (let i = 0; i < 3; i++) { awardPoint(2, 0, 'Scenario'); awardPoint(2, 1, 'Scenario'); }
    dispute(2);
  }
}
export function legalChoices(c: Court) {
  return engineOptions(c.match, courtKey(c.id)).map(option => option.score.winner !== null ? 'Match' : option.score.serviceGame !== c.match.score.serviceGame ? 'Game' : labels(option.score).join('–'));
}

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

export function applyCourtUpdate(p: { courtId: string; matchId: string; state: MatchState | null; events?: MatchEventRecord[] }) {
  const id = idxForCourt(p.courtId);
  if (!id) return;
  const last = p.events?.at(-1);
  const reason = last?.decision === 'REJECTED' ? last.rejectionReason : undefined;
  if (!p.state && !reason) return;
  if (p.state) applyEngineRemote(id, p.state);
  if (reason) {
    const heard = last?.transcript;
    update(s => {
      s.courts[id - 1].decision = { type: 'blocked', title: 'Call blocked', detail: 'CourtGuard rejected the call (' + reason + '). Score unchanged.', ...(heard !== undefined ? { heard } : {}) };
    });
  }
}

export function applyTournamentUpdate(p: { matches: Record<string, MatchState> }) {
  for (const c of state.courts) {
    const ms = p.matches[c.match.id] ?? p.matches[c.remoteMatch.id];
    if (ms) applyEngineRemote(c.id, ms);
  }
}

export function applyAssignmentUpdate() {
  update(s => {
    if (s.plan.options.length === 0) { s.plan.status = 'validated'; s.plan.options = scheduleState(s); s.plan.basedOnRevision = s.revision; }
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
