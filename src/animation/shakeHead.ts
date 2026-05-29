import type { AnimationFn } from "./engine";

// Drives head.turn with a sinusoidal left-right oscillation, then settles back at neutral.
// One-shot: after CYCLES * CYCLE_MS, returns NEUTRAL forever. By landing exactly on a sin=0
// boundary at the end, the transition back to whatever mode-level animation takes over has
// no value jump.

const NEUTRAL = 0.5;
const AMPLITUDE = 0.12;   // ±0.18 from neutral — clearly visible without being a profile turn
const CYCLE_MS = 450;     // one full left-right-left cycle
const CYCLES = 2.5;
const TOTAL_MS = CYCLE_MS * CYCLES;

export const SHAKE_HEAD_DURATION_MS = TOTAL_MS;

export function createShakeHeadAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    const t = elapsed - createdAt;
    if (t >= TOTAL_MS) return NEUTRAL;
    return NEUTRAL + AMPLITUDE * Math.sin((2 * Math.PI * t) / CYCLE_MS);
  };
}
