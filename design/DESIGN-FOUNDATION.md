# CourtOS design foundation

Updated: September 5, 2026.
Status: design record only. No frontend implementation or new image generation.

## Latest user decision: court navigation and event attention

**Add three tabs in the organizer's top navigation: Court 1, Court 2, and Upcoming Matches.**

Reference: the organizer concept with the upcoming-match rules drawer open. The user marked the upper-right header area, approximately x 81.5%, y 1.8%.

- Court 1 opens Court 1's view.
- Court 2 opens Court 2's view.
- Upcoming Matches opens the upcoming-match view.
- When an event occurs on a court, its tab turns red to draw attention and invite the organizer to click it.
- Events explicitly named by the user: a point, a dispute, or a correction.
- Red applies to the court where the event occurred. Activity on Court 2 must not mark Court 1.
- Keep the event visible in its court view so the organizer can understand why the tab requested attention.
- Do not generate another image for this change. This document records it for the next design/implementation pass.

This updates the original organizer concept's navigation. The generated image is a visual reference, not the final navigation specification.

### Meaning of the red tab

Red means **court activity needs the organizer's attention**. It does not necessarily mean an error: an accepted point can also trigger it.

The tab is presentation of an event. Clicking a tab must not accept a score, resolve a dispute, perform a correction, or alter the match.

### Interaction details still proposed, not yet user-approved

- Keep the selected-tab indicator separate from the red attention treatment, so selection and new activity remain distinguishable.
- Pair red with a visible activity marker or short label; do not depend on color alone.
- Suggested unread behavior: opening the relevant court clears its new-activity indicator. An unresolved dispute retains a separate persistent Dispute / Scoring frozen status until actually resolved.
- Coalesce multiple events on the same tab instead of flashing repeatedly. Do not automatically switch courts when a new event arrives.
- Trigger a point notification from an accepted scoring event; a rejected score call can produce its own blocked-call alert without appearing as a scored point.
- Do not retrigger attention for duplicate event delivery or an ACK of an already-seen event.
- The user has not specified an event-attention policy for Upcoming Matches. Do not assume court-event red alerts apply to that tab.

These details can be refined without changing the user-approved three-tab navigation and red court-event signal.

## Design foundation to preserve

The existing concept direction is the starting point for further review. Recording it here does not imply that every detail in the generated images has been approved.

### Visual identity

Professional tennis operations with a clear sports-broadcast presentation.

- Deep grass green for navigation and strong structural surfaces.
- Near-white opaque score and control surfaces.
- Almost-black score numerals and primary text.
- Restrained tennis yellow for selected controls and positive emphasis.
- Red for the newly requested court-tab attention signal; explicit words distinguish ordinary activity from disputes or rejected calls.
- Original grass-court atmosphere with white-clad scripted players, as specified in the approved demo.
- Solid surfaces, restrained corners and functional dividers.

Suggested palette from the concept direction:

| Token | Color |
|---|---|
| Main surface | #F5F7F4 |
| Primary text | #10251C |
| Deep green | #164B35 |
| Tennis-yellow accent | #DDED8C |

The final red token and its foreground contrast remain implementation choices.

### Typography and score hierarchy

Use a regular, readable interface sans for labels and controls, paired with bold condensed sporting numerals for scores. Geist and Barlow Condensed are proposed directions, not finalized font selections.

Court information priority:

1. Current point score.
2. Players or teams.
3. Games and sets.
4. Current server and receiver information.
5. CourtOS decision and connectivity state.

Keep team rows and score columns stable. Use aligned numerals so changing a point does not move the rest of the scoreboard. Important decisions belong in a prominent score-adjacent region.

### Court-tablet layout

- Large point scores on an opaque surface.
- Clear team names and smaller games/set history.
- A labelled demo court visualization beside the score.
- Broad touch controls available during ordinary play.
- A full-width decision region for Accepted, Call blocked, Correction, confirmation and other meaningful states.
- Connectivity remains visible even while another decision or control area is open.

A blocked call leaves the score unchanged and foregrounds the legal touch choices. Saying Correction opens correction controls without itself changing the score.

### Organizer layout

The new top-level orientation is:

**Court 1 | Court 2 | Upcoming Matches**

Court tabs provide both navigation and the user's requested red activity signal. Keep court identities visible while inspecting one court.

The focused court view should expose:

- Match identity and players.
- Score, service information and ruleset.
- Connectivity and whether a displayed score is stale.
- Recent point, correction, rejection or dispute activity.
- Current lifecycle state and any next assignment.

Upcoming Matches should expose:

- Match identity, participants and format.
- Readiness and waiting status.
- Applicable upcoming rules.
- Planned court placement.
- Semifinal dependencies and rest eligibility for the projected final.
- A clear distinction between planned and committed assignments.

The existing contextual drawer remains a proposed pattern for match-rule configuration and dispute history. The tabs supersede the previous generic organizer navigation proposal; the exact arrangement of the focused content can be refined in the next pass.

### Match configuration

Keep configuration tied to the approved fixture and high-value operational controls:

- No-Ad on/off.
- Full deciding set or 10-point deciding match tiebreak.
- Changeover duration.
- Explicit Apply to upcoming matches action.

Show the affected upcoming matches and keep active-match rules visibly pinned. Publication, delivery to a tablet and activation for a match are separate states.

### Scoreboard graphics and animation

Animate meaningful changes:

| Event | Intended visual response |
|---|---|
| Accepted point | Only the changed score numeral transitions; corresponding organizer court tab turns red |
| Correction | Foreground controls; score changes only after accepted correction activity; corresponding tab turns red |
| Blocked call | Keep score still; reveal reason and legal touch choices |
| Dispute | Show frozen scoring and history-resolution controls; corresponding tab turns red |
| Offline | Keep the court usable; show local persistence and pending sync |
| Changeover | Sponsor creative enters while court/match context stays visible |
| TIME | Audible cue at 80 seconds of a 90-second break; ten seconds remain |
| Match complete | Show final result and event-driven handshake |
| Assignment committed | Show incoming players, applicable rules and warmup |

Use brief transitions and stable layouts. The red attention signal should remain readable; continuous flashing is not part of the user request. Reduced-motion behavior should retain all score and status information.

### Sponsor treatment

Use a broadcast-style changeover presentation: large creative area, retained match context and a clear countdown. The current COURTSIDE CLUB artwork is a fictional visual placeholder.

Sponsor content belongs to changeover, not an invented break after match completion.

### Scheduling climax

Preserve the approved comparison:

- Consolation first: projected tournament finish in 55 minutes.
- Semifinal first: projected tournament finish in 50 minutes.
- Semifinal A is committed to Court 1 only after validation.
- Consolation remains planned for Court 2.
- The final remains projected until both semifinal winners and required rest are resolved.

The actual new assignment and warmup are the visible payoff. The comparison explains the choice.

## Architecture boundaries

This navigation change adds no scoring or tournament authority.

- CourtGuard owns scores, legality, service and completion.
- Voice and touch use the existing authority path.
- Corrections and disputes preserve append-only history.
- Local scoring continues while disconnected; organizer state is explicitly stale until synchronization.
- Started matches retain their ruleset.
- The optimizer proposes; tournament authority validates and commits.
- 3D choreography reacts to authoritative events.
- Viewing or clearing a tab's attention indicator never changes domain state.

Do not modify architecture.md or implement the frontend as part of this design-log request.

## References

- Approved demo: [demo_flow.md](C:/Users/moham/OneDrive/Documents/ChatGPT/CourtOS/demo_flow.md).
- Current architecture: [architecture.md](C:/Users/moham/OneDrive/Documents/ChatGPT/CourtOS/architecture.md).
- Original organizer image referenced by the user: [organizer concept](C:/Users/moham/.codex/generated_images/01a07365-7adc-7a73-a6ad-0cd8032054c6/exec-c0418d62-2ad4-406b-9ebc-eef6f7489211.png).
- Selected court baseline: [court scoreboard](C:/Users/moham/OneDrive/Documents/ChatGPT/CourtOS/design/concepts-v1/01-court-live.png).
- Selected organizer refinement before this navigation decision: [organizer rules](C:/Users/moham/OneDrive/Documents/ChatGPT/CourtOS/design/concepts-v1/05-organizer-rules.png).
- Other generated concepts and generation prompts: design/concepts-v1.

The generated concepts are visual proposals. Exact typography, component consistency, outdoor contrast, service poses and animation require verification during implementation.
