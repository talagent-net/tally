import type { AnimationFn } from "./engine";

// Continuously alternates hold ↔ slide. Each slide eases from the current pose to a new random
// target; each hold dwells there. No return to neutral between picks — the character keeps gazing
// wherever it last settled, then occasionally re-aims. Reads as ambient attention.
//
// Mirrors `track`'s ability set (same ranges, passed in via config): it picks a random EFFECTIVE
// head turn + head tilt, splits the turn into a slight upperbody.turn + a head.turn offset (so the
// upper body twists a little, hips/legs planted), and also keeps a small side-to-side head BOB
// (a flat roll — personality, not part of the cursor-style aim). Renderers sum body.turn +
// upperbody.turn + head.turn for the effective head direction, so head.turn / upperbody.turn here
// are OFFSETS around 0.5, never fully overriding the body's facing.
//
// All channels are driven from one shared state machine. step() is idempotent within a tick: it
// advances once per unique elapsed value, so the engine can call the four fns in the same frame
// without double-advancing.

const NEUTRAL = 0.5;
const BOB_MIN = 0.4; // ±0.1 from neutral → ±3.6° roll with MAX_HEAD_BOB_DEGREES=18
const BOB_MAX = 0.6;

const MIN_HOLD_MS = 2000;
const MAX_HOLD_MS = 5000;
const MIN_SLIDE_MS = 350;
const MAX_SLIDE_MS = 600;

const randRange = (min: number, max: number) => min + Math.random() * (max - min);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

type Phase = "hold" | "slide";

// Shared with `track` so idle and cursor-follow use the same ability ranges.
export type LookAroundConfig = {
  turnMax: number; // max effective head turn from 0.5
  tiltMax: number; // max head.tilt from 0.5
  upperFraction: number; // share of the turn carried by a slight upperbody.turn (rest stays a head offset)
  // Optional pose to START from, captured lazily on the first tick (so capabilities are registered
  // and hold their live values by then). Lets idle continue from wherever the head currently is —
  // e.g. the frozen `connecting` pose — instead of snapping to neutral. Defaults to neutral.
  getInitialPose?: () => { turn: number; upper: number; tilt: number; bob: number };
};

export type LookAroundAnimation = {
  headTurn: AnimationFn;
  headBob: AnimationFn;
  headTilt: AnimationFn;
  upperTurn: AnimationFn;
};

export function createLookAroundAnimation(config: LookAroundConfig): LookAroundAnimation {
  const { turnMax, tiltMax, upperFraction, getInitialPose } = config;

  // Start in hold at neutral. The first slide kicks in after the initial hold expires.
  let phase: Phase = "hold";
  let phaseStartedAt: number | null = null;
  let phaseDuration = 0;

  // Each channel keeps a from/to for the current slide. turn is stored pre-split as head.turn +
  // upperbody.turn targets so both ease together.
  let fromTurn = NEUTRAL,
    toTurn = NEUTRAL;
  let fromUpper = NEUTRAL,
    toUpper = NEUTRAL;
  let fromTilt = NEUTRAL,
    toTilt = NEUTRAL;
  let fromBob = NEUTRAL,
    toBob = NEUTRAL;

  let lastElapsed = -1;
  let curTurn = NEUTRAL;
  let curUpper = NEUTRAL;
  let curTilt = NEUTRAL;
  let curBob = NEUTRAL;

  const pickTargets = () => {
    const effTurn = randRange(0.5 - turnMax, 0.5 + turnMax);
    toUpper = 0.5 + (effTurn - 0.5) * upperFraction;
    toTurn = 0.5 + (effTurn - 0.5) * (1 - upperFraction);
    toTilt = randRange(0.5 - tiltMax, 0.5 + tiltMax);
    toBob = randRange(BOB_MIN, BOB_MAX);
  };

  const step = (elapsed: number) => {
    if (elapsed === lastElapsed) return;
    lastElapsed = elapsed;

    // Lazy-init so the first hold is measured from when the animation actually starts running, and
    // (optionally) so the first hold dwells at the CURRENT pose rather than neutral — then the
    // first slide eases away from there, so there's no snap when idle takes over a held pose.
    if (phaseStartedAt === null) {
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_HOLD_MS, MAX_HOLD_MS);
      if (getInitialPose) {
        const p = getInitialPose();
        fromTurn = toTurn = curTurn = p.turn;
        fromUpper = toUpper = curUpper = p.upper;
        fromTilt = toTilt = curTilt = p.tilt;
        fromBob = toBob = curBob = p.bob;
      }
    }

    const t = (elapsed - phaseStartedAt) / phaseDuration;

    if (phase === "hold") {
      if (t < 1) {
        curTurn = toTurn;
        curUpper = toUpper;
        curTilt = toTilt;
        curBob = toBob;
        return;
      }
      // Hold expired — pick the next target and slide from the current pose to it.
      phase = "slide";
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_SLIDE_MS, MAX_SLIDE_MS);
      fromTurn = toTurn;
      fromUpper = toUpper;
      fromTilt = toTilt;
      fromBob = toBob;
      pickTargets();
      curTurn = fromTurn;
      curUpper = fromUpper;
      curTilt = fromTilt;
      curBob = fromBob;
      return;
    }

    // phase === "slide"
    if (t >= 1) {
      phase = "hold";
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_HOLD_MS, MAX_HOLD_MS);
      curTurn = toTurn;
      curUpper = toUpper;
      curTilt = toTilt;
      curBob = toBob;
      return;
    }
    const eased = smoothstep(t);
    curTurn = fromTurn + (toTurn - fromTurn) * eased;
    curUpper = fromUpper + (toUpper - fromUpper) * eased;
    curTilt = fromTilt + (toTilt - fromTilt) * eased;
    curBob = fromBob + (toBob - fromBob) * eased;
  };

  return {
    headTurn: (elapsed) => {
      step(elapsed);
      return curTurn;
    },
    headBob: (elapsed) => {
      step(elapsed);
      return curBob;
    },
    headTilt: (elapsed) => {
      step(elapsed);
      return curTilt;
    },
    upperTurn: (elapsed) => {
      step(elapsed);
      return curUpper;
    },
  };
}
