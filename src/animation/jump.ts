import type { AnimationFn } from "./engine";
import { createFlail } from "./drop";

// Jump — a vertical hop with no net displacement. Five beats over one duration:
//   [0, CROUCH_MS)                    ANTICIPATION: body.crouch eases 0→1 (full) — load the legs.
//   [CROUCH_MS, +SPRING_MS)           SPRING: body.crouch 1→0 fast — the legs extend and push off.
//   air = [CROUCH_MS, CROUCH_MS+airMs)  body.y traces a symmetric parabola 0 → -peak (apex) → 0,
//                                     i.e. constant-gravity projectile motion: decelerating on the
//                                     way up, accelerating on the way down.
//   flail = [spring end, landing]     the four limbs flail (reused from the drop) only once fully
//                                     airborne — released the instant the landing crouch begins.
//   landing = [CROUCH_MS+airMs, …)    body.crouch 0→LAND_CROUCH (partial) → 0 (stand up). Done.
// This is the scale-independent half (timing + crouch/flail). The vertical pixel arc (body.y) is
// resolved component-side from `peakBodyWidths` + the air timing this returns.

const JUMP_HEIGHT_BODYWIDTHS = 4;    // KNOB: fixed apex height in body-widths
const JUMP_AIR_MS_PER_BODYWIDTH = 150; // air time per body-width of height (taller jump → longer hang)
const JUMP_CROUCH_MS = 220;            // anticipation crouch-down (0→1, full)
const JUMP_SPRING_MS = 110;            // spring/extension (crouch 1→0) at launch — overlaps the ascent
const JUMP_LAND_CROUCH = 0.5;          // KNOB: partial landing crouch depth (vs the full 1.0 anticipation)
const JUMP_LAND_IMPACT_MS = 130;       // landing compress (0→LAND_CROUCH) — fast
const JUMP_LAND_RECOVER_MS = 300;      // stand up (LAND_CROUCH→0) — slower
const JUMP_FLAIL_SPEED = 1.5;          // KNOB: arm + leg flail thrash rate while airborne
const JUMP_HEAD_DOWN_TILT = .48;      // KNOB: head dip during the anticipation crouch (head.tilt below 0.5 = down)
const JUMP_HEAD_UP_TILT = 0.36;        // KNOB: head lift toward the apex (head.tilt above 0.5 = up)

const NEUTRAL_TILT = 0.5;              // head.tilt rest: 0.5 straight, 0 down, 1 up
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export type Jump = {
  duration: number;
  peakBodyWidths: number; // apex height in body-widths; px resolved component-side
  airStartMs: number;     // when the air phase (and the body.y parabola) begins
  airMs: number;          // air-phase duration (ascent + descent)
  flailStartMs: number;   // flail engages here (fully airborne, after the spring)
  flailEndMs: number;     // flail releases here (landing crouch begins)
  animations: Record<string, AnimationFn>;
};

// body.crouch across the whole jump: anticipation load (0→1), spring/extension (1→0), flat 0 through
// the air, then the partial landing absorb (0→LAND_CROUCH) and stand-up (→0).
function createJumpCrouch(airStartMs: number, airMs: number): AnimationFn {
  const springEnd = airStartMs + JUMP_SPRING_MS;
  const landStart = airStartMs + airMs;
  const impactEnd = landStart + JUMP_LAND_IMPACT_MS;
  const recoverEnd = impactEnd + JUMP_LAND_RECOVER_MS;
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t < airStartMs) return smoothstep(t / JUMP_CROUCH_MS);                          // 0→1 load
    if (t < springEnd) return 1 - smoothstep((t - airStartMs) / JUMP_SPRING_MS);        // 1→0 spring
    if (t < landStart) return 0;                                                         // airborne (extended)
    if (t < impactEnd) return JUMP_LAND_CROUCH * smoothstep((t - landStart) / JUMP_LAND_IMPACT_MS); // 0→partial
    if (t < recoverEnd) return JUMP_LAND_CROUCH * (1 - smoothstep((t - impactEnd) / JUMP_LAND_RECOVER_MS)); // →0
    return 0;
  };
}

// head.tilt across the jump: dip down with the anticipation crouch, swing up while rising toward the
// apex (looking to the sky), then ease back to neutral by the time it lands — and hold neutral
// through the landing crouch. (head.tilt: 0.5 straight, 0 down, 1 up.)
function createJumpHeadTilt(airStartMs: number, airMs: number): AnimationFn {
  const apex = airStartMs + airMs / 2;
  const landStart = airStartMs + airMs;
  const downValue = NEUTRAL_TILT - JUMP_HEAD_DOWN_TILT;
  const upValue = NEUTRAL_TILT + JUMP_HEAD_UP_TILT;
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t < airStartMs) return NEUTRAL_TILT + (downValue - NEUTRAL_TILT) * smoothstep(t / airStartMs);          // neutral → down (crouch)
    if (t < apex) return downValue + (upValue - downValue) * smoothstep((t - airStartMs) / (apex - airStartMs)); // down → up (rising)
    if (t < landStart) return upValue + (NEUTRAL_TILT - upValue) * smoothstep((t - apex) / (landStart - apex));   // up → neutral (falling)
    return NEUTRAL_TILT;                                                                                          // neutral (landing)
  };
}

export function createJump(): Jump {
  const peakBodyWidths = JUMP_HEIGHT_BODYWIDTHS;
  const airStartMs = JUMP_CROUCH_MS;
  const airMs = Math.max(1, peakBodyWidths * JUMP_AIR_MS_PER_BODYWIDTH);
  const flailStartMs = airStartMs + JUMP_SPRING_MS; // flail only once the legs have extended
  const flailEndMs = airStartMs + airMs;            // flail releases as the landing crouch begins
  const landMs = JUMP_LAND_IMPACT_MS + JUMP_LAND_RECOVER_MS;
  return {
    duration: airStartMs + airMs + landMs,
    peakBodyWidths,
    airStartMs,
    airMs,
    flailStartMs,
    flailEndMs,
    animations: {
      "body.crouch": createJumpCrouch(airStartMs, airMs),
      "head.tilt": createJumpHeadTilt(airStartMs, airMs),
      // Reuse the drop's flail; its oscillation spans the airborne window, at jump's own speed.
      "arms.left.flail": createFlail(0, flailEndMs - flailStartMs, JUMP_FLAIL_SPEED),
      "arms.right.flail": createFlail(1, flailEndMs - flailStartMs, JUMP_FLAIL_SPEED),
      "legs.left.flail": createFlail(2, flailEndMs - flailStartMs, JUMP_FLAIL_SPEED),
      "legs.right.flail": createFlail(3, flailEndMs - flailStartMs, JUMP_FLAIL_SPEED),
    },
  };
}
