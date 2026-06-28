import type { AnimationFn } from "./engine";

// Cursor-follow head driver for `track` mode — the head turns toward the pointer and tilts up/down
// depending on whether the pointer is above or below the head. Mirrors lookAround's shape: two
// AnimationFns (head.turn + head.tilt) sharing one eased state, so the engine can call both in the
// same frame without double-stepping.
//
// The TARGET pose (turn, tilt in [0,1]) is computed component-side from the live cursor position and
// written into `target.current` on every mousemove. This driver just eases the rendered pose toward
// that target each frame with frame-rate-independent exponential smoothing — so the head glides to
// the cursor instead of snapping, and naturally holds its last direction when the cursor stops.

// turn = head.turn (the head's OFFSET on the upper-body turn), upperTurn = upperbody.turn, tilt =
// head.tilt. The component pre-splits the cursor's horizontal deflection into upperTurn + turn so the
// upper body twists slightly while the head's effective direction (upper + offset) stays as tuned.
export type FollowTarget = { turn: number; tilt: number; upperTurn: number };

const NEUTRAL = 0.5;
const FOLLOW_TAU_MS = 120; // easing time-constant: smaller = snappier follow, larger = smoother/laggier

export type FollowAnimation = {
  headTurn: AnimationFn;
  headTilt: AnimationFn;
  upperTurn: AnimationFn;
};

// Optional pose to START easing from, captured lazily on the first tick (so capabilities are
// registered and hold their live values by then). Lets the follow continue from wherever the head
// currently is — e.g. a hangout look-around gaze — instead of snapping to neutral before easing to
// the cursor. Defaults to neutral.
export function createFollowAnimation(
  target: { current: FollowTarget },
  getInitialPose?: () => { turn: number; tilt: number; upperTurn: number },
): FollowAnimation {
  let curTurn = NEUTRAL;
  let curTilt = NEUTRAL;
  let curUpper = NEUTRAL;
  let lastElapsed = -1;
  let seeded = false;

  // Idempotent within a tick: advance once per unique elapsed value (the three fns all call it in
  // the same frame), easing every pose toward the live target.
  const step = (elapsed: number, dt: number) => {
    if (elapsed === lastElapsed) return;
    lastElapsed = elapsed;
    // Seed the eased state from the head's live pose on the first tick, so easing begins from there
    // instead of snapping to neutral when track mode takes over a held pose.
    if (!seeded) {
      seeded = true;
      if (getInitialPose) {
        const p = getInitialPose();
        curTurn = p.turn;
        curTilt = p.tilt;
        curUpper = p.upperTurn;
      }
    }
    const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / FOLLOW_TAU_MS);
    curTurn += (target.current.turn - curTurn) * k;
    curTilt += (target.current.tilt - curTilt) * k;
    curUpper += (target.current.upperTurn - curUpper) * k;
  };

  return {
    headTurn: (elapsed, dt) => {
      step(elapsed, dt);
      return curTurn;
    },
    headTilt: (elapsed, dt) => {
      step(elapsed, dt);
      return curTilt;
    },
    upperTurn: (elapsed, dt) => {
      step(elapsed, dt);
      return curUpper;
    },
  };
}
