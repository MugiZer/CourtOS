import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowCounterClockwise, ArrowRight, Check, CheckCircle, CloudArrowUp, Microphone, MicrophoneSlash, Play, ShieldCheck, WarningCircle, WifiHigh, WifiSlash, X } from '@phosphor-icons/react';
import type { CourtId, DemoState, Rules } from '../demo/types';
import { scoreText, serverName } from '../demo/score';
import { ActivityRow } from './Activity';
import { SponsorScene } from './CourtView';
import { dispute, loadScenario, publishRules, requestConfirmation, restoreEvent, setOnline, setUnclear, startChangeover, submitCall, updateSponsor } from '../demo/store';

export type Panel = 'rules' | 'history' | 'sponsor' | 'demo' | 'voice' | null;
export function Drawer({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={'drawer ' + (wide ? 'drawer--wide' : '')} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left) onClose(); } }}>
    <div className="drawer-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={23}/></button></div>
    <div className="drawer-body">{children}</div>
  </dialog>;
}
function Segments<T extends string | number | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return <fieldset className="field-group"><legend>{label}</legend><div className="segments">{options.map(option => <button key={String(option.value)} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}{value === option.value && <Check size={15}/>}</button>)}</div></fieldset>;
}
export function RulesPanel({ state }: { state: DemoState }) {
  const [draft, setDraft] = useState<Omit<Rules, 'version'>>(state.upcomingRules);
  const [published, setPublished] = useState(false);
  return <form className="rules-form" onSubmit={event => { event.preventDefault(); publishRules(draft); setPublished(true); }}>
    <section className="scope-card"><h3>Active match rules</h3>{state.courts.map(c => <p key={c.id}><strong>Court {c.id} · {c.match.id} · v{c.match.rules.version}</strong><br/>{c.match.rules.noAd ? 'No-Ad' : 'Advantage'} · {c.match.rules.deciding === 'full' ? 'Full deciding set' : '10-point deciding tiebreak'} · {c.match.rules.changeover}s changeover</p>)}</section>
    <h3>Upcoming configuration</h3>
    <p className="panel-intro">Set the format for the next matches. Every match already in play keeps its original rules.</p>
    <div className="scope-card"><span className="eyebrow">APPLIES TO</span><strong>Upcoming mixed doubles</strong><span>{!state.courts.some(c => c.match.id === 'M103') && <>M103 · Semifinal A<br/></>}M105 · Final</span></div>
    <Segments label="No-Ad scoring" value={draft.noAd} options={[{ label: 'Off', value: false }, { label: 'On', value: true }]} onChange={value => { setDraft({ ...draft, noAd: value }); setPublished(false); }}/>
    <Segments label="Deciding set" value={draft.deciding} options={[{ label: 'Full set', value: 'full' }, { label: '10-point tiebreak', value: 'tiebreak' }]} onChange={value => { setDraft({ ...draft, deciding: value }); setPublished(false); }}/>
    <Segments label="Changeover" value={draft.changeover} options={[{ label: '90 seconds', value: 90 }, { label: '60 seconds', value: 60 }]} onChange={value => { setDraft({ ...draft, changeover: value }); setPublished(false); }}/>
    <div className="rules-explainer"><ShieldCheck size={20}/><span>Active matches stay pinned to their current version. Singles matches are unaffected.</span></div>
    <button className="button primary full drawer-action" type="submit">{published ? <CheckCircle size={19}/> : <Check size={19}/>} {published ? 'Rules published · v' + state.upcomingRules.version : 'Apply to upcoming matches'}</button>
    {published && <div className="publication-receipt" role="status"><strong>Upcoming rules v{state.upcomingRules.version} published</strong>{state.courts.map(c => <div key={c.id}><span>Court {c.id} · {c.match.id}</span><span>Active v{c.match.rules.version}</span><small>{c.online ? 'Policy received' : 'Delivery pending · offline'}</small></div>)}<p>Unstarted mixed doubles matches will use v{state.upcomingRules.version}. Assigned matches retain their active version.</p></div>}
  </form>;
}
export function HistoryPanel({ state, id }: { state: DemoState; id: CourtId }) {
  const court = state.courts[id - 1];
  const [target, setTarget] = useState<string>('');
  const frozen = court.match.phase === 'dispute';
  const candidates = court.events.filter(e => e.kind === 'point' && e.matchId === court.match.id && e.score.winner === null).slice(-6).reverse();
  const selected = candidates.find(e => e.id === target);
  return <div>
    {frozen && <><div className="dispute-notice"><WarningCircle size={23}/><div><strong>Scoring frozen at {scoreText(court.match.score)}</strong><p>Players disagree about the last point.</p></div></div><h3 className="restore-question">What score should we return to?</h3><div className="history-choices">{candidates.map(e => <label className={'history-choice ' + (target === e.id ? 'selected' : '')} key={e.id}><input type="radio" name="prior-event" value={e.id} checked={target === e.id} onChange={() => setTarget(e.id)}/><strong>{scoreText(e.score)}</strong><span>{JSON.stringify(e.score) === JSON.stringify(court.match.score) ? 'Current disputed state' : 'Prior accepted state'}<small>Event {e.sequence} · {e.score.games.join('–')} games</small></span></label>)}</div><p className="muted">Selecting a prior state does not change the current score.</p><div className="drawer-action">{selected && <p className="restore-preview">Points: {scoreText(court.match.score)} → {scoreText(selected.score)}<br/>Games: {court.match.score.games.join('–')} → {selected.score.games.join('–')}<br/>Sets: {court.match.score.sets.map(s => s.join('–')).join(', ') || 'None'} → {selected.score.sets.map(s => s.join('–')).join(', ') || 'None'}<br/>Server: {serverName(court.match)} → {serverName({ ...court.match, score: selected.score })}<br/>Scoring resumes from event {selected.sequence}. History is retained.</p>}<button className="button primary full" disabled={!selected || !court.online} onClick={() => { if (target) restoreEvent(id, target); }}><ArrowCounterClockwise size={18}/>{selected ? 'Restore ' + scoreText(selected.score) + ' and resume' : 'Select a prior score'}</button></div><p className="field-note">Adds a correction event. Original history is preserved.</p></>}
    <div className="subsection-heading history-title"><h3>Event history</h3><span className="small-label">{court.events.length} EVENTS</span></div>
    {court.events.length ? <div className="full-history">{court.events.slice().reverse().map(event => <ActivityRow key={event.id} event={event}/>)}</div> : <p className="panel-intro">Your first point will start the match history.</p>}
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
export function VoicePanel({ state, id, onClose }: { state: DemoState; id: CourtId; onClose: () => void }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('Enter the score call, or try your browser microphone.');
  const recognizer = useRef<Recognition | null>(null);
  useEffect(() => () => { recognizer.current?.abort(); }, []);
  const listen = () => {
    if (listening) { recognizer.current?.stop(); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setMessage('Microphone recognition is not available in this browser. Enter a score call below or use touch.'); setUnclear(id, 'Browser microphone unavailable. Touch and typed calls are ready.'); return; }
    const recognition = new Speech(); recognizer.current = recognition; recognition.lang = 'en-CA'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = e => { const result = e.results[e.resultIndex]; setText(result[0].transcript); if (result.isFinal) { recognition.stop(); submitCall(id, result[0].transcript); onClose(); } };
    recognition.onerror = e => { setListening(false); setMessage(e.error === 'not-allowed' ? 'Microphone permission was denied. You can still type the call.' : 'Could not hear a clear call. Try again or type it below.'); };
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); setMessage('Listening. Say the score clearly.'); } catch { setMessage('Microphone could not start. Enter a call below.'); }
  };
  return <form onSubmit={e => { e.preventDefault(); if (text.trim()) { submitCall(id, text); onClose(); } }}>
    <div className={'voice-orb ' + (listening ? 'listening' : '')}><Microphone size={42}/></div>
    <h3 className="voice-current">Current score <b>{scoreText(state.courts[id - 1].match.score)}</b></h3>
    <p className="panel-intro centered" role="status">{message}</p>
    <button type="button" className="button full" onClick={listen}>{listening ? <MicrophoneSlash size={18}/> : <Microphone size={18}/>} {listening ? 'Stop listening' : 'Use microphone'}</button>
    <label className="text-field"><span>Score call</span><input placeholder="e.g. Fifteen-love" value={text} onChange={e => setText(e.target.value)} autoComplete="off"/></label>
    <button className="button primary full" type="submit" disabled={!text.trim()}>Submit score call <Check size={18}/></button>
    <p className="field-note">Browser speech is a preview. The production two-stage voice system is not connected. Calls still pass through the local demo scorer.</p>
    <div className="voice-examples"><span>TRY A CALL</span>{['Fifteen-love', 'Thirty-all', 'Correction'].map(call => <button type="button" key={call} onClick={() => setText(call)}>{call}</button>)}</div>
  </form>;
}
export function SponsorPanel({ state }: { state: DemoState }) {
  const [name, setName] = useState(state.sponsor.name);
  const [headline, setHeadline] = useState(state.sponsor.headline);
  const [media, setMedia] = useState(state.sponsor.media);
  const [type, setType] = useState(state.sponsor.mediaType);
  const [notice, setNotice] = useState('');
  const file = useRef<HTMLInputElement>(null);
  return <form onSubmit={e => { e.preventDefault(); updateSponsor(name, headline, media, type); setNotice('Creative attached to tournament changeovers.'); }}>
    <p className="panel-intro">One creative, ready on every court. It appears automatically during a changeover.</p>
    <label className="text-field"><span>Sponsor name</span><input value={name} maxLength={48} onChange={e => setName(e.target.value)}/></label>
    <label className="text-field"><span>Headline</span><textarea value={headline} maxLength={100} onChange={e => setHeadline(e.target.value)} rows={3}/></label>
    <input ref={file} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={e => {
      const selected = e.target.files?.[0]; if (!selected) return;
      if (selected.size > 2_000_000) { setNotice('Choose a file below 2 MB for local preview storage.'); return; }
      const reader = new FileReader(); reader.onload = () => { setMedia(String(reader.result)); setType(selected.type.startsWith('video/') ? 'video' : 'image'); setNotice(selected.name + ' selected. Attach it below.'); };
      reader.onerror = () => setNotice('The file could not be read. Please try another.');
      reader.readAsDataURL(selected);
    }}/>
    <button className="upload-zone" type="button" onClick={() => file.current?.click()}><CloudArrowUp size={30}/><strong>{media ? 'Replace creative' : 'Upload a creative'}</strong><span>Image or video · up to 2 MB in this preview</span></button>
    <p className="field-note">Changeover crop preview · centered cover. Crop varies with court display size.</p><div className="sponsor-preview"><SponsorScene court={state.courts[0]} remaining={60} muted onMute={() => {}} preview={{ name, headline, media, mediaType: type }}/></div>{media && <div className="upload-preview">{type === 'video' ? <video src={media} controls muted/> : <img src={media} alt="Selected sponsor creative"/>}<button type="button" onClick={() => { setMedia(undefined); setType(undefined); }}>Use original artwork</button></div>}
    <button className="button primary full" type="submit">Attach to tournament <Check size={18}/></button>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <div className="rules-explainer"><ShieldCheck size={20}/><span>The Time cue takes priority over sponsor audio. Match context stays visible.</span></div>
  </form>;
}
export function DemoPanel({ state, activeCourt, onScenario }: { state: DemoState; activeCourt: CourtId; onScenario: (id: CourtId) => void }) {
  const court = state.courts[activeCourt - 1];
  return <div><p className="panel-intro">Explore the frontend with local fixtures. These controls simulate court events; no production server is connected.</p>
    <span className="eyebrow">LOAD A PREVIEW STATE</span>
    <div className="scenario-list">{([
      ['live', 'Start the demo', '0–0 on Court 1. Court 2 starts its 90-second sponsor break.'],
      ['blocked', 'Impossible score call', 'Thirty-love at 15–15. Legal touch choices open automatically.'],
      ['offline', 'Keep playing offline', 'Court shows 30–30. Organizer retains 30–15.'],
      ['dispute', 'A dispute on Court 2', 'Frozen at deuce. Restore a previous accepted score.'],
      ['deciding', 'The deciding point', 'No-Ad deuce. Choose the receiver, then finish the match.'],
    ] as const).map(([key, title, detail]) => <button key={key} onClick={() => { loadScenario(key); onScenario(key === 'dispute' ? 2 : 1); }}><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={20}/></button>)}</div>
    <div className="demo-actions"><h3>Court {activeCourt} controls</h3><button className="button full" onClick={() => setOnline(activeCourt, !court.online)}>{court.online ? <WifiSlash/> : <WifiHigh/>}{court.online ? 'Pause preview connection' : 'Reconnect preview court'}</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => startChangeover(activeCourt)}><Play/> Start changeover</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => { dispute(activeCourt); onScenario(activeCourt); }}><WarningCircle/> Trigger player dispute</button><button className="button full" disabled={court.match.phase !== 'playing'} onClick={() => { requestConfirmation(activeCourt); onScenario(activeCourt); }}><ShieldCheck/> Preview voice confirmation</button></div>
    <div className="preview-boundary"><strong>Frontend preview</strong><p>Browser-local persistence and same-browser tab updates are available. Socket.IO sync, production CourtGuard, ASR cascade and the global optimizer remain integration work.</p></div>
  </div>;
}
