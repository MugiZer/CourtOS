import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowCounterClockwise, ArrowRight, Check, CloudArrowUp, DownloadSimple, Play, ShieldCheck, WarningCircle, WifiHigh, WifiSlash, X } from '@phosphor-icons/react';
import type { Court, CourtId, DemoState } from '../demo/types';
import { scoreText, serverName } from '../demo/score';
import { downloadPointHistory, pointHistory } from '../demo/history';
import { ActivityRow } from './Activity';
import { SponsorScene } from './CourtView';
import { applyDecidingTiebreak, dispute, loadScenario, markResultDelivered, requestConfirmation, requiresDecidingTiebreakOverride, restoreEvent, setOnline, startChangeover, updateSponsor } from '../demo/store';

export type Panel = 'rules' | 'history' | 'sponsor' | 'scenarios' | null;
export function Drawer({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={'drawer ' + (wide ? 'drawer--wide' : '')} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left) onClose(); } }}>
    <div className="drawer-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={23}/></button></div>
    <div className="drawer-body">{children}</div>
  </dialog>;
}
export { default as RulesPanel } from "./MatchSettings";
export function HistoryPanel({ state, id }: { state: DemoState; id: CourtId }) {
  const court = state.courts[id - 1];
  const [target, setTarget] = useState<string>('');
  const [exportStatus, setExportStatus] = useState('');
  const frozen = court.match.phase === 'dispute';
  const tiebreakOverride = requiresDecidingTiebreakOverride(court);
  const candidates = court.events.filter(e => (e.kind === 'point' || e.kind === 'snapshot') && e.matchId === court.match.id && e.score.winner === null).slice(-6).reverse();
  const selected = candidates.find(e => e.id === target);
  const points = pointHistory(court);
  return <div>
    {tiebreakOverride ? <section className="rule-override" aria-labelledby="rule-override-title"><div className="dispute-notice"><WarningCircle size={23}/><div><strong id="rule-override-title">Manual rule override required</strong><p>The deciding set is tied at 5–5. Select the 10-point match tiebreak that governs the final stage.</p></div></div><p className="field-note">Scoring stays locked until this organizer decision is accepted. The active rules will be versioned in the event history.</p><button className="button primary full" type="button" onClick={() => applyDecidingTiebreak(id)}><ShieldCheck size={18}/> Apply 10-point match tiebreak</button></section> : frozen && <><div className="dispute-notice"><WarningCircle size={23}/><div><strong>Manual override required</strong><p>Scoring is frozen at {scoreText(court.match.score)}. Players disagree about the last point.</p></div></div><h3 className="restore-question">What score should we return to?</h3><div className="history-choices">{candidates.map(e => <label className={'history-choice ' + (target === e.id ? 'selected' : '')} key={e.id}><input type="radio" name="prior-event" value={e.id} checked={target === e.id} onChange={() => setTarget(e.id)}/><strong>{scoreText(e.score)}</strong><span>{JSON.stringify(e.score) === JSON.stringify(court.match.score) ? 'Current disputed state' : 'Prior accepted state'}<small>Event {e.sequence} · {e.score.games.join('–')} games</small></span></label>)}</div><p className="muted">Selecting a prior state does not change the current score.</p><div className="drawer-action">{selected && <p className="restore-preview">Points: {scoreText(court.match.score)} → {scoreText(selected.score)}<br/>Games: {court.match.score.games.join('–')} → {selected.score.games.join('–')}<br/>Sets: {court.match.score.sets.map(s => s.join('–')).join(', ') || 'None'} → {selected.score.sets.map(s => s.join('–')).join(', ') || 'None'}<br/>Server: {serverName(court.match)} → {serverName({ ...court.match, score: selected.score })}<br/>Scoring resumes from event {selected.sequence}. History is retained.</p>}<button className="button primary full" disabled={!selected || !court.online} onClick={() => { if (target) restoreEvent(id, target); }}><ArrowCounterClockwise size={18}/>{selected ? 'Restore ' + scoreText(selected.score) + ' and resume' : 'Select a prior score'}</button></div><p className="field-note">Adds a correction event. Original history is preserved.</p></>}
    <TournamentSoftwareResult court={court}/>
    <div className="subsection-heading history-title"><h3>Event history</h3><div className="history-actions"><span className="small-label">{court.events.length} EVENTS</span><button className="button compact-button" type="button" disabled={!points.length} onClick={() => { downloadPointHistory(court); setExportStatus(`${points.length} points exported.`); }}><DownloadSimple size={16}/> Export points</button></div></div>
    {exportStatus && <p className="form-notice" role="status">{exportStatus}</p>}
    {court.events.length ? <div className="full-history">{court.events.slice().reverse().map(event => <ActivityRow key={event.id} event={event}/>)}</div> : <p className="panel-intro">Your first point will start the match history.</p>}
  </div>;
}
type TournamentSoftwareStep = 'idle' | 'login' | 'connected' | 'sent';
const tennisCanadaLogo = 'https://static.tournamentsoftware.com/Content/images/themes/tc/logo.svg?v=20240611103631';
function TournamentSoftwareResult({ court }: { court: Court }) {
  const [step, setStep] = useState<TournamentSoftwareStep>('idle');
  useEffect(() => setStep('idle'), [court.match.id]);
  const complete = court.match.phase === 'complete';
  const required = court.resultDeliveryRequired === true;
  const delivered = court.resultDelivered === true;
  const receipt = `TC-LOCAL-${court.match.id}-001`;
  return <section className="result-delivery" aria-labelledby="result-delivery-title">
    <div className="result-delivery-heading"><div><span className="eyebrow">RESULT DELIVERY</span><h3 id="result-delivery-title">Tennis Canada</h3></div><span className="small-label">BROWSER CONNECTION</span></div>
    <div className="tournament-software-brand"><img src={tennisCanadaLogo} alt="Tennis Canada"/><div><strong>Tennis Canada</strong><span>Tournament Software</span></div></div>
    {step === 'idle' && delivered ? <div className="integration-success" role="status"><Check size={22}/><div><strong>Result sent to Tennis Canada</strong><span>{court.match.id} is recorded and the next game may be scheduled.</span><small>Local receipt {receipt}</small></div></div> : step === 'idle' && <>
      <p>{required ? 'Send the completed result before CourtOS releases the next game.' : 'Send the final result to your Tennis Canada tournament account.'} This browser-local connection never transmits credentials.</p>
      {!complete && !required ? <><p className="field-note">Finish the match before sending a result.</p><button className="button full" type="button" disabled>Complete match to continue</button></> : <button className="button primary full" type="button" onClick={() => setStep('login')}>Log in to Tournament Software <ArrowRight size={16}/></button>}
    </>}
    {step === 'login' && <div className="integration-login">
      <span className="eyebrow">LOGIN</span><strong>Tennis Canada organizer account</strong>
      <div className="mock-login-field"><span>Email</span><b>organizer@local.test</b></div>
      <div className="mock-login-field"><span>Password</span><b>Local account</b></div>
      <p className="field-note">Browser-local preview. No password is stored or transmitted.</p>
      <button className="button primary full" type="button" onClick={() => setStep('connected')}>Continue with local account <ArrowRight size={16}/></button>
      <button className="button quiet full" type="button" onClick={() => setStep('idle')}>Cancel</button>
    </div>}
    {step === 'connected' && <div className="integration-connected">
      <div><span className="eyebrow">CONNECTED · BROWSER</span><strong>Tournament Organizer</strong><span>Ready to send {court.match.id} to Tennis Canada.</span></div>
      <button className="button primary full" type="button" onClick={() => setStep('sent')}>Send match result <ArrowRight size={16}/></button>
      <button className="button quiet full" type="button" onClick={() => setStep('idle')}>Use different account</button>
    </div>}
    {step === 'sent' && <div className="integration-success" role="status"><Check size={22}/><div><strong>Result sent to Tennis Canada</strong><span>{court.match.id} is ready for the tournament record.</span><small>Local receipt {receipt}</small></div><button className="button quiet" type="button" onClick={() => { markResultDelivered(court.id); setStep('idle'); }}>Close connection</button></div>}
  </section>;
}
export function SponsorPanel({ state }: { state: DemoState }) {
  const [name, setName] = useState(state.sponsor.name);
  const [headline, setHeadline] = useState(state.sponsor.headline);
  const [media, setMedia] = useState(state.sponsor.media);
  const [type, setType] = useState(state.sponsor.mediaType);
  const [clickUrl, setClickUrl] = useState(state.sponsor.clickUrl ?? '');
  const [audio, setAudio] = useState(state.sponsor.audio ?? '');
  const [skipAds, setSkipAds] = useState(state.sponsor.skipAds ?? false);
  const [notice, setNotice] = useState('');
  const file = useRef<HTMLInputElement>(null);
  return <form onSubmit={e => { e.preventDefault(); updateSponsor(name, headline, media, type, clickUrl, audio, skipAds); setNotice(skipAds ? 'Sponsor ads will be skipped during changeovers.' : 'Creative attached to tournament changeovers.'); }}>
    <p className="panel-intro">A 90-second ad pod rotates across every court during changeover. Use the supplied sponsor creatives or attach a custom image or video.</p>
    <label className="skip-ads-option"><input type="checkbox" checked={skipAds} onChange={e => setSkipAds(e.target.checked)}/><span><strong>Skip sponsor ads</strong><small>Keep the changeover clock and TIME cue, but hide sponsor creative.</small></span></label>
    <label className="text-field"><span>Sponsor name</span><input value={name} maxLength={48} onChange={e => setName(e.target.value)}/></label>
    <label className="text-field"><span>Headline</span><textarea value={headline} maxLength={100} onChange={e => setHeadline(e.target.value)} rows={3}/></label>
    <label className="text-field"><span>Destination URL <small>optional</small></span><input type="url" value={clickUrl} placeholder="https://sponsor.example" onChange={e => setClickUrl(e.target.value)}/></label>
    <label className="text-field"><span>Audio URL <small>optional, opt-in</small></span><input type="url" value={audio} placeholder="https://sponsor.example/ad.mp3" onChange={e => setAudio(e.target.value)}/></label>
    <input ref={file} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={e => {
      const selected = e.target.files?.[0]; if (!selected) return;
      if (selected.size > 2_000_000) { setNotice('Choose a file below 2 MB for browser storage.'); return; }
      const reader = new FileReader(); reader.onload = () => { setMedia(String(reader.result)); setType(selected.type.startsWith('video/') ? 'video' : 'image'); setNotice(selected.name + ' selected. Attach it below.'); };
      reader.onerror = () => setNotice('The file could not be read. Please try another.');
      reader.readAsDataURL(selected);
    }}/>
    <button className="upload-zone" type="button" onClick={() => file.current?.click()}><CloudArrowUp size={30}/><strong>{media ? 'Replace creative' : 'Upload a creative'}</strong><span>Image or video · up to 2 MB for this session</span></button>
    <p className="field-note">Court crop uses centered cover. The three supplied sponsor creatives rotate at 30 seconds each. Confirm usage rights before production.</p><div className="sponsor-preview"><SponsorScene court={state.courts[0]} changeoverEndsAt={Date.now() + 60000} sponsor={state.sponsor} muted onMute={() => {}} preview={{ name, headline, media, mediaType: type, clickUrl, audio, skipAds }}/></div>{media && <div className="upload-preview">{type === 'video' ? <video src={media} controls muted/> : <img src={media} alt="Selected sponsor creative"/>}<button type="button" onClick={() => { setMedia(undefined); setType(undefined); }}>Use supplied sponsor set</button></div>}
    <button className="button primary full" type="submit">Attach to tournament <Check size={18}/></button>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <div className="rules-explainer"><ShieldCheck size={20}/><span>The Time cue takes priority over sponsor audio. Match context stays visible.</span></div>
  </form>;
}
export function ScenarioPanel({ state, activeCourt, onScenario }: { state: DemoState; activeCourt: CourtId; onScenario: (id: CourtId) => void }) {
  const court = state.courts[activeCourt - 1];
  return <div><p className="panel-intro">Use saved scenarios to inspect court workflows. These controls replay court events in this browser; no production server is connected.</p>
    <span className="eyebrow">LOAD A SCENARIO</span>
    <div className="scenario-list">{([
      ['live', 'Start live scoring', 'Court 1 starts at 0–0. Its first accepted point triggers Court 2’s 40–30 → 40–40 dispute.'],
      ['blocked', 'Impossible score call', 'Thirty-love at 15–15. Legal touch choices open automatically.'],
      ['offline', 'Keep playing offline', 'Court shows 30–30. Organizer retains 30–15.'],
      ['dispute', 'Manual override at deuce', 'Court 2 freezes at 40–40 while Court 1 stays live.'],
      ['deciding', 'The deciding point', 'No-Ad deuce. Choose the receiver, then finish the match.'],
      ['finish', 'Finish the deciding set', 'Court 1 is at 30–40 in the last set. One point ties games at 5–5 and opens the rule override.'],
    ] as const).map(([key, title, detail]) => <button key={key} onClick={() => { loadScenario(key); onScenario(key === 'dispute' ? 2 : 1); }}><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={20}/></button>)}</div>
    <div className="scenario-actions"><h3>Court {activeCourt} controls</h3><button className="button full" onClick={() => setOnline(activeCourt, !court.online)}>{court.online ? <WifiSlash/> : <WifiHigh/>}{court.online ? 'Pause court connection' : 'Reconnect court'}</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => startChangeover(activeCourt)}><Play/> Start changeover</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => { dispute(activeCourt); onScenario(activeCourt); }}><WarningCircle/> Trigger player dispute</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => { requestConfirmation(activeCourt); onScenario(activeCourt); }}><ShieldCheck/> Voice confirmation</button></div>
    <div className="preview-boundary"><strong>Browser session</strong><p>This browser saves state and updates other tabs. Socket.IO sync, production CourtGuard, ASR cascade and the global optimizer remain integration work.</p></div>
  </div>;
}
