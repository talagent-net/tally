import type { AnimationFn } from "./engine";

// "I don't know" shrug — a PURE GESTURE (no params, no net body.x/body.y translation, returns to
// rest). Both arms rise to a PARTIAL open pose (a fraction of the full overhead "stop" raise, so the
// elbows stay low and the forearms come up-and-open — palms-up) while the head cocks slightly to one
// side; they hold a brief beat, then settle back to rest. Built entirely from the existing rig
// (arms.*.raise + head.bob) — no shoulder capability needed; the arms-up + head-cock read as the
// shrug. Timed to land in the same window as agree/disagree so it reads alongside the speech bubble.

const RISE_MS = 320;
const HOLD_MS = 900;
const SETTLE_MS = 520;
export const SHRUG_DURATION_MS = RISE_MS + HOLD_MS + SETTLE_MS;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// Peak arm raise — a PARTIAL fraction of the full "stop" raise (raise=1 puts the hand at face level).
// At ~0.5 the upper arm lifts only slightly while the forearm swings up to an open diagonal, hands
// around chest height — an open palms-up shrug. Tunable.
const SHRUG_RAISE_PEAK = 0.6;
// Peak head cock on head.bob (0.5 = level; rolls slightly to one side for the quizzical "I dunno").
const SHRUG_HEAD_BOB_PEAK = .3;

// rise base→peak (smoothstep) → hold at peak → settle peak→base (smoothstep). Shared shape so the
// arms and head move on one synchronized envelope.
function pulse(elapsed: number, createdAt: number, base: number, peak: number): number {
  const t = elapsed - createdAt;
  if (t < RISE_MS) return base + (peak - base) * smoothstep(t / RISE_MS);
  if (t < RISE_MS + HOLD_MS) return peak;
  if (t < SHRUG_DURATION_MS) return base + (peak - base) * (1 - smoothstep((t - RISE_MS - HOLD_MS) / SETTLE_MS));
  return base;
}

// Both arms share this (the renderer mirrors the right side), raising from rest (0) to the partial
// open pose and back.
export function createShrugRaiseAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    return pulse(elapsed, createdAt, 0, SHRUG_RAISE_PEAK);
  };
}

// Slight head cock to one side (head.bob rest is 0.5), on the same envelope as the arms.
export function createShrugHeadBobAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    return pulse(elapsed, createdAt, 0.5, SHRUG_HEAD_BOB_PEAK);
  };
}
