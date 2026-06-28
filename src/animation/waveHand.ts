import type { AnimationFn } from "./engine";
import { createCyclicAnimation, type CyclicDirection } from "./cyclic";

// Waves the raised forearm left/right during `disagree`, in sync with the head shake — the elbow
// (upper arm) stays put, only the forearm rotates. Cadence is kept in step with shakeHead so the
// hand and head move together; settles back to neutral (0.5) after CYCLES, landing on a sin=0
// boundary for a clean handoff. Amplitude here is normalized; the on-screen magnitude is set by
// HAND_WAVE_DEG at the render site.

const NEUTRAL = 0.5;
const AMPLITUDE = 0.5; // normalized — full swing both ways around neutral
const CYCLE_MS = 450; // matches shakeHead's CYCLE_MS to stay in sync
const CYCLES = 2.5; // matches shakeHead's CYCLES
const DIRECTION: CyclicDirection = -1; // flip to -1 to wave opposite the head's first turn

export const WAVE_HAND_DURATION_MS = CYCLE_MS * CYCLES;

export function createWaveHandAnimation(): AnimationFn {
  return createCyclicAnimation({
    neutral: NEUTRAL,
    amplitude: AMPLITUDE,
    cycleMs: CYCLE_MS,
    cycles: CYCLES,
    direction: DIRECTION,
  });
}
