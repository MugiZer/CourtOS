import { useState, type FormEvent } from 'react';
import { Check, Clock, Plus, SlidersHorizontal, Trash, X } from '@phosphor-icons/react';
import { addQueuedMatch, cancelQueuedMatch } from '../demo/store';
import type { DemoState, MatchFormat, Plan, Rules } from '../demo/types';
import { defaultDuration, paceRules } from '../demo/matchConfig';
import { resolvedMatch, scheduleState } from '../demo/optimizer';

export default function Upcoming({ state, onRules }: { state: DemoState; onRules: () => void }) {
  const plans = scheduleState(state);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(() => newMatchDraft());
  const pending = state.upcomingMatches.filter(match => !state.courts.some(c => c.match.id === match.id) && !state.completedMatches.some(result => result.match.id === match.id));
  const updateFormat = (format: MatchFormat) => setDraft(current => ({ ...current, format, teams: [['', ''], ['', '']] }));
  const submitNewMatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const size = draft.format === 'Singles' ? 1 : 2;
      const teams: [string[], string[]] = [draft.teams[0].slice(0, size), draft.teams[1].slice(0, size)];
      const id = addQueuedMatch({ ...draft, teams });
      setNotice(`${id} added. The optimizer is comparing the new queue.`);
      setAdding(false);
      setDraft(newMatchDraft());
    } catch (error) { setNotice((error as Error).message); }
  };
  const cancel = (id: string) => { const result = cancelQueuedMatch(id); setNotice(result.message); };
  return <section className="upcoming-page">
    <div className="section-heading"><div><span className="eyebrow">MATCH QUEUE</span><h1>Upcoming matches</h1><p>Match formats, rest requirements, and projected court assignments.</p></div><div className="queue-heading-actions"><button className="button" onClick={() => { setAdding(value => !value); setNotice(''); }}><Plus size={18}/>{adding ? 'Close add match' : 'Add match'}</button><button className="button" onClick={onRules}><SlidersHorizontal size={18}/> Configure matches</button></div></div>
    <section className="queue-controls" aria-label="Queue controls"><div><span className="eyebrow">RECEDING HORIZON</span><strong>{plans.length ? `${plans.length} feasible configurations` : 'No feasible configuration'}</strong><p>Every queue, rules, and availability change is replanned from the current courts.</p></div><div className="queue-control-meta"><span className={'queue-status ' + state.plan.status}>{state.plan.status === 'solving' ? 'Re-solving' : 'Live projection'}</span><span>{pending.length} pending · {state.courts.length} courts</span></div></section>
    {adding && <form className="add-match-form" onSubmit={submitNewMatch}><div className="add-match-header"><div><span className="eyebrow">ADD TO QUEUE</span><h2>New match</h2></div><button type="button" className="icon-button" aria-label="Close add match" onClick={() => setAdding(false)}><X size={19}/></button></div><div className="add-match-grid"><label className="field-group">Round label<input required maxLength={50} value={draft.round} onChange={e => setDraft({ ...draft, round: e.target.value })} placeholder="e.g. Court 3 feature"/></label><label className="field-group">Format<select value={draft.format} onChange={e => updateFormat(e.target.value as MatchFormat)}>{(['Singles', 'Doubles', 'Mixed doubles'] as const).map(format => <option key={format}>{format}</option>)}</select></label></div><div className="add-roster-grid">{draft.teams.map((team, teamIndex) => <fieldset className="field-group" key={teamIndex}><legend>Team {teamIndex + 1}</legend>{team.slice(0, draft.format === 'Singles' ? 1 : 2).map((player, playerIndex) => <input required key={playerIndex} value={player} placeholder={`Player ${teamIndex * 2 + playerIndex + 1}`} onChange={e => { const teams = structuredClone(draft.teams); teams[teamIndex][playerIndex] = e.target.value; setDraft({ ...draft, teams }); }}/>)}</fieldset>)}</div><div className="add-match-grid add-match-meta"><label className="field-group">Pace<select value={draft.pace} onChange={e => { const pace = e.target.value as Rules['pace']; setDraft({ ...draft, pace, matchRest: pace === 'Express' ? 0 : draft.matchRest }); }}>{(['Standard', 'Express'] as const).map(pace => <option key={pace}>{pace}</option>)}</select></label><label className="field-group">Estimated minutes<input required type="number" min="1" max="480" value={draft.estimatedMinutes} onChange={e => setDraft({ ...draft, estimatedMinutes: Number(e.target.value) })}/></label><label className="field-group">Recovery before match<input required type="number" min="0" max="120" disabled={draft.pace === 'Express'} value={draft.matchRest} onChange={e => setDraft({ ...draft, matchRest: Number(e.target.value) })}/></label></div><div className="add-match-actions"><button className="button primary" type="submit"><Check size={18}/> Add and replan</button><span>New matches start as warmup and stay unassigned until a court is free.</span></div></form>}
    {notice && <p className="queue-notice" role="status">{notice}</p>}
    <ScheduleComparison state={{ ...state, plan: { ...state.plan, options: plans } }} optionsOverride={plans}/>
    <div className="upcoming-table"><div className="upcoming-table-head"><span>MATCH</span><span>PLAYERS</span><span>FORMAT & PACE</span><span>READINESS</span><span>COURT</span></div>
      {state.upcomingMatches.map(original => {
        const assigned = state.courts.find(c => c.match.id === original.id);
        const completed = state.completedMatches.find(r => r.match.id === original.id);
        const match = assigned?.match ?? completed?.match ?? original;
        const resolved = resolvedMatch(state, match);
        const projection = plans[0]?.items.find(i => i.match === match.id);
        const participants = resolved?.teams.flat() ?? [];
        const busy = state.courts.filter(c => c.match.id !== match.id && c.match.phase !== 'complete' && c.match.teams.flat().some(p => participants.includes(p)));
        const recovery = state.completedMatches.filter(r => r.match.teams.flat().some(p => participants.includes(p))).map(r => ({ name: r.match.teams.flat().filter(p => participants.includes(p)).join(' / '), minutes: Math.max(0, Math.ceil((r.finishedAt + match.rules.matchRest * 60000 - Date.now()) / 60000)) })).filter(r => r.minutes > 0);
        const readiness = completed ? 'Complete' : assigned ? assigned.match.phase === 'warmup' ? 'Assigned · warmup' : 'On court' : !resolved ? 'Awaiting semifinal results' : busy.length ? 'Players on Court ' + busy.map(c => c.id).join(', ') : recovery.length ? recovery.map(r => `${r.name} · ${r.minutes} min rest remaining`).join('; ') : 'Ready to play';
        return <div className="upcoming-row" key={match.id}>
          <div><span className="match-id">{match.id}</span><h3>{match.round}</h3><span className="estimate"><Clock size={13}/>{match.rules.estimatedMinutes} min estimated</span></div>
          <div className="upcoming-players">{resolved ? <><span>{resolved.teams[0].join(' / ')}</span><small>vs</small><span>{resolved.teams[1].join(' / ')}</span></> : <span>{match.dependencies?.map(id => `Winner of ${id}`).join(' vs ')}</span>}</div>
          <div><span>{match.format} · {match.format === 'Singles' ? 2 : 4} players</span><small>{match.rules.pace} · {match.rules.noAd ? 'No-Ad' : 'Advantage'} · v{match.rules.version}</small><small>{match.rules.changeover}s changeover · {match.rules.setRest}s set rest</small></div>
          <div className="readiness"><span>{readiness}<small>{match.rules.matchRest === 0 ? 'No between-match rest required' : `${match.rules.matchRest} min recovery before this match`}</small></span></div>
          <div className="court-assignment">{assigned ? <><b>Court {assigned.id}</b><span className="tiny-tag">ASSIGNED</span></> : completed ? <span>Result recorded</span> : projection ? <><b>Court {projection.court}</b><small>In ~{Math.ceil(projection.start)} min · projected</small></> : <span>No feasible projection</span>}{!assigned && !completed && <button className="queue-cancel" type="button" onClick={() => cancel(match.id)}><Trash size={14}/> Cancel match</button>}</div>
        </div>;
      })}</div>
  </section>;
}

function newMatchDraft() {
  const rules = paceRules({ version: 1, noAd: false, deciding: 'full', changeover: 90, pace: 'Standard', setRest: 120, matchRest: 10, estimatedMinutes: 20 }, 'Standard', 'Singles');
  return { round: '', format: 'Singles' as MatchFormat, teams: [['', ''], ['', '']], pace: rules.pace, estimatedMinutes: defaultDuration('Singles', rules.pace), matchRest: rules.matchRest };
}

export function OptimizationSavings({ state, optionsOverride }: { state: DemoState; optionsOverride?: Plan[] }) {
  const options = optionsOverride ?? state.optimizationDecision?.options ?? state.plan.options;
  if (options.length < 2) return null;
  const best = options.reduce((a, b) => a.finish <= b.finish ? a : b);
  const alternative = options.reduce((a, b) => a.finish >= b.finish ? a : b);
  const saved = Math.floor(alternative.finish - best.finish);
  if (saved <= 0) return null;
  const first = best.items.find(i => i.match === best.firstMatch);
  return <section className="optimization-savings" aria-label="Projected scheduling savings">
    <div className="savings-number"><span className="eyebrow">PROJECTED TIME SAVED</span><strong>{saved}<small>MIN</small></strong><span>{Math.round(saved / alternative.finish * 100)}% shorter remaining schedule</span></div>
    <div className="savings-explanation"><h2>{first?.label ?? 'Selected match'} first.</h2><p className="savings-finish"><span>{Math.ceil(alternative.finish)} min</span><span aria-hidden="true">→</span><strong>{Math.ceil(best.finish)} min</strong><span>to finish</span></p>
      <p>{best.firstMatch === 'M104' ? 'Start the long singles match now. The mixed-doubles semifinal and final use the other court.' : 'Start the match that gives the shortest remaining tournament schedule.'}</p>
      <small>{optionsOverride ? 'Based on the current queue projection.' : state.optimizationDecision ? `Assignment comparison saved at ${new Date(state.optimizationDecision.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Based on current match-duration estimates.'} Both alternatives use the same rules and availability.</small>
    </div>
  </section>;
}

export function ScheduleComparison({ state, showSavings = true, optionsOverride }: { state: DemoState; showSavings?: boolean; optionsOverride?: Plan[] }) {
  const decision = state.optimizationDecision;
  const options = optionsOverride ?? decision?.options ?? state.plan.options;
  const best = options.reduce<(typeof options)[number] | undefined>((a, b) => !a || b.finish < a.finish ? b : a, undefined);
  if (!best) return <div className="schedule-placeholder"><Clock size={28}/><p>No feasible schedule in the current horizon. Check court availability and bracket dependencies before adding or canceling another match.</p></div>;
  return <>{showSavings && <OptimizationSavings state={state} optionsOverride={optionsOverride}/>}<details className="comparison" open><summary>{decision && !optionsOverride ? 'The assignment decision' : 'Compare schedules'} · {options.length} feasible configurations · projected finish in {Math.ceil(best.finish)} min</summary>
    <p className="muted">{decision && !optionsOverride ? 'Times are minutes from the saved assignment decision.' : 'Times are minutes from the current projection.'} Each option shows its best legal continuation. Match blocks are not drawn to scale. Future winners remain projections.</p>
    <div className="plan-grid">{options.map(plan => <div className={'plan-card ' + (plan === best ? 'selected' : '')} key={plan.firstMatch ?? plan.first}>
      <div className="plan-title"><span>{plan.items.find(i => i.match === plan.firstMatch)?.label ?? plan.first} first{plan === best ? ' · Selected' : ''}</span><strong>{Math.ceil(plan.finish)} min</strong></div>
      {([1, 2] as const).map(court => <div className="plan-lane" key={court}><b>COURT {court}</b><div>{plan.items.filter(i => i.court === court).sort((a, b) => a.start - b.start).map(item => <span className="plan-match" key={item.match}><strong>{item.label}</strong><small>{Math.ceil(item.start)}–{Math.ceil(item.end)} min</small><em>{decision && plan === best && item.match === decision.assignedMatch && item.court === decision.court && item.start === 0 ? 'Assigned' : item.match === 'M102' ? 'Remaining estimate' : 'Projected'}</em></span>)}</div></div>)}
    </div>)}</div><p className="comparison-footer">Uses configured duration estimates, player availability, bracket dependencies, and required rest. Replanned as scores and availability change.</p>
  </details></>;
}
