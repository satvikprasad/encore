import { DIMS, type Dim } from "@/constants";
import type { Vec7 } from "@/types";

export const DIM_LABELS: Record<Dim, string> = {
  music: "Music",
  crowd: "Crowd",
  venue: "Venue",
  accessibility: "Access",
  production: "Production",
  value: "Value",
  would_again: "Again",
};

// Review questions (DESIGN.md §6).
export const DIM_QUESTIONS: Record<Dim, string> = {
  music: "How was the performance?",
  crowd: "Energy and vibe?",
  venue: "How was the room?",
  accessibility: "Did the venue work for you?",
  production: "Lights, visuals, staging?",
  value: "Worth what you paid?",
  would_again: "Would you go again?",
};

/** Recharts radar rows, capped at 5. */
export function radarData(theta: Vec7) {
  return DIMS.map((d, i) => ({ dim: DIM_LABELS[d], value: Math.max(0, Math.min(5, theta[i])) }));
}
