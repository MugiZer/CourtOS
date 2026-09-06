import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Broadcast, CaretRight, Check, Clock, Flag, GearSix, Play, SlidersHorizontal, SpeakerHigh, SpeakerSlash, TennisBall } from '@phosphor-icons/react';
import { CourtVisual, DecisionBar, Scoreboard, ScoreControls, TeamName, Connection } from './components/CourtView';
import { Activity } from './components/Activity';
import Upcoming, { OptimizationSavings, ScheduleComparison } from './components/Upcoming';
import { ScenarioPanel, Drawer, HistoryPanel, RulesPanel, SponsorPanel } from './components/Drawers';
import type { Panel } from './components/Drawers';
import type { CourtId } from './demo/types';
import { getState, markSeen, tickChangeover, tickRallies, unread, useDemo } from './demo/store';
import { timeCallDue } from './demo/changeover';
import { labels } from './demo/score';

type Tab = 'court1' | 'court2' | 'upcoming';
export default function App() {
  const state = useDemo();
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) tickRallies(); }, 100); return () => clearInterval(timer); }, []);
  const scorer = window.location.pathname.startsWith('/court');
  const queryCourt: CourtId = new URLSearchParams(window.location.search).get('id') === '2' ? 2 : 1;
  const [tab, setTab] = useState<Tab>(scorer && queryCourt === 2 ? 'court2' : 'court1');
  const [panel, setPanel] = useState<Panel>(null);
  const [muted, setMuted] = useState(true);
  const [audioStatus, setAudioStatus] = useState('Time audio is off. Enable and test before play.');
  const calledAt = useRef(new Map<CourtId, number>());
  const lastFocus = useRef<HTMLElement | null>(null);
  const activeCourt: CourtId = tab === 'court2' ? 2 : 1;
  const court = state.courts[activeCourt - 1];
  const match = !scorer && !court.online ? court.remoteMatch : court.match;
  const pendingMatches = state.upcomingMatches.filter(m => !state.courts.some(c => c.match.id === m.id) && !state.completedMatches.some(r => r.match.id === m.id));
  const onDeck = pendingMatches.find(m => !m.dependencies?.length) ?? pendingMatches[0];
  const selectedEvents = unread(court);
  const changeovers = state.courts.map(c => c.match.phase === 'changeover' ? c.changeoverEndsAt : null).join(':');
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) { setAudioStatus('Speech audio unavailable. Watch the TIME cue.'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-CA'; utterance.rate = 0.85; utterance.volume = 1;
    utterance.onend = () => setAudioStatus('Time audio enabled. Check the tablet volume.');
    utterance.onerror = () => { setMuted(true); setAudioStatus('Audio failed. Enable and test again; watch the TIME cue.'); };
    window.speechSynthesis.speak(utterance);
  };
  const testAudio = () => {
    if (!('speechSynthesis' in window)) { setAudioStatus('Speech audio unavailable. Watch the TIME cue.'); return; }
    setMuted(false); setAudioStatus('Testing Time audio.'); speak('Time. Audio alerts enabled.');
  };
  const toggleAudio = () => {
    if (muted) testAudio();
    else { setMuted(true); window.speechSynthesis?.cancel(); setAudioStatus('Time audio is off. Watch the TIME cue.'); }
  };
  useEffect(() => {
    if (!getState().courts.some(c => c.match.phase === 'changeover')) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const time = Date.now();
      for (const id of [1, 2] as const) {
        const c = getState().courts[id - 1];
        if (!muted && (!scorer || (tab !== 'upcoming' && id === activeCourt)) && c.match.phase === 'changeover' && timeCallDue(c.changeoverEndsAt, time, calledAt.current.get(id) ?? null)) {
          calledAt.current.set(id, c.changeoverEndsAt!);
          setAudioStatus('TIME · Return to court');
          speak(scorer ? 'Time.' : `Court ${id}. Time.`);
        }
        tickChangeover(id);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [muted, scorer, activeCourt, tab, changeovers]);
  useEffect(() => { document.title = 'CourtOS · ' + (tab === 'upcoming' ? 'Upcoming matches' : 'Court ' + activeCourt); }, [tab, activeCourt]);
  const chooseTab = (next: Tab) => { setTab(next); if (next !== 'upcoming') markSeen(next === 'court1' ? 1 : 2); };
  const openPanel = (next: Panel) => { lastFocus.current = document.activeElement as HTMLElement; setPanel(next); };
  const closePanel = () => { setPanel(null); requestAnimationFrame(() => lastFocus.current?.focus()); };
  const scenario = (id: CourtId) => { setTab(id === 1 ? 'court1' : 'court2'); closePanel(); };
  const titles = { rules: ['TOURNAMENT SETTINGS', 'Match rules & scope'], history: ['COURT ' + activeCourt + ' · ' + court.match.id, court.match.phase === 'dispute' ? 'Manual override required.' : 'Score history'], sponsor: ['CHANGEOVER PARTNER', 'Changeover sponsor'], scenarios: ['COURT SCENARIOS', 'Review court workflows.'] };

  return <div className={'app ' + (scorer ? 'app--scorer' : '')}>
    <a href="#main" className="skip-link">Skip to court content</a>
    <header className="masthead"><div className="masthead-inner">
      <a href="/organizer" className="brand" aria-label="CourtOS organizer"><TennisBall size={29} weight="light"/><span>Court<b>OS</b></span></a>
      <div className="tournament-identity"><span>MONTRÉAL INVITATIONAL</span><small>Grass court series <i/> Tournament operations</small></div>
    <div className="masthead-actions"><span className="preview-label" title="Browser-local tournament state; no production server is connected"><i/>BROWSER SESSION</span><a className="court-link" href={scorer ? '/organizer' : '/court?id=' + activeCourt} target={scorer ? undefined : '_blank'} rel="noreferrer">{scorer ? 'Organizer view' : 'Court display'}<ArrowUpRight size={17}/></a><button className="icon-button inverse" aria-label={muted ? 'Enable and test Time audio' : 'Mute Time audio'} onClick={toggleAudio}>{muted ? <SpeakerSlash size={19}/> : <SpeakerHigh size={19}/>}</button></div>
    </div></header>
    <nav className="court-navigation" aria-label="Court navigation"><div className="navigation-inner">
      <div className="navigation-label"><span className="eyebrow">YOUR TOURNAMENT</span><span><i className="live-dot"/> {state.courts.filter(c => ['playing', 'changeover', 'dispute'].includes(c.match.phase)).length} courts in play</span></div>
      <div className="court-tabs" role="tablist" aria-label="Courts and upcoming matches" onKeyDown={e => {
        const all: Tab[] = ['court1', 'court2', 'upcoming']; let index = all.indexOf(tab);
        if (e.key === 'ArrowRight') index = (index + 1) % 3; else if (e.key === 'ArrowLeft') index = (index + 2) % 3; else return;
        e.preventDefault(); chooseTab(all[index]); (e.currentTarget.children[index] as HTMLButtonElement).focus();
      }}>
        {state.courts.map(c => {
          const key: Tab = c.id === 1 ? 'court1' : 'court2'; const count = unread(c); const shown = scorer ? c.match : c.remoteMatch; const points = labels(shown.score);
          return <button id={key + '-tab'} key={c.id} role="tab" aria-selected={tab === key} aria-controls="main" tabIndex={tab === key ? 0 : -1} className={'court-tab ' + (tab === key ? 'active ' : '') + (count ? 'needs-attention' : '')} onClick={() => chooseTab(key)}>
            <span className="tab-top"><span>Court {c.id}</span>{count > 0 ? <span className="unread-count" aria-label={count + ' new events'}>{count}</span> : <span className={'tab-status-dot ' + (c.online ? '' : 'offline')}/>}</span>
            <span className="tab-detail">{shown.phase === 'dispute' ? 'Manual override · ' + points.join('–') : !c.online ? points.join('–') + ' · offline' : shown.phase === 'warmup' ? 'Warmup · ' + shown.id : points.join('–') + ' · ' + (shown.phase === 'changeover' ? 'Changeover' : shown.id)}</span>
          </button>;
        })}
        <button id="upcoming-tab" role="tab" aria-selected={tab === 'upcoming'} aria-controls="main" tabIndex={tab === 'upcoming' ? 0 : -1} className={'court-tab upcoming-tab ' + (tab === 'upcoming' ? 'active' : '')} onClick={() => chooseTab('upcoming')}><span className="tab-top"><span>Upcoming matches</span><ArrowUpRight size={18}/></span><span className="tab-detail">{pendingMatches.length} matches pending · View readiness</span></button>
      </div>
    </div></nav>
    <main id="main" className="workspace" role="tabpanel" aria-labelledby={tab + '-tab'}>
      {state.storageError && <div className="storage-warning" role="alert">Local storage is full or unavailable. This session is in memory; export or free storage before relying on reload recovery.</div>}
      {tab === 'upcoming' ? <Upcoming state={state} onRules={() => openPanel('rules')}/> : <>
        <div className="court-heading"><div><div className="breadcrumb">Tournament live <CaretRight size={13}/> {match.round}</div><h1>Court <span>{String(activeCourt).padStart(2, '0')}</span><span className={'lifecycle-badge ' + match.phase}>{match.phase === 'playing' ? <i className="live-dot"/> : match.phase === 'dispute' ? <Flag size={13}/> : <Clock size={13}/>} {match.phase === 'complete' ? 'Match complete' : match.phase === 'warmup' ? 'Warmup' : match.phase === 'dispute' ? 'Dispute' : match.phase === 'changeover' ? 'Changeover' : 'In play'}</span></h1></div><div className="court-heading-actions"><Connection court={court}/><span className="heading-divider"/><button className="button compact-button" onClick={() => openPanel('rules')}><SlidersHorizontal size={17}/> Rules & scope</button><button className="icon-button" aria-label="Sponsor settings" title="Sponsor settings" onClick={() => openPanel('sponsor')}><GearSix size={19}/></button></div></div>
        {state.optimizationDecision?.court === activeCourt && match.id === state.optimizationDecision.assignedMatch && <OptimizationSavings state={state}/>}
        <div className="court-stage"><Scoreboard court={court} match={match} scorer={scorer}/>
        <DecisionBar court={court} scorer={scorer} planStatus={state.plan.status} otherCourt={state.courts[1]}/>
        <ScoreControls court={court} scorer={scorer} onDispute={() => openPanel('history')} onResultDelivery={() => openPanel('history')}/>
        {scorer && match.rules.changeover > 0 && <section className="court-audio" aria-label="Time audio setup"><div><strong>TIME at {match.rules.changeover - 10}s · {match.rules.changeover}s rest</strong><span role="status">{audioStatus}</span></div><button className="button" onClick={testAudio}>{muted ? 'Enable & test audio' : 'Test Time call'}</button></section>}
        <CourtVisual court={court} match={match} sponsor={state.sponsor} muted={muted} onMute={toggleAudio} scorer={scorer}/></div>
        {state.lastResult && activeCourt === 1 && match.id !== 'M101' && <div className="last-result"><Flag size={18}/><strong>M101 complete</strong><span>{state.lastResult}</span><span><Check size={14}/> Result recorded</span></div>}
        <div className="below-court"><Activity court={court} onAll={() => openPanel("history")}/><section className="on-deck"><div className="subsection-heading"><h2>On deck</h2></div><div className="on-deck-content">{onDeck ? <><span className="eyebrow">{onDeck.id} · {onDeck.round}</span>{!onDeck.dependencies?.length && <TeamName names={onDeck.teams.flat()} compact/>}<span className="on-deck-vs">{onDeck.format} · {onDeck.rules.pace} · {onDeck.rules.estimatedMinutes} min estimated</span></> : <span>All matches assigned or complete.</span>}<button onClick={() => chooseTab("upcoming")}>See upcoming matches <ArrowRight size={16}/></button></div></section></div>
        {state.plan.status === 'assigned' && activeCourt === 1 && <ScheduleComparison state={state} showSavings={false}/>}
        {selectedEvents > 0 && <span className="sr-only" role="status">{selectedEvents} new events on Court {activeCourt}.</span>}
      </>}
    </main>
    <footer className="app-footer"><div><span className="footer-brand">CourtOS</span><span>Every court. Every point. In view.</span></div><div><span className="footer-mode"><Broadcast size={14}/> Browser-local session</span><button onClick={() => openPanel('scenarios')}><Play size={13} weight="fill"/> Open scenarios <ArrowUpRight size={14}/></button></div></footer>
    {panel && <Drawer key={panel + activeCourt} eyebrow={titles[panel][0]} title={titles[panel][1]} onClose={closePanel} wide={panel === 'history'}>{panel === 'rules' ? <RulesPanel state={state}/> : panel === 'history' ? <HistoryPanel state={state} id={activeCourt}/> : panel === 'sponsor' ? <SponsorPanel state={state}/> : <ScenarioPanel state={state} activeCourt={activeCourt} onScenario={scenario}/>}</Drawer>}
  </div>;
}
