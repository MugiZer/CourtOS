import { Check, Clock, LockKey, SlidersHorizontal, TennisBall } from '@phosphor-icons/react';
import { upcoming } from '../demo/fixtures';
import type { DemoState, Plan } from '../demo/types';

export default function Upcoming({ state, onRules }: { state: DemoState; onRules: () => void }) {
  const assigned = state.plan.status === 'assigned';
  return <section className="upcoming-page">
    <div className="section-heading"><div><span className="eyebrow">MATCH QUEUE</span><h1>Up next.</h1><p>Readiness, court assignments, and estimated start order.</p></div><button className="button" onClick={onRules}><SlidersHorizontal size={18}/> Upcoming configuration</button></div>
    <div className="schedule-intro"><span><TennisBall size={19}/> {assigned ? 'Semifinal A is warming up on Court 1' : 'Two courts in play'}</span><span>Next available court receives the next valid match.</span></div>
    <div className="upcoming-table">
      <div className="upcoming-table-head"><span>MATCH</span><span>PLAYERS</span><span>FORMAT</span><span>READINESS</span><span>COURT</span></div>
      {upcoming.map(m => <div className="upcoming-row" key={m.id}>
        <div><span className="match-id">{m.id}</span><h3>{m.title}</h3><span className="estimate"><Clock size={13}/>{m.estimate} min estimated</span></div>
        <div className="upcoming-players"><span>{m.teams[0]}</span><small>vs</small><span>{m.teams[1]}</span></div>
        <div><span>{m.format}</span><small>{m.id === 'M104' ? 'Advantage · v1' : (state.upcomingRules.noAd ? 'No-Ad' : 'Advantage') + ' · v' + state.upcomingRules.version}</small></div>
        <div className={'readiness ' + (m.id === 'M105' ? 'waiting' : '')}>{m.id === 'M105' ? <LockKey size={16}/> : <Check size={16}/>}<span>{assigned && m.id === 'M103' ? 'Assigned · warmup' : m.status}{m.id === 'M105' && <small>Both results + 10 min rest</small>}</span></div>
        <div className="court-assignment">{assigned && m.id === 'M103' ? <><b>Court 1</b><span className="tiny-tag">COMMITTED</span></> : assigned && m.id === 'M104' ? <><b>Court 2</b><span className="tiny-tag outline">PLANNED</span></> : <span>Awaiting court</span>}</div>
      </div>)}
    </div>
    <div className="dependency-strip"><span className="eyebrow">THE ROAD TO THE FINAL</span><div><span>Semifinal A winner</span><span className="plus-sign">+</span><span>Semifinal B winner</span><span>then</span><span>10-minute rest</span><span>then</span><strong>Final</strong></div></div>
    {state.plan.options.length > 0 ? <ScheduleComparison state={state}/> : <div className="schedule-placeholder"><div className="schedule-placeholder-icon"><Clock size={32}/></div><div><h3>Waiting for an available court</h3><p>When Court 1 becomes free, compare the best continuation for each ready match. The selected assignment will appear here.</p></div><span className="small-label">REPLANNED ON COURT AVAILABILITY</span></div>}
  </section>;
}
export function ScheduleComparison({ state }: { state: DemoState }) {
  const options = state.plan.options;
  const best = options.reduce<Plan | undefined>((winner, item) => !winner || item.finish < winner.finish ? item : winner, undefined);
  if (!best) return null;
  return <details className="comparison" open={state.plan.status !== 'assigned'}><summary>{state.plan.status === 'assigned' ? 'Semifinal A assigned · View schedule comparison' : 'Compare schedules'}</summary>
    <div className="comparison-heading"><div><span className="eyebrow">SCHEDULING OPTIONS</span><h2>Projected completion</h2></div><div className="finish-comparison"><span>{Math.max(...options.map(p => p.finish))}<small>MIN</small></span><span className="muted">vs</span><strong>{best.finish}<small>MIN</small></strong><b>PROJECTED FINISH</b></div></div>
    <p className="muted">Read each court row from left to right. Times are minutes after Court 1 becomes free; card widths do not represent duration.</p>
    <div className="plan-grid">{options.map(plan => <div className={'plan-card ' + (plan.first === best.first ? 'selected' : '')} key={plan.first}><div className="plan-title"><span>{plan.first === best.first ? <Check size={17}/> : <Clock size={17}/>} {plan.first === 'semifinal' ? 'Semifinal first' : 'Consolation first'}</span><strong>{plan.finish}<small> min</small></strong></div>{([1,2] as const).map(id => <div className="plan-lane" key={id}><b>COURT {id}</b><div>{plan.items.filter(i => i.court === id).sort((a,b) => a.start - b.start).map(item => <span className={'plan-match ' + (!item.projected && plan.first === best.first && state.plan.status === 'assigned' ? 'committed' : '')} key={item.match}><strong>{item.label}</strong><small>{item.start}–{item.end} min</small><em>{!item.projected && state.plan.status === 'assigned' ? 'Assigned' : item.match === 'M102' ? 'Remaining estimate' : 'Projected'}</em></span>)}</div></div>)}<div className="plan-note">{plan.first === best.first ? 'Starts the semifinal now. Consolation follows on Court 2.' : 'Starts consolation now. Semifinal follows on Court 2.'}</div></div>)}</div>
    <div className="proof-strip">{['Result recorded', 'Court free', 'Twin updated', 'Plan validated', 'M103 assigned'].map((item, i) => <span key={item}><CheckCircleSmall/>{item}{i < 4 && <span aria-hidden="true">·</span>}</span>)}</div>
    <div className="comparison-footer"><span>Times relative to Court 1 becoming free. Local fixture estimates.</span><span><Check size={14}/> No overlaps <Check size={14}/> Dependencies respected <Check size={14}/> Rest protected</span></div>
  </details>;
}
function CheckCircleSmall() { return <span className="proof-check"><Check size={11} weight="bold"/></span>; }
