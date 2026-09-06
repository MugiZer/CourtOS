# CourtOS frontend

A runnable React + TypeScript + Vite frontend based on `demo_flow.md` and `design/DESIGN-FOUNDATION.md`.

## Run

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev
```

- Organizer: http://localhost:5173/organizer
- Court 1 tablet: http://localhost:5173/court?id=1
- Court 2 tablet: http://localhost:5173/court?id=2

```sh
npm test
npm run build
npm run preview
```

Production hosting needs SPA fallback to index.html for /organizer and /court.

## Included

- Court 1, Court 2, and Upcoming Matches tabs.
- Red unread attention indicators for point, correction, rejection, dispute, resolution and assignment events. Clicking a court tab marks its activity seen; it does not resolve a dispute or change a score.
- Responsive opaque scoreboards with serving/receiving information, set history, points and pinned rules.
- Touch scoring, typed calls and optional browser speech recognition. A final browser transcript goes through the same local demo scorer.
- Correction controls, illegal-call rejection, confirmation, receiver-side selection and history-based dispute recovery.
- Per-match singles, doubles, and mixed-doubles configuration with active-match pinning, service order, duration estimates, and separate rest settings.
- Fast-Play / Express preset: No-Ad, deciding match tiebreak, and no scheduled rest periods. Scoring is editable; format/pace load editable demo duration estimates.
- Sponsor text configuration and small image/video uploads; timestamp-based changeover countdown and audible Time cue.
- Three.js grass-court scene for the organizer; static court diagrams on fence tablets avoid WebGL work. Rally playback never awards points.
- Outdoor court displays use 18.88:1 scoreboard contrast, enlarged names and scores, and an explicit audio setup control. Tap **Enable & test audio** on each tablet and check its volume before play. A 90-second changeover calls **Time** at 80 seconds with a visual **TIME / 00:10** cue; sponsor videos stay muted.
- Upcoming-match readiness, dependencies and the 55-versus-50-minute scheduling fixture.
- Real Three.js grass-court scene. Rally playback never awards points; completion and assignment states drive presentation.
- Upcoming-match readiness, shared-player conflicts, dependencies, recovery, and court scheduling across the local fixture horizon. The selected plan drives assignment.
- LocalStorage persistence and same-browser, same-origin tab updates. Offline preview shows different local/organizer scores until reconnect.

Open **Scenarios** in the footer and choose **Start live scoring** to reset the sequence. Court 1 opens at 0–0; Court 2 opens at 40–30. The first accepted Court 1 point immediately takes Court 2 to 40–40 and raises its dispute notification. Restore the opening 40–30 snapshot through History, then continue the Court 1 game.

When M101 finishes, the optimizer assigns the 120-minute singles consolation to Court 1. The 40-minute Express semifinal and 30-minute Express final fit onto Court 2 after its remaining play. The best singles-first continuation finishes in 120 minutes versus 160 minutes for the best semifinal-first continuation: **40 projected minutes saved (25%)**. These are configured scenario estimates, not measured savings. The comparison is saved with the assignment so it stays visible as the live queue changes. Singles players enter and wait; warmup never starts a rally automatically.

The revised scenario uses storage key `courtos.frontend-preview.v2`, so older sessions do not reopen the former slow Court 2 sequence. Reloading still restores progress within the new scenario. Scenarios can reset it at any time; the previous storage key is left intact.

## Integration boundary

This is the frontend plus a labelled local demo adapter, not the completed backend.

The existing `courtguard/`, `optimizer/`, `server/`, `shared/`, and `voice/` modules remain in the repository. The frontend does not yet consume their production events.

- `src/components/` renders views and dispatches actions.
- `src/demo/store.ts` owns browser-local demo events and view snapshots.
- `src/demo/score.ts` provides deterministic preview scoring, separated from React.
- `src/demo/optimizer.ts` schedules the small local horizon from match settings, live score progress, player availability, and dependencies. `src/demo/schedule.ts` supplies historical regression inputs to the same scheduler.
- Replace the demo adapter with production CourtGuard, Tournament Twin and Socket.IO event integration. Production recognizer cascade, real server ACKs and global court optimization are not connected.
- The “Connected” indicator describes the preview connection. The UI is visibly labelled **Local preview** and **Browser-local demo**.
- Browser speech support varies, can require network access, and is not the frozen two-stage ASR system.
- The 3D scene is original, scripted presentation with stylized players, not tracking or physics.

No database, authentication, registration flow, sponsor marketplace or remote deployment was added. Architecture section 28 records the amateur-format implementation and remaining production boundaries.

## Configure amateur matches

Open **Upcoming matches → Upcoming configuration**, select an unassigned match, and edit its format, roster, first server, pace, duration, and rest policy. **Apply** creates the next rules version and replans. Assigned matches retain their settings. Use the same player name across matches to represent a shared participant in this local preview. Semifinals feeding an already-started bracket must retain its format.

Express skips changeover, set, and between-match rest. The estimated duration includes court occupancy and can be overridden; it does not stop a match when time expires. The queue shows unresolved winners, occupied players, recovery waits, and projected court times. Mixed-doubles eligibility and gender-specific receiving rules remain outside this preview.

Whisper configuration defaults and their architecture decision are included; the frontend still uses browser speech recognition for its local preview.

## Design and verification

The requested design foundation is in `design/DESIGN-FOUNDATION.md`. Selected concept images remain in `design/concepts-v1/`.

Frontend scoring, scheduling, and changeover tests plus the existing backend suites run with `npm test`. Browser verification captures are written to ignored `output/playwright/`. Actual outdoor glare, speaker audibility, full production voice recognition and real network synchronization require device/backend testing.
