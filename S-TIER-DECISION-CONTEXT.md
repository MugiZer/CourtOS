# S-tier Hackathon Decision Context

Source: Google Drive document “Hackathon ideas”, especially the S-tier framework and the CourtGuard / CourtSide AI entry.

## Core decision rule

An S-tier hackathon idea combines:

**painful or emotionally resonant problem × surprising interaction × non-trivial technical mechanism × undeniable live proof × authentic builder insight**

If any factor approaches zero, the idea weakens. Strong engineering without a clear human payoff is hard to judge; a great concept without a reliable demo does not exist on demo day.

## Five hard gates

Every feature, scope decision, and demo addition should pass all five:

1. **Ten-second comprehension** — Can a stranger understand the project and payoff in one sentence without technical vocabulary?
2. **Demo climax** — Is there one visible moment where “when X happens, the system does Y”?
3. **Technical secret** — Is there a real mechanism beneath the simple demo, not just an API call?
4. **Personal unfair advantage** — Can we explain why this team specifically had to build it?
5. **Weekend-shaped scope** — Can the core loop work reliably with controlled inputs, one golden path, and graceful fallbacks?

Tier guidance: S-tier is 88–100 with no hard-gate failure and at least 17/20 for demo clarity. The rubric is demo clarity/climax (20), originality/surprise (15), technical depth (15), human importance/resonance (15), reliability (15), builder-story/thesis fit (10), polish (5), and expansion potential (5).

## What this means for CourtOS

CourtOS should be framed as a trusted execution layer for tennis, not “AI that keeps score”:

- Voice is probabilistic and may propose an intent.
- CourtGuard, a deterministic tennis-rules engine, decides what is allowed to become match state.
- Accepted and rejected proposals become an auditable event trace.
- The court continues operating offline and reconciles when connectivity returns.
- The organizer dashboard proves the full tournament loop: match completion → court free → valid next match → notification.

The strongest demo sequence is:

1. Make a normal score call and update court plus organizer displays.
2. Deliberately speak an impossible next score.
3. Show CourtGuard reject it, leave the score unchanged, and explain the exact rule.
4. Correct the call and recover immediately.
5. Disconnect Wi-Fi, continue scoring locally, reconnect, and show synchronization.
6. Finish a match and show the sponsor changeover plus next-match assignment.

The audience must see the complete loop: sense → understand → decide → act → prove.

## Decision principles

- Prefer removing a workflow step over making it slightly faster. CourtOS removes repeated desk reporting and manual court assignment.
- Use AI as an enabling mechanism, not the headline.
- Make the result visibly change, block, alert, or recover in real time.
- Verification matters more than generation when incorrect output can corrupt state.
- Build from the observed tournament pain: noisy courts, unofficiated matches, score disputes, manual updates, and delayed assignments.
- Repurpose ordinary hardware (tablet, phone, microphone); hardware must change the meaning of the demo, not decorate it.
- The demo must not depend on perfect model output. Tactile controls are a first-class fallback and must reach the same authoritative engine.
- Show exact reasons and evidence for rejection or ambiguity.

## Scope policy

Freeze one reliable golden path before adding breadth. Must-have work is the court tablet, organizer dashboard, narrow voice vocabulary, deterministic legal-transition verification, correction/undo, core singles plus one doubles/No-Ad path, offline event persistence and reconnect sync, and one polished sponsor changeover.

Stretch work comes only after the golden path is reliable: full doubles edge cases, advanced scheduling optimization, natural-language organizer controls, advanced ASR adaptation, notifications, and full bracket management.

Cut work that does not strengthen the climax: ball tracking, line calling, computer vision, registration/brackets, payments, accounts, sponsor marketplace, native mobile apps, sophisticated speaker identification, and exhaustive professional-tennis edge cases.

## Kill test

Reject or redesign a direction when two or more are true:

- The pitch needs more than one sentence.
- The climax is only text appearing on a screen.
- The core mechanism could be replaced by one API call.
- The problem is invented rather than observed.
- Reliability depends on several uncontrolled external systems.
- There is no clear golden path.
- Judges have likely seen many similar projects.
- Hardware does not change the meaning of the demo.
- The team cannot explain its personal connection.

## Review loop

1. Generate broadly without judging.
2. Eliminate hard-gate failures.
3. Score survivors independently.
4. Prototype the demo climax before building the full product.
5. Choose emotional reaction + technical defensibility + reliability over maximum market size.
6. Freeze scope around one golden path.
7. Rehearse the pitch and failure recovery as seriously as the code.

## CourtOS authority boundary

ML is authoritative over nothing; it proposes interpretations. CourtGuard owns match legality and score state. The tournament engine owns assignments, readiness, availability, and ruleset versions. The append-only event log owns the record of what happened.

Future decisions should preserve this line:

**Voice (probabilistic) → typed intent → CourtGuard (deterministic) → match events → Tournament Twin (deterministic) → CourtOptimizer (deterministic) → real-world tournament**
