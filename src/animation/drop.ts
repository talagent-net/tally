import type { AnimationFn } from "./engine";

// Drop — the vertical mirror of `come`: Avagent free-falls from `distance` above the anchor and
// lands exactly on it. Two phases:
//   [0, fallMs)               FALL: body.y descends with a gravity profile (accelerating, hard
//                             stop), while all four limbs flail frantically and independently.
//   [fallMs, fallMs+landMs)   LAND: body.crouch spikes 0→1 (impact absorb) then eases 1→0
//                             (stand up). The flail has settled to neutral by now.
// This module is the scale-independent half: normalized timing + the flail / landing-crouch
// animations. The actual vertical pixel descent (body.y) is resolved component-side (needs scale),
// driven from the `fallMs` + `offsetBodyWidths` this returns.

const DROP_FALL_MS_PER_BODYWIDTH = 110; // fall duration per body-width of height (linear in distance)
const DROP_OFFSET_PER_BODYWIDTH = 2.2;  // body-widths of on-screen height per distance unit (matches come's travel scale)
const DROP_IMPACT_MS = 160;             // landing compress (0→1 crouch) — fast
const DROP_RECOVER_MS = 360;            // stand up (1→0 crouch) — slower
// FLAIL SPEED — multiplier on how fast the arms/legs thrash, INDEPENDENT of fall speed/distance.
// Scales the flail oscillation frequencies; the fade-in/out envelope still spans the whole fall.
// Now per-character (drop.flailSpeed); this is the default.
const DROP_FLAIL_SPEED = 2.5;

// Per-limb flail: each limb oscillates the FULL [0,1] cap range (→ full MIN↔MAX rotation) at its
// own speed (close to each other) and starting phase, so the four limbs look random rather than
// synced. Index 0=L arm, 1=R arm, 2=L leg, 3=R leg.
const FLAIL_SPEEDS = [1.0, 1.17, 0.88, 1.09]; // per-limb rate multiplier (close but individual)
const FLAIL_PHASES = [0, 1.9, 3.5, 5.2];       // per-limb starting offset

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export type Drop = {
  duration: number;
  fallMs: number;
  offsetBodyWidths: number; // height above the anchor in body-widths; px resolved component-side
  animations: Record<string, AnimationFn>;
};

// A single sine that sweeps the cap the full [0,1] range over [0, fallMs] — so the limb rotates
// the whole MIN..MAX band. Per-limb speed + phase make the four limbs feel independent. Outside
// the fall it returns 0.5 (the cap then settles to its rest in the component).
// `speedScale` is the overall thrash-rate knob (defaults to the drop's); jump passes its own.
// The initial swing DIRECTION is randomized per call (± sign on the sine), so each limb kicks off
// a different way every time the action fires — re-rolled fresh because createDrop/createJump build
// new flail closures on each use.
export function createFlail(seed: number, fallMs: number, speedScale: number = DROP_FLAIL_SPEED): AnimationFn {
  const speed = FLAIL_SPEEDS[seed % FLAIL_SPEEDS.length];
  const phase = FLAIL_PHASES[seed % FLAIL_PHASES.length];
  const dir = Math.random() < 0.5 ? 1 : -1; // random initial swing direction, fixed for this use
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t <= 0 || t >= fallMs) return 0.5;
    const s = (t / 1000) * speedScale * speed; // overall rate knob × per-limb rate
    return 0.5 + dir * 0.5 * Math.sin(2 * Math.PI * s + phase); // full [0,1] sweep, randomized direction
  };
}

// body.crouch over the whole drop: flat 0 through the fall, then a fast compress to full and a
// slower stand-up — the landing impact. Ends at 0 (standing).
function createLandingCrouch(fallMs: number): AnimationFn {
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t < fallMs) return 0; // upright through the fall
    const lt = t - fallMs;
    if (lt < DROP_IMPACT_MS) return smoothstep(lt / DROP_IMPACT_MS); // 0 → 1 absorb
    if (lt < DROP_IMPACT_MS + DROP_RECOVER_MS) return 1 - smoothstep((lt - DROP_IMPACT_MS) / DROP_RECOVER_MS); // 1 → 0 stand
    return 0;
  };
}

export function createDrop(
  distance: number,
  flailSpeed: number = DROP_FLAIL_SPEED, // per-character fall flail rate (drop); default = today's value
): Drop {
  const dist = Math.max(0, distance);
  const fallMs = Math.max(1, dist * DROP_FALL_MS_PER_BODYWIDTH);
  const landMs = DROP_IMPACT_MS + DROP_RECOVER_MS;
  return {
    duration: fallMs + landMs,
    fallMs,
    offsetBodyWidths: dist * DROP_OFFSET_PER_BODYWIDTH,
    animations: {
      "body.crouch": createLandingCrouch(fallMs),
      "arms.left.flail": createFlail(0, fallMs, flailSpeed),
      "arms.right.flail": createFlail(1, fallMs, flailSpeed),
      "legs.left.flail": createFlail(2, fallMs, flailSpeed),
      "legs.right.flail": createFlail(3, fallMs, flailSpeed),
    },
  };
}
