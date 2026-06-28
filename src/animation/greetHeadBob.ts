import type { AnimationFn } from "./engine";
import { createCyclicAnimation, type CyclicDirection } from "./cyclic";

// A gentle side-to-side head bob (head.bob) during `greet`, kept in step with the hand wave so the
// head and hand move together — settles back to neutral (0.5) after CYCLES, landing on a sin=0
// boundary for a clean handoff. head.bob: 0.5 centered, 0 = left tilt, 1 = right tilt.

const NEUTRAL = 0.5;
const AMPLITUDE = 0.12; // a little side-to-side — "bop a little bit"
const CYCLE_MS = 450; // matches the wave's cadence so they move together
const CYCLES = 1.5; // matches the wave
const DIRECTION: CyclicDirection = 1;

export const GREET_HEAD_BOB_DURATION_MS = CYCLE_MS * CYCLES;

export function createGreetHeadBobAnimation(): AnimationFn {
  return createCyclicAnimation({
    neutral: NEUTRAL,
    amplitude: AMPLITUDE,
    cycleMs: CYCLE_MS,
    cycles: CYCLES,
    direction: DIRECTION,
  });
}
