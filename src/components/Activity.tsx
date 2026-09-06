import { ArrowCounterClockwise, ArrowRight, Check, ClockCounterClockwise, Flag, ShieldCheck, WarningCircle, WifiSlash } from '@phosphor-icons/react';
import type { Court, CourtEvent } from '../demo/types';
import { scoreText } from '../demo/score';

const icons = { snapshot: ClockCounterClockwise, point: Check, correction: ArrowCounterClockwise, blocked: ShieldCheck, dispute: WarningCircle, resumed: Check, changeover: ClockCounterClockwise, assignment: Flag, connection: WifiSlash, rules: ShieldCheck };
export function Activity({ court, onAll }: { court: Court; onAll: () => void }) {
  const events = court.events.slice(-3).reverse();
  return <section className="activity-section"><div className="subsection-heading"><h2>Match activity <span>{court.events.length}</span></h2><button onClick={onAll}>View history <ArrowRight size={15}/></button></div>
    {events.length ? <div className="activity-list">{events.map(event => <ActivityRow key={event.id} event={event}/>)}</div> : <div className="activity-empty"><ClockCounterClockwise size={22}/><div><strong>No events yet.</strong><span>Every point and decision will appear here.</span></div><span className="small-label">HISTORY IS ALWAYS PRESERVED</span></div>}
  </section>;
}
export function ActivityRow({ event }: { event: CourtEvent }) {
  const Icon = icons[event.kind];
  return <div className={'activity-row activity--' + event.kind}><span className="activity-symbol"><Icon size={17}/></span><div><strong>{event.title}</strong><span>{event.detail}</span></div><span className="event-score">{event.kind === 'point' && event.score.winner === null ? scoreText(event.score) : ''}</span><span className="event-time">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<small>{event.source}</small></span></div>;
}
