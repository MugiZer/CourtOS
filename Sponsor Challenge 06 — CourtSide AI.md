# Sponsor Challenge 06 — CourtSide AI

Build a real-time, voice-controlled match scoring system and a central dashboard that simplifies tennis tournament operations, enforces singles, doubles, and express rules, and opens court-side sponsorship revenue for local and recreational events.

## Prize & IP

Prize: $250 in Ethereum (ETH) for the top-performing build.

Selecting this challenge requires an IP grant acknowledgement.

## The problem

Running a multi-court local or recreational tennis tournament is logistically chaotic. Matches operate unofficiated, relying on self-scoring players who frequently lose track of scores, serving rotations, or changeover break limits. Tournament organizers must continuously walk between courts or rely on paper draw sheets to update central standings, causing scheduling bottlenecks and delayed court assignments. Professional tournaments use automated umpires and electronic scoreboards, but local organizers lack an affordable, easy-to-deploy solution. Existing software either requires manual entry by a dedicated court-side volunteer or offers no real-time sync with central organizers. Quebec runs 400+ sanctioned competitive tournaments a year across Junior, Open, and Masters tiers, and Greater Montreal has 60+ indoor and outdoor multi-court facilities. Over 60% of adult recreational and Masters entries play doubles or mixed doubles, so multi-player tracking is essential. Outdoor public courts routinely exceed 65 dB of ambient noise, so voice models must sit next to tactile screen controls.

## How it works today

Players call scores out loud. Score disputes require stopping play to find a roaming tournament director. When a match ends, players walk to the desk to report results. The organizer updates a spreadsheet, writes results on a draw board, and manually calls the next match to court. Manual court scoreboards need a person sitting court-side tapping buttons and have no remote connectivity. Enterprise tournament software such as TournamentSoftware or Tennis Canada IPIN handles registration and draws, but not real-time court-level execution. Wearable stroke tools such as SwingVision focus on individual video analysis, not live scoreboards, court rotation, or ads. Basic timer apps track rest intervals but lack tennis scoring logic, rule customization, or organizer dashboard sync. Paper scorecards and whiteboards are free and universal, but they create delays, missing records, and zero revenue.

## Scoreboard example

```text
COURT 2  |  MATCH #104  |  TENNIS MONTREAL OPEN  [LIVE]  [VOICE ACTIVE]
SERVER  J. Tremblay / A. Roy     Sets 1   Games 4   Points 40   Serve clock 18s
        (Serving: A. Roy)
RECEIVER  M. Dubois / P. Lefebvre  Sets 0   Games 2   Points 15   No-Ad / 3rd TB
        (Receiving: P. Lefebvre)
[Correction]  [Override]  [Force changeover]  [Call umpire]
```

## Where to focus

- Hands-free court updates: replace manual tapping with a tablet app driven by the server's verbal point calls (for example 30-15 or Correction).
- Real-time multi-court dashboard: connect individual court tablets to a master organizer view that tracks live match states and flags freed courts instantly.
- Amateur match variations: singles, doubles and mixed doubles server rotations, plus Fast-Play / Express modes without rest periods.
- Digitized court-side monetization: turn idle 90-second changeovers into dynamic ad space for audio and video.
- Centralized rules push: override match rules such as No-Ad scoring, a 10-point tiebreaker, or serve clocks globally from the organizer console.

## Important constraints

- Hands-free voice recognition is noisy. Speech-to-text must handle player accents and court noise using keywords such as 40-30, Correction, and Fault, plus a tactile fallback touchscreen.
- Tablets on court fences face sun glare and heat. The UI needs ultra-high contrast, large fonts for fans, and explicit audio alerts (a Time call at 80 seconds into a 90-second rest).
- Internet drops on distant courts must not crash a match. Record score states locally and push to the organizer dashboard when reconnected.
- 24-hour hackathon scope: build a 2-court demonstrator with 1 organizer dashboard and 1 court scorer tablet, synced over WebSockets or Firebase.

## Before you build

- How well does voice recognition filter ambient noise or score calls from adjacent courts?
- How do you handle disputes?
- How are doubles server rotations and receiver order tracked during tiebreaks?
- What happens when a player mispronounces a score or the speech model misinterprets a call?
- How do local organizers load ad sponsors into the changeover video or audio loop?
- How well is the tournament dashboard designed, and how are matches configured?
- How well are the scoreboard graphics and animation designed?

## What to deliver

A 2-court demonstrator: one organizer dashboard and one court scorer tablet, synced in real time.

Prize: $250 in Ethereum (ETH) for the top-performing build.
