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
- Upcoming mixed-doubles rules publication with active-match pinning.
- Sponsor text configuration and small image/video uploads; timestamp-based changeover countdown and audible Time cue.
- Three.js grass-court scene for the organizer; static court diagrams on fence tablets avoid WebGL work. Rally playback never awards points.
- Outdoor court displays use 18.88:1 scoreboard contrast, enlarged names and scores, and an explicit audio setup control. Tap **Enable & test audio** on each tablet and check its volume before play. A 90-second changeover calls **Time** at 80 seconds with a visual **TIME / 00:10** cue; sponsor videos stay muted.
- Upcoming-match readiness, dependencies and the 55-versus-50-minute scheduling fixture.
- LocalStorage persistence and same-browser, same-origin tab updates. Offline preview shows different local/organizer scores until reconnect.

Open **Demo controls** in the footer to load the approved interaction states. These controls reset the local preview fixture. The deciding-point fixture leads to the assignment comparison; choose a receiving side, then award the final point to Roy / Chen.

## Integration boundary

This is the frontend plus a labelled local demo adapter, not the completed backend.

The existing `courtguard/`, `optimizer/`, `server/`, `shared/`, and `voice/` modules remain in the repository. The frontend does not yet consume their production events.

- `src/components/` renders views and dispatches actions.
- `src/demo/store.ts` owns browser-local demo events and view snapshots.
- `src/demo/score.ts` provides deterministic preview scoring, separated from React.
- `src/demo/schedule.ts` computes the two small conditional schedules from fixture estimates.
- Replace the demo adapter with production CourtGuard, Tournament Twin and Socket.IO event integration. Production recognizer cascade, real server ACKs and global court optimization are not connected.
- The “Connected” indicator describes the preview connection. The UI is visibly labelled **Local preview** and **Browser-local demo**.
- Browser speech support varies, can require network access, and is not the frozen two-stage ASR system.
- The 3D scene is original, scripted presentation with stylized players, not tracking or physics.

No database, authentication, registration flow, sponsor marketplace or remote deployment was added. Whisper configuration defaults and their architecture decision are included; the frontend still uses browser speech recognition for its local preview.

## Design and verification

The requested design foundation is in `design/DESIGN-FOUNDATION.md`. Selected concept images remain in `design/concepts-v1/`.

Frontend scoring, scheduling, and changeover tests plus the existing backend suites run with `npm test`. Browser verification captures are written to ignored `output/playwright/`. Actual outdoor glare, speaker audibility, full production voice recognition and real network synchronization require device/backend testing.
