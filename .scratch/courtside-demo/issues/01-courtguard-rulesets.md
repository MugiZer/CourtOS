Type: task
Status: superseded
Superseded-by: .scratch/backend/ (to-tickets re-slice: B02 core + B03 rulesets)

## Question

Implement the demo rulesets in the CourtGuard deterministic engine: singles, doubles, No-Ad, and a 10-point deciding tiebreak, all through the same versioned ruleset model. Express/Fast-Play behavior must be representable in that model.

Done when: the demo can configure these formats and CourtGuard deterministically produces the correct legal next states for each (valid accepts, impossible rejects with rule reason), on the single-process stack (React/Vite + Socket.IO + localStorage, no DB).
