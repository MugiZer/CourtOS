// B07 judge-visible explain trace (arch §22 Proof 5 — OPTIMIZE).
// Pure string render of an AssignmentPlan + its violation counts. Stdlib only.
import type { AssignmentPlan } from "../shared/types.ts";
import type { ViolationCounts } from "./solve.ts";

export interface ExplainOptions {
  previousFinish?: number;
}

export function explainPlan(
  plan: AssignmentPlan,
  v: ViolationCounts,
  opts?: ExplainOptions,
): string {
  const lines: string[] = ["OPTIMAL / BEST FEASIBLE PLAN FOUND"];
  const sorted = [...plan.assignments].sort((a, b) => (a.courtId < b.courtId ? -1 : 1));
  for (const a of sorted) {
    const tag = a.status === "PLAYING" ? " (PLAYING, pinned)" : "";
    lines.push(`Court ${a.courtId} → Match ${a.matchId}${tag}`);
  }
  const d = new Date(plan.projectedFinishTime);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  lines.push(`Projected tournament finish: ${time} (${d.toISOString()})`);
  lines.push(`✓ ${v.playerOverlap} player overlaps`);
  lines.push(`✓ ${v.prereq} dependency violations`);
  lines.push(`✓ ${v.rest} rest violations`);
  lines.push(`✓ ${v.courtConflict} court conflicts`);
  lines.push(`✓ ${v.compat} compatibility violations`);
  lines.push(`✓ ${v.readiness} readiness violations`);
  if (opts?.previousFinish !== undefined) {
    const mins = Math.round((opts.previousFinish - plan.projectedFinishTime) / 60000);
    lines.push(mins > 0 ? `Improvement: ${mins} minutes` : "Improvement: none (already optimal)");
  } else {
    lines.push("Improvement: n/a (first plan)");
  }
  return lines.join("\n");
}
