import type { AnimationFn } from "./engine";
import { createCyclicAnimation, type CyclicDirection } from "./cyclic";

// Drives head.tilt with a sinusoidal up-down oscillation (a nod), then settles back at
// neutral. The vertical analog of shakeHead. One-shot: after CYCLES * CYCLE_MS, returns
// NEUTRAL forever, landing on a sin=0 boundary for a clean handoff.
//
// Note head.tilt's input range is remapped to a narrower rendered range at read time
// (remapTilt in Tally), so this amplitude lands softer on screen than the raw number suggests.

const NEUTRAL = 0.5;
const AMPLITUDE = 0.18;             // ±0.18 from neutral in input space — a decisive nod
const CYCLE_MS = 420;               // one full down-up-down cycle
const CYCLES = 1.5;
const DIRECTION: CyclicDirection = -1;  // -1 = nod DOWN first then up; +1 = up first

export const NOD_HEAD_DURATION_MS = CYCLE_MS * CYCLES;

export function createNodHeadAnimation(): AnimationFn {
  return createCyclicAnimation({
    neutral: NEUTRAL,
    amplitude: AMPLITUDE,
    cycleMs: CYCLE_MS,
    cycles: CYCLES,
    direction: DIRECTION,
  });
}
