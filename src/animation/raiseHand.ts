import type { AnimationFn } from "./engine";

// Drives an arm raise capability through four phases: ramp up → hold → ramp down → at rest.
// Smoothstep on both ramps. Ends at 0 (rest) so the engine's auto-release on null is a no-op
// and the arm sits naturally at its initial pose after the reaction completes.

const RAISE_MS = 250;
const HOLD_MS = 1500;
const LOWER_MS = 550;
const TOTAL_MS = RAISE_MS + HOLD_MS + LOWER_MS;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const RAISE_HAND_DURATION_MS = TOTAL_MS;

export function createRaiseHandAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    const t = elapsed - createdAt;

    if (t < RAISE_MS) {
      return smoothstep(t / RAISE_MS);
    }
    if (t < RAISE_MS + HOLD_MS) {
      return 1;
    }
    if (t < TOTAL_MS) {
      return 1 - smoothstep((t - RAISE_MS - HOLD_MS) / LOWER_MS);
    }
    return 0;
  };
}
