import type { AnimationFn } from "./engine";
import { createShakeHeadAnimation, SHAKE_HEAD_DURATION_MS } from "./shakeHead";
import { createRaiseHandAnimation, RAISE_HAND_DURATION_MS } from "./raiseHand";

// A reaction is a top-level one-shot: it composes parallel body-part animations under one
// duration, then mode resumes. Animations are keyed by capability so they slot into the
// existing engine machinery (and benefit from the conflict system — e.g. shaking head.turn
// will smoothly release head.tilt if it was active).
export type Reaction = {
  duration: number;
  animations: Record<string, AnimationFn>;
};

export type ReactionName = "disagree";

// Each call creates fresh closures so the reaction can re-fire from a clean state.
export function createReaction(name: ReactionName): Reaction {
  switch (name) {
    case "disagree":
      return {
        duration: Math.max(SHAKE_HEAD_DURATION_MS, RAISE_HAND_DURATION_MS),
        animations: {
          "head.turn": createShakeHeadAnimation(),
          "arms.left.raise": createRaiseHandAnimation(),
        },
      };
  }
}
