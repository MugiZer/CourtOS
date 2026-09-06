import { optimize } from "./optimizer";
import type { Plan } from "./types";

// Historical demo inputs exercise the same scheduler used by the live preview.
export function compareSchedules(consolationDuration = 10, semifinalDuration = 20, court2Remaining = 5, rest = 10, finalDuration = 20): Plan[] {
  const plans = optimize([
    { id: "M103", label: "Semifinal A", players: ["A", "B"], duration: semifinalDuration, rest: 0, dependencies: [] },
    { id: "M104", label: "Consolation", players: ["C", "D"], duration: consolationDuration, rest: 0, dependencies: [] },
    { id: "M105", label: "Final", players: ["A", "B", "E", "F"], duration: finalDuration, rest, dependencies: ["M103", "M102"] },
  ], [{ match: "M102", label: "Semifinal B", court: 2, end: court2Remaining, players: ["E", "F"] }]);
  return [plans.find(p => p.firstMatch === "M104")!, plans.find(p => p.firstMatch === "M103")!];
}
