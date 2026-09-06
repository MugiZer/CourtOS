Type: task
Status: superseded
Superseded-by: .scratch/backend/ (to-tickets re-slice: B05)
Blocked by: 03

## Question

Implement the dumb dispute path: player hits DISPUTE -> scoring freezes -> organizer sees last N events -> hits one RESOLVE-to-seq button -> match resumes. Never delete history.

Done when: a live demo dispute can be resolved from the organizer dashboard and replaying the event log deterministically reconstructs the corrected match.
