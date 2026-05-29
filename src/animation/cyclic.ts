import type { AnimationFn } from "./engine";

// Shared one-shot sinusoidal oscillation around a neutral value — the common shape behind
// cyclic reactions like the head nod (head.tilt) and head shake (head.turn). It oscillates
// `cycles` times with period `cycleMs`, then returns `neutral` forever. Because it lands
// exactly on a sin=0 boundary at the end, the handoff back to whatever mode-level animation
// takes over has no value jump.
//
// `direction` flips which way the cycle swings FIRST:
//   +1 → first half-swing toward neutral + amplitude
//   -1 → first half-swing toward neutral - amplitude
// For head.tilt that's up-first vs down-first; for head.turn it's right-first vs left-first.
// It's purely a sign on the sine, so the settle-at-neutral and clean-boundary properties hold
// for either value.
export type CyclicDirection = 1 | -1;

export type CyclicConfig = {
  neutral: number;
  amplitude: number;
  cycleMs: number;
  cycles: number;
  direction?: CyclicDirection;
};

export function createCyclicAnimation({
  neutral,
  amplitude,
  cycleMs,
  cycles,
  direction = 1,
}: CyclicConfig): AnimationFn {
  const totalMs = cycleMs * cycles;
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    const t = elapsed - createdAt;
    if (t >= totalMs) return neutral;
    return neutral + direction * amplitude * Math.sin((2 * Math.PI * t) / cycleMs);
  };
}
