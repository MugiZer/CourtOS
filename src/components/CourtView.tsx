import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowCounterClockwise, ArrowsOut, Broadcast, Check, CheckCircle, Clock, Flag, Microphone, Pause, Play, Plus, ShieldCheck, SpeakerHigh, SpeakerSlash, TennisBall, WarningCircle, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import type { Court, Match, Team } from '../demo/types';
import { getAdPod, selectAd, type SponsorConfig } from '../demo/ads';
import { rallyIndex } from '../demo/rallies';
import { awardPoint, beginWarmupMatch, canStartRally, confirmCall, dismissDecision, legalChoices, openCorrection, requiresDecidingTiebreakOverride, selectReceiver, setUnclear, startRally, submitCall, undoPoint } from '../demo/store';
import { isDecidingPoint, labels, receiverName, scoreText, serverName } from '../demo/score';
const courtSceneModule = import('./CourtScene');
const CourtScene = lazy(() => courtSceneModule);

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
    <div className="score-columns"><span>{warmup ? match.round.toUpperCase() : 'PLAYERS'}</span><span>SETS</span><span>GAMES</span><span>POINTS</span></div>
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
      <span>{match.format} · {match.teams.flat().length} players · {match.rules.pace}{match.rules.pace === 'Express' ? ' · No rest periods' : ` · ${match.rules.changeover}s changeover`}</span>
      <span><ShieldCheck size={17}/>{match.rules.noAd ? 'No-Ad scoring' : 'Advantage scoring'}</span>
      <span>{match.rules.deciding === 'tiebreak' ? '10-point deciding tiebreak' : 'Full deciding set'}<b className="rule-version">v{match.rules.version}</b></span>
    </div>
  </div>;
}
export function SponsorScene({ court, changeoverEndsAt, muted, onMute, sponsor, preview }: { court: Court; changeoverEndsAt: number | null; muted: boolean; onMute: () => void; sponsor: SponsorConfig; preview?: SponsorConfig }) {
  const [remaining, setRemaining] = useState(() => changeoverEndsAt ? Math.max(0, Math.ceil((changeoverEndsAt - Date.now()) / 1000)) : 0);
  const config = preview ?? sponsor;
  const skipAds = config.skipAds === true;
  const pod = getAdPod(config, Boolean(preview));
  const { ad, index, elapsedInAd } = selectAd(pod, remaining, court.changeoverSeconds ?? court.match.rules.changeover);
  const timeCue = remaining <= 10;
  const [adAudioEnabled, setAdAudioEnabled] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const progress = Math.min(100, (elapsedInAd / ad.duration) * 100);
  useEffect(() => {
    if (skipAds) return;
    if (ad.mediaType === 'video') { const video = document.createElement('video'); video.preload = 'auto'; video.src = ad.media; }
    else { const image = new Image(); image.decoding = 'async'; image.src = ad.media; }
    if (ad.audio) { const cue = new Audio(); cue.preload = 'auto'; cue.src = ad.audio; }
  }, [skipAds, ad.media, ad.mediaType, ad.audio]);
  useEffect(() => {
    const update = () => setRemaining(changeoverEndsAt ? Math.max(0, Math.ceil((changeoverEndsAt - Date.now()) / 1000)) : 0);
    update();
    if (!changeoverEndsAt) return;
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [changeoverEndsAt]);
  useEffect(() => {
    const player = audio.current;
    if (!player || !ad.audio || !adAudioEnabled || timeCue) {
      player?.pause();
      return;
    }
    player.currentTime = 0;
    void player.play().catch(() => setAdAudioEnabled(false));
    return () => player.pause();
  }, [ad.id, ad.audio, adAudioEnabled, timeCue]);
  useEffect(() => { if (timeCue) setAdAudioEnabled(false); }, [timeCue]);
  const adLabel = `${ad.sponsor}: ${ad.headline}`;
  return <div className={'sponsor-scene ' + (skipAds ? 'sponsor-scene--skipped' : 'sponsor-scene--' + ad.id + ' sponsor-scene--' + ad.copySide)} role="region" aria-label={skipAds ? 'Sponsor ads skipped during changeover' : 'Sponsor message. ' + adLabel}>
    {skipAds ? <div className="sponsor-skipped"><span>SPONSOR ADS SKIPPED</span><strong>Changeover time stays on track.</strong><small>Ads are disabled for this tournament.</small></div> : ad.mediaType === 'video' ? <video key={ad.id} src={ad.media} autoPlay muted loop playsInline preload="auto" className="sponsor-media" aria-label={adLabel}/> : <img key={ad.id} src={ad.media} className="sponsor-media" alt={adLabel}/>}<div className="sponsor-top"><div className="sponsor-top-actions">
      {!skipAds && ad.audio && <button className="sponsor-audio-button" type="button" disabled={timeCue} aria-pressed={adAudioEnabled} onClick={() => setAdAudioEnabled(value => !value)}>{adAudioEnabled ? <SpeakerHigh size={16}/> : <SpeakerSlash size={16}/>}<span>{adAudioEnabled ? 'Ad audio on' : 'Ad audio'}</span></button>}
      <button className="icon-button inverse" aria-label={muted ? 'Enable time audio' : 'Mute time audio'} onClick={onMute}>{muted ? <SpeakerSlash/> : <SpeakerHigh/>}</button>
    </div></div>
    {!skipAds && <div className="sponsor-pod" aria-label={`Ad ${index + 1} of ${pod.length}`}><div className="sponsor-pod-track">{pod.map((item, itemIndex) => <span className={itemIndex === index ? 'active' : itemIndex < index ? 'complete' : ''} key={item.id} style={itemIndex === index ? { '--ad-progress': `${progress}%` } as CSSProperties : undefined}/>)}</div><strong>{index + 1}/{pod.length}</strong></div>}
    <div className={'sponsor-countdown ' + (timeCue ? 'time-cue' : '')} role="status"><span><b>{timeCue ? 'TIME' : 'CHANGEOVER'}</b><small>{timeCue ? 'Return to court' : (court.changeoverSeconds ?? court.match.rules.changeover) + '-second rest'}</small></span><strong>{formatTime(remaining)}</strong></div>
    {!skipAds && ad.audio && <audio ref={audio} src={ad.audio} preload="auto"/>}
  </div>;
}
export function formatTime(seconds: number) { return Math.floor(Math.max(seconds, 0) / 60).toString().padStart(2, '0') + ':' + (Math.max(seconds, 0) % 60).toString().padStart(2, '0'); }
export function CourtVisual({ court, match, sponsor, muted, onMute, scorer }: { court: Court; match: Match; sponsor: SponsorConfig; muted: boolean; onMute: () => void; scorer: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = () => setExpanded(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler); return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  return <div className={'court-visual ' + (expanded ? 'expanded ' : '') + (match.phase === 'changeover' ? 'has-changeover' : '')} ref={visual}>
    <div className="court-live-surface"><Suspense fallback={<div className="scene-loading"><TennisBall size={32}/><span>Preparing your court</span></div>}><CourtScene key={court.id} match={match} rallyStartedAt={court.online || scorer ? court.rallyStartedAt : null} rallyIndex={court.rallyIndex ?? rallyIndex(match)} rallyWinner={court.rallyWinner} courtId={court.id} stale={!court.online && !scorer} changeoverEndsAt={court.changeoverEndsAt}/></Suspense></div>
    {match.phase === 'changeover' ? <SponsorScene court={court} changeoverEndsAt={court.changeoverEndsAt} sponsor={sponsor} muted={muted} onMute={onMute}/> : <>
      <div className="visual-top"><span><i className={'live-dot ' + (match.phase === 'dispute' ? 'red' : '')}/>{match.phase === 'dispute' ? 'PLAY PAUSED' : match.phase === 'warmup' ? 'WARMUP' : court.rallyStartedAt ? 'RALLY IN PROGRESS' : 'COURT VIEW'}</span><button className="icon-button inverse" aria-label="Expand court view" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void visual.current?.requestFullscreen?.().catch(() => {}); }}><ArrowsOut size={18}/></button></div>
      <div className="visual-bottom"><span className="visual-caption">COURT {String(court.id).padStart(2, '0')}<small>Animated court view</small></span><span className="visual-state">{!court.online && !scorer ? <><WifiSlash size={13}/> Last received state</> : match.phase === 'dispute' ? <><Pause size={13} weight="fill"/> Frozen</> : court.rallyStartedAt ? <><Play size={13} weight="fill"/> {match.id === 'M101' ? 'R' + ((court.rallyIndex ?? 0) + 1) : 'Rally'} in play</> : match.phase === 'complete' ? <><Flag size={13}/> Match complete</> : <><Broadcast size={14}/> {match.phase === 'warmup' ? 'New players on court' : court.rallyFinished ? 'Team ' + (court.rallyWinner === 1 ? (court.id === 1 ? 'B' : 'F') : (court.id === 1 ? 'A' : 'E')) + ' wins · awaiting score' : 'Ready to serve'}</>}</span></div>
    </>}
  </div>;
}
export function DecisionBar({ court, scorer, planStatus, otherCourt }: { court: Court; scorer: boolean; planStatus: string; otherCourt: Court }) {
  const c = court;
  const isOfflineView = !c.online && !scorer;
  let { title, detail } = c.decision;
  let kind: string = c.decision.type;
  let Icon = c.decision.type === 'accepted' ? CheckCircle : c.decision.type === 'blocked' ? ShieldCheck : c.decision.type === 'correction' ? ArrowCounterClockwise : Microphone;
  if (isOfflineView) { title = 'Showing the last received score'; detail = 'The court keeps scoring locally. Updates arrive when it reconnects.'; kind = 'offline'; Icon = WifiSlash; }
  else if (requiresDecidingTiebreakOverride(c)) { title = 'Manual rule override required'; detail = 'Court ' + c.id + ' is tied at 5–5 in the deciding set. Open history to select a 10-point match tiebreak.'; kind = 'blocked'; Icon = WarningCircle; }
  else if (c.match.phase === 'dispute') { title = 'Manual override required'; detail = 'Court ' + c.id + ' is paused at ' + scoreText(c.match.score) + '. Open score history to restore the correct prior state.'; kind = 'blocked'; Icon = WarningCircle; }
  else if (c.resultDeliveryRequired) { title = 'Send result before the next game'; detail = 'This match is complete. Send the result to Tennis Canada before Court ' + c.id + ' is released.'; kind = 'blocked'; Icon = ShieldCheck; }
  else if (c.match.phase === 'changeover') { title = 'Changeover in progress'; detail = 'The countdown runs locally. Play resumes at the end of the break.'; kind = 'ready'; Icon = Clock; }
  else if (c.match.phase === 'warmup') { title = c.match.round + ' assigned'; detail = 'Players are on court. Upcoming rules applied before the match starts.'; kind = 'accepted'; Icon = CheckCircle; }
  else if (c.match.phase === 'complete') { title = 'Game. Set. Match.'; detail = planStatus === 'solving' ? 'Result recorded. Finding the next valid assignment…' : 'Match complete. Court is becoming available.'; kind = 'accepted'; Icon = Flag; }
  else if (isDecidingPoint(c.match) && c.decision.type !== 'confirmation' && c.decision.type !== 'blocked') {
    const other = otherCourt;
    const waitingForOverride = c.match.id === 'M101' && other.match.id === 'M102' && !other.events.some(e => e.kind === 'resumed' && e.matchId === 'M102');
    title = 'No-Ad. The next point decides it.';
    detail = waitingForOverride ? other.match.phase === 'dispute' ? 'Court 2 needs a manual override. Resolve its dispute before the deciding rally.' : 'Court 2 is catching up. Its dispute checkpoint comes before the deciding rally.' : c.match.receiverSide ? 'Receiving side selected. Play the deciding point.' : 'Receiving team: choose the side below.';
    kind = 'deciding'; Icon = TennisBall;
  }
  return <div className={'decision-bar decision--' + kind} role="status" aria-live="polite">
    <span className="decision-icon"><Icon size={24} weight={kind === 'accepted' ? 'fill' : 'regular'}/></span>
    <div><strong>{title}</strong><span>{c.decision.heard && kind === 'blocked' ? 'Heard “' + c.decision.heard + '”. ' : ''}{detail}</span></div>
    <span className="decision-meta">{!c.online && scorer ? <><WifiSlash size={15}/>{c.pending} pending sync</> : c.match.phase === 'playing' && !isOfflineView ? <><Check size={15}/> {c.decision.type === 'accepted' ? 'Accepted locally' : scorer ? 'Saved locally' : 'Browser session'}</> : null}</span>
  </div>;
}
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<SpeechResult>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
function VoiceScoreButton({ court, disabled }: { court: Court; disabled: boolean }) {
  const [listening, setListening] = useState(false);
  const recognizer = useRef<Recognition | null>(null);
  const listeningRef = useRef(false);
  const submittedRef = useRef(false);
  useEffect(() => () => { recognizer.current?.abort(); recognizer.current = null; listeningRef.current = false; }, []);
  const listen = () => {
    if (disabled) return;
    if (listeningRef.current) { recognizer.current?.stop(); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setUnclear(court.id, 'Browser microphone unavailable. Use the touch controls to enter the score.'); return; }
    const recognition = new Speech(); recognizer.current = recognition; submittedRef.current = false; recognition.lang = 'en-CA'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = e => { const result = e.results[e.resultIndex]; if (result.isFinal && !submittedRef.current) { submittedRef.current = true; recognition.stop(); submitCall(court.id, result[0].transcript); } };
    recognition.onerror = () => { if (recognizer.current !== recognition) return; recognizer.current = null; listeningRef.current = false; setListening(false); setUnclear(court.id, 'Microphone could not hear a clear call. Use touch or try again.'); };
    recognition.onend = () => { if (recognizer.current !== recognition) return; recognizer.current = null; listeningRef.current = false; setListening(false); };
    listeningRef.current = true; setListening(true);
    try { recognition.start(); } catch { recognizer.current = null; listeningRef.current = false; setListening(false); setUnclear(court.id, 'Microphone could not start. Use the touch controls to enter the score.'); }
  };
  return <button onClick={listen} disabled={disabled} aria-pressed={listening}><Microphone size={17}/>{listening ? 'Listening…' : 'Speak score'}</button>;
}
export function ScoreControls({ court, scorer, onDispute, onResultDelivery }: { court: Court; scorer: boolean; onDispute: () => void; onResultDelivery: () => void }) {
  const playing = court.match.phase === 'playing';
  const disabled = !playing || (!scorer && !court.online) || !!court.rallyStartedAt;
  const correcting = court.decision.type === 'correction';
  const blocked = court.decision.type === 'blocked';
  const choices = legalChoices(court);
  if (court.match.phase === 'warmup') return <div className="warmup-actions"><button className="button primary" onClick={() => beginWarmupMatch(court.id)}><Play size={18} weight="fill"/> Begin match</button><span>{court.match.format} · {court.match.rules.pace} · v{court.match.rules.version}</span></div>;
  if (court.match.phase === 'dispute') return <div className="warmup-actions"><button className="button danger" disabled={!court.online} onClick={onDispute}><WarningCircle size={18}/> {requiresDecidingTiebreakOverride(court) ? 'Open rule override' : 'Open manual override'}</button><span>{court.online ? requiresDecidingTiebreakOverride(court) ? 'Choose the 10-point tiebreak rule in history.' : 'Choose the correct prior score from history.' : 'Reconnect before organizer intervention.'}</span></div>;
  if (court.resultDeliveryRequired) return <div className="warmup-actions result-delivery-gate"><button className="button primary" onClick={onResultDelivery}><ShieldCheck size={18}/> Open result delivery</button><span>Send the completed result to Tennis Canada before the next game.</span></div>;
  if (!playing) return null;
  return <div className="score-controls">
    {isDecidingPoint(court.match) && <div className="receiver-choice"><span>Receiving side</span>{(['deuce', 'ad'] as const).map(side => <button key={side} aria-pressed={court.match.receiverSide === side} disabled={disabled} onClick={() => selectReceiver(court.id, side)}>{side === 'deuce' ? 'Deuce side' : 'Ad side'}{court.match.receiverSide === side && <Check size={14}/>}</button>)}</div>}
    {court.decision.type === 'confirmation' ? <div className="point-buttons"><button className="point-button" onClick={() => confirmCall(court.id)}><Check/> Yes, confirm</button><button className="point-button" onClick={() => dismissDecision(court.id)}>No, keep current score</button></div> : correcting ? <div className="correction-controls"><button className="button primary" onClick={() => undoPoint(court.id)} disabled={!court.events.some(e => e.kind === 'point' && e.matchId === court.match.id)}><ArrowCounterClockwise/> Undo last point</button><button className="button quiet" onClick={() => dismissDecision(court.id)}>Cancel correction</button></div> : <div className="point-buttons">{court.match.teams.map((names, index) => <button key={index} className="point-button" disabled={disabled || !choices[index]} aria-label={'Point for ' + names.map(name => name.split(' ').at(-1)).join(' / ')} onClick={() => awardPoint(court.id, index as Team)}><span className="point-button-icon"><Plus size={20}/></span><span>{blocked && <strong className="legal-score">{choices[index]}</strong>}<span>{blocked ? 'Point for ' : ''}{names.map(name => name.split(' ').at(-1)).join(' / ')}</span></span><span className="point-button-label">{blocked ? 'LEGAL NEXT SCORE' : 'AWARD POINT'}</span></button>)}</div>}
    <div className="secondary-controls">
      <VoiceScoreButton court={court} disabled={disabled}/>
      <button onClick={() => openCorrection(court.id)} disabled={disabled || correcting}><ArrowCounterClockwise size={17}/> Correction</button>
      {blocked ? <button onClick={() => dismissDecision(court.id)}>Cancel · keep score</button> : <button className="rally-control" disabled={disabled || !canStartRally(court)} onClick={() => startRally(court.id)}><Play size={15}/> Play rally</button>}
    </div>
  </div>;
}
