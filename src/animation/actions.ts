import type { AnimationFn } from "./engine";
import { createShakeHeadAnimation, SHAKE_HEAD_DURATION_MS } from "./shakeHead";
import { createNodHeadAnimation, NOD_HEAD_DURATION_MS } from "./nodHead";
import { createRaiseHandAnimation, RAISE_HAND_DURATION_MS } from "./raiseHand";
import { createWaveHandAnimation } from "./waveHand";
import { createWalk } from "./walk";
import type { WalkDirection } from "./walk";

// An action is a top-level one-shot: it composes parallel body-part animations under one
// duration, then mode resumes. Animations are keyed by capability so they slot into the
// existing engine machinery (and benefit from the conflict system — e.g. shaking head.turn
// will smoothly release head.tilt if it was active).
//
// Most actions are pure gestures: every capability they touch returns to rest when the action
// ends. `walk` is different — it has a net side effect (the figure ends somewhere new and stays
// there). That displacement can't ride the reset-to-rest capability system, so a walk action
// additionally carries a `locomotion` descriptor that the component uses to drive the
// PERSISTENT body.x position and commit the net move on completion. The gait itself (facing,
// bob, lean) still flows through `animations` and resets cleanly like any other action.
export type Action = {
  duration: number;
  animations: Record<string, AnimationFn>;
  // Optional override (ms) for the engine's conflict-release duration when this action's
  // animations are installed. Lets an action demand an instant handoff (0) instead of waiting out
  // the default unwind of whatever ambient/conflicting capability it's interrupting.
  releaseMs?: number;
  locomotion?: {
    direction: WalkDirection;
    travelBodyWidths: number; // horizontal screen travel in body-widths; pixels resolved component-side (needs scale)
    rampStartMs: number;
    rampEndMs: number;
    accelMs: number; // fixed ease-in/ease-out duration for the body.x slide (trapezoidal profile)
  };
};

// Actions are triggered by a spec object rather than a bare name, because some actions take
// parameters (walk needs a direction and a distance). Discriminated on `name`.
export type ActionSpec =
  | { name: "disagree" }
  | { name: "agree" }
  | { name: "walk"; direction: WalkDirection; distance: number };

export type ActionName = ActionSpec["name"];

// Each call creates fresh closures so the action can re-fire from a clean state.
export function createAction(spec: ActionSpec): Action {
  switch (spec.name) {
    case "disagree":
      return {
        duration: Math.max(SHAKE_HEAD_DURATION_MS, RAISE_HAND_DURATION_MS),
        animations: {
          "head.turn": createShakeHeadAnimation(),
          "arms.left.raise": createRaiseHandAnimation(),
          // The raised hand waves left/right (forearm at the elbow) in sync with the head shake.
          "arms.left.wave": createWaveHandAnimation(),
        },
      };
    case "agree":
      // Nodding up and down on head.tilt — no arm movement, mirroring disagree's head-only
      // intent but on the vertical axis.
      return {
        duration: NOD_HEAD_DURATION_MS,
        animations: {
          "head.tilt": createNodHeadAnimation(),
        },
      };
    case "walk": {
      const walk = createWalk(spec.direction, spec.distance);
      return {
        duration: walk.duration,
        animations: walk.animations,
        releaseMs: walk.releaseMs,
        locomotion: {
          direction: spec.direction,
          travelBodyWidths: walk.travelBodyWidths,
          rampStartMs: walk.rampStartMs,
          rampEndMs: walk.rampEndMs,
          accelMs: walk.accelMs,
        },
      };
    }
  }
}
