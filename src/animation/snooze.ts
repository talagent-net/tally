import type { AnimationFn } from "./engine";

// Drives the `snooze` (asleep) mode. Like lookAround, ONE shared state machine feeds several
// capability drivers so they advance in lock-step within a frame (step() is idempotent per elapsed).
// On the first tick it captures the head's live pose (getInitialPose) and eases from there into the
// sleep pose over SETTLE_MS — so entering snooze *drifts off* smoothly instead of snapping (the engine
// applies animation values directly, with no ease-IN; only release-to-rest is eased, so the settle has
// to live here). After settling, body.crouch (and a tiny synced head nod) oscillate on a slow sine =
// breathing. Leaving snooze removes these drivers, so each capability eases back to rest as usual.

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Sleep-pose targets (capability values) — TWEAK ME ───────────────────────────────────────────
const SLEEP_BLINK = 0;          // eyes fully closed (eyes.blink: 1 = open, 0 = shut)
const SLEEP_TILT = 0.06;        // head tilted down (head.tilt: 0.5 = straight, 0 = looking down)
const SLEEP_BOB = 0.44;         // head lolls slightly to one side (head.bob: 0.5 = upright)
const SLEEP_ANTENNA = 0.12;     // antenna.wiggle pushed off-rest so the antenna droops limp (with its rest lean)
const SLEEP_CROUCH_BASE = 0.12; // resting crouch the breathing oscillates around (0 = standing)

const SETTLE_MS = 900;          // ease from the live pose into the sleep pose (how long "drifting off" takes)

// ── Breathing — a slow sine on body.crouch, with a tiny synced head nod. sin(0)=0 at the settle
// start, so it phases in with no jump. ──────────────────────────────────────────────────────────
const BREATH_PERIOD_MS = 4200;   // one full inhale+exhale
const BREATH_CROUCH_AMP = 0.05;  // body.crouch swings ± this around the base (the visible "breath") — shallow
const BREATH_TILT_AMP = 0.014;   // head dips ± this in sync (very subtle)

export type SnoozeAnimation = {
  blink: AnimationFn;
  headTilt: AnimationFn;
  headBob: AnimationFn;
  antennaWiggle: AnimationFn;
  bodyCrouch: AnimationFn;
};

export type SnoozeConfig = {
  // Pose to START easing FROM, captured lazily on the first tick (so capabilities hold their live
  // values by then). Lets snooze drift off from wherever the figure currently is — e.g. a hangout
  // look-around gaze — instead of snapping to the sleep pose. Defaults to each capability's rest.
  getInitialPose?: () => { blink: number; tilt: number; bob: number; antenna: number; crouch: number };
};

export function createSnoozeAnimation(config: SnoozeConfig = {}): SnoozeAnimation {
  const { getInitialPose } = config;

  let startElapsed: number | null = null;
  // Defaults are each capability's rest value, used when no initial pose is supplied.
  let fromBlink = 1, fromTilt = 0.5, fromBob = 0.5, fromAntenna = 0.5, fromCrouch = 0;

  let lastElapsed = -1;
  let curBlink = SLEEP_BLINK, curTilt = SLEEP_TILT, curBob = SLEEP_BOB;
  let curAntenna = SLEEP_ANTENNA, curCrouch = SLEEP_CROUCH_BASE;

  const step = (elapsed: number) => {
    if (elapsed === lastElapsed) return;
    lastElapsed = elapsed;

    if (startElapsed === null) {
      startElapsed = elapsed;
      if (getInitialPose) {
        const p = getInitialPose();
        fromBlink = p.blink;
        fromTilt = p.tilt;
        fromBob = p.bob;
        fromAntenna = p.antenna;
        fromCrouch = p.crouch;
      }
    }

    const settle = smoothstep(clamp01((elapsed - startElapsed) / SETTLE_MS));
    // Breathing — sine starts at 0, so its contribution grows in naturally as the settle completes.
    const breath = Math.sin((2 * Math.PI * (elapsed - startElapsed)) / BREATH_PERIOD_MS);
    const targetCrouch = SLEEP_CROUCH_BASE + breath * BREATH_CROUCH_AMP;
    const targetTilt = SLEEP_TILT + breath * BREATH_TILT_AMP;

    curBlink = fromBlink + (SLEEP_BLINK - fromBlink) * settle;
    curTilt = fromTilt + (targetTilt - fromTilt) * settle;
    curBob = fromBob + (SLEEP_BOB - fromBob) * settle;
    curAntenna = fromAntenna + (SLEEP_ANTENNA - fromAntenna) * settle;
    curCrouch = fromCrouch + (targetCrouch - fromCrouch) * settle;
  };

  return {
    blink: (e) => { step(e); return curBlink; },
    headTilt: (e) => { step(e); return curTilt; },
    headBob: (e) => { step(e); return curBob; },
    antennaWiggle: (e) => { step(e); return curAntenna; },
    bodyCrouch: (e) => { step(e); return curCrouch; },
  };
}
