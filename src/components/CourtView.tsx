import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowsOut, Broadcast, Check, CheckCircle, Clock, Flag, Microphone, Pause, Play, Plus, ShieldCheck, SpeakerHigh, SpeakerSlash, TennisBall, WarningCircle, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import type { Court, Match, Team } from '../demo/types';
import { awardPoint, beginWarmupMatch, confirmCall, dismissDecision, endRally, legalChoices, openCorrection, selectReceiver, startRally, undoPoint } from '../demo/store';
import { isDecidingPoint, labels, receiverName, serverName, serverTeam } from '../demo/score';
import { useDemo } from '../demo/store';
const CourtScene = lazy(() => import('./CourtScene'));

export function TeamName({ names, compact = false }: { names: string[]; compact?: boolean }) {
  return <span className={compact ? 'team-name compact' : 'team-name'}>{names.map((name, i) => <span key={name}>{compact ? name.split(' ').at(-1) : name}{i < names.length - 1 && compact ? <i> / </i> : null}</span>)}</span>;
}
export function Connection({ court }: { court: Court }) {
  return <span className={'connection ' + (!court.online ? 'offline' : '')}>{court.online ? <WifiHigh size={16}/> : <WifiSlash size={16}/>}<span>{court.online ? 'Connected' : 'Offline'}</span></span>;
}
export function Scoreboard({ court, match, scorer }: { court: Court; match: Match; scorer: boolean }) {
  const points = labels(match.score);
  const serving = serverName(match);
  const isComplete = match.phase === 'complete';
  const warmup = match.phase === 'warmup';
  return <div className={'scoreboard ' + (scorer ? 'scoreboard--large' : '')}>
    {!court.online && <p className="score-freshness" role="status">{scorer ? `Local score · ${court.pending} pending sync` : 'Last received score · offline · may be outdated'}</p>}
    <div className="scoreboard-topline"><span className="eyebrow">{warmup ? 'NEXT ON COURT' : isComplete ? 'FINAL RESULT' : match.score.matchTieBreak ? 'MATCH TIEBREAK' : match.score.tieBreak ? 'SET TIEBREAK' : match.score.sets.length === 2 ? 'DECIDING SET' : 'SET ' + (match.score.sets.length + 1)}</span><span className="match-id">{match.id}</span></div>
    <div className="score-columns"><span>{warmup ? 'SEMIFINAL A' : 'PLAYERS'}</span><span>SETS</span><span>GAMES</span><span>POINTS</span></div>
    {match.teams.map((team, index) => <div className={'score-row ' + (isComplete && match.score.winner === index ? 'winner-row' : '')} key={team.join()}>
      <div className="player-block">
        {team.map(name => <div className="player-name" key={name}><span aria-label={name} title={name}><span className="full-name">{name}</span><span className="compact-name" aria-hidden="true">{name[0]}. {name.split(' ').slice(1).join(' ')}</span></span>{!warmup && !isComplete && name === serving && <TennisBall size={17} weight="fill" aria-label="Serving"/>}</div>)}
        <span className="player-role">{warmup ? (index === 0 ? 'Ready for warmup' : 'Players assigned') : isComplete ? (match.score.winner === index ? 'MATCH WINNER' : 'Match complete') : match.teams[index].includes(serving) ? serving.split(' ')[0] + ' serving' : receiverName(match).split(' ')[0] + ' receiving'}</span>
      </div>
      <div className="set-history">{match.score.sets.slice(0, 2).map((set, i) => <span className={set[index] > set[1-index] ? 'set-won' : ''} key={i}>{set[index]}</span>)}</div>
      <div className="game-score">{warmup ? '–' : match.score.games[index]}</div>
      <div className="point-score" key={index + ':' + points[index]}>{warmup ? '–' : points[index]}</div>
    </div>)}
    <div className="scoreboard-bottom">
      <span><ShieldCheck size={17}/>{match.rules.noAd ? 'No-Ad scoring' : 'Advantage scoring'}</span>
      <span>{match.rules.deciding === 'tiebreak' ? '10-point deciding tiebreak' : 'Full deciding set'}<b className="rule-version">v{match.rules.version}</b></span>
    </div>
  </div>;
}
export function SponsorScene({ court, remaining, muted, onMute, preview }: { court: Court; remaining: number; muted: boolean; onMute: () => void; preview?: ReturnType<typeof useDemo>['sponsor'] }) {
  const state = useDemo();
  const sponsor = preview ?? state.sponsor;
  return <div className="sponsor-scene">
    {sponsor.media ? sponsor.mediaType === 'video' ? <video src={sponsor.media} autoPlay muted loop playsInline className="sponsor-upload"/> : <img src={sponsor.media} className="sponsor-upload" alt={sponsor.name}/> : <><div className="sponsor-ball"><TennisBall weight="thin"/></div><span className="sponsor-wordmark">{sponsor.name}</span><h2>{sponsor.headline}</h2></>}
    <div className="sponsor-top"><span>CHANGEOVER PARTNER</span><button className="icon-button inverse" aria-label={muted ? 'Enable time audio' : 'Mute time audio'} onClick={onMute}>{muted ? <SpeakerSlash/> : <SpeakerHigh/>}</button></div>
    <div className={'sponsor-countdown ' + (remaining <= 10 ? 'time-cue' : '')} role="status"><span><b>{remaining <= 10 ? 'TIME' : 'CHANGEOVER'}</b><small>{remaining <= 10 ? 'Return to court' : court.match.rules.changeover + '-second changeover'}</small></span><strong>{formatTime(remaining)}</strong></div>
  </div>;
}
export function formatTime(seconds: number) { return Math.floor(Math.max(seconds, 0) / 60).toString().padStart(2, '0') + ':' + (Math.max(seconds, 0) % 60).toString().padStart(2, '0'); }
export function CourtVisual({ court, match, remaining, muted, onMute, scorer }: { court: Court; match: Match; remaining: number; muted: boolean; onMute: () => void; scorer: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = () => setExpanded(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler); return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  return <div className={'court-visual ' + (expanded ? 'expanded' : '')} ref={visual}>
    {match.phase === 'changeover' ? <SponsorScene court={court} remaining={remaining} muted={muted} onMute={onMute}/> : <>
      {scorer ? <div className="fence-court" role="img" aria-label={`Court ${court.id} diagram. ${match.phase === 'dispute' ? 'Play paused.' : 'See the scoreboard for live match status.'}`}><div className="flat-court" aria-hidden="true"><span/><span/></div></div> : <Suspense fallback={<div className="scene-loading"><TennisBall size={32}/><span>Preparing your court</span></div>}><CourtScene phase={match.phase} rallyStartedAt={court.online ? court.rallyStartedAt : null} serverTeam={serverTeam(match)} courtId={court.id}/></Suspense>}
      <div className="visual-top"><span><i className={'live-dot ' + (match.phase === 'dispute' ? 'red' : '')}/>{match.phase === 'dispute' ? 'PLAY PAUSED' : match.phase === 'warmup' ? 'WARMUP' : court.rallyStartedAt ? 'RALLY IN PROGRESS' : 'COURT VIEW'}</span><button className="icon-button inverse" aria-label="Expand court view" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void visual.current?.requestFullscreen?.().catch(() => {}); }}><ArrowsOut size={18}/></button></div>
      <div className="visual-bottom"><span className="visual-caption">COURT {String(court.id).padStart(2, '0')}<small>{scorer ? 'Court diagram' : 'Scripted demo visualization'}</small></span><span className="visual-state">{match.phase === 'dispute' ? <><Pause size={13} weight="fill"/> Frozen</> : court.rallyStartedAt ? <><Play size={13} weight="fill"/> Playing rally</> : match.phase === 'complete' ? <><Flag size={13}/> Match complete</> : <><Broadcast size={14}/> {match.phase === 'warmup' ? 'New players on court' : 'Awaiting score'}</>}</span></div>
    </>}
  </div>;
}
export function DecisionBar({ court, scorer }: { court: Court; scorer: boolean }) {
  const c = court;
  const state = useDemo();
  const isOfflineView = !c.online && !scorer;
  let { title, detail } = c.decision;
  let kind: string = c.decision.type;
  let Icon = c.decision.type === 'accepted' ? CheckCircle : c.decision.type === 'blocked' ? ShieldCheck : c.decision.type === 'correction' ? ArrowCounterClockwise : Microphone;
  if (isOfflineView) { title = 'Showing the last received score'; detail = 'The court keeps scoring locally. Updates arrive when it reconnects.'; kind = 'offline'; Icon = WifiSlash; }
  else if (c.match.phase === 'dispute') { title = 'Scoring is frozen'; detail = 'Players disagree about the last point. Review the history to resume.'; kind = 'blocked'; Icon = WarningCircle; }
  else if (c.match.phase === 'changeover') { title = 'Changeover in progress'; detail = 'The countdown runs locally. Play resumes at the end of the break.'; kind = 'ready'; Icon = Clock; }
  else if (c.match.phase === 'warmup') { title = 'Semifinal A assigned'; detail = 'Players are on court. Upcoming rules applied before the match starts.'; kind = 'accepted'; Icon = CheckCircle; }
  else if (c.match.phase === 'complete') { title = 'Game. Set. Match.'; detail = state.plan.status === 'solving' ? 'Result recorded. Finding the next valid assignment…' : 'Match complete. Court is becoming available.'; kind = 'accepted'; Icon = Flag; }
  else if (isDecidingPoint(c.match) && c.decision.type !== 'confirmation' && c.decision.type !== 'blocked') { title = 'No-Ad. The next point decides it.'; detail = c.match.receiverSide ? 'Receiving side selected. Play the deciding point.' : 'Receiving team: choose the side below.'; kind = 'deciding'; Icon = TennisBall; }
  return <div className={'decision-bar decision--' + kind} role="status" aria-live="polite">
    <span className="decision-icon"><Icon size={24} weight={kind === 'accepted' ? 'fill' : 'regular'}/></span>
    <div><strong>{title}</strong><span>{c.decision.heard && kind === 'blocked' ? 'Heard “' + c.decision.heard + '”. ' : ''}{detail}</span></div>
    <span className="decision-meta">{!c.online && scorer ? <><WifiSlash size={15}/>{c.pending} pending sync</> : c.match.phase === 'playing' && !isOfflineView ? <><Check size={15}/> {scorer ? 'Saved locally' : 'Local preview'}</> : null}</span>
  </div>;
}
export function ScoreControls({ court, scorer, onVoice, onDispute }: { court: Court; scorer: boolean; onVoice: () => void; onDispute: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!court.rallyStartedAt) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time - court.rallyStartedAt! >= 4200) endRally(court.id); }, 200);
    return () => clearInterval(timer);
  }, [court.rallyStartedAt, court.id]);
  const playing = court.match.phase === 'playing';
  const disabled = !playing || (!scorer && !court.online) || (!!court.rallyStartedAt && now - court.rallyStartedAt < 4200);
  const correcting = court.decision.type === 'correction';
  const blocked = court.decision.type === 'blocked';
  const choices = legalChoices(court);
  if (court.match.phase === 'warmup') return <div className="warmup-actions"><button className="button primary" onClick={() => beginWarmupMatch(court.id)}><Play size={18} weight="fill"/> Begin match</button><span>Mixed doubles · v{court.match.rules.version}</span></div>;
  if (court.match.phase === 'dispute') return <div className="warmup-actions"><button className="button danger" disabled={!court.online} onClick={onDispute}><WarningCircle size={18}/> Resolve dispute</button><span>{court.online ? 'Review a prior score before resuming.' : 'Reconnect before organizer intervention.'}</span></div>;
  if (!playing) return null;
  return <div className="score-controls">
    {isDecidingPoint(court.match) && <div className="receiver-choice"><span>Receiving side</span>{(['deuce', 'ad'] as const).map(side => <button key={side} aria-pressed={court.match.receiverSide === side} disabled={disabled} onClick={() => selectReceiver(court.id, side)}>{side === 'deuce' ? 'Deuce side' : 'Ad side'}{court.match.receiverSide === side && <Check size={14}/>}</button>)}</div>}
    {court.decision.type === 'confirmation' ? <div className="point-buttons"><button className="point-button" onClick={() => confirmCall(court.id)}><Check/> Yes, confirm</button><button className="point-button" onClick={() => dismissDecision(court.id)}>No, keep current score</button></div> : correcting ? <div className="correction-controls"><button className="button primary" onClick={() => undoPoint(court.id)} disabled={!court.events.some(e => e.kind === 'point' && e.matchId === court.match.id)}><ArrowCounterClockwise/> Undo last point</button><button className="button quiet" onClick={() => dismissDecision(court.id)}>Cancel correction</button></div> : <div className="point-buttons">{court.match.teams.map((names, index) => <button key={index} className="point-button" disabled={disabled || !choices[index]} aria-label={'Point for ' + names.map(name => name.split(' ').at(-1)).join(' / ')} onClick={() => awardPoint(court.id, index as Team)}><span className="point-button-icon"><Plus size={20}/></span><span>{blocked && <strong className="legal-score">{choices[index]}</strong>}<span>{blocked ? 'Point for ' : ''}{names.map(name => name.split(' ').at(-1)).join(' / ')}</span></span><span className="point-button-label">{blocked ? 'LEGAL NEXT SCORE' : 'AWARD POINT'}</span></button>)}</div>}
    <div className="secondary-controls">
      <button onClick={onVoice} disabled={disabled}><Microphone size={17}/> Enter or speak a score</button>
      <button onClick={() => openCorrection(court.id)} disabled={disabled || correcting}><ArrowCounterClockwise size={17}/> Correction</button>
      {blocked ? <button onClick={() => dismissDecision(court.id)}>Cancel · keep score</button> : <button className="rally-control" disabled={disabled || correcting} onClick={() => startRally(court.id)}><Play size={15}/> Play rally</button>}
    </div>
  </div>;
}
