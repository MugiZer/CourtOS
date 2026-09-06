import { useState } from 'react';
import type { DemoState, Match, MatchFormat, Rules } from '../demo/types';
import { configureMatch } from '../demo/store';
import { defaultDuration, formatTeams, paceRules, serviceOrder } from '../demo/matchConfig';

export default function MatchSettings({ state }: { state: DemoState }) {
  const available = state.upcomingMatches.filter(m => !state.courts.some(c => c.match.id === m.id) && !state.completedMatches.some(r => r.match.id === m.id));
  const [id, setId] = useState(available[0]?.id ?? '');
  const selected = available.find(m => m.id === id) ?? available[0];
  return <>
    <section className="scope-card"><h3>Active match rules</h3>{state.courts.map(c => <p key={c.id}><strong>Court {c.id} · {c.match.format} · {c.match.rules.pace} · v{c.match.rules.version}</strong><br/>{c.match.rules.noAd ? 'No-Ad' : 'Advantage'} · {c.match.rules.changeover}s changeover · {c.match.rules.matchRest} min between matches</p>)}</section>
    {selected ? <><label className="field-group">Upcoming match<select value={selected.id} onChange={e => setId(e.target.value)}>{available.map(m => <option key={m.id} value={m.id}>{m.id} · {m.round}</option>)}</select></label><MatchForm key={selected.id + ':' + selected.rules.version} match={selected}/></> : <p>All matches are assigned or complete. Assigned matches retain their settings.</p>}
  </>;
}

function MatchForm({ match }: { match: Match }) {
  const [draft, setDraft] = useState(() => structuredClone(match));
  const [error, setError] = useState('');
  function rule<K extends keyof Rules>(key: K, value: Rules[K]) { setDraft(d => ({ ...d, rules: { ...d.rules, [key]: value } })); }
  const express = draft.rules.pace === 'Express';
  return <form className="rules-form match-settings" onSubmit={e => { e.preventDefault(); try { configureMatch(draft); setError(''); } catch (err) { setError((err as Error).message); } }}>
    <p className="panel-intro">Configure this upcoming match. Active matches keep their current rules. Use the same spelling across matches so the scheduler can match shared players.</p>
    <label className="field-group">Match format<select disabled={!!draft.dependencies?.length} value={draft.format} onChange={e => { const format = e.target.value as MatchFormat; const teams = formatTeams(draft.teams, format); setDraft({ ...draft, format, teams, serverOrder: serviceOrder(teams), firstServer: 0, rules: { ...draft.rules, estimatedMinutes: defaultDuration(format, draft.rules.pace) } }); }}>
      {(['Singles', 'Doubles', 'Mixed doubles'] as const).map(f => <option key={f}>{f}</option>)}</select></label>
    <fieldset className="field-group"><legend>Pace</legend><div className="segments">{(['Standard', 'Express'] as const).map(pace => <button key={pace} type="button" aria-pressed={draft.rules.pace === pace} onClick={() => setDraft({ ...draft, rules: paceRules(draft.rules, pace, draft.format) })}>{pace === 'Express' ? 'Fast-Play / Express' : pace}</button>)}</div></fieldset>
    {express && <p className="field-note">Express starts with No-Ad and a 10-point deciding tiebreak. No scheduled changeover, set, or between-match rest. Scoring can be adjusted below.</p>}
    {draft.dependencies?.length ? <p className="field-note">Players come from the semifinal winners. Format follows the bracket; server order is resolved when both winners are known.</p> : <>
      <div className="roster-fields">{draft.teams.map((team, ti) => <fieldset className="field-group" key={ti}><legend>Team {ti + 1} · {team.length} {team.length === 1 ? 'player' : 'players'}</legend>{team.map((name, pi) => <label key={pi}>Player {pi + 1}<input required value={name} onChange={e => { const teams = structuredClone(draft.teams); teams[ti][pi] = e.target.value; setDraft({ ...draft, teams, serverOrder: serviceOrder(teams) }); }}/></label>)}</fieldset>)}</div>
      <label className="field-group">First server<select value={draft.firstServer} onChange={e => setDraft({ ...draft, firstServer: Number(e.target.value) })}>{draft.serverOrder.map((name, i) => <option value={i} key={i}>{name || `Player ${i + 1}`}</option>)}</select></label>
      <p className="field-note">Service rotation: {draft.serverOrder.map((_, i) => draft.serverOrder[(draft.firstServer + i) % draft.serverOrder.length] || 'Unnamed player').join(' → ')}. For doubles, player 1 receives on the deuce side and player 2 on the ad side.</p>
    </>}
    <label className="field-group">Scoring<select value={draft.rules.noAd ? 'no-ad' : 'advantage'} onChange={e => rule('noAd', e.target.value === 'no-ad')}><option value="advantage">Advantage</option><option value="no-ad">No-Ad</option></select></label>
    <label className="field-group">Deciding set<select value={draft.rules.deciding} onChange={e => rule('deciding', e.target.value as Rules['deciding'])}><option value="full">Full deciding set</option><option value="tiebreak">10-point deciding tiebreak</option></select></label>
    <label className="field-group">Estimated match duration (minutes)<input required type="number" min="1" max="480" value={draft.rules.estimatedMinutes} onChange={e => rule('estimatedMinutes', Number(e.target.value))}/></label>
    <p className="field-note">Court occupancy estimate, including breaks. Changing format or pace updates the starting estimate; adjust it for your event. This is a forecast, not a time limit.</p>
    <div className="roster-fields"><label className="field-group">Changeover rest<select disabled={express} value={draft.rules.changeover} onChange={e => rule('changeover', Number(e.target.value) as Rules['changeover'])}><option value={0}>None</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option></select></label>
      <label className="field-group">Between sets (seconds)<input required type="number" min="0" max="600" disabled={express} value={draft.rules.setRest} onChange={e => rule('setRest', Number(e.target.value))}/></label>
      <label className="field-group">Before this match (minutes)<input required type="number" min="0" max="120" disabled={express} value={draft.rules.matchRest} onChange={e => rule('matchRest', Number(e.target.value))}/></label></div>
    {error && <p role="alert" className="configuration-error">{error}</p>}
    <button className="button primary full" type="submit">Apply to {draft.id} & replan</button><p className="field-note" role="status">Saved rules v{match.rules.version}. Assigned matches stay pinned to their version.</p>
  </form>;
}
