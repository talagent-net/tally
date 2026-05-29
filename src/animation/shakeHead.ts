import type { AnimationFn } from "./engine";
import { createCyclicAnimation, type CyclicDirection } from "./cyclic";

// Drives head.turn with a sinusoidal left-right oscillation, then settles back at neutral.
// One-shot: after CYCLES * CYCLE_MS, returns NEUTRAL forever. By landing exactly on a sin=0
// boundary at the end, the transition back to whatever mode-level animation takes over has
// no value jump.

const NEUTRAL = 0.5;
const AMPLITUDE = 0.12;             // ±0.12 from neutral — clearly visible without being a profile turn
const CYCLE_MS = 450;               // one full left-right-left cycle
const CYCLES = 2.5;
const DIRECTION: CyclicDirection = 1;   // +1 = shake RIGHT first then left; -1 = left first

export const SHAKE_HEAD_DURATION_MS = CYCLE_MS * CYCLES;

export function createShakeHeadAnimation(): AnimationFn {
  return createCyclicAnimation({
    neutral: NEUTRAL,
    amplitude: AMPLITUDE,
    cycleMs: CYCLE_MS,
    cycles: CYCLES,
    direction: DIRECTION,
  });
}
