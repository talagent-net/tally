import type { AnimationFn } from "./engine";

// "Hang head" — a dejected/weary beat: the head tilts down while the eyes fall to nearly shut, holds
// for ~1.3s, then eases back to rest and the mode resumes. A PURE GESTURE (no params, no net
// translation, returns to rest). Built from head.tilt + eyes.blink + a small body.crouch dip (the
// head/shoulders sink a few px) — no new capability.

const FALL_MS = 380;   // head drops + eyes fall
const HOLD_MS = 1900;  // the held "hung" beat (~1.3s; the "second or two")
const LIFT_MS = 480;   // ease back up to rest
export const HANG_HEAD_DURATION_MS = FALL_MS + HOLD_MS + LIFT_MS;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// head.tilt: 0.5 = level, < 0.5 = look DOWN. Drop the head well below level.
const HANG_TILT_DOWN = 0;
// eyes.blink: 1 = fully OPEN, 0 = fully closed. Fall to nearly shut (not a hard 0) and hold there.
const HANG_BLINK_NEARLY_SHUT = 0.0;
// body.crouch: 0 = standing; a small value sinks the head/shoulders a few px (not a real squat). The
// "head lowers a few pixels and returns" dip — tunable.
const HANG_CROUCH_DROP = 0.16;

// fall base→peak (smoothstep) → hold at peak → lift peak→base (smoothstep). Shared envelope so the
// head and eyes move together.
function pulse(elapsed: number, createdAt: number, base: number, peak: number): number {
  const t = elapsed - createdAt;
  if (t < FALL_MS) return base + (peak - base) * smoothstep(t / FALL_MS);
  if (t < FALL_MS + HOLD_MS) return peak;
  if (t < HANG_HEAD_DURATION_MS) return base + (peak - base) * (1 - smoothstep((t - FALL_MS - HOLD_MS) / LIFT_MS));
  return base;
}

// head.tilt from level (0.5) down to HANG_TILT_DOWN and back.
export function createHangHeadTiltAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    return pulse(elapsed, createdAt, 0.5, HANG_TILT_DOWN);
  };
}

// eyes.blink from open (1) to nearly shut and back, on the same envelope as the head.
export function createHangHeadBlinkAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    return pulse(elapsed, createdAt, 1, HANG_BLINK_NEARLY_SHUT);
  };
}

// body.crouch from standing (0) to a small dip and back, on the same envelope — the head/shoulders
// sink a few px, then return.
export function createHangHeadCrouchAnimation(): AnimationFn {
  let createdAt: number | null = null;
  return (elapsed) => {
    if (createdAt === null) createdAt = elapsed;
    return pulse(elapsed, createdAt, 0, HANG_CROUCH_DROP);
  };
}
