import type { AnimationFn } from "./engine";

// Walk gait — the scale-independent, normalized half of the walk action. It produces the
// per-capability animation functions for the *look* of walking (face the travel direction,
// vertical bob, lean into it) plus the timing metadata the component needs to drive the
// PERSISTENT horizontal translation (body.x). The actual pixel displacement is computed
// component-side (it depends on `scale` and body width), so this module stays pure timing +
// normalized values, mirroring how every other animation is authored.
//
// Timeline (one walk):
//   [0, TURN_IN_MS)              turn-in: body pivots to face the travel direction, leans in;
//                                body.x is already sliding here (rampStartMs = 0)
//   [TURN_IN_MS, rampEndMs)      stride:  body.x continues; bounce + legs.stride kick in together
//                                (both planted/at-rest through the turn, phase-locked thereafter)
//   [rampEndMs, duration)        settle:  body unwinds back to forward / upright
// Only the horizontal slide (body.x) overlaps the turn; the gait cycle (bounce + leg swing) is
// held back until the turn completes.

const WALK_MS_PER_BODYWIDTH = 240; // TRAVEL SPEED — ms of travel per body-width covered. Sets the
                                   // total walk duration. Changing it does NOT change how many
                                   // step cycles occur, only how fast the character moves.
const TURN_IN_MS = 120;            // time to pivot toward the travel direction before striding
const SETTLE_MS = 160;             // time to unwind facing/lean back to neutral after arriving
// HORIZONTAL ACCELERATION — fixed ms the body.x slide takes to ease IN at the start and OUT at the
// end (a trapezoidal velocity profile: ramp up → constant-speed cruise → ramp down). Independent of
// distance — a longer walk just gets a longer cruise. If a walk is too short to fit accel + decel,
// the component clamps them proportionally (degrading to a pure ease-in-out). Applied to both ends.
const WALK_ACCEL_MS = 150;
// GAIT FREQUENCY — how many step cycles (one body bounce + one leg pass) occur per body-width
// travelled. This is the bounce/leg-swing frequency knob, fully independent of travel speed:
// changing it changes ONLY how many steps subdivide the walk, not how long the walk takes.
const STEPS_PER_BODYWIDTH = 2;
// HORIZONTAL TRAVEL — body-widths of on-screen movement per body-width of walk. Decoupled from
// the gait cycle: it scales ONLY how far body.x slides, leaving duration, step count, and the
// bounce/swing cadence untouched. Raise it to cover more ground in the same walk (Avagent reads as
// faster across the screen; the legs keep cycling at the same speed, so the feet glide a little).
// 1.0 = feet roughly track the ground. Now per-character (gait.travelPerBodyWidth); this is the default.
const WALK_TRAVEL_PER_BODYWIDTH = 2.2;

const WALK_FACE_TURN = 0.5;        // body.turn offset from 0.5 toward the travel direction (0.5 = full profile)
const WALK_LEAN = 0.3;             // body.lean offset from 0.5 toward the travel direction (normalized)
const WALK_LEG_SWING = 0.5;        // legs.stride amplitude around 0.5 (0.5 = full normalized swing both ways)
const WALK_BOUNCE_RANGE = 0.4;     // fraction of the FULL body.bounce range used per walk step

const TURN_NEUTRAL = 0.5;
const LEAN_NEUTRAL = 0.5;
const SWING_NEUTRAL = 0.5;
const BOUNCE_REST = 0;
const BODY_SINK_REST = 0; // grounded height; the sink envelope holds at 1 through the stride

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export type WalkDirection = "left" | "right";

export type Walk = {
  duration: number;
  // The animations slot straight into the action system, keyed by capability.
  animations: Record<string, AnimationFn>;
  // Timing window for the component-driven body.x stride (pixels resolved component-side).
  rampStartMs: number;
  rampEndMs: number;
  // Effective horizontal screen travel in body-widths (distance × travelPerBodyWidth).
  // The component multiplies this by body width × scale to get the body.x pixel displacement.
  travelBodyWidths: number;
  // Fixed ease-in/ease-out duration (ms) for the body.x slide — the component builds a trapezoidal
  // velocity profile from this (see WALK_ACCEL_MS).
  accelMs: number;
};

// An envelope that ramps neutral → target over the turn-in, holds through the stride, then
// ramps back to neutral over the settle. Shared by body.turn (face) and body.lean.
function createEnvelope(target: number, neutral: number, rampEndMs: number, duration: number): AnimationFn {
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t <= 0) return neutral;
    if (t < TURN_IN_MS) return neutral + (target - neutral) * smoothstep(t / TURN_IN_MS);
    if (t < rampEndMs) return target;
    if (t < duration) return target + (neutral - target) * smoothstep((t - rampEndMs) / SETTLE_MS);
    return neutral;
  };
}

// abs(sine) hump per step, over the post-turn stride window [startMs, endMs] — like the leg
// swing, the bounce stays at rest through the turn-in and only begins once the body has turned.
// Same window + step count as the swing, so the body bounces once per step in sync with the legs.
// Ends exactly at rest (0) because the argument lands on an integer multiple of π at endMs.
function createBounce(steps: number, startMs: number, endMs: number): AnimationFn {
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t < startMs || t >= endMs) return BOUNCE_REST;
    const p = (t - startMs) / (endMs - startMs);
    return WALK_BOUNCE_RANGE * Math.abs(Math.sin(p * Math.PI * steps));
  };
}

// legs.stride stays neutral (legs planted) through the turn-in, then alternates over the stride
// window [startMs, endMs] — full sine, so one leg forward = half a period = one step. Unlike the
// bounce (which starts at t=0), the legs only begin swinging once the body has turned. Starts and
// ends on neutral (sin from 0 to an integer × π). Rendered anti-phase across the two legs.
function createSwing(steps: number, startMs: number, endMs: number): AnimationFn {
  let t0: number | null = null;
  return (elapsed) => {
    if (t0 === null) t0 = elapsed;
    const t = elapsed - t0;
    if (t < startMs || t >= endMs) return SWING_NEUTRAL;
    const p = (t - startMs) / (endMs - startMs);
    return SWING_NEUTRAL + WALK_LEG_SWING * Math.sin(p * Math.PI * steps);
  };
}

export function createWalk(
  direction: WalkDirection,
  distance: number,
  walkMsPerBodyWidth: number = WALK_MS_PER_BODYWIDTH,        // per-character pace (gait); default = today's value
  travelPerBodyWidth: number = WALK_TRAVEL_PER_BODYWIDTH,    // per-character travel (gait); default = today's value
): Walk {
  const dist = Math.max(0, distance);
  const sign = direction === "right" ? 1 : -1;

  const strideMs = dist * walkMsPerBodyWidth;
  const rampStartMs = 0;
  const rampEndMs = TURN_IN_MS + strideMs;
  const duration = rampEndMs + SETTLE_MS;

  const turnTarget = clamp01(TURN_NEUTRAL + sign * WALK_FACE_TURN);
  const leanTarget = clamp01(LEAN_NEUTRAL + sign * WALK_LEAN);
  // Step count = distance × gait frequency. Independent of WALK_MS_PER_BODYWIDTH (that only
  // affects duration), so the travel-speed and gait-frequency knobs don't interfere. Bounce and
  // swing share this count over the same post-turn window [TURN_IN_MS, rampEndMs], so they stay
  // phase-locked (one bounce per leg step). Real-time cadence emerges as strideMs / steps.
  const steps = Math.max(1, Math.round(dist * STEPS_PER_BODYWIDTH));

  return {
    duration,
    rampStartMs,
    rampEndMs,
    travelBodyWidths: dist * travelPerBodyWidth,
    accelMs: WALK_ACCEL_MS,
    animations: {
      "body.turn": createEnvelope(turnTarget, TURN_NEUTRAL, rampEndMs, duration),
      "body.lean": createEnvelope(leanTarget, LEAN_NEUTRAL, rampEndMs, duration),
      // body.sink — hold-high envelope (rest 0 → 1 through the stride), synced to body.lean's
      // ramp/hold/settle. The component multiplies it by gait.walkDropOffset (scaled px) so the
      // figure drops a flat amount while walking, countering the lean's pivot-lift.
      "body.sink": createEnvelope(1, BODY_SINK_REST, rampEndMs, duration),
      "body.bounce": createBounce(steps, TURN_IN_MS, rampEndMs),
      "legs.stride": createSwing(steps, TURN_IN_MS, rampEndMs),
      // Same swing waveform as the legs; the arm renderer applies the opposite sign per side so the
      // arms counter-swing the legs (and each other).
      "arms.stride": createSwing(steps, TURN_IN_MS, rampEndMs),
    },
  };
}
