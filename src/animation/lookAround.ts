import type { AnimationFn } from "./engine";

// Continuously alternates hold ↔ slide. Each slide eases from the current pose to a new
// random target for turn AND bob; each hold dwells at the most recent target. There is no
// return to neutral between picks — the character just keeps gazing in whichever direction
// it most recently settled on, then occasionally re-aims. Reads as ambient attention rather
// than a series of discrete glances.
//
// Drives head.turn (NOT body.turn) — ambient idle moves the head only; the body holds whatever
// angle it's currently at. Renderers compute effective head turn = body.turn + (head.turn -
// 0.5), so head.turn is interpreted as an OFFSET on top of the body's current pose. lookAround
// produces values in a narrow range around 0.5, so the head wiggles around the body's facing
// direction without ever fully overriding it.
//
// Both capabilities are driven from one shared state machine. step() is idempotent within a
// tick: it advances once per unique elapsed value and caches the resulting (turn, bob) pair so
// the engine can call headTurn and headBob in the same frame without double-advancing state.

const NEUTRAL = 0.5;
const TURN_MIN = 0.35;
const TURN_MAX = 0.65;
const BOB_MIN = 0.4;  // ±0.1 from neutral → ±3.6° tilt with MAX_HEAD_BOB_DEGREES=18
const BOB_MAX = 0.6;

const MIN_HOLD_MS = 2000;
const MAX_HOLD_MS = 5000;
const MIN_SLIDE_MS = 350;
const MAX_SLIDE_MS = 600;

const randRange = (min: number, max: number) => min + Math.random() * (max - min);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

type Phase = "hold" | "slide";

export type LookAroundAnimation = {
  headTurn: AnimationFn;
  headBob: AnimationFn;
};

export function createLookAroundAnimation(): LookAroundAnimation {
  // Start in hold at neutral. The first slide kicks in after the initial hold expires.
  let phase: Phase = "hold";
  let phaseStartedAt: number | null = null;
  let phaseDuration = 0;
  let fromTurn = NEUTRAL;
  let fromBob = NEUTRAL;
  let toTurn = NEUTRAL;
  let toBob = NEUTRAL;

  let lastElapsed = -1;
  let lastTurn = NEUTRAL;
  let lastBob = NEUTRAL;

  const step = (elapsed: number) => {
    if (elapsed === lastElapsed) return;
    lastElapsed = elapsed;

    // Lazy-init on first call so the first hold is measured from when the animation
    // actually starts running, not from when the engine started. Matters when mode switches
    // mid-session re-create this closure.
    if (phaseStartedAt === null) {
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_HOLD_MS, MAX_HOLD_MS);
    }

    const t = (elapsed - phaseStartedAt) / phaseDuration;

    if (phase === "hold") {
      if (t < 1) {
        lastTurn = toTurn;
        lastBob = toBob;
        return;
      }
      // Hold expired — pick the next target and start a slide from the current pose to it.
      phase = "slide";
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_SLIDE_MS, MAX_SLIDE_MS);
      fromTurn = toTurn;
      fromBob = toBob;
      toTurn = randRange(TURN_MIN, TURN_MAX);
      toBob = randRange(BOB_MIN, BOB_MAX);
      lastTurn = fromTurn;
      lastBob = fromBob;
      return;
    }

    // phase === "slide"
    if (t >= 1) {
      // Slide finished — hold at the new pose.
      phase = "hold";
      phaseStartedAt = elapsed;
      phaseDuration = randRange(MIN_HOLD_MS, MAX_HOLD_MS);
      lastTurn = toTurn;
      lastBob = toBob;
      return;
    }
    const eased = smoothstep(t);
    lastTurn = fromTurn + (toTurn - fromTurn) * eased;
    lastBob = fromBob + (toBob - fromBob) * eased;
  };

  return {
    headTurn: (elapsed) => { step(elapsed); return lastTurn; },
    headBob: (elapsed) => { step(elapsed); return lastBob; },
  };
}
