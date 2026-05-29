import type { AnimationFn } from "./engine";

// Drop — the vertical mirror of `come`: Tally free-falls from `distance` above the anchor and
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
const DROP_IMPACT_MS = 110;             // landing compress (0→1 crouch) — fast
const DROP_RECOVER_MS = 280;            // stand up (1→0 crouch) — slower
// FLAIL SPEED — multiplier on how fast the arms/legs thrash, INDEPENDENT of fall speed/distance.
// Scales the flail oscillation frequencies; the fade-in/out envelope still spans the whole fall.
const DROP_FLAIL_SPEED = .1;

// Per-limb flail signature: each limb gets a distinct pair of (non-harmonic) frequencies and a
// phase offset so the four limbs are decorrelated — a chaotic, asymmetric free-fall thrash rather
// than a synchronized cycle. Index 0=L arm, 1=R arm, 2=L leg, 3=R leg.
const FLAIL_FREQS: [number, number][] = [
  [5.1, 7.7],
  [4.3, 8.3],
  [5.9, 6.7],
  [4.7, 9.1],
];
const FLAIL_PHASES = [0, 1.7, 3.4, 5.0];

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export type Drop = {
  duration: number;
  fallMs: number;
  offsetBodyWidths: number; // height above the anchor in body-widths; px resolved component-side
  animations: Record<string, AnimationFn>;
};

// Per-limb chaotic signal in [0,1] around neutral 0.5, active over [0, fallMs]. A sum of two
// out-of-phase sines (chaotic but smooth) under a sin fade envelope (starts/ends at neutral). The
// renderer maps (value-0.5) to a per-limb rotation exactly like the leg stride flail — same for
// arms and legs — so the debug slider drives each limb directly. Arms additionally clamp the
// result to a min/max band.
function createFlail(seed: number, fallMs: number): AnimationFn {
  const [f1, f2] = FLAIL_FREQS[seed % FLAIL_FREQS.length];
  const ph = FLAIL_PHASES[seed % FLAIL_PHASES.length];
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t <= 0 || t >= fallMs) return 0.5;
    const env = Math.sin(Math.PI * (t / fallMs)); // 0 → 1 → 0 across the fall
    const s = (t / 1000) * DROP_FLAIL_SPEED; // flail-speed knob — independent of fall speed
    const chaotic = 0.6 * Math.sin(2 * Math.PI * f1 * s + ph) + 0.4 * Math.sin(2 * Math.PI * f2 * s + ph * 1.3);
    return 0.5 + env * 0.5 * chaotic; // chaotic ∈ [-1,1] → [0,1]
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

export function createDrop(distance: number): Drop {
  const dist = Math.max(0, distance);
  const fallMs = Math.max(1, dist * DROP_FALL_MS_PER_BODYWIDTH);
  const landMs = DROP_IMPACT_MS + DROP_RECOVER_MS;
  return {
    duration: fallMs + landMs,
    fallMs,
    offsetBodyWidths: dist * DROP_OFFSET_PER_BODYWIDTH,
    animations: {
      "body.crouch": createLandingCrouch(fallMs),
      "arms.left.flail": createFlail(0, fallMs),
      "arms.right.flail": createFlail(1, fallMs),
      "legs.left.flail": createFlail(2, fallMs),
      "legs.right.flail": createFlail(3, fallMs),
    },
  };
}
