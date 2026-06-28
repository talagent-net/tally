import type { AnimationFn } from "./engine";

// Drives antenna.wiggle with occasional damped-sine wiggles separated by long random rests.
// Each wiggle starts at neutral, oscillates with linearly-decaying amplitude over a few cycles,
// and ends at neutral. Pattern is the same shape as blink — ambient idle behavior that fires
// occasionally, not continuously.

const NEUTRAL = 0.5;
const PEAK_AMPLITUDE = 0.5; // ±0.5 from neutral = full [0, 1] range at the very first peak
const CYCLE_MS = 160; // quick oscillation per cycle
const MIN_CYCLES = 3;
const MAX_CYCLES = 6;
const MIN_INTERVAL_MS = 15000;
const MAX_INTERVAL_MS = 55000;

const randRange = (min: number, max: number) => min + Math.random() * (max - min);
const randIntRange = (min: number, max: number) => Math.floor(randRange(min, max + 1));

export function createAntennaWiggleAnimation(): AnimationFn {
  // Lazy-init pattern (same as blink, lookAround): nextEventAt computed on first call so the
  // scheduled time is relative to when this animation actually starts running, not when its
  // closure was created. Survives mode/reaction transitions mid-session.
  let nextEventAt: number | null = null;
  let wiggleStartedAt: number | null = null;
  let wiggleDuration = 0;

  return (elapsed) => {
    if (nextEventAt === null) {
      nextEventAt = elapsed + randRange(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    }

    if (wiggleStartedAt === null && elapsed >= nextEventAt) {
      wiggleStartedAt = elapsed;
      const cycles = randIntRange(MIN_CYCLES, MAX_CYCLES);
      wiggleDuration = cycles * CYCLE_MS;
    }

    if (wiggleStartedAt !== null) {
      const t = elapsed - wiggleStartedAt;
      if (t >= wiggleDuration) {
        wiggleStartedAt = null;
        nextEventAt = elapsed + randRange(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
        return NEUTRAL;
      }
      // Linearly-decaying amplitude × sine. Duration is a whole multiple of CYCLE_MS so sin = 0
      // at the boundary, AND the decay envelope is 0 at the boundary — double-zero ending.
      const decay = 1 - t / wiggleDuration;
      return NEUTRAL + PEAK_AMPLITUDE * decay * Math.sin((2 * Math.PI * t) / CYCLE_MS);
    }

    return NEUTRAL;
  };
}
