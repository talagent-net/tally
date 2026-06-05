import type { AnimationFn } from "./engine";
import { createShakeHeadAnimation, SHAKE_HEAD_DURATION_MS } from "./shakeHead";
import { createNodHeadAnimation, NOD_HEAD_DURATION_MS } from "./nodHead";
import { createRaiseHandAnimation, RAISE_HAND_DURATION_MS } from "./raiseHand";
import { createWaveHandAnimation } from "./waveHand";
import { createGreetHeadBobAnimation } from "./greetHeadBob";
import { createShrugRaiseAnimation, createShrugHeadBobAnimation, SHRUG_DURATION_MS } from "./shrug";
import { createHangHeadTiltAnimation, createHangHeadBlinkAnimation, createHangHeadCrouchAnimation, HANG_HEAD_DURATION_MS } from "./hangHead";
import { createWalk } from "./walk";
import type { WalkDirection } from "./walk";
import { createDrop } from "./drop";
import { createJump } from "./jump";

// An action is a top-level one-shot: it composes parallel body-part animations under one
// duration, then mode resumes. Animations are keyed by capability so they slot into the
// existing engine machinery; when the action ends, each capability eases back to rest.
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
  locomotion?: {
    direction: WalkDirection;
    travelBodyWidths: number; // horizontal screen travel in body-widths; pixels resolved component-side (needs scale)
    rampStartMs: number;
    rampEndMs: number;
    accelMs: number; // fixed ease-in/ease-out duration for the body.x slide (trapezoidal profile)
    arrive?: boolean; // come: slide from the offset INTO the anchor (no net displacement) vs walk's offset-FROM
  };
  // Present only for `drop`: the vertical free-fall. The component drives body.y from `offsetBodyWidths`
  // above the anchor down to it over `fallMs` with a gravity profile, then the landing crouch (in
  // `animations`) absorbs the impact. No net displacement — Tally lands on the anchor.
  descent?: {
    offsetBodyWidths: number;
    fallMs: number;
  };
  // Present only for `jump`: the vertical hop. The component drives body.y as a symmetric parabola
  // (0 → -peak apex → 0) over `airMs`, starting `airStartMs` into the action (after the anticipation
  // crouch). No net displacement — Tally returns to the anchor.
  ascent?: {
    peakBodyWidths: number;
    airStartMs: number;
    airMs: number;
  };
  // Window (ms, relative to action start) during which the four flail capabilities are driven; outside
  // it they release to rest so the engine eases the limbs back. drop flails from t=0 to landing; jump
  // flails only while airborne. Both end the window the moment the landing crouch begins.
  flailWindow?: {
    startMs: number;
    endMs: number;
  };
};

// Actions are triggered by a spec object rather than a bare name, because some actions take
// parameters (walk needs a direction and a distance). Discriminated on `name`.
//
// walk vs come (inverse): walk leaves the anchor and travels `distance` away (net displacement);
// come is an ENTRANCE — Tally starts `distance` off the anchor on the given side and walks IN to
// the anchor, ending exactly there (no net displacement). `direction` for come is the side Tally
// comes FROM; distance is in the same body-widths as walk.
export type ActionSpec = (
  | { name: "disagree" }
  | { name: "agree" }
  | { name: "walk"; direction: WalkDirection; distance: number }
  | { name: "come"; direction: WalkDirection; distance: number }
  | { name: "drop"; distance: number }
  | { name: "jump" }
  | { name: "greet" }
  | { name: "shrug" }
  | { name: "hangHead" }
) & {
  // Opt-in preemption. When this spec is dispatched while another action is in flight AND the active
  // action is a pure gesture, it preempts immediately (and flushes any queued spec) instead of
  // queueing behind it — used for user-triggered actions that shouldn't lag behind an idle gesture.
  // Ignored (falls back to the default queue) when the active action is locomotion/vertical, whose
  // net body.x/body.y side effect is settled only on completion — see isPureGesture. Absent = the
  // default non-interrupting queue-behind behavior.
  interrupt?: boolean;
};

export type ActionName = ActionSpec["name"];

// walk/come commit a net body.x move, and drop/jump drive a body.y excursion — both settled ONLY in
// the completion timer (see the action lifecycle in Tally). Preempting one mid-flight would strand
// walkStateRef/verticalRef and snap the figure, so `interrupt` is honored only against pure gestures
// (every other action touches solely reset-to-rest capabilities and tears down cleanly).
const NET_EFFECT_ACTIONS = new Set<ActionName>(["walk", "come", "drop", "jump"]);
export const isPureGesture = (name: ActionName): boolean => !NET_EFFECT_ACTIONS.has(name);

// Each call creates fresh closures so the action can re-fire from a clean state.
export function createAction(spec: ActionSpec, walkMsPerBodyWidth?: number): Action {
  switch (spec.name) {
    case "disagree":
      // Head shake only (no arms) — the head-turn "no", mirroring agree's head-only nod.
      return {
        duration: SHAKE_HEAD_DURATION_MS,
        animations: {
          "head.turn": createShakeHeadAnimation(),
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
    case "greet":
      // Like disagree minus the head shake: raise the hand and wave it (forearm) while the head
      // bobs gently side-to-side, then everything settles back to rest. The hand stays raised
      // (RAISE_HAND_DURATION_MS) past the shorter wave/bob, exactly like disagree.
      return {
        duration: RAISE_HAND_DURATION_MS,
        animations: {
          "arms.left.raise": createRaiseHandAnimation(),
          "arms.left.wave": createWaveHandAnimation(),
          "head.bob": createGreetHeadBobAnimation(),
        },
      };
    case "shrug":
      // "I don't know" — both arms rise to a partial open palms-up pose while the head cocks slightly
      // to one side, then settle. A pure gesture like agree/greet (no translation, returns to rest);
      // built from arms.*.raise + head.bob so no shoulder capability is needed.
      return {
        duration: SHRUG_DURATION_MS,
        animations: {
          "arms.left.raise": createShrugRaiseAnimation(),
          "arms.right.raise": createShrugRaiseAnimation(),
          "head.bob": createShrugHeadBobAnimation(),
        },
      };
    case "hangHead":
      // Dejected beat — head tilts down + eyes fall to nearly shut, hold, then ease back to rest.
      // Pure gesture (no translation); head.tilt + eyes.blink only.
      return {
        duration: HANG_HEAD_DURATION_MS,
        animations: {
          "eyes.blink": createHangHeadBlinkAnimation(),
          "body.crouch": createHangHeadCrouchAnimation(),
          "head.tilt": createHangHeadTiltAnimation(),
        },
      };
    case "walk": {
      const walk = createWalk(spec.direction, spec.distance, walkMsPerBodyWidth);
      return {
        duration: walk.duration,
        animations: walk.animations,
        locomotion: {
          direction: spec.direction,
          travelBodyWidths: walk.travelBodyWidths,
          rampStartMs: walk.rampStartMs,
          rampEndMs: walk.rampEndMs,
          accelMs: walk.accelMs,
        },
      };
    }
    case "come": {
      // Inverse of walk: Tally enters from `distance` off the anchor on `direction`'s side and
      // walks IN to the anchor. The gait travels TOWARD the anchor — i.e. the opposite direction
      // — so reuse createWalk with the flipped direction; `arrive` makes body.x slide offset→0.
      const gaitDirection: WalkDirection = spec.direction === "left" ? "right" : "left";
      const walk = createWalk(gaitDirection, spec.distance, walkMsPerBodyWidth);
      return {
        duration: walk.duration,
        animations: walk.animations,
        locomotion: {
          direction: gaitDirection,
          travelBodyWidths: walk.travelBodyWidths,
          rampStartMs: walk.rampStartMs,
          rampEndMs: walk.rampEndMs,
          accelMs: walk.accelMs,
          arrive: true,
        },
      };
    }
    case "drop": {
      // Vertical mirror of come: free-fall from `distance` above and land on the anchor. The gait
      // is frantic per-limb flail (during the fall) + a landing crouch; the descent is component-side.
      const d = createDrop(spec.distance);
      return {
        duration: d.duration,
        animations: d.animations,
        descent: { offsetBodyWidths: d.offsetBodyWidths, fallMs: d.fallMs },
        flailWindow: { startMs: 0, endMs: d.fallMs }, // flail the whole fall; release at landing
      };
    }
    case "jump": {
      // Vertical hop, no net displacement: anticipation crouch → spring → parabolic arc → partial
      // landing crouch. Fixed height (knob lives in jump.ts). Flail applies only while airborne.
      const j = createJump();
      return {
        duration: j.duration,
        animations: j.animations,
        ascent: { peakBodyWidths: j.peakBodyWidths, airStartMs: j.airStartMs, airMs: j.airMs },
        flailWindow: { startMs: j.flailStartMs, endMs: j.flailEndMs },
      };
    }
  }
}
