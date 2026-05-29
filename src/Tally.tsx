import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colors as defaultColors } from "./colors";
import { AnimationProvider, useAnimationRenderer, useCapability, useCapabilityAnimation, useConflict } from "./animation/context";
import { createBlinkAnimation } from "./animation/blink";
import { createLookAroundAnimation } from "./animation/lookAround";
import { createAntennaWiggleAnimation } from "./animation/antennaWiggle";
import { createAction } from "./animation/actions";
import type { ActionSpec } from "./animation/actions";
import type { AnimationFn } from "./animation/engine";

const BLINK_KEY = "eyes.blink";
const HEAD_BOB_KEY = "head.bob";
const HEAD_TURN_KEY = "head.turn";
const HEAD_TILT_KEY = "head.tilt";
const ARMS_LEFT_RAISE_KEY = "arms.left.raise";
const ARMS_LEFT_WAVE_KEY = "arms.left.wave";
const ANTENNA_WIGGLE_KEY = "antenna.wiggle";
const BODY_TURN_KEY = "body.turn";
// Locomotion capabilities. body.x is the figure's net horizontal position in *scaled pixels* —
// it is persistent (does NOT reset to rest after an action), so the figure stays where it walked
// to. body.bounce (vertical step bounce) and body.lean (lean into the travel direction) are normal
// transient gait capabilities that reset to rest when a walk ends.
const BODY_X_KEY = "body.x";
const BODY_BOUNCE_KEY = "body.bounce";
const BODY_LEAN_KEY = "body.lean";
const LEGS_SWING_KEY = "legs.swing";
const ARMS_SWING_KEY = "arms.swing";
const MAX_HEAD_BOB_DEGREES = 18;

// Render-side magnitudes for the gait capabilities (normalized value → px / degrees), mirroring
// how head.tilt etc. keep their pixel/degree tuning at the read site.
const BODY_BOUNCE_PX = 7;      // peak vertical lift at body.bounce = 1 (unscaled px)
const BODY_LEAN_DEG = 7;    // peak lean at body.lean extremes (degrees), signed around 0.5
const LEG_SWING_DEG = 40;   // peak leg rotation at legs.swing extremes (degrees), anti-phase across legs
const ARM_SWING_DEG = 22;   // peak arm rotation at arms.swing extremes (degrees), anti-phase across arms & counter to legs
const HAND_WAVE_DEG = 25;   // peak forearm rotation at arms.left.wave extremes (degrees) — the disagree hand-wave

// head.tilt, head.turn, and body.turn all squash the head's geometry — head.tilt on the
// vertical axis, head.turn and body.turn (via the effective-head-turn sum) on the horizontal.
// Applying any two together looks broken. Declared once via useConflict — the engine handles
// the smooth handoff between them.
const HEAD_AXIS_CONFLICT = [HEAD_TILT_KEY, HEAD_TURN_KEY, BODY_TURN_KEY];

// Head renderers compute their "effective turn" from body.turn and head.turn combined.
// First version: head follows body 1:1 (head.turn capability stays at rest 0.5 by default,
// so effective = body.turn). When something drives head.turn off rest (e.g. shakeHead during
// disagree), it acts as a SIGNED OFFSET on top of body.turn. Clamped to [0, 1] to keep the
// downstream foreshortening math bounded.
const effectiveHeadTurn = (caps: ReadonlyMap<string, number>): number => {
  const head = caps.get(HEAD_TURN_KEY) ?? 0.5;
  const body = caps.get(BODY_TURN_KEY) ?? 0.5;
  return Math.max(0, Math.min(1, body + (head - 0.5)));
};

export type Mode = "hangout" | "jump" | "debug";

export interface ColorTheme {
  primary: string;
  primaryDark: string;
  primaryMid: string;
  outline: string;
}

export const defaultTheme: ColorTheme = {
  primary: defaultColors.primary,
  primaryDark: defaultColors.primaryDark,
  primaryMid: defaultColors.primaryMid,
  outline: "#2a2a2a",
};

export interface TallyProps {
  scale?: number;
  mode?: Mode;
  theme?: ColorTheme;
  showAnchor?: boolean;
  chestImage?: string;
  chestOutline?: string;
  // Debug overrides: a map of capability key → held value (0..1). Each listed capability is
  // pinned to its value regardless of mode, bypassing the regular mode animations. Multiple
  // independent capabilities can be held simultaneously.
  debugOverrides?: Record<string, number>;
  // One-shot actions override the mode for their duration. Pass a spec object, e.g.
  // { name: "agree" } or { name: "walk", direction: "right", distance: 2 }. The component
  // dedupes against the last-fired spec (by value), so to re-fire an identical action set this
  // to null then back. `walk` distance is in body-widths.
  action?: ActionSpec | null;
  // Fired when a walk action finishes, reporting the net horizontal move in scaled pixels
  // (signed: positive = rightward). The figure retains this displacement.
  onWalkComplete?: (deltaPx: number) => void;
}

const BASE = {
  width: 200,
  height: 240,
};

export function Tally(props: TallyProps) {
  return (
    <AnimationProvider>
      <TallyInner {...props} />
    </AnimationProvider>
  );
}

function TallyInner({ scale = 1, mode = "hangout", theme = defaultTheme, showAnchor = false, chestImage, chestOutline, debugOverrides, action, onWalkComplete }: TallyProps) {
  const s = (v: number) => v * scale;

  // Capabilities — declared once at the root with their rest values.
  useCapability(BLINK_KEY, 1);      // 1 = fully open
  useCapability(HEAD_BOB_KEY, 0.5); // 0.5 = centered, 0 = max left tilt, 1 = max right tilt
  useCapability(HEAD_TURN_KEY, 0.5); // 0.5 = looking straight, 0 = looking left, 1 = looking right
  useCapability(HEAD_TILT_KEY, 0.5); // 0.5 = looking straight, 0 = looking down, 1 = looking up
  useCapability(ARMS_LEFT_RAISE_KEY, 0); // 0 = arm at rest pose; 1 = raised to a "stop" gesture
  useCapability(ARMS_LEFT_WAVE_KEY, 0.5);// 0.5 = no wave; 0/1 = forearm rotated left/right at the elbow
  useCapability(ANTENNA_WIGGLE_KEY, 0.5); // 0.5 = no wiggle; 0/1 = max wiggle in either direction
  useCapability(BODY_TURN_KEY, 0.5); // 0.5 = facing forward; 0/1 = max body turn either way (head follows by default)
  useCapability(BODY_X_KEY, 0);      // net horizontal position in scaled px — persistent across actions
  useCapability(BODY_BOUNCE_KEY, 0);    // 0 = grounded; 1 = peak of a walk step bounce
  useCapability(BODY_LEAN_KEY, 0.5); // 0.5 = upright; 0/1 = lean left/right into travel
  useCapability(LEGS_SWING_KEY, 0.5);// 0.5 = neutral stance; 0/1 = legs at opposite ends of a step (anti-phase)
  useCapability(ARMS_SWING_KEY, 0.5);// 0.5 = arms at rest; 0/1 = arms at opposite ends of a swing (anti-phase, counter to legs)

  // head.tilt vs head.turn — the engine will smoothly unwind one when the other gets engaged.
  useConflict(HEAD_AXIS_CONFLICT);

  // Debug overrides — a map of capability key → held value. Each listed capability is driven by
  // its value (read live via a ref so closures stay stable), independently of the others, so
  // several non-conflicting capabilities can be pinned at once (e.g. hold body.turn sideways
  // while scrubbing legs.swing). Order in the useMemos below: action > debug override > mode
  // default. A key absent from the map makes debugAnimFor return null, so its mode default applies.
  // Written during render (not in an effect) on purpose: debugAnimFor recomputes when the key
  // SET changes and reads this ref to decide whether to install a capability's animation. If the
  // ref lagged a render behind (effect-updated), a freshly-checked capability wouldn't install
  // until the NEXT key-set change — the "slider works one capability late" bug. A latest-value
  // ref write in render is idempotent and safe here.
  const debugOverridesRef = useRef<Record<string, number>>(debugOverrides ?? {});
  debugOverridesRef.current = debugOverrides ?? {};

  // Identity changes only when the SET of overridden keys changes, so capability animations are
  // installed/removed as keys are toggled — but live value edits (same keys) don't churn effects.
  const debugKeysSig = debugOverrides ? Object.keys(debugOverrides).sort().join(",") : "";
  const debugAnimFor = useCallback(
    (key: string): AnimationFn | null =>
      debugOverridesRef.current[key] !== undefined ? () => debugOverridesRef.current[key] : null,
    [debugKeysSig],
  );

  // Persistent horizontal position. committedXRef is the net distance (scaled px) the figure has
  // walked so far — it survives every action. walkStateRef holds the in-progress stride during a
  // walk; the body.x capability value is committed + current-stride. On walk completion the stride
  // is folded into committedXRef and walkStateRef is cleared, so body.x reads the same value the
  // frame before and after the commit — no snap-back when the action's gait animations release.
  const committedXRef = useRef(0);
  const walkStateRef = useRef<{
    startElapsed: number | null;
    delta: number;
    rampStartMs: number;
    rampEndMs: number;
    accelMs: number;
  } | null>(null);
  // Stable closure so the engine installs it exactly once and never unwinds it (unlike the gait
  // capabilities, body.x must not reset to rest).
  //
  // The slide follows a TRAPEZOIDAL velocity profile across the stride window [rampStartMs,
  // rampEndMs]: velocity ramps 0→V over accelMs, holds V (constant-speed cruise), then ramps V→0
  // over accelMs. So the acceleration phase is a FIXED duration regardless of distance — a longer
  // walk just cruises longer. If the window can't fit accel + decel, both are scaled down
  // proportionally (the profile degrades to a triangle = pure ease-in-out). Position is the
  // integral of that velocity, normalised so the cruise speed works out to cover `delta` exactly.
  const bodyXAnimRef = useRef<AnimationFn>((elapsed) => {
    const w = walkStateRef.current;
    if (!w) return committedXRef.current;
    if (w.startElapsed === null) w.startElapsed = elapsed;
    const d = w.rampEndMs - w.rampStartMs; // stride duration
    const tt = elapsed - w.startElapsed - w.rampStartMs; // time into the stride
    let stride: number;
    if (tt <= 0) {
      stride = 0;
    } else if (tt >= d) {
      stride = w.delta;
    } else {
      let ta = w.accelMs; // ease-in duration
      let td = w.accelMs; // ease-out duration (symmetric)
      if (ta + td > d) {
        const f = d / (ta + td);
        ta *= f;
        td *= f;
      }
      const cruise = d - ta - td;
      // Distance (in "unit cruise speed" terms) under the velocity profile = denom; the final
      // position is delta, so scale position-units by delta/denom. Branches are safe for ta or td
      // = 0 (the corresponding ramp region is empty, so its divisor is never reached).
      const denom = ta / 2 + cruise + td / 2;
      let s: number;
      if (tt < ta) {
        s = (tt * tt) / (2 * ta); // accelerate: ½·(t/ta)·t
      } else if (tt < ta + cruise) {
        s = ta / 2 + (tt - ta); // cruise at unit speed
      } else {
        const tau = tt - (ta + cruise); // into the decel ramp
        s = ta / 2 + cruise + (tau - (tau * tau) / (2 * td)); // decelerate
      }
      stride = w.delta * (s / denom);
    }
    return committedXRef.current + stride;
  });
  useCapabilityAnimation(BODY_X_KEY, bodyXAnimRef.current);
  const locomotionRef = useLocomotionRef();

  // Action lifecycle. An active action plays to completion and is NOT interruptible. A trigger
  // that arrives while an action is in flight is held in a single queue slot (depth 1) and plays
  // when the current one finishes; a newer trigger replaces whatever is queued (latest-wins).
  // lastActionKeyRef dedupes the prop by value (specs are objects) — to fire an identical action,
  // the consumer sets the prop to null then back. Setting the prop to null is a no-op for
  // playback: it neither cancels the running action nor clears the queue, it just resets the
  // trigger so the same spec can re-fire.
  const lastActionKeyRef = useRef<string | null>(null);
  // The active action is wrapped with a per-activation `id` so EVERY activation is a fresh object,
  // even when the same spec reference is replayed back-to-back (e.g. queueing the same gesture that
  // just finished — the dev buttons reuse one spec object). Without this, setActive(sameSpecRef)
  // would be a no-op state update: activeAction wouldn't recompute, the completion effect wouldn't
  // re-run, no new timer would be scheduled, and the lifecycle would freeze stuck-busy forever.
  const activationCounterRef = useRef(0);
  const [active, setActive] = useState<{ spec: ActionSpec; id: number } | null>(null);
  const activate = useCallback((spec: ActionSpec | null) => {
    setActive(spec ? { spec, id: ++activationCounterRef.current } : null);
  }, []);
  // Latest-value ref so the prop effect can read whether an action is in flight without a stale
  // closure (written during render — see debugOverridesRef).
  const activeRef = useRef(active);
  activeRef.current = active;
  const queuedActionSpecRef = useRef<ActionSpec | null>(null);
  useEffect(() => {
    const key = action ? JSON.stringify(action) : null;
    if (key === lastActionKeyRef.current) return;
    lastActionKeyRef.current = key;
    if (!action) return; // null/clear is a no-op — doesn't interrupt or flush the queue
    if (activeRef.current === null) {
      activate(action); // idle → play now
    } else {
      queuedActionSpecRef.current = action; // busy → queue (replacing any prior queued)
    }
  }, [action, activate]);
  const activeAction = useMemo(
    () => (active ? createAction(active.spec) : null),
    [active],
  );
  useEffect(() => {
    if (!activeAction) return;
    // Locomotion actions arm the persistent body.x stride and commit their net move on completion.
    let walkDelta = 0;
    if (activeAction.locomotion) {
      const { direction, travelBodyWidths, rampStartMs, rampEndMs, accelMs } = activeAction.locomotion;
      const sign = direction === "right" ? 1 : -1;
      walkDelta = sign * travelBodyWidths * BODY_W * scale;
      walkStateRef.current = { startElapsed: null, delta: walkDelta, rampStartMs, rampEndMs, accelMs };
    }
    const timer = setTimeout(() => {
      if (activeAction.locomotion) {
        committedXRef.current += walkDelta;
        walkStateRef.current = null;
        onWalkComplete?.(walkDelta);
      }
      // Dequeue: play the queued action next if present, otherwise go idle.
      const next = queuedActionSpecRef.current;
      queuedActionSpecRef.current = null;
      activate(next);
    }, activeAction.duration);
    return () => clearTimeout(timer);
  }, [activeAction, scale, onWalkComplete, activate]);

  // eyes.blink — action > debug > (no ambient in debug mode) > hangout's random blinks.
  const blinkAnimation = useMemo(() => {
    if (activeAction?.animations[BLINK_KEY]) return activeAction.animations[BLINK_KEY];
    const dbg = debugAnimFor(BLINK_KEY);
    if (dbg) return dbg;
    if (mode === "debug") return null;
    return createBlinkAnimation();
  }, [activeAction, mode, debugAnimFor]);
  useCapabilityAnimation(BLINK_KEY, blinkAnimation);

  // head.tilt — action > debug. No mode-level animation.
  const headTiltAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_TILT_KEY]) return activeAction.animations[HEAD_TILT_KEY];
    return debugAnimFor(HEAD_TILT_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(HEAD_TILT_KEY, headTiltAnimation);

  // head.turn + head.bob — action overrides if it touches either; otherwise hangout runs
  // lookAround. lookAround is disabled while a action is active so its state machine resets
  // and the head settles cleanly during the action, with no leftover slide-in-progress when
  // the action ends. lookAround is also null in debug mode, so the null-fallback below acts
  // as "no ambient in debug mode" for these capabilities.
  const lookAround = useMemo(
    () => (mode === "hangout" && !activeAction ? createLookAroundAnimation() : null),
    [mode, activeAction],
  );

  // head.turn is an OFFSET on top of body.turn (renderers compute effective = sum). lookAround
  // drives it ambiently in hangout — the head wiggles around whatever angle the body is currently
  // at. Actions like shakeHead override and shake from that body angle too.
  const headTurnAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_TURN_KEY]) return activeAction.animations[HEAD_TURN_KEY];
    const dbg = debugAnimFor(HEAD_TURN_KEY);
    if (dbg) return dbg;
    return lookAround?.headTurn ?? null;
  }, [activeAction, debugAnimFor, lookAround]);
  useCapabilityAnimation(HEAD_TURN_KEY, headTurnAnimation);

  // body.turn has no mode-level idle — the body stays wherever it's last been pointed (rest by
  // default). Actions / debug / future deliberate body-turn animations drive it.
  const bodyTurnAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_TURN_KEY]) return activeAction.animations[BODY_TURN_KEY];
    const dbg = debugAnimFor(BODY_TURN_KEY);
    if (dbg) return dbg;
    return null;
  }, [activeAction, debugAnimFor]);
  // When the active action drives body.turn (e.g. walk), let it override the conflict-release
  // duration — walk passes 0 so the ambient head pose snaps to neutral and the body turns toward
  // travel immediately, instead of sliding while still facing the camera during the unwind.
  const bodyTurnReleaseMs = activeAction?.animations[BODY_TURN_KEY] ? activeAction.releaseMs : undefined;
  useCapabilityAnimation(BODY_TURN_KEY, bodyTurnAnimation, bodyTurnReleaseMs);

  // body.bounce + body.lean — gait capabilities driven only by a walk action (or debug). No
  // mode-level idle; they rest when nothing drives them, releasing cleanly after a walk.
  const bodyBounceAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_BOUNCE_KEY]) return activeAction.animations[BODY_BOUNCE_KEY];
    return debugAnimFor(BODY_BOUNCE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(BODY_BOUNCE_KEY, bodyBounceAnimation);

  const bodyLeanAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_LEAN_KEY]) return activeAction.animations[BODY_LEAN_KEY];
    return debugAnimFor(BODY_LEAN_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(BODY_LEAN_KEY, bodyLeanAnimation);

  const legsSwingAnimation = useMemo(() => {
    if (activeAction?.animations[LEGS_SWING_KEY]) return activeAction.animations[LEGS_SWING_KEY];
    return debugAnimFor(LEGS_SWING_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(LEGS_SWING_KEY, legsSwingAnimation);

  const armsSwingAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_SWING_KEY]) return activeAction.animations[ARMS_SWING_KEY];
    return debugAnimFor(ARMS_SWING_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_SWING_KEY, armsSwingAnimation);

  const headBobAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_BOB_KEY]) return activeAction.animations[HEAD_BOB_KEY];
    const dbg = debugAnimFor(HEAD_BOB_KEY);
    if (dbg) return dbg;
    return lookAround?.headBob ?? null;
  }, [activeAction, debugAnimFor, lookAround]);
  useCapabilityAnimation(HEAD_BOB_KEY, headBobAnimation);

  // arms.left.raise — action > debug. No mode-level animation.
  const armsLeftRaiseAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_LEFT_RAISE_KEY]) return activeAction.animations[ARMS_LEFT_RAISE_KEY];
    return debugAnimFor(ARMS_LEFT_RAISE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_LEFT_RAISE_KEY, armsLeftRaiseAnimation);

  // arms.left.wave — action > debug. The disagree hand-wave (forearm only).
  const armsLeftWaveAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_LEFT_WAVE_KEY]) return activeAction.animations[ARMS_LEFT_WAVE_KEY];
    return debugAnimFor(ARMS_LEFT_WAVE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_LEFT_WAVE_KEY, armsLeftWaveAnimation);

  // antenna.wiggle — action > debug > hangout's occasional damped wiggles. !activeAction
  // gating mirrors lookAround so actions interrupt cleanly; debug overrides regardless.
  const antennaWiggleAnimation = useMemo(() => {
    if (activeAction?.animations[ANTENNA_WIGGLE_KEY]) return activeAction.animations[ANTENNA_WIGGLE_KEY];
    const dbg = debugAnimFor(ANTENNA_WIGGLE_KEY);
    if (dbg) return dbg;
    if (mode === "hangout" && !activeAction) return createAntennaWiggleAnimation();
    return null;
  }, [activeAction, mode, debugAnimFor]);
  useCapabilityAnimation(ANTENNA_WIGGLE_KEY, antennaWiggleAnimation);

  return (
    <div
      style={{
        position: "relative",
        width: 0,
        height: 0,
        overflow: "visible",
      }}
    >
      {showAnchor && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 12,
            height: 12,
            backgroundColor: "#ff3300",
            zIndex: 999,
          }}
        />
      )}
      <div
        ref={locomotionRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: "visible",
        }}
      >
        <Body scale={scale} theme={theme} showAnchor={showAnchor} chestImage={chestImage} chestOutline={chestOutline}>
          <Head scale={scale} theme={theme} showAnchor={showAnchor}>
            <LeftEye scale={scale} theme={theme} />
            <RightEye scale={scale} theme={theme} />
            <LeftEar scale={scale} theme={theme} />
            <RightEar scale={scale} theme={theme} />
            <Antenna scale={scale} theme={theme} showAnchor={showAnchor} />
          </Head>
          <LeftArm scale={scale} theme={theme} showAnchor={showAnchor} />
          <RightArm scale={scale} theme={theme} showAnchor={showAnchor} />
          <LeftLeg scale={scale} theme={theme} showAnchor={showAnchor} />
          <RightLeg scale={scale} theme={theme} showAnchor={showAnchor} />
        </Body>
        <Shadow scale={scale} theme={theme} />
      </div>
    </div>
  );
}

const BODY_W = 52;
const BODY_H = 64;
const BODY_OFFSET = 12;
const BODY_RADIUS_TOP = 32;
const BODY_RADIUS_BOT = 24;
const BODY_BOTTOM = 15;
const BODY_PIVOT_X = (BODY_W + BODY_OFFSET) / 2;
const BODY_PIVOT_Y = (BODY_H + BODY_OFFSET) * 0.6;
const BODY_ROTATION = 0;
const CHEST_SIZE = 30;             // square — single dimension for both width and height
const CHEST_TOP_RATIO = 0.25;
const CHEST_TURN_MIN_RATIO = 0.15;  // chest width fraction at full body turn — foreshortens more aggressively than the body face, since the logo is a forward-facing decal and largely disappears in profile
const CHEST_TURN_SLIDE = 16;        // unscaled px the chest slides horizontally at full body turn — same direction as the turn
const BODY_TURN_RATIO = .84;  // visible body WIDTH fraction at full body turn — matches HEAD_TURN_RATIO for now

// Drives two body.turn effects on the chest: width shrinks linearly toward CHEST_TURN_MIN_RATIO,
// and the whole element slides horizontally in the SIGNED direction of the turn. The chest div
// uses left:50% + translateX(-50%) for centering — the renderer rewrites the full transform so
// the slide composes with the centering offset.
function useChestRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const bodyTurn = caps.get(BODY_TURN_KEY) ?? 0.5;
      const signedDistance = (bodyTurn - 0.5) * 2;
      const distance = Math.abs(signedDistance);
      const factor = 1 - distance * (1 - CHEST_TURN_MIN_RATIO);
      el.style.width = `${CHEST_SIZE * scale * factor}px`;
      const slideOffset = signedDistance * CHEST_TURN_SLIDE * scale;
      el.style.transform = `translateX(calc(-50% + ${slideOffset}px))`;
    },
    [scale],
  );
  useAnimationRenderer(render);
  return ref;
}

// Shrinks the body's shadow + main-face widths horizontally as body.turn moves away from 0.5
// and re-centers both around the body container's vertical axis. Inner main face keeps a
// constant pixel inset from the shadow (= BODY_OFFSET / 2 on each side) so the outline
// thickness stays uniform regardless of how much the body is turned. Children of Body (head,
// arms, legs) aren't repositioned by this renderer — that's a follow-up once the body shape
// shrink itself reads right.
function useBodyRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const bodyTurn = caps.get(BODY_TURN_KEY) ?? 0.5;
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      const turnFactor = 1 - distance * (1 - BODY_TURN_RATIO);

      const fullW = (BODY_W + BODY_OFFSET) * scale;
      const shadowW = fullW * turnFactor;
      const shadowLeft = (fullW - shadowW) / 2;
      const mainW = shadowW - BODY_OFFSET * scale;
      const mainLeft = shadowLeft + (BODY_OFFSET / 2) * scale;

      const shadow = el.firstElementChild as HTMLElement | null;
      if (shadow) {
        shadow.style.width = `${shadowW}px`;
        shadow.style.left = `${shadowLeft}px`;
      }
      const mainFace = el.children[1] as HTMLElement | null;
      if (mainFace) {
        mainFace.style.width = `${mainW}px`;
        mainFace.style.left = `${mainLeft}px`;
      }

      // Walk gait — vertical step bounce (body.bounce) and lean into the travel direction
      // (body.lean) compose into the body's own transform, on top of the static centering +
      // rotation. The shadow is a sibling of Body, so it neither bounces nor leans (stays grounded).
      const bounce = caps.get(BODY_BOUNCE_KEY) ?? 0;
      const lean = caps.get(BODY_LEAN_KEY) ?? 0.5;
      const leanDeg = (lean - 0.5) * 2 * BODY_LEAN_DEG;
      el.style.transform = `translateX(-50%) translateY(${-bounce * BODY_BOUNCE_PX * scale}px) rotate(${BODY_ROTATION + leanDeg}deg)`;
    },
    [scale],
  );
  useAnimationRenderer(render);
  return ref;
}

// Wraps Body + Shadow and slides the whole figure horizontally by body.x (scaled px). The
// wrapper is a zero-size box at the figure's origin, so its children keep their existing
// absolute positioning; only the translate moves. This is what persists a walk's displacement.
function useLocomotionRef() {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translateX(${caps.get(BODY_X_KEY) ?? 0}px)`;
  }, []);
  useAnimationRenderer(render);
  return ref;
}

function Body({
  scale = 1,
  theme,
  showAnchor = false,
  chestImage,
  chestOutline,
  children,
}: {
  scale: number;
  theme: ColorTheme;
  showAnchor?: boolean;
  chestImage?: string;
  chestOutline?: string;
  children: React.ReactNode;
}) {
  const s = (v: number) => v * scale;
  const bodyRef = useBodyRef(scale);
  const chestRef = useChestRef(scale);

  const baseRadius = (extra: number) =>
    `${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_BOT + extra)}px ${s(BODY_RADIUS_BOT + extra)}px`;

  return (
    <div
      ref={bodyRef}
      style={{
        position: "absolute",
        bottom: s(BODY_BOTTOM),
        left: "50%",
        transform: `translateX(-50%) rotate(${BODY_ROTATION}deg)`,
        transformOrigin: `${s(BODY_PIVOT_X)}px ${s(BODY_PIVOT_Y)}px`,
        width: s(BODY_W + BODY_OFFSET),
        height: s(BODY_H + BODY_OFFSET),
      }}
    >
      {/* Shadow — bottom-right */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: 0,
          left: 0,
          width: s(BODY_W + BODY_OFFSET),
          height: s(BODY_H + BODY_OFFSET),
          backgroundColor: theme.outline,
          borderRadius: baseRadius(BODY_OFFSET / 2),
        }}
      />
      {/* Main body face */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          top: s(BODY_OFFSET / 2),
          left: s(BODY_OFFSET / 2),
          width: s(BODY_W),
          height: s(BODY_H),
          backgroundColor: theme.primary,
          borderRadius: baseRadius(0),
        }}
      />
      {(chestImage || chestOutline) && (
        <div
          ref={chestRef}
          style={{
            position: "absolute",
            zIndex: 4,
            top: s(BODY_OFFSET / 2 + BODY_H * CHEST_TOP_RATIO),
            left: "50%",
            transform: "translateX(-50%)",
            width: s(CHEST_SIZE),
            height: s(CHEST_SIZE),
          }}
        >
          {/* Outline layer — outer image, tinted primaryDark */}
          {chestOutline && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: theme.primaryMid,
                WebkitMaskImage: `url(${chestOutline})`,
                maskImage: `url(${chestOutline})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
          )}
          {/* Fill layer — inner image, tinted primaryMid */}
          {chestImage && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: theme.outline,
                WebkitMaskImage: `url(${chestImage})`,
                maskImage: `url(${chestImage})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
          )}
        </div>
      )}
      {children}
      {showAnchor && <PivotMarker scale={scale} x={BODY_PIVOT_X} y={BODY_PIVOT_Y} />}
    </div>
  );
}

function useHeadRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;

    // head.bob — tilts the whole head left/right via rotation.
    const bob = caps.get(HEAD_BOB_KEY) ?? 0.5;
    const angle = (bob - 0.5) * 2 * MAX_HEAD_BOB_DEGREES;
    el.style.transform = `translateX(-50%) rotate(${HEAD_ROTATION + angle}deg)`;

    // head.turn — horizontal foreshortening. Width shrinks symmetrically around the center.
    // Side outlines stay constant thickness because the inner divs use constant pixel insets
    // from the (potentially shifted) base.
    const turn = effectiveHeadTurn(caps);
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const baseW = (HEAD_W + HEAD_OFFSET) * scale * turnFactor;
    const turnShift = ((HEAD_W + HEAD_OFFSET) * scale - baseW) / 2;
    const lightLeftInset = HEAD_OFFSET / 2;
    const lightSideMargin = HEAD_OFFSET * 9 / 8;
    const mainLeftInset = HEAD_OFFSET * HEAD_FACE_INSET;
    const mainSideMargin = HEAD_OFFSET * (2 - HEAD_FACE_INSET);

    // head.tilt — stylized rounded-box rotation. The apparent silhouette foreshortens at the
    // extremes (HEAD_TILT_RATIO < 1). Anchor follows tilt direction:
    //   tilt=1 (look up):   bottom-anchored — chin stays at body, crown drops down.
    //   tilt=0 (look down): top-anchored — crown stays put, chin pulls up.
    //   tilt=0.5 (rest):    no shift either way (baseH = original, so the term is 0).
    // anchorRatio = tilt directly interpolates between these — when tilt=0 the shift term
    // vanishes (top stays), when tilt=1 the shift term is the full positive delta (top moves
    // down by the full shrink amount). Smooth, no discontinuity at the rest point.
    // The margins are equal in both axes, so the same constant-inset trick works vertically.
    const tilt = remapTilt(caps.get(HEAD_TILT_KEY) ?? 0.5);
    const tiltFactor = (1 - HEAD_TILT_RATIO) * 2 * (.5 - Math.abs(tilt - .5)) + HEAD_TILT_RATIO;
    const baseH = (HEAD_H + HEAD_OFFSET) * scale * tiltFactor;
    const tiltShift = tilt * ((HEAD_H + HEAD_OFFSET) * scale - baseH);
    const lightTopInset = HEAD_OFFSET / 2;
    const lightVerticalMargin = HEAD_OFFSET * 9 / 8;
    const mainTopInset = HEAD_OFFSET * HEAD_FACE_INSET;
    const mainVerticalMargin = HEAD_OFFSET * (2 - HEAD_FACE_INSET);

    // Border-radius factors, per corner. Both axes are asymmetric:
    //   turn — the TRAILING horizontal side (away from the look direction) grows; the LEADING side
    //          stays at neutral. Look left (turn < 0.5) → right corners grow; look right → left.
    //   tilt — tilt down grows the TOP corners, tilt up grows the BOTTOM corners; other side rests.
    // CSS shorthand is `TL TR BR BL` (clockwise), so left corners = TL,BL and right = TR,BR.
    const turnDistance = Math.abs(turn - .5) * 2;
    const grownSide = 1 + turnDistance * (HEAD_TURN_RADIUS_GROW - 1);
    const lookingLeft = turn < 0.5;
    const leftTurnFactor = lookingLeft ? 1 : grownSide;   // left corners grow when looking right
    const rightTurnFactor = lookingLeft ? grownSide : 1;  // right corners grow when looking left
    const tiltDownDistance = Math.max(0, 0.5 - tilt) * 2;
    const tiltUpDistance = Math.max(0, tilt - 0.5) * 2;
    const topTiltFactor = 1 + tiltDownDistance * (HEAD_TILT_RADIUS_GROW - 1);
    const bottomTiltFactor = 1 + tiltUpDistance * (HEAD_TILT_RADIUS_GROW - 1);
    const tlFactor = leftTurnFactor * topTiltFactor;
    const trFactor = rightTurnFactor * topTiltFactor;
    const brFactor = rightTurnFactor * bottomTiltFactor;
    const blFactor = leftTurnFactor * bottomTiltFactor;
    const radiusShorthand = (baseR: number) =>
      `${baseR * tlFactor}px ${baseR * trFactor}px ${baseR * brFactor}px ${baseR * blFactor}px`;

    const headBase = el.firstElementChild as HTMLElement | null;
    if (headBase) {
      headBase.style.width = `${baseW}px`;
      headBase.style.height = `${baseH}px`;
      headBase.style.left = `${turnShift}px`;
      headBase.style.top = `${tiltShift}px`;
      headBase.style.borderRadius = radiusShorthand((HEAD_ROUNDNESS + HEAD_OFFSET / 2) * scale);
    }

    const headLight = el.children[1] as HTMLElement | null;
    if (headLight) {
      headLight.style.width = `${baseW - lightSideMargin * scale}px`;
      headLight.style.height = `${baseH - lightVerticalMargin * scale}px`;
      headLight.style.left = `${turnShift + lightLeftInset * scale}px`;
      headLight.style.top = `${tiltShift + lightTopInset * scale}px`;
      headLight.style.borderRadius = radiusShorthand(HEAD_ROUNDNESS * scale);
    }

    const headMain = el.children[2] as HTMLElement | null;
    if (headMain) {
      headMain.style.width = `${baseW - mainSideMargin * scale}px`;
      headMain.style.height = `${baseH - mainVerticalMargin * scale}px`;
      headMain.style.left = `${turnShift + mainLeftInset * scale}px`;
      headMain.style.top = `${tiltShift + mainTopInset * scale}px`;
      headMain.style.borderRadius = radiusShorthand((HEAD_ROUNDNESS - HEAD_OFFSET * (1 - HEAD_FACE_INSET)) * scale);
    }
  }, [scale]);
  useAnimationRenderer(render);
  return ref;
}

const HEAD_W = 120;
const HEAD_H = 90;
const HEAD_OFFSET = 12;
const HEAD_ROUNDNESS = 36;
const HEAD_TOP = -85;
const HEAD_FACE_INSET = 0.7;
const HEAD_PIVOT_X = (HEAD_W + HEAD_OFFSET) / 2;
const HEAD_PIVOT_Y = (HEAD_H + HEAD_OFFSET) * 0.85;
const HEAD_ROTATION = 0;
const HEAD_TURN_RATIO = .75;
// On head.turn, the two TRAILING corners (the side away from the look direction) grow their
// border-radius by up to this multiplier at the extreme; the two LEADING corners stay at their
// neutral radius. Mirrored per direction — look left → right corners grow, look right → left
// corners grow. (Replaces the old uniform-shrink behavior; >1 = grow, 1 = no change.)
const HEAD_TURN_RADIUS_GROW = 1.4;
// Tilting a rounded-box head (think: stylized robot) foreshortens the visible silhouette
// vertically — HEAD_TILT_RATIO < 1 (shrink). Bottom-anchored — chin stays attached to the
// body, the crown comes down. Border-radius is asymmetric: tilting down makes the TOP corners
// grow (the back of the head is curving over into view), tilting up makes the BOTTOM corners
// grow (mirror — underside of the chin curving forward). The unaffected side stays at rest.
const HEAD_TILT_RATIO = 0.92;             // visible head HEIGHT fraction at full tilt (<1 = shorter)
const HEAD_TILT_RADIUS_GROW = 1.25;        // border-radius multiplier on the corners exposed by the tilt direction

// head.tilt's input range [0, 1] is remapped to a narrower rendered range at read time. The
// raw extremes push the geometry past where it looks good (eyes flatten too much, head growth
// goes too far, antenna sinks unnaturally), so we compress what the value actually means in
// rendering. External semantic is unchanged: animations and the slider still produce 0..1,
// 0.5 is still neutral — the visual extremes are just softer. Apply `remapTilt(raw)` wherever
// head.tilt is read from caps.
const HEAD_TILT_RENDER_MIN = 0.3;
const HEAD_TILT_RENDER_MAX = 0.7;
const remapTilt = (raw: number) =>
  HEAD_TILT_RENDER_MIN + raw * (HEAD_TILT_RENDER_MAX - HEAD_TILT_RENDER_MIN);

function Head({
  scale = 1,
  theme,
  showAnchor = false,
  children,
}: {
  scale: number;
  theme: ColorTheme;
  showAnchor?: boolean;
  children: React.ReactNode;
}) {
  const s = (v: number) => v * scale;
  const headRef = useHeadRef(scale);

  return (
    <div
      ref={headRef}
      style={{
        position: "absolute",
        zIndex: 5,
        top: s(HEAD_TOP),
        left: "50%",
        transform: `translateX(-50%) rotate(${HEAD_ROTATION}deg)`,
        transformOrigin: `${s(HEAD_PIVOT_X)}px ${s(HEAD_PIVOT_Y)}px`,
        width: s(HEAD_W + HEAD_OFFSET),
        height: s(HEAD_H + HEAD_OFFSET),
      }}
    >
      {/* Head base */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: s(HEAD_W + HEAD_OFFSET),
          height: s(HEAD_H + HEAD_OFFSET),
          backgroundColor: theme.outline,
          borderRadius: s(HEAD_ROUNDNESS + HEAD_OFFSET / 2),
        }}
      />
      {/* Highlight — middle layer, top-left */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: s(HEAD_OFFSET / 2),
          left: s(HEAD_OFFSET / 2),
          width: s(HEAD_W - HEAD_OFFSET / 8),
          height: s(HEAD_H - HEAD_OFFSET / 8),
          backgroundColor: theme.primaryMid,
          borderRadius: s(HEAD_ROUNDNESS),
        }}
      />
      {/* Main face — top layer, centered, slightly smaller */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          top: s(HEAD_OFFSET * HEAD_FACE_INSET),
          left: s(HEAD_OFFSET * HEAD_FACE_INSET),
          width: s(HEAD_W - HEAD_OFFSET * (1 - HEAD_FACE_INSET)),
          height: s(HEAD_H - HEAD_OFFSET * (1 - HEAD_FACE_INSET)),
          background: `linear-gradient(135deg, ${theme.primaryMid} 0%, ${theme.primary} 40%, ${theme.primaryDark} 100%)`,
          borderRadius: s(HEAD_ROUNDNESS - HEAD_OFFSET * (1 - HEAD_FACE_INSET)),
        }}
      />
      {children}
      {showAnchor && <PivotMarker scale={scale} x={HEAD_PIVOT_X} y={HEAD_PIVOT_Y} />}
    </div>
  );
}

const EYE_W = 16;
const EYE_H = 28;
const EYE_TOP_RATIO = 0.55;
const EYE_SIDE_RATIO = 0.24;
const PUPIL_W = 8;
const PUPIL_H = 20;
const EYE_OFFSET_V = EYE_H - PUPIL_H;   // constant top+bottom pupil margin (4px each side)
const EYE_OFFSET_H = EYE_W - PUPIL_W;   // constant left+right pupil margin (4px each side)
const MAX_BLINK_CLOSE = .84;
const EYE_TURN_W_RATIO = 0.24;           // min eye-width fraction at full turn
const EYE_TURN_SLIDE_GAZE = 26;         // base slide (unscaled px) both eyes get toward the gaze
const EYE_TURN_SLIDE_CONVERGENCE = 24;  // extra slide each eye gets toward face center → far eye nets more travel
const EYE_TILT_H_RATIO = 0.7;             // min eye-height fraction at full tilt — vertical analog of EYE_TURN_W_RATIO
const EYE_TILT_PERSPECTIVE_POWER = 3;     // ease-in power for height shrink — 2 = gentle, 3 = aggressive (action concentrated at extremes)
const EYE_TILT_SLIDE_UP = 58;             // vertical slide (unscaled px) when tilt > 0.5 — eyes slide up by this much at tilt=1
const EYE_TILT_SLIDE_DOWN = 14;           // vertical slide (unscaled px) when tilt < 0.5 — eyes slide down by this much at tilt=0

// Shared eye renderer. Handles both eyes.blink (vertical) and head.turn (horizontal)
// in a single tick, on the same element + pupil child. `side` is the CSS property
// the eye is positioned with ("left" for LeftEye, "right" for RightEye).
function useEyeRefShared(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const blink = caps.get(BLINK_KEY) ?? 1;
    const turn = effectiveHeadTurn(caps);
    const tilt = remapTilt(caps.get(HEAD_TILT_KEY) ?? 0.5);

    // ==== VERTICAL: eyes.blink × head.tilt ====
    // Height is the product of two independent shrink factors (multiplicative compounding) —
    // a half-blink during a full tilt produces a thinner eye than either alone, naturally.
    // Top is the sum of three vertical offsets, applied in order: head-face tracking (eye
    // follows the foreshortened head face down toward the chin); a kinematic gaze slide
    // (ease-out-quad, moves the eye up at tilt=1 / down at tilt=0); and a centering shift that
    // keeps the eye anchored on its rest centerline as it shrinks vertically.
    const blinkHeightFactor = blink * MAX_BLINK_CLOSE + (1 - MAX_BLINK_CLOSE);

    const signedTiltDistance = (tilt - 0.5) * 2;
    const tiltDistance = Math.abs(signedTiltDistance);
    const easedTiltGaze = 1 - (1 - tiltDistance) * (1 - tiltDistance);
    const easedTiltGazeSigned = Math.sign(signedTiltDistance) * easedTiltGaze;
    const easedTiltPerspective = Math.pow(tiltDistance, EYE_TILT_PERSPECTIVE_POWER);
    const tiltHeightFactor = 1 - easedTiltPerspective * (1 - EYE_TILT_H_RATIO);
    // Linear factor — must match the head shape rendering in useHeadRef so the eye tracks the
    // visible face exactly, not on the eye's own perspective curve.
    const headTiltFactor = (1 - HEAD_TILT_RATIO) * (1 - tiltDistance) + HEAD_TILT_RATIO;

    const eyeH = EYE_H * blinkHeightFactor * tiltHeightFactor;
    const heightShrink = EYE_H - eyeH;
    const eyeFaceTrackY = (HEAD_H + HEAD_OFFSET) * (1 - headTiltFactor) + HEAD_H * EYE_TOP_RATIO * headTiltFactor;
    // Pick the slide magnitude based on tilt direction so up/down can be tuned independently.
    const tiltSlideMagnitude = signedTiltDistance >= 0 ? EYE_TILT_SLIDE_UP : EYE_TILT_SLIDE_DOWN;
    const tiltGazeShift = -easedTiltGazeSigned * tiltSlideMagnitude;  // negative because tilt=1 = up = top decreases

    el.style.height = `${eyeH * scale}px`;
    el.style.top = `${(eyeFaceTrackY + tiltGazeShift + heightShrink / 2) * scale}px`;

    // ==== HORIZONTAL: head.turn ====
    // Two conceptually different motions, two different curves.
    // GAZE slide (kinematic — eyes tracking with the head's rotation): ease-out-quad. Fast off
    // neutral so both eyes commit to the gaze direction together. Both eyes share this term, so
    // they start a turn at identical velocity in the same direction.
    // PERSPECTIVE effects — width foreshortening AND spacing convergence (the differentiation
    // between near and far eye): ease-in-quad. Derivative is 0 at neutral, so neither effect
    // is active at the start of a turn; both ramp up as the head commits.
    const signedTurnDistance = (turn - 0.5) * 2;
    const turnDistance = Math.abs(signedTurnDistance);
    const easedTurnGaze = 1 - (1 - turnDistance) * (1 - turnDistance);
    const easedTurnGazeSigned = Math.sign(signedTurnDistance) * easedTurnGaze;
    const easedTurnPerspective = turnDistance * turnDistance;
    const eyeW = EYE_W * (1 - easedTurnPerspective * (1 - EYE_TURN_W_RATIO));
    const widthShrink = EYE_W - eyeW;
    const isLeft = side === "left";
    const screenDx =
      easedTurnGazeSigned * EYE_TURN_SLIDE_GAZE +
      (isLeft ? 1 : -1) * easedTurnPerspective * EYE_TURN_SLIDE_CONVERGENCE;
    const cssOffset =
      HEAD_W * EYE_SIDE_RATIO +
      widthShrink / 2 +
      (isLeft ? screenDx : -screenDx);
    el.style.width = `${eyeW * scale}px`;
    el.style[side] = `${cssOffset * scale}px`;

    // Pupil — constant-margin trick on both axes. `left` and `top` in initial styles are never
    // overwritten, so the 4px margin holds automatically as the parent shrinks. eyeH/eyeW already
    // incorporate all combined shrinks above.
    const pupil = el.firstElementChild as HTMLElement | null;
    if (pupil) {
      pupil.style.height = `${Math.max(0, eyeH - EYE_OFFSET_V) * scale}px`;
      pupil.style.width = `${Math.max(0, eyeW - EYE_OFFSET_H) * scale}px`;
    }
  }, [scale, side]);
  useAnimationRenderer(render);
  return ref;
}

function LeftEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const eyeRef = useEyeRefShared(scale, "left");

  return (
    <div
      ref={eyeRef}
      style={{
        position: "absolute",
        zIndex: 5,
        top: s(HEAD_H * EYE_TOP_RATIO),
        left: s(HEAD_W * EYE_SIDE_RATIO),
        width: s(EYE_W),
        height: s(EYE_H),
        backgroundColor: theme.primaryMid,
        borderRadius: s(EYE_W / 2),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: s((EYE_H - PUPIL_H) / 2),
          left: s((EYE_W - PUPIL_W) / 2),
          width: s(PUPIL_W),
          height: s(PUPIL_H),
          backgroundColor: theme.outline,
          borderRadius: s(PUPIL_W / 2),
        }}
      />
    </div>
  );
}

function RightEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const eyeRef = useEyeRefShared(scale, "right");

  return (
    <div
      ref={eyeRef}
      style={{
        position: "absolute",
        zIndex: 5,
        top: s(HEAD_H * EYE_TOP_RATIO),
        right: s(HEAD_W * EYE_SIDE_RATIO),
        width: s(EYE_W),
        height: s(EYE_H),
        backgroundColor: theme.primaryMid,
        borderRadius: s(EYE_W / 2),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: s((EYE_H - PUPIL_H) / 2),
          left: s((EYE_W - PUPIL_W) / 2),
          width: s(PUPIL_W),
          height: s(PUPIL_H),
          backgroundColor: theme.outline,
          borderRadius: s(PUPIL_W / 2),
        }}
      />
    </div>
  );
}

const EAR_TOP_RATIO = 0.42;
const EAR_HEIGHT_RATIO = 0.4;
const EAR_REST_W = HEAD_OFFSET;
const EAR_REST_OFFSET = HEAD_OFFSET / 2;  // small clearance so the dark ear doesn't bleed into the head face
const EAR_RADIUS_RATIO = 0.4;             // borderRadius = current width × this (grows with width)
const EAR_TURN_INWARD_RATIO = 0.25;       // how far inward the ear slides on a full turn (fraction of HEAD_W)
const EAR_HIDE_RATE = 3;                  // how quickly the ear disappears (higher = faster)
const EAR_HIDE_MIN_W = HEAD_OFFSET / 3;   // keep some width when fully hidden — smaller than outline so it stays masked
const EAR_TILT_SLIDE = 8;                 // vertical slide on full tilt (unscaled px) — ear slides with the gaze direction, no size change

// Shared shape math — `side` is the "left" or "right" CSS property name.
function useEarRefShared(scale: number, side: "left" | "right", hideWhenTurnGreater: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const turn = effectiveHeadTurn(caps);
    const tilt = remapTilt(caps.get(HEAD_TILT_KEY) ?? 0.5);
    const restOffset = -EAR_REST_OFFSET;
    const restRightEdge = restOffset + EAR_REST_W;

    // Which side is "growing" vs "hiding" depends on the ear.
    const hidingDistance = hideWhenTurnGreater ? Math.max(0, turn - 0.5) * 2 : Math.max(0, 0.5 - turn) * 2;
    const growingDistance = hideWhenTurnGreater ? Math.max(0, 0.5 - turn) * 2 : Math.max(0, turn - 0.5) * 2;

    let w: number;
    let offset: number;
    if (hidingDistance > 0) {
      // Shrink toward a minimum width, and slide inward following the head's turn-shift so the
      // ear stays masked by the (now-shifted) outline instead of hovering outside it.
      const hide = Math.max(0, 1 - hidingDistance * EAR_HIDE_RATE);
      w = Math.max(EAR_HIDE_MIN_W, EAR_REST_W * hide);
      const headTurnShift = (HEAD_W + HEAD_OFFSET) * (hidingDistance / 2) * (1 - HEAD_TURN_RATIO);
      offset = restRightEdge - w + headTurnShift;
    } else {
      // Grow toward a square earphone-cup shape and slide inward from the side.
      const targetW = HEAD_H * EAR_HEIGHT_RATIO;
      const targetOffset = HEAD_W * EAR_TURN_INWARD_RATIO;
      w = EAR_REST_W + (targetW - EAR_REST_W) * growingDistance;
      offset = restOffset + (targetOffset - restOffset) * growingDistance;
    }

    el.style.width = `${w * scale}px`;
    el.style[side] = `${offset * scale}px`;
    el.style.borderRadius = `${w * EAR_RADIUS_RATIO * scale}px`;
    // Above the head face so the ear is visible once it slides onto the head.
    el.style.zIndex = "4";

    // head.tilt — small vertical slide in the gaze direction. No size change, no horizontal
    // change. tilt=1 (look up) → slide up (top decreases); tilt=0 (look down) → slide down.
    const tiltSlide = -(tilt - 0.5) * 2 * EAR_TILT_SLIDE;
    el.style.top = `${(HEAD_H * EAR_TOP_RATIO + tiltSlide) * scale}px`;
  }, [scale, side, hideWhenTurnGreater]);
  useAnimationRenderer(render);
  return ref;
}

function LeftEar({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const earRef = useEarRefShared(scale, "left", false);

  return (
    <div
      ref={earRef}
      style={{
        position: "absolute",
        zIndex: 4,
        top: s(HEAD_H * EAR_TOP_RATIO),
        left: s(-EAR_REST_OFFSET),
        width: s(EAR_REST_W),
        height: s(HEAD_H * EAR_HEIGHT_RATIO),
        backgroundColor: theme.outline,
        borderRadius: `${s(EAR_REST_W * EAR_RADIUS_RATIO)}px`,
      }}
    />
  );
}

function RightEar({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const earRef = useEarRefShared(scale, "right", true);

  return (
    <div
      ref={earRef}
      style={{
        position: "absolute",
        zIndex: 4,
        top: s(HEAD_H * EAR_TOP_RATIO),
        right: s(-EAR_REST_OFFSET),
        width: s(EAR_REST_W),
        height: s(HEAD_H * EAR_HEIGHT_RATIO),
        backgroundColor: theme.outline,
        borderRadius: `${s(EAR_REST_W * EAR_RADIUS_RATIO)}px`,
      }}
    />
  );
}

const PIVOT_SIZE = 8;

function PivotMarker({ scale, x, y }: { scale: number; x: number; y: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x * scale - PIVOT_SIZE / 2,
        top: y * scale - PIVOT_SIZE / 2,
        width: PIVOT_SIZE,
        height: PIVOT_SIZE,
        backgroundColor: "#ff8800",
        zIndex: 999,
      }}
    />
  );
}

const ANTENNA_W = 9;
const ANTENNA_H = 38;
const ANTENNA_TOP = -28;
const ANTENNA_RIGHT = 18;
const ANTENNA_RADIUS = 3;
const ANTENNA_ANGLE = -15;
const ANTENNA_TURN_ANGLE_DELTA = 8;
const ANTENNA_TILT_H_RATIO = 0.5;             // height fraction at full tilt — perspective foreshortening of the antenna stick
const ANTENNA_TILT_SLIDE = 18;                 // vertical slide (unscaled px) of the WHOLE antenna at full tilt — base sinks down too
const ANTENNA_TILT_Z_FRONT = 6;               // z-index when looking down (antenna swings toward viewer, in front of head)
const ANTENNA_TILT_Z_BEHIND = -1;             // z-index when looking up (antenna falls behind head outline)
const ANTENNA_WIGGLE_AMPLITUDE_DEG = 25;      // max wiggle rotation offset at antenna.wiggle = 0 or 1 (added to the existing turn-driven angle)

function useAntennaRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const turn = effectiveHeadTurn(caps);
    const tilt = remapTilt(caps.get(HEAD_TILT_KEY) ?? 0.5);

    // Position: stay glued to the visible head's right edge as it turns AND track the head's
    // top edge as it foreshortens vertically on tilt (antenna sits on the crown).
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const turnShift = (HEAD_W + HEAD_OFFSET) * Math.abs(turn - .5) * (1 - HEAD_TURN_RATIO);
    const baseW = (HEAD_W + HEAD_OFFSET) * turnFactor;
    const restAntennaRight = HEAD_OFFSET / 2 + ANTENNA_RIGHT;
    el.style.right = `${((HEAD_W + HEAD_OFFSET) + restAntennaRight - turnShift - baseW) * scale}px`;

    // head.tilt — three effects on the antenna:
    //   1. foreshortening (height shrinks) — the stick compresses out of the picture plane.
    //   2. whole-antenna slide DOWN — the base sinks toward the head as the crown rotates
    //      out of view. Symmetric at both extremes.
    //   3. z-index switch — looking down puts the antenna in front of the head; looking up
    //      swings it behind the head outline.
    // The shrink (1) is bottom-anchored relative to the antenna itself, so its top moves down.
    // The slide (2) adds an additional drop to BOTH ends. Net result at extreme: top moves down
    // by shrink + slide; base moves down by slide.
    const tiltDistance = Math.abs(tilt - 0.5) * 2;
    const antennaHFactor = 1 - tiltDistance * (1 - ANTENNA_TILT_H_RATIO);
    const antennaH = ANTENNA_H * antennaHFactor;
    const antennaShrink = ANTENNA_H - antennaH;
    const antennaTiltSlide = tiltDistance * ANTENNA_TILT_SLIDE;
    el.style.height = `${antennaH * scale}px`;
    el.style.top = `${(ANTENNA_TOP + antennaShrink + antennaTiltSlide) * scale}px`;
    el.style.zIndex = `${tilt < 0.5 ? ANTENNA_TILT_Z_FRONT : ANTENNA_TILT_Z_BEHIND}`;

    // Angle: rest lean fades out toward the extremes, replaced by a signed offset
    // pointing in the head's gaze direction (forward lean).
    // turn=0.5 → ANTENNA_ANGLE (default left lean).
    // turn=1   → +ANTENNA_TURN_ANGLE_DELTA → tilts right (with the gaze).
    // turn=0   → -ANTENNA_TURN_ANGLE_DELTA → tilts left (with the gaze).
    const distance = Math.abs(turn - 0.5) * 2;
    const signedOffset = (turn - 0.5) * 2 * ANTENNA_TURN_ANGLE_DELTA;
    // antenna.wiggle adds an extra rotation offset around the same bottom-center pivot.
    // Composes additively with the turn-driven angle so they can both apply at the same time
    // without interfering — head turning AND antenna wiggling render correctly together.
    const wiggle = caps.get(ANTENNA_WIGGLE_KEY) ?? 0.5;
    const wiggleAngle = (wiggle - 0.5) * 2 * ANTENNA_WIGGLE_AMPLITUDE_DEG;
    el.style.transform = `rotate(${ANTENNA_ANGLE * (1 - distance) + signedOffset + wiggleAngle}deg)`;
  }, [scale]);
  useAnimationRenderer(render);
  return ref;
}

function Antenna({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const antennaRef = useAntennaRef(scale);

  return (
    <div
      ref={antennaRef}
      style={{
        position: "absolute",
        zIndex: showAnchor ? 999 : 0,
        top: s(ANTENNA_TOP),
        right: s(HEAD_OFFSET / 2 + ANTENNA_RIGHT),
        width: s(ANTENNA_W),
        height: s(ANTENNA_H),
        backgroundColor: theme.outline,
        borderRadius: s(ANTENNA_RADIUS),
        transformOrigin: "bottom center",
        transform: `rotate(${ANTENNA_ANGLE}deg)`,
      }}
    >
      {showAnchor && <PivotMarker scale={scale} x={ANTENNA_W / 2} y={ANTENNA_H} />}
    </div>
  );
}

const ARM_UPPER_W = 24;
const ARM_UPPER_H = 48;
const ARM_LOWER_W = 24;
const ARM_LOWER_H = 40;
const ARM_OFFSET = 12;
const ARM_SHOULDER_RATIO = 0.15;
const SHOULDER_TURN_INWARD = 16;  // max unscaled px each shoulder anchor moves toward body center at full body.turn

const LEFT_UPPER_ANGLE = 25;
const RIGHT_UPPER_ANGLE = -25;
const LEFT_LOWER_ANGLE = -15;
const RIGHT_LOWER_ANGLE = 15;

// Target angles for the LeftArm at arms.left.raise = 1. Interpolated linearly from the rest
// angles above. Tuned for a "stop" gesture: upper arm rotated up-and-outward, lower arm bent
// at the elbow so the forearm is roughly vertical and the hand sits at face level.
const LEFT_UPPER_RAISED_ANGLE = 45;
const LEFT_LOWER_RAISED_ANGLE = 130;

// Shared renderer for both layers (outer outline + inner face) of an arm, for either side. The
// wrapper div carries the ref; the renderer walks its children and sets each upper's transform
// plus the corresponding lower's transform (the lower is the upper's firstElementChild — both
// layers have the lower as their first child even when showAnchor adds a sibling PivotMarker).
// Drives: body.turn inward shift; arms.swing (rotate the whole arm from the shoulder, anti-phase
// across the two arms and counter to the same-side leg — so left arm swings forward as left leg
// goes back); and, left arm only, the arms.left.raise "stop" gesture composed on top.
function useArmRef(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const isLeft = side === "left";

      // body.turn — shift the entire arm wrapper inward by sliding its edge toward center.
      const bodyTurn = caps.get(BODY_TURN_KEY) ?? 0.5;
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      el.style[side] = `${distance * SHOULDER_TURN_INWARD * scale}px`;

      // arms.swing — rotate the upper arm about the shoulder. swingSign is the opposite of the
      // same-side leg's (legs: left +1 / right -1) so each arm counter-swings its leg.
      const swing = caps.get(ARMS_SWING_KEY) ?? 0.5;
      const swingSign = isLeft ? -1 : 1;
      const swingDelta = swingSign * (swing - 0.5) * 2 * ARM_SWING_DEG;

      // arms.left.raise — left arm only; the "stop" gesture composes on top of the rest pose.
      const raise = isLeft ? (caps.get(ARMS_LEFT_RAISE_KEY) ?? 0) : 0;
      const restUpper = isLeft ? LEFT_UPPER_ANGLE : RIGHT_UPPER_ANGLE;
      const restLower = isLeft ? LEFT_LOWER_ANGLE : RIGHT_LOWER_ANGLE;
      const upperAngle = restUpper + raise * (LEFT_UPPER_RAISED_ANGLE - LEFT_UPPER_ANGLE) + swingDelta;
      // arms.left.wave — left arm only; rotates the FOREARM about the elbow (upper arm/elbow stay
      // put), waving the hand side to side. Composes on top of the raised forearm angle.
      const wave = isLeft ? (caps.get(ARMS_LEFT_WAVE_KEY) ?? 0.5) : 0.5;
      const waveDelta = (wave - 0.5) * 2 * HAND_WAVE_DEG;
      const lowerAngle = restLower + raise * (LEFT_LOWER_RAISED_ANGLE - LEFT_LOWER_ANGLE) + waveDelta;

      for (let i = 0; i < el.children.length; i++) {
        const upper = el.children[i] as HTMLElement;
        upper.style.transform = `rotate(${upperAngle}deg)`;
        const lower = upper.firstElementChild as HTMLElement | null;
        if (lower) lower.style.transform = `rotate(${lowerAngle}deg)`;
      }
    },
    [scale, side],
  );
  useAnimationRenderer(render);
  return ref;
}

function LeftArm({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const armRef = useArmRef(scale, "left");

  return (
    <div
      ref={armRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: "visible",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: s(BODY_H * ARM_SHOULDER_RATIO),
          left: 0,
          width: s(ARM_UPPER_W),
          height: s(ARM_UPPER_H),
          backgroundColor: theme.outline,
          borderRadius: s(ARM_UPPER_W / 2),
          // Shoulder pivot: inner (right) edge, top
          transformOrigin: `${s(ARM_UPPER_W / 2)}px ${s(ARM_UPPER_W / 2)}px`,
          transform: `rotate(${LEFT_UPPER_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(ARM_UPPER_H - ARM_LOWER_W),
            left: 0,
            width: s(ARM_LOWER_W),
            height: s(ARM_LOWER_H),
            backgroundColor: theme.outline,
            borderRadius: s(ARM_LOWER_W / 2),
            // Elbow pivot: center top
            transformOrigin: `${s(ARM_UPPER_W / 2)}px ${s(ARM_LOWER_W / 2)}px`,
            transform: `rotate(${LEFT_LOWER_ANGLE}deg)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: showAnchor ? 999 : 2,
          top: s((BODY_H * ARM_SHOULDER_RATIO) + ARM_OFFSET / 2),
          left: s(ARM_OFFSET / 2),
          width: s(ARM_UPPER_W - ARM_OFFSET),
          height: s(ARM_UPPER_H - ARM_OFFSET),
          backgroundColor: theme.primary,
          borderRadius: s(ARM_UPPER_W / 2),
          // Shoulder pivot: inner (right) edge, top
          transformOrigin: `${s((ARM_UPPER_W - ARM_OFFSET) / 2)}px ${s((ARM_UPPER_W - ARM_OFFSET) / 2)}px`,
          transform: `rotate(${LEFT_UPPER_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(ARM_UPPER_H - ARM_LOWER_W),
            left: 0,
            width: s(ARM_LOWER_W - ARM_OFFSET),
            height: s(ARM_LOWER_H - ARM_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: s(ARM_LOWER_W / 2),
            // Elbow pivot: center top
            transformOrigin: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px`,
            transform: `rotate(${LEFT_LOWER_ANGLE}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(ARM_LOWER_W - ARM_OFFSET) / 2} y={(ARM_LOWER_W - ARM_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(ARM_UPPER_W - ARM_OFFSET) / 2} y={(ARM_UPPER_W - ARM_OFFSET) / 2} />}
      </div>
    </div>
  );
}

function RightArm({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const armRef = useArmRef(scale, "right");

  return (
    <div
      ref={armRef}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: 0,
        overflow: "visible",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: s(BODY_H * ARM_SHOULDER_RATIO),
          right: 0,
          width: s(ARM_UPPER_W),
          height: s(ARM_UPPER_H),
          backgroundColor: theme.outline,
          borderRadius: s(ARM_UPPER_W / 2),
          // Shoulder pivot: inner (left) edge, top
          transformOrigin: `${s(ARM_UPPER_W / 2)}px ${s(ARM_UPPER_W / 2)}px`,
          transform: `rotate(${RIGHT_UPPER_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(ARM_UPPER_H - ARM_LOWER_W),
            right: 0,
            width: s(ARM_LOWER_W),
            height: s(ARM_LOWER_H),
            backgroundColor: theme.outline,
            borderRadius: s(ARM_LOWER_W / 2),
            // Elbow pivot: center top
            transformOrigin: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px`,
            transform: `rotate(${RIGHT_LOWER_ANGLE}deg)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: showAnchor ? 999 : 2,
          top: s((BODY_H * ARM_SHOULDER_RATIO) + ARM_OFFSET / 2),
          right: s(ARM_OFFSET / 2),
          width: s(ARM_UPPER_W - ARM_OFFSET),
          height: s(ARM_UPPER_H - ARM_OFFSET),
          backgroundColor: theme.primary,
          borderRadius: s(ARM_UPPER_W / 2),
          // Shoulder pivot: inner (left) edge, top
          transformOrigin: `${s((ARM_UPPER_W - ARM_OFFSET) / 2)}px ${s((ARM_UPPER_W - ARM_OFFSET) / 2)}px`,
          transform: `rotate(${RIGHT_UPPER_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(ARM_UPPER_H - ARM_LOWER_W),
            right: 0,
            width: s(ARM_LOWER_W - ARM_OFFSET),
            height: s(ARM_LOWER_H - ARM_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: s(ARM_LOWER_W / 2),
            // Elbow pivot: center top
            transformOrigin: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px`,
            transform: `rotate(${RIGHT_LOWER_ANGLE}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(ARM_LOWER_W - ARM_OFFSET) / 2} y={(ARM_LOWER_W - ARM_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(ARM_UPPER_W - ARM_OFFSET) / 2} y={(ARM_UPPER_W - ARM_OFFSET) / 2} />}
      </div>
    </div>
  );
}

const LEG_HIP_INSET = 0;
const LEG_W = 24;
const LEG_H = 36;
const HIP_TURN_INWARD = 12;  // max unscaled px each hip anchor moves toward body center at full body.turn
const LEG_HIP_TUCK = 26;
const FOOT_W = 32;
const FOOT_H = 24;
const LEG_OFFSET = 12;

const LEFT_LEG_ANGLE = 9;
const RIGHT_LEG_ANGLE = -9;
const LEFT_FOOT_ANGLE = -9;
const RIGHT_FOOT_ANGLE = 9;
const FOOT_TRAIL_INWARD = 0;    // unscaled px the TRAILING foot slides INWARD toward body center at full body.turn
const FOOT_LEAD_OUTWARD = 0;    // unscaled px the LEADING foot slides OUTWARD away from body center at full body.turn
const FOOT_REST_INSET = LEG_OFFSET * 0.25;  // CSS left/right value the foot sits at when at rest

// Leg renderer — hip-inward shift + foot horizontal slide. Feet move in opposite local
// directions so they don't cross:
//   TRAILING foot slides INWARD across its leg's local frame (toward body center).
//   LEADING foot slides OUTWARD across its leg's local frame (away from body center).
// The TRAILING contribution INCREASES the CSS prop value; the LEADING contribution DECREASES
// it. Only one of the two contributions is non-zero at a time.
function useLegRef(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const bodyTurn = caps.get(BODY_TURN_KEY) ?? 0.5;
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      const isLeft = side === "left";

      // Hip inward shift — slide the leg wrapper's edge toward body center as body.turn departs 0.5.
      el.style[side] = `${distance * HIP_TURN_INWARD * scale}px`;

      // legs.swing — rotate the whole leg about the hip, anti-phase across the two legs, so they
      // alternate during a walk. Composes on top of each leg's rest angle. Both upper-leg layers
      // (outline + face) share the angle; the foot rides along since it's their child.
      const swing = caps.get(LEGS_SWING_KEY) ?? 0.5;
      const swingSign = isLeft ? 1 : -1;
      const restAngle = isLeft ? LEFT_LEG_ANGLE : RIGHT_LEG_ANGLE;
      const legAngle = restAngle + swingSign * (swing - 0.5) * 2 * LEG_SWING_DEG;

      // Foot slide combines trailing-forward + leading-pullback contributions. Only one
      // contribution is non-zero at a time (a leg is either trailing or leading, not both).
      const trailingDistance = isLeft
        ? Math.max(0, bodyTurn - 0.5) * 2   // LeftLeg trails when body.turn > 0.5
        : Math.max(0, 0.5 - bodyTurn) * 2;  // RightLeg trails when body.turn < 0.5
      const leadingDistance = isLeft
        ? Math.max(0, 0.5 - bodyTurn) * 2   // LeftLeg leads when body.turn < 0.5
        : Math.max(0, bodyTurn - 0.5) * 2;  // RightLeg leads when body.turn > 0.5
      const slide = trailingDistance * FOOT_TRAIL_INWARD - leadingDistance * FOOT_LEAD_OUTWARD;
      const footInset = (FOOT_REST_INSET + slide) * scale;

      // Two upper-leg layers (outer outline + inner face) — each has the foot as its
      // firstElementChild. Apply the swing rotation to each layer and update both feet together.
      for (let i = 0; i < el.children.length; i++) {
        const upperLeg = el.children[i] as HTMLElement;
        upperLeg.style.transform = `rotate(${legAngle}deg)`;
        const foot = upperLeg.firstElementChild as HTMLElement | null;
        if (foot) foot.style[side] = `${footInset}px`;
      }
    },
    [scale, side],
  );
  useAnimationRenderer(render);
  return ref;
}

function LeftLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const legRef = useLegRef(scale, "left");

  return (
    <div
      ref={legRef}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 0,
        overflow: "visible",
      }}
    >
      {/* Outer shadow layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          bottom: s(-LEG_H + LEG_HIP_TUCK),
          left: s(BODY_OFFSET / 2 + BODY_W * LEG_HIP_INSET),
          width: s(LEG_W),
          height: s(LEG_H),
          backgroundColor: theme.outline,
          borderRadius: s(LEG_W / 2),
          // Hip pivot: top center
          transformOrigin: `${s(LEG_W / 2)}px ${s(LEG_W / 2)}px`,
          transform: `rotate(${LEFT_LEG_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(LEG_H - FOOT_H + LEG_OFFSET / 2),
            left: s(LEG_OFFSET * .5),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(LEG_W / 2)}px ${s(FOOT_H / 2)}px`,
            backgroundColor: theme.outline,
            borderRadius: `${s(FOOT_H * 0.5)}px ${s(FOOT_H * 0.25)}px ${s(FOOT_H * 0.25)}px ${s(FOOT_H * 0.5)}px`,
            transform: `rotate(${LEFT_FOOT_ANGLE + 90}deg)`,
          }}
        />
      </div>
      {/* Inner face layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          bottom: s(-LEG_H + LEG_HIP_TUCK + LEG_OFFSET / 2),
          left: s(BODY_OFFSET / 2 + BODY_W * LEG_HIP_INSET + LEG_OFFSET / 2),
          width: s(LEG_W - LEG_OFFSET),
          height: s(LEG_H - LEG_OFFSET),
          backgroundColor: theme.primary,
          borderRadius: s(LEG_W / 2),
          // Hip pivot: top center
          transformOrigin: `${s((LEG_W - LEG_OFFSET) / 2)}px ${s((LEG_W - LEG_OFFSET) / 2)}px`,
          transform: `rotate(${LEFT_LEG_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(LEG_H - FOOT_H + LEG_OFFSET / 2),
            left: s(LEG_OFFSET),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * 0.25)}px ${s((FOOT_H - LEG_OFFSET) * 0.25)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_H - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${LEFT_FOOT_ANGLE + 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_H - LEG_OFFSET / 2) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </div>
  );
}

function RightLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const legRef = useLegRef(scale, "right");

  return (
    <div
      ref={legRef}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: 0,
        overflow: "visible",
      }}
    >
      {/* Outer shadow layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          bottom: s(-LEG_H + LEG_HIP_TUCK),
          right: s(BODY_OFFSET / 2 + BODY_W * LEG_HIP_INSET),
          width: s(LEG_W),
          height: s(LEG_H),
          backgroundColor: theme.outline,
          borderRadius: s(LEG_W / 2),
          // Hip pivot: top center
          transformOrigin: `${s(LEG_W / 2)}px ${s(LEG_W / 2)}px`,
          transform: `rotate(${RIGHT_LEG_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(LEG_H - FOOT_H + LEG_OFFSET / 2),
            right: s(LEG_OFFSET),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(FOOT_H - LEG_W / 2)}px ${s(FOOT_H / 2)}px`,
            backgroundColor: theme.outline,
            borderRadius: `${s(FOOT_H * 0.25)}px ${s(FOOT_H * 0.5)}px ${s(FOOT_H * 0.5)}px ${s(FOOT_H * 0.25)}px`,
            transform: `rotate(${RIGHT_FOOT_ANGLE - 90}deg)`,
          }}
        />
      </div>
      {/* Inner face layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          bottom: s(-LEG_H + LEG_HIP_TUCK + LEG_OFFSET / 2),
          right: s(BODY_OFFSET / 2 + BODY_W * LEG_HIP_INSET + LEG_OFFSET / 2),
          width: s(LEG_W - LEG_OFFSET),
          height: s(LEG_H - LEG_OFFSET),
          backgroundColor: theme.primary,
          borderRadius: s(LEG_W / 2),
          // Hip pivot: top center
          transformOrigin: `${s((LEG_W - LEG_OFFSET) / 2)}px ${s((LEG_W - LEG_OFFSET) / 2)}px`,
          transform: `rotate(${RIGHT_LEG_ANGLE}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: s(LEG_H - FOOT_H + LEG_OFFSET / 2),
            right: s(LEG_OFFSET),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * 0.25)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * 0.25)}px`,
            // Ankle pivot: center
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_H - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${RIGHT_FOOT_ANGLE - 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_H - LEG_OFFSET / 2) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </div>
  );
}

const SHADOW_W = 80;
const SHADOW_H = 16;
const SHADOW_BLUR = 5;
const SHADOW_OPACITY = 0.24;

function Shadow({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: -1,
        bottom: s(-9),
        left: "50%",
        transform: "translateX(-50%)",
        width: s(SHADOW_W),
        height: s(SHADOW_H),
        backgroundColor: `color-mix(in srgb, ${theme.outline} ${SHADOW_OPACITY * 100}%, transparent)`,
        borderRadius: "50%",
        filter: `blur(${s(SHADOW_BLUR)}px)`,
      }}
    />
  );
}
