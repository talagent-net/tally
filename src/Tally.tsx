import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { colors as defaultColors } from "./colors";
import { tally } from "./anatomy";
import type { Anatomy } from "./anatomy";
import { AnimationProvider, useAnimationRenderer, useCapability, useCapabilityAnimation, useEngine } from "./animation/context";
import { createBlinkAnimation } from "./animation/blink";
import { createLookAroundAnimation } from "./animation/lookAround";
import { createFollowAnimation, type FollowTarget } from "./animation/follow";
import { createAntennaWiggleAnimation } from "./animation/antennaWiggle";
import { createEyeSpinAnimation } from "./animation/eyeSpin";
import { createAction, isPureGesture } from "./animation/actions";
import type { ActionSpec } from "./animation/actions";
import type { AnimationFn } from "./animation/engine";
import { SpeechBubble, speechDurationMs, SPEECH_EXIT_MS, DEFAULT_FONT_FAMILY } from "./speech";
import type { SpeechSpec, SpeechSide } from "./speech";

const BLINK_KEY = "eyes.blink";
const EYE_SPIN_KEY = "eyes.spin"; // 0 = upright (rest); 0→1 sweeps a full 0→360° eye rotation (connecting mode)
const HEAD_BOB_KEY = "head.bob";
const HEAD_TURN_KEY = "head.turn";
const HEAD_TILT_KEY = "head.tilt";
const ARMS_LEFT_RAISE_KEY = "arms.left.raise";
const ARMS_LEFT_WAVE_KEY = "arms.left.wave";
const ARMS_RIGHT_RAISE_KEY = "arms.right.raise";
const ARMS_RIGHT_WAVE_KEY = "arms.right.wave";
const ANTENNA_WIGGLE_KEY = "antenna.wiggle";
const BODY_TURN_KEY = "body.turn";
// upper-body twist: an OFFSET on body.turn that turns only the upper half — the body face foreshortens
// horizontally and the shoulders/arms pull in, but the hips, legs and feet stay planted. Renderers for
// the upper parts read body.turn + (upperbody.turn − 0.5); the hip/foot renderer reads body.turn alone.
const UPPERBODY_TURN_KEY = "upperbody.turn";
// Locomotion capabilities. body.x is the figure's net horizontal position in *scaled pixels* —
// it is persistent (does NOT reset to rest after an action), so the figure stays where it walked
// to. body.bounce (vertical step bounce) and body.lean (lean into the travel direction) are normal
// transient gait capabilities that reset to rest when a walk ends.
const BODY_X_KEY = "body.x";
const BODY_Y_KEY = "body.y"; // net vertical position (scaled px) on the locomotion wrapper — the drop free-fall descent
const BODY_BOUNCE_KEY = "body.bounce";
const BODY_LEAN_KEY = "body.lean";
// Walk sink — a hold-high gait envelope (0 at rest → 1 through the stride) that nudges the figure
// DOWN by gait.walkDropOffset scaled px during a walk, so the lean's pivot-lift doesn't float the
// feet off the ground. Walk-only and transient, synced to body.lean's envelope.
const BODY_SINK_KEY = "body.sink";
const LEGS_STRIDE_KEY = "legs.stride";
const ARMS_STRIDE_KEY = "arms.stride";
// Per-limb frantic-flail capabilities (drop free-fall). Independent per limb — they break the
// stride mirror-lock so each limb thrashes on its own chaotic signal. Rest 0.5 = neutral.
const ARMS_LEFT_FLAIL_KEY = "arms.left.flail";
const ARMS_RIGHT_FLAIL_KEY = "arms.right.flail";
const LEGS_LEFT_FLAIL_KEY = "legs.left.flail";
const LEGS_RIGHT_FLAIL_KEY = "legs.right.flail";
// body.crouch — 0 = standing (rest), 1 = full crouch: the body foreshortens vertically and sinks
// (tilting forward toward camera); the shoulders and head lower to track it.
const BODY_CROUCH_KEY = "body.crouch";
const MAX_HEAD_BOB_DEGREES = 18;

// Render-side magnitudes for the gait capabilities (normalized value → px / degrees), mirroring
// how head.tilt etc. keep their pixel/degree tuning at the read site.
// body.bounce + body.lean magnitudes are now per-character (gait.bounceHeightRatio →
// GAIT_BOUNCE_RATIO, gait.leanDeg → GAIT_LEAN_DEG), like the leg/arm swing below.
// leg stride extension + arm swing are now per-character (gait.strideDeg → GAIT_STRIDE_DEG,
// gait.armSwingDeg → GAIT_ARM_SWING_DEG).
const HAND_WAVE_DEG = 25;   // peak forearm rotation at arms.left.wave extremes (degrees) — the disagree hand-wave
// Legs: same scheme as the arms — the flail cap maps linearly to an absolute leg angle in
// [LEG_FLAIL_MIN, LEG_FLAIL_MAX], cap rests at LEG_FLAIL_REST_CAP (maps to the leg's rest angle,
// LEFT_LEG_ANGLE = 9°) so legs sit at rest when not flailing; right leg mirrors. Range must
// include 9°.
const LEG_FLAIL_MIN = -10;
const LEG_FLAIL_MAX = 114;
// Arms: the flail cap maps linearly to an absolute upper-arm angle in [ARM_FLAIL_MIN, ARM_FLAIL_MAX].
// When the flail isn't being applied, the cap rests at ARM_FLAIL_REST_CAP — the value that maps to
// the arm's rest angle (LEFT_UPPER_ANGLE = 25°) — so the arm sits at rest. The right arm mirrors
// (sign flip). The range must include 25° for the rest mapping to exist.
const ARM_FLAIL_MIN = 20;
const ARM_FLAIL_MAX = 150;
// The arm/leg flail REST CAPS (the cap values that map each limb to its rest angle) are computed in
// resolveRig() — they depend on the anatomy rest angles, so they live with the resolved rig.

// Grounding calibration: a constant offset folded into the geometry-computed foot-drop (below) so the
// default grounds exactly — it absorbs the small effects the flat-foot box model doesn't capture
// (leg rest-tilt, rounded corners). TWEAK ME if feet consistently sit a touch off across all presets.
const FOOT_GROUND_CALIB = -4;

// ─── Resolved rig ──────────────────────────────────────────────────────────────────────────────
// Every anatomy-DERIVED value, computed once per anatomy preset. Render functions read these via
// useRig() instead of module constants, so `<Tally anatomy={...} />` renders a differently-proportioned
// robot. Motion-tuning magnitudes (stride°, slides, flail bounds, crouch°, …) stay module-level —
// shared across all characters. A few absolute-px values (LEG_HIP_TUCK, ANTENNA_RIGHT) are still
// literal pending the px→fraction pass; HEAD_TOP and BODY_BOTTOM are now derived (neck-anchor / grounding).
function resolveRig(a: Anatomy) {
  const OT = a.global.outlineThickness;
  const OFFSET = OT * 2; // container pad shared by body/head/arm/leg (visible stroke = OFFSET/2)
  // Grounding: the resting foot's lowest point below the leg's bottom end. The foot box
  // (footHeight × footWidth) is laid flat by a ~90° rotation about a pivot at the leg's horizontal
  // centre, so the drop scales with leg width and foot size — NOT a constant. (Lowest rotated corner.)
  const footTheta = ((a.leg.footAngle + 90) * Math.PI) / 180;
  const footDrop =
    OFFSET / 2 - a.leg.footHeight / 2 +
    (a.leg.footHeight - a.leg.legWidth / 2) * Math.sin(footTheta) +
    (a.leg.footWidth - a.leg.footHeight / 2) * Math.cos(footTheta) +
    FOOT_GROUND_CALIB;
  // Shared locals: grounding-estimate body bottom and neck-anchored head top — also feed the derived
  // speech/track head-center anchor below.
  const bodyBottom = a.leg.legHeight - a.leg.hipTuckRatio * a.body.height + footDrop;
  const headTop = a.head.bodyOverlap - (a.head.height + OFFSET);
  return {
    // Body
    BODY_W: a.body.width,
    BODY_H: a.body.height,
    BODY_OFFSET: OFFSET,
    BODY_RADIUS_TOP: a.body.radiusTop,
    BODY_RADIUS_BOT: a.body.radiusBottom,
    BODY_PIVOT_X: (a.body.width + OFFSET) * a.body.pivot.xFrac,
    BODY_PIVOT_Y: (a.body.height + OFFSET) * a.body.pivot.yFrac,
    BODY_ROTATION: a.body.restRotation,
    BODY_TURN_RATIO: a.body.turnDepthRatio,
    BODY_BOTTOM: bodyBottom, // grounding ESTIMATE (close, for the first paint); runtime auto-grounding in TallyInner refines it to exact
    CHEST_SIZE: a.body.chest.size, // absolute px — chest image stays the same size regardless of body width
    CHEST_TOP_RATIO: a.body.chest.topRatio,
    CHEST_TURN_MIN_RATIO: a.body.chest.turnMinRatio,
    CHEST_TURN_SLIDE: a.body.chest.turnSlideRatio * a.body.width,
    CHEST_CROUCH_MIN_RATIO: a.body.chest.crouchMinRatio,
    CHEST_CROUCH_RISE: a.body.chest.crouchRise,
    CHEST_LOGO_SHADOW_OFFSET: a.body.chest.haloOffset,
    CHEST_LOGO_SHADOW_BLUR: a.body.chest.haloBlur,
    // Head
    HEAD_W: a.head.width,
    HEAD_H: a.head.height,
    HEAD_OFFSET: OFFSET,
    HEAD_ROUNDNESS: a.head.roundness,
    HEAD_TOP: headTop, // neck-anchored: derive top so any head height keeps the neck rooted in the body
    // Speech bubble + track-mode head anchor — DERIVED from the head geometry (the bubble parks at the
    // real head's side edge and vertical center, so it tracks any proportions). gap + maxWidth authored.
    HEAD_HALF_W: (a.head.width + OFFSET) / 2,
    HEAD_CENTER_ABOVE_ANCHOR: bodyBottom + (a.body.height + OFFSET) - headTop - (a.head.height + OFFSET) / 2,
    SPEECH_GAP: a.speech.gap,
    SPEECH_MAX_WIDTH: a.speech.maxWidth,
    HEAD_LIGHT_INSET: OFFSET / 2,
    HEAD_LIGHT_MARGIN: OFFSET,
    HEAD_MAIN_INSET: OT * (1 + a.head.shading.highlightRatio),
    HEAD_MAIN_MARGIN: OT * (2 + a.head.shading.highlightRatio + a.head.shading.shadowCrescentRatio),
    HEAD_SHADOW_OFFSET: OT * a.head.shading.shadowCrescentRatio,
    HEAD_PIVOT_X: (a.head.width + OFFSET) * a.head.pivot.xFrac,
    HEAD_PIVOT_Y: (a.head.height + OFFSET) * a.head.pivot.yFrac,
    HEAD_ROTATION: a.head.restRotation,
    HEAD_TURN_RATIO: a.head.turnDepthRatio,
    HEAD_TURN_RADIUS_GROW: a.head.turnRadiusGrow,
    HEAD_TILT_RATIO: a.head.tiltDepthRatio,
    HEAD_TILT_RADIUS_GROW: a.head.tiltRadiusGrow,
    // Antenna
    ANTENNA_W: a.antenna.width,
    ANTENNA_H: a.antenna.height,
    ANTENNA_TOP: a.antenna.baseInset - a.antenna.height,
    ANTENNA_RIGHT: a.antenna.rightRatio * a.head.width,
    ANTENNA_RADIUS: a.antenna.radius,
    ANTENNA_ANGLE: a.antenna.restLean,
    ANTENNA_TILT_H_RATIO: a.antenna.tiltHeightRatio,
    SIGNAL_SCALE: a.antenna.signalScale, // per-character uniform scale of the connecting signal rings
    // Eye
    EYE_W: a.eye.width,
    EYE_H: a.eye.height,
    EYE_TOP_RATIO: a.eye.topRatio,
    EYE_SIDE_RATIO: a.eye.sideRatio,
    EYE_TURN_CLOSER_INSET: a.eye.turnCloserInset,
    EYE_TURN_FURTHER_INSET: a.eye.turnFurtherInset,
    EYE_ROUNDNESS_RATIO: a.eye.roundnessRatio,
    PUPIL_W: a.eye.width - 2 * a.eye.pupilInset,
    PUPIL_H: a.eye.height - 2 * a.eye.pupilInset,
    EYE_OFFSET_V: 2 * a.eye.pupilInset,
    EYE_OFFSET_H: 2 * a.eye.pupilInset,
    EYE_TURN_W_RATIO: a.eye.turnWidthRatio,
    EYE_TILT_H_RATIO: a.eye.tiltHeightRatio,
    EYE_TILT_PERSPECTIVE_POWER: a.eye.tiltPerspectivePower,
    // Ear
    EAR_TOP_RATIO: a.ear.topRatio,
    EAR_HEIGHT_RATIO: a.ear.heightRatio,
    EAR_REST_W: OFFSET,
    EAR_REST_OFFSET: OFFSET / 2,
    EAR_RADIUS_RATIO: a.ear.roundnessRatio,
    EAR_HIDE_MIN_W: OFFSET / 3,
    // Arm
    ARM_UPPER_W: a.arm.upperWidth,
    ARM_UPPER_H: a.arm.upperHeight,
    ARM_LOWER_W: a.arm.lowerWidth,
    ARM_LOWER_H: a.arm.lowerHeight,
    ARM_OFFSET: OFFSET,
    ARM_SHOULDER_RATIO: a.arm.shoulderRatio,
    LEFT_UPPER_ANGLE: a.arm.upperAngle,
    RIGHT_UPPER_ANGLE: -a.arm.upperAngle,
    LEFT_LOWER_ANGLE: a.arm.lowerAngle,
    RIGHT_LOWER_ANGLE: -a.arm.lowerAngle,
    ARM_FLAIL_REST_CAP: (a.arm.upperAngle - ARM_FLAIL_MIN) / (ARM_FLAIL_MAX - ARM_FLAIL_MIN),
    // Leg
    LEG_HIP_INSET: a.leg.hipInsetRatio,
    LEG_W: a.leg.legWidth,
    LEG_H: a.leg.legHeight,
    LEG_HIP_TUCK: a.leg.hipTuckRatio * a.body.height,
    FOOT_W: a.leg.footWidth,
    FOOT_H: a.leg.footHeight,
    LEG_OFFSET: OFFSET,
    LEFT_LEG_ANGLE: a.leg.legAngle,
    RIGHT_LEG_ANGLE: -a.leg.legAngle,
    LEFT_FOOT_ANGLE: a.leg.footAngle,
    RIGHT_FOOT_ANGLE: -a.leg.footAngle,
    LEG_FLAIL_REST_CAP: (a.leg.legAngle - LEG_FLAIL_MIN) / (LEG_FLAIL_MAX - LEG_FLAIL_MIN),
    // Shadow
    SHADOW_W: a.global.shadow.width,
    SHADOW_H: a.global.shadow.height,
    SHADOW_BLUR: a.global.shadow.blur,
    SHADOW_OPACITY: a.global.shadow.opacity,
    SHADOW_FADE_OUT_BW: a.global.shadow.fadeOutBodyWidths,
    // Gait (per-character behavior — see GaitAnatomy)
    GAIT_STRIDE_DEG: a.gait.strideDeg,
    GAIT_ARM_SWING_DEG: a.gait.armSwingDeg,
    GAIT_BOUNCE_RATIO: a.gait.bounceHeightRatio,
    GAIT_LEAN_DEG: a.gait.leanDeg,
    GAIT_WALK_DROP: a.gait.walkDropOffset,
    GAIT_WALK_MS: a.gait.walkMsPerBodyWidth,
    GAIT_TRAVEL_PER_BW: a.gait.travelPerBodyWidth,
    // Jump (per-character behavior — see JumpAnatomy)
    JUMP_HEIGHT_BW: a.jump.heightBodyWidths,
    JUMP_FLAIL_SPEED: a.jump.flailSpeed,
    // Drop (per-character behavior — see DropAnatomy)
    DROP_FLAIL_SPEED: a.drop.flailSpeed,
  };
}
type Rig = ReturnType<typeof resolveRig>;
const RigContext = createContext<Rig | null>(null);
function useRig(): Rig {
  const rig = useContext(RigContext);
  if (!rig) throw new Error("useRig must be used inside <Tally>");
  return rig;
}

// Head renderers compute their "effective turn" from body.turn and head.turn combined.
// First version: head follows body 1:1 (head.turn capability stays at rest 0.5 by default,
// so effective = body.turn). When something drives head.turn off rest (e.g. shakeHead during
// disagree), it acts as a SIGNED OFFSET on top of body.turn. Clamped to [0, 1] to keep the
// downstream foreshortening math bounded.
const effectiveHeadTurn = (caps: ReadonlyMap<string, number>): number => {
  const head = caps.get(HEAD_TURN_KEY) ?? 0.5;
  const body = caps.get(BODY_TURN_KEY) ?? 0.5;
  const upper = caps.get(UPPERBODY_TURN_KEY) ?? 0.5;
  // The head rides the upper body: total turn = body + upper-body offset + head offset.
  return Math.max(0, Math.min(1, body + (upper - 0.5) + (head - 0.5)));
};

// Effective UPPER-body turn for the body face / chest / shoulders: body.turn plus the upper-body
// offset. Hips and feet ignore this and read raw body.turn, so the stance stays put.
const effectiveUpperTurn = (caps: ReadonlyMap<string, number>): number => {
  const body = caps.get(BODY_TURN_KEY) ?? 0.5;
  const upper = caps.get(UPPERBODY_TURN_KEY) ?? 0.5;
  return Math.max(0, Math.min(1, body + (upper - 0.5)));
};

export type Mode = "hangout" | "track" | "connecting" | "debug";

// `track` mode: the head follows the cursor. The head's screen center sits HEAD_CENTER_ABOVE_ANCHOR
// unscaled px above the anchor (derived in the rig from the body/head stack) and the figure is
// centered on the anchor horizontally — so we resolve the head point from the root anchor rect.
// Cursor offset is normalized by a range in body-widths (full deflection at the range edge, clamped)
// and scaled by the per-axis max deflection from neutral (0.5). The head-center anchor is DERIVED in
// the rig (HEAD_CENTER_ABOVE_ANCHOR — the same value the speech bubble uses), so it tracks any head.
const TRACK_TURN_RANGE_BW = 6;       // cursor horizontal distance (body-widths) for full turn deflection
const TRACK_TILT_RANGE_BW = 4;       // cursor vertical distance (body-widths) for full tilt deflection
const TRACK_TURN_MAX = 0.15;          // max effective head turn from 0.5 (0.5 = full sideways profile; <0.5 keeps the face visible)
const TRACK_TILT_MAX = 0.2;          // max |head.tilt − 0.5| (input range; head.tilt is softened again at render)
const TRACK_BODY_TURN_FRACTION = .64; // share of the head's turn carried by a slight body.turn (the rest stays a head offset)
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface ColorTheme {
  primary: string;
  primaryDark: string;
  primaryMidDark: string; // a tone between primary and primaryMid (lightness: primaryDark < primary < primaryMidDark < primaryMid)
  primaryMid: string;
  outline: string;
  // Font stack for the speech-bubble text. Optional — defaults to a Plex-first system fallback
  // (DEFAULT_FONT_FAMILY), referencing IBM Plex Sans without bundling it. The consumer's app is
  // expected to load the actual font; this only names it.
  fontFamily?: string;
}

export const defaultTheme: ColorTheme = {
  primary: defaultColors.primary,
  primaryDark: defaultColors.primaryDark,
  primaryMidDark: defaultColors.primaryMidDark,
  primaryMid: defaultColors.primaryMid,
  outline: "#2a2a2a",
  fontFamily: DEFAULT_FONT_FAMILY,
};

export interface TallyProps {
  scale?: number;
  mode?: Mode;
  theme?: ColorTheme;
  showAnchor?: boolean;
  // Optional logo PNG, rendered (mask-tinted in the light theme tone) on top of the solid chest
  // panel. A single image — the panel itself replaces the old dark outline PNG.
  chestImage?: string;
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
  // A speech bubble shown next to the figure. This is an OVERLAY, independent of `action`: it
  // rides on top of whatever Tally is doing (idle, tracking, mid-gesture) and times itself out
  // after a read-proportional duration. Like `action`, it dedupes by value — to re-say identical
  // text, set this to null then back. Setting it to null is a no-op for an in-flight bubble (the
  // bubble dismisses on its own timer, not by clearing the prop). `side` defaults to "auto" (opens
  // toward the roomier side based on the figure's horizontal position in the viewport).
  speech?: SpeechSpec | null;
  // Fired when a speech bubble finishes (times out and is removed).
  onSpeechEnd?: () => void;
  // Enlarge the speech bubble's TEXT independently of the figure: `speechScale` scales only the font
  // size and the max-width (text-wrap column) by `scale * speechScale`. Everything else — padding,
  // outline stroke, corner radius, the tail, the anchor to the head, and head-follow drift — stays on
  // the figure `scale`, so the chrome and the figure's linework weight are unchanged and the bubble
  // stays pinned to the head. The box still reflows to hug the larger text. Default 1 (no change).
  // Use to keep a readable bubble on small screens while the figure stays at scale=1.
  speechScale?: number;
  // The robot's anatomy (proportions). A character is purely this object; theme and behavior are
  // orthogonal. Defaults to `tally`. Provide a different preset to render a differently-proportioned
  // robot. See ANATOMY_SPEC.md.
  anatomy?: Anatomy;
  // When the host renders a ground plane behind the figure, set this to clip the shadow to the pixels
  // AT/BELOW the feet (so it reads as a cast shadow on the floor instead of a soft ellipse that smudges
  // above the ground line). Default false (full soft shadow, for a plain/no-ground background).
  groundShadow?: boolean;
}

const BASE = {
  width: 200,
  height: 240,
};

export function Tally(props: TallyProps) {
  const anatomy = props.anatomy ?? tally;
  const rig = useMemo(() => resolveRig(anatomy), [anatomy]);
  // Remount the engine + figure whenever the anatomy object changes. Hot-swapping a running animation
  // engine's renderers onto a new rig in place proved unreliable — the engine kept applying the previous
  // rig even though React re-rendered with the new one. A character is conceptually a NEW figure, so a
  // clean remount (fresh engine, fresh renderers/refs bound to the new proportions) is both correct and
  // simpler. Motion resets on switch, which is the right behavior for swapping characters.
  const remountKey = useRef(0);
  const prevAnatomy = useRef(anatomy);
  if (prevAnatomy.current !== anatomy) {
    prevAnatomy.current = anatomy;
    remountKey.current += 1;
  }
  return (
    <RigContext.Provider value={rig}>
      <AnimationProvider key={remountKey.current}>
        <TallyInner {...props} />
      </AnimationProvider>
    </RigContext.Provider>
  );
}

function TallyInner({ scale = 1, mode = "hangout", theme = defaultTheme, showAnchor = false, chestImage, debugOverrides, action, onWalkComplete, speech, onSpeechEnd, speechScale = 1, groundShadow = false }: TallyProps) {
  const s = (v: number) => v * scale;
  const rig = useRig();
  const { BODY_W, ARM_FLAIL_REST_CAP, LEG_FLAIL_REST_CAP, HEAD_HALF_W, HEAD_CENTER_ABOVE_ANCHOR, SPEECH_GAP, SPEECH_MAX_WIDTH, GAIT_WALK_MS, GAIT_TRAVEL_PER_BW, JUMP_HEIGHT_BW, JUMP_FLAIL_SPEED, DROP_FLAIL_SPEED } = rig;
  // Runtime auto-grounding: a measured vertical offset (unscaled units) added to the body so the
  // lowest foot sits exactly on the anchor. Grounding is a rest-pose property of the resolved figure,
  // NOT a per-character config value — it's measured (see the layout effect below), never authored.
  const [groundingOffset, setGroundingOffset] = useState(0);
  const groundingOffsetRef = useRef(0); // latest committed offset, base for the deferred re-measure
  groundingOffsetRef.current = groundingOffset;

  // Capabilities — declared once at the root with their rest values.
  useCapability(BLINK_KEY, 1);      // 1 = fully open
  useCapability(EYE_SPIN_KEY, 0);   // 0 = upright; connecting mode sweeps it 0→1 for a full eye rotation
  useCapability(HEAD_BOB_KEY, 0.5); // 0.5 = centered, 0 = max left tilt, 1 = max right tilt
  useCapability(HEAD_TURN_KEY, 0.5); // 0.5 = looking straight, 0 = looking left, 1 = looking right
  useCapability(HEAD_TILT_KEY, 0.5); // 0.5 = looking straight, 0 = looking down, 1 = looking up
  useCapability(ARMS_LEFT_RAISE_KEY, 0); // 0 = arm at rest pose; 1 = raised to a "stop" gesture
  useCapability(ARMS_LEFT_WAVE_KEY, 0.5);// 0.5 = no wave; 0/1 = forearm rotated left/right at the elbow
  useCapability(ARMS_RIGHT_RAISE_KEY, 0); // right-arm mirror of arms.left.raise
  useCapability(ARMS_RIGHT_WAVE_KEY, 0.5);// right-arm mirror of arms.left.wave
  useCapability(ANTENNA_WIGGLE_KEY, 0.5); // 0.5 = no wiggle; 0/1 = max wiggle in either direction
  useCapability(BODY_TURN_KEY, 0.5); // 0.5 = facing forward; 0/1 = max body turn either way (head follows by default)
  useCapability(UPPERBODY_TURN_KEY, 0.5); // 0.5 = square; offset on body.turn that twists only the upper body
  useCapability(BODY_X_KEY, 0);      // net horizontal position in scaled px — persistent across actions
  useCapability(BODY_Y_KEY, 0);      // vertical position in scaled px — the drop free-fall descent (0 = anchor)
  useCapability(BODY_BOUNCE_KEY, 0);    // 0 = grounded; 1 = peak of a walk step bounce
  useCapability(BODY_LEAN_KEY, 0.5); // 0.5 = upright; 0/1 = lean left/right into travel
  useCapability(BODY_SINK_KEY, 0);   // 0 = grounded height; 1 = full walk drop (× gait.walkDropOffset)
  useCapability(LEGS_STRIDE_KEY, 0.5);// 0.5 = neutral stance; 0/1 = legs at opposite ends of a step (anti-phase)
  useCapability(ARMS_STRIDE_KEY, 0.5);// 0.5 = arms at rest; 0/1 = arms at opposite ends of a swing (anti-phase, counter to legs)
  useCapability(ARMS_LEFT_FLAIL_KEY, ARM_FLAIL_REST_CAP);  // rest cap → arm at its rest angle when not flailing
  useCapability(ARMS_RIGHT_FLAIL_KEY, ARM_FLAIL_REST_CAP);
  useCapability(LEGS_LEFT_FLAIL_KEY, LEG_FLAIL_REST_CAP);  // rest cap → leg at its rest angle when not flailing
  useCapability(LEGS_RIGHT_FLAIL_KEY, LEG_FLAIL_REST_CAP);
  useCapability(BODY_CROUCH_KEY, 0); // 0 = standing; 1 = full crouch (body foreshortens + sinks, head/shoulders follow)

  // Debug overrides — a map of capability key → held value. Each listed capability is driven by
  // its value (read live via a ref so closures stay stable), independently of the others, so any
  // combination of capabilities can be pinned at once (e.g. hold body.turn sideways while scrubbing
  // head.tilt). Order in the useMemos below: action > debug override > mode
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

  // makeFreeze installs a "hold current value" animation for a capability: on its first tick it
  // captures whatever the engine currently has for that key and returns it forever. Used by
  // `connecting` mode to FREEZE the head's ambient pose (turn/tilt/bob/upper-body) in place on
  // entry — otherwise removing the hangout look-around animation would ease those capabilities back
  // to rest (the head "straightening" the user didn't want). Capturing on the first tick (not at
  // render) means it freezes the live pose at the moment the engine swaps animations.
  const engine = useEngine();
  const makeFreeze = useCallback(
    (key: string): AnimationFn => {
      let held: number | null = null;
      return () => (held ??= engine.getCapability(key));
    },
    [engine],
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
    arrive: boolean; // come: slide from the offset INTO the anchor (offset→0) instead of 0→delta
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
    // walk: body.x runs committed → committed+delta (and commits delta on completion).
    // come (arrive): body.x runs committed-delta (the offset) → committed, ending at the anchor;
    // committed is never changed, so it's a pure transient — no snap when the stride clears.
    return committedXRef.current + (w.arrive ? stride - w.delta : stride);
  });
  useCapabilityAnimation(BODY_X_KEY, bodyXAnimRef.current);

  // Transient vertical motion (drop & jump). Mirror of body.x but it never commits a net offset —
  // body.y rests at 0 (the anchor) whenever nothing is in flight. Two profiles:
  //   "fall" (drop): starts `offset` px ABOVE the anchor and falls to it with a GRAVITY profile,
  //     -offset·(1 − (t/fallMs)²) — speed ramps up (no decel), hard stop at the anchor.
  //   "jump": planted through the anticipation crouch, then a symmetric parabola over the air phase,
  //     -4·peak·u·(1−u) with u = (t − airStartMs)/airMs — i.e. 0 → -peak (apex) → 0: decelerating up,
  //     accelerating down. Planted again once it lands.
  const verticalRef = useRef<
    | { kind: "fall"; startElapsed: number | null; offset: number; fallMs: number }
    | { kind: "jump"; startElapsed: number | null; peak: number; airStartMs: number; airMs: number }
    | null
  >(null);
  const bodyYAnimRef = useRef<AnimationFn>((elapsed) => {
    const v = verticalRef.current;
    if (!v) return 0;
    if (v.startElapsed === null) v.startElapsed = elapsed;
    const t = elapsed - v.startElapsed;
    if (v.kind === "fall") {
      if (t >= v.fallMs) return 0; // landed on the anchor
      const p = t / v.fallMs;
      return -v.offset * (1 - p * p); // accelerating descent from -offset (above) to 0
    }
    const at = t - v.airStartMs; // time since the air phase began
    if (at <= 0 || at >= v.airMs) return 0; // planted (anticipation) or landed
    const u = at / v.airMs;
    return -4 * v.peak * u * (1 - u); // symmetric parabola: 0 → -peak (apex) → 0
  });
  useCapabilityAnimation(BODY_Y_KEY, bodyYAnimRef.current);
  const locomotionRef = useLocomotionRef();
  const verticalWrapRef = useVerticalRef();

  // Action lifecycle. By default an active action plays to completion and is NOT interruptible. A
  // trigger that arrives while an action is in flight is held in a single queue slot (depth 1) and
  // plays when the current one finishes; a newer trigger replaces whatever is queued (latest-wins).
  // Exception: a trigger carrying `interrupt: true` preempts an in-flight PURE GESTURE immediately
  // (and flushes the queue) — see the prop effect below.
  // lastActionKeyRef dedupes the prop by value (specs are objects) — to fire an identical action,
  // the consumer sets the prop to null then back. Setting the prop to null is a no-op for
  // playback: it neither cancels the running action nor clears the queue, it just resets the
  // trigger so the same spec can re-fire.
  // Seed with the CURRENT prop value so a mount-time action isn't auto-played. This matters on a
  // character switch: the whole figure remounts (see Tally) while `action` still holds the last spec —
  // a null-seeded dedupe would replay it on the new character. Only genuine prop CHANGES fire.
  const lastActionKeyRef = useRef<string | null>(action ? JSON.stringify(action) : null);
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
  // True only while inside an action's flail window (drop & jump). When it flips false — at the
  // moment the landing crouch begins — the flail animations are dropped, so the engine eases each
  // limb from its flail pose back to rest (its normal release) while the crouch keeps playing.
  // Reset to false at the start of every action; armed by the action's `flailWindow`.
  const [flailActive, setFlailActive] = useState(false);
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
    } else if (action.interrupt && isPureGesture(activeRef.current.spec.name)) {
      // Opt-in preemption: a higher-priority action cuts in front of an in-flight PURE GESTURE
      // instead of queueing. activate() gives a fresh id, so the completion effect re-runs and its
      // cleanup cancels the preempted gesture's timers. Flush the queue too — a preempting action
      // shouldn't be tailed by a stale queued gesture. Locomotion/vertical actives are excluded
      // (isPureGesture) because their net body.x/body.y commit lives in the completion timer.
      queuedActionSpecRef.current = null;
      activate(action);
    } else {
      queuedActionSpecRef.current = action; // busy → queue (replacing any prior queued)
    }
  }, [action, activate]);
  const activeAction = useMemo(
    () => (active ? createAction(active.spec, {
      walkMsPerBodyWidth: GAIT_WALK_MS,
      travelPerBodyWidth: GAIT_TRAVEL_PER_BW,
      jumpHeightBodyWidths: JUMP_HEIGHT_BW,
      jumpFlailSpeed: JUMP_FLAIL_SPEED,
      dropFlailSpeed: DROP_FLAIL_SPEED,
    }) : null),
    [active, GAIT_WALK_MS, GAIT_TRAVEL_PER_BW, JUMP_HEIGHT_BW, JUMP_FLAIL_SPEED, DROP_FLAIL_SPEED],
  );
  useEffect(() => {
    if (!activeAction) return;
    // Locomotion actions arm the persistent body.x stride. walk commits its net move on
    // completion; come (arrive) ends at the anchor, so it commits nothing.
    let walkDelta = 0;
    const arrive = activeAction.locomotion?.arrive ?? false;
    if (activeAction.locomotion) {
      const { direction, travelBodyWidths, rampStartMs, rampEndMs, accelMs } = activeAction.locomotion;
      const sign = direction === "right" ? 1 : -1;
      walkDelta = sign * travelBodyWidths * BODY_W * scale;
      walkStateRef.current = { startElapsed: null, delta: walkDelta, rampStartMs, rampEndMs, accelMs, arrive };
    }
    // Flail window (drop & jump): drive the four flail caps only within [startMs, endMs]; reset the
    // flag for this action, then arm on/off timers. drop flails from t=0; jump only once airborne.
    // When the window ends (landing crouch begins) the flail releases and the engine eases the limbs
    // back to rest — see flailActive.
    setFlailActive(false);
    let flailOnTimer: ReturnType<typeof setTimeout> | undefined;
    let flailOffTimer: ReturnType<typeof setTimeout> | undefined;
    if (activeAction.flailWindow) {
      const { startMs, endMs } = activeAction.flailWindow;
      if (startMs <= 0) setFlailActive(true);
      else flailOnTimer = setTimeout(() => setFlailActive(true), startMs);
      flailOffTimer = setTimeout(() => setFlailActive(false), endMs);
    }
    // Vertical (transient; returns to the anchor, commits nothing): drop falls onto the anchor, jump
    // hops off it and back. Anchored at this action's start elapsed inside bodyYAnimRef.
    if (activeAction.descent) {
      const { offsetBodyWidths, fallMs } = activeAction.descent;
      verticalRef.current = { kind: "fall", startElapsed: null, offset: offsetBodyWidths * BODY_W * scale, fallMs };
    } else if (activeAction.ascent) {
      const { peakBodyWidths, airStartMs, airMs } = activeAction.ascent;
      verticalRef.current = { kind: "jump", startElapsed: null, peak: peakBodyWidths * BODY_W * scale, airStartMs, airMs };
    }
    const timer = setTimeout(() => {
      if (activeAction.locomotion) {
        if (!arrive) committedXRef.current += walkDelta; // come returns to the anchor — no net commit
        walkStateRef.current = null;
        onWalkComplete?.(arrive ? 0 : walkDelta);
      }
      if (activeAction.descent || activeAction.ascent) verticalRef.current = null; // back at the anchor

      // Dequeue: play the queued action next if present, otherwise go idle.
      const next = queuedActionSpecRef.current;
      queuedActionSpecRef.current = null;
      activate(next);
    }, activeAction.duration);
    return () => {
      clearTimeout(timer);
      if (flailOnTimer) clearTimeout(flailOnTimer);
      if (flailOffTimer) clearTimeout(flailOffTimer);
    };
  }, [activeAction, scale, onWalkComplete, activate]);

  // eyes.blink — action > debug > (no ambient in debug/connecting) > hangout's random blinks.
  const blinkAnimation = useMemo(() => {
    if (activeAction?.animations[BLINK_KEY]) return activeAction.animations[BLINK_KEY];
    const dbg = debugAnimFor(BLINK_KEY);
    if (dbg) return dbg;
    if (mode === "debug") return null;
    if (mode === "connecting") return null; // eyes stay open while spinning
    return createBlinkAnimation();
  }, [activeAction, mode, debugAnimFor]);
  useCapabilityAnimation(BLINK_KEY, blinkAnimation);

  // eyes.spin — debug > connecting mode's continuous full-turn spin. No action drives it; rests at
  // 0 (upright) otherwise, so leaving connecting eases the eyes back to upright (release-to-rest).
  const eyeSpinAnimation = useMemo(() => {
    const dbg = debugAnimFor(EYE_SPIN_KEY);
    if (dbg) return dbg;
    if (mode === "connecting") return createEyeSpinAnimation();
    return null;
  }, [mode, debugAnimFor]);
  useCapabilityAnimation(EYE_SPIN_KEY, eyeSpinAnimation);


  // head.turn + head.bob — action overrides if it touches either; otherwise hangout runs
  // lookAround. lookAround is disabled while a action is active so its state machine resets
  // and the head settles cleanly during the action, with no leftover slide-in-progress when
  // the action ends. lookAround is also null in debug mode, so the null-fallback below acts
  // as "no ambient in debug mode" for these capabilities.
  // Idle look-around reuses track's ability ranges (turn/tilt) + the upper-body split, so the head
  // (and a slight upper-body twist) wanders the same way it follows the cursor, plus its own bob.
  const lookAround = useMemo(
    () =>
      mode === "hangout" && !activeAction
        ? createLookAroundAnimation({
            turnMax: TRACK_TURN_MAX,
            tiltMax: TRACK_TILT_MAX,
            upperFraction: TRACK_BODY_TURN_FRACTION,
            // Begin idle from the head's current pose (e.g. the frozen connecting pose, or a track
            // gaze) so it continues from there instead of snapping to neutral. Read lazily on the
            // first tick — see makeFreeze for why first-tick (not render-time) capture is correct.
            getInitialPose: () => ({
              turn: engine.getCapability(HEAD_TURN_KEY),
              upper: engine.getCapability(UPPERBODY_TURN_KEY),
              tilt: engine.getCapability(HEAD_TILT_KEY),
              bob: engine.getCapability(HEAD_BOB_KEY),
            }),
          })
        : null,
    [mode, activeAction, engine],
  );

  // `track` mode: the head follows the cursor. The mousemove listener (attached only in track mode)
  // resolves the head's screen point from the root anchor rect + the known head offset, then writes
  // a target head.turn/head.tilt into followTargetRef; the follow driver eases the head toward it.
  // Gated by !activeAction like lookAround, so an action takes over and tracking resumes after.
  const rootRef = useRef<HTMLDivElement>(null);
  // Measure where the feet actually land (post-layout, at rest) and shift the body so the lowest foot
  // sits exactly on the anchor/ground. Runs once per anatomy (rig) or scale change; useLayoutEffect
  // applies the correction before paint, so there's no visible jump. Exact for ANY anatomy.
  useLayoutEffect(() => {
    // Measure the lowest foot vs the anchor and shift the body so the feet sit on the ground. `base`
    // is the offset the measurement was taken against; setting base+delta (absolute, not prev+delta)
    // is idempotent under StrictMode's double-invoked mount effect. groundingOffset in deps converges.
    const ground = (base: number) => {
      const root = rootRef.current;
      if (!root) return;
      const feet = root.querySelectorAll<HTMLElement>("[data-tally-foot]");
      if (!feet.length) return;
      const anchorY = root.getBoundingClientRect().top; // 0-size root: its top edge IS the ground anchor
      let lowest = -Infinity;
      feet.forEach((f) => {
        const b = f.getBoundingClientRect().bottom;
        if (b > lowest) lowest = b;
      });
      const delta = (lowest - anchorY) / scale; // feet below anchor → raise body; above → lower
      if (Math.abs(delta) < 0.1) return; // already grounded — leave it
      setGroundingOffset(base + delta);
    };
    ground(groundingOffset); // pre-paint: grounds to the static rest pose (no visible jump)
    // Re-measure after the animation engine has settled the rest pose, so the very first load grounds
    // IDENTICALLY to a later character switch (both land on the engine-settled positions). The double
    // rAF guarantees it runs past the engine's first render tick; base = latest committed offset.
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => ground(groundingOffsetRef.current));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [rig, scale, groundingOffset]);
  const followTargetRef = useRef<FollowTarget>({ turn: 0.5, tilt: 0.5, upperTurn: 0.5 });
  useEffect(() => {
    if (mode !== "track") return;
    // Seed the target from the head's current pose so that, until the first mousemove, the follow
    // driver eases toward where the head already is (a continuous hand-off) rather than drifting to
    // neutral.
    followTargetRef.current = {
      turn: engine.getCapability(HEAD_TURN_KEY),
      tilt: engine.getCapability(HEAD_TILT_KEY),
      upperTurn: engine.getCapability(UPPERBODY_TURN_KEY),
    };
    const onMove = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect(); // 0×0 div: rect origin IS the anchor screen point
      const headX = rect.left;
      const headY = rect.top - HEAD_CENTER_ABOVE_ANCHOR * scale;
      const dx = e.clientX - headX;
      const dy = e.clientY - headY; // screen-y grows downward: dy<0 = cursor above the head
      const effTurn = 0.5 + clamp(dx / (TRACK_TURN_RANGE_BW * BODY_W * scale), -1, 1) * TRACK_TURN_MAX;
      const tilt = 0.5 - clamp(dy / (TRACK_TILT_RANGE_BW * BODY_W * scale), -1, 1) * TRACK_TILT_MAX; // above → look up
      // Split the effective head turn into a slight upperbody.turn + a head.turn offset (renderers
      // sum them), so the upper body twists a little while the head's on-screen direction stays as
      // tuned. The hips/legs stay planted because upperbody.turn doesn't touch them.
      const upperTurn = 0.5 + (effTurn - 0.5) * TRACK_BODY_TURN_FRACTION;
      const turn = 0.5 + (effTurn - 0.5) * (1 - TRACK_BODY_TURN_FRACTION);
      followTargetRef.current = { turn, tilt, upperTurn };
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      followTargetRef.current = { turn: 0.5, tilt: 0.5, upperTurn: 0.5 }; // reset so re-entry starts looking straight
    };
  }, [mode, scale, engine]);
  const follow = useMemo(
    () =>
      mode === "track" && !activeAction
        ? createFollowAnimation(followTargetRef, () => ({
            // Begin easing from the head's current pose (e.g. a hangout look-around gaze) so the
            // motion is continuous into track mode instead of snapping to neutral first. Read lazily
            // on the first tick so the capabilities hold their live values by then.
            turn: engine.getCapability(HEAD_TURN_KEY),
            tilt: engine.getCapability(HEAD_TILT_KEY),
            upperTurn: engine.getCapability(UPPERBODY_TURN_KEY),
          }))
        : null,
    [mode, activeAction, engine],
  );

  // head.turn is an OFFSET on top of body.turn (renderers compute effective = sum). lookAround
  // drives it ambiently in hangout; follow drives it from the cursor in track mode. Actions like
  // shakeHead override and play from the body's current angle too.
  const headTurnAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_TURN_KEY]) return activeAction.animations[HEAD_TURN_KEY];
    const dbg = debugAnimFor(HEAD_TURN_KEY);
    if (dbg) return dbg;
    if (mode === "connecting") return makeFreeze(HEAD_TURN_KEY); // hold the entry pose, don't recenter
    return follow?.headTurn ?? lookAround?.headTurn ?? null;
  }, [activeAction, debugAnimFor, follow, lookAround, mode, makeFreeze]);
  useCapabilityAnimation(HEAD_TURN_KEY, headTurnAnimation);

  // head.tilt — action > debug > track follow > hangout look-around. (Idle now also tilts up/down.)
  const headTiltAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_TILT_KEY]) return activeAction.animations[HEAD_TILT_KEY];
    const dbg = debugAnimFor(HEAD_TILT_KEY);
    if (dbg) return dbg;
    if (mode === "connecting") return makeFreeze(HEAD_TILT_KEY);
    return follow?.headTilt ?? lookAround?.headTilt ?? null;
  }, [activeAction, debugAnimFor, follow, lookAround, mode, makeFreeze]);
  useCapabilityAnimation(HEAD_TILT_KEY, headTiltAnimation);

  // body.turn (full turn — hips + legs included) — action > debug. No mode-level idle; the body stays
  // wherever it's last been pointed (rest by default). Track uses upperbody.turn instead (below).
  const bodyTurnAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_TURN_KEY]) return activeAction.animations[BODY_TURN_KEY];
    const dbg = debugAnimFor(BODY_TURN_KEY);
    if (dbg) return dbg;
    return null;
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(BODY_TURN_KEY, bodyTurnAnimation);

  // upperbody.turn — action > debug > track-mode cursor follow (a slight upper-body twist under the
  // head; hips/legs stay planted). No hangout idle.
  const upperBodyTurnAnimation = useMemo(() => {
    if (activeAction?.animations[UPPERBODY_TURN_KEY]) return activeAction.animations[UPPERBODY_TURN_KEY];
    const dbg = debugAnimFor(UPPERBODY_TURN_KEY);
    if (dbg) return dbg;
    if (mode === "connecting") return makeFreeze(UPPERBODY_TURN_KEY);
    return follow?.upperTurn ?? lookAround?.upperTurn ?? null;
  }, [activeAction, debugAnimFor, follow, lookAround, mode, makeFreeze]);
  useCapabilityAnimation(UPPERBODY_TURN_KEY, upperBodyTurnAnimation);

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

  const bodySinkAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_SINK_KEY]) return activeAction.animations[BODY_SINK_KEY];
    return debugAnimFor(BODY_SINK_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(BODY_SINK_KEY, bodySinkAnimation);

  const legsStrideAnimation = useMemo(() => {
    if (activeAction?.animations[LEGS_STRIDE_KEY]) return activeAction.animations[LEGS_STRIDE_KEY];
    return debugAnimFor(LEGS_STRIDE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(LEGS_STRIDE_KEY, legsStrideAnimation);

  const armsStrideAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_STRIDE_KEY]) return activeAction.animations[ARMS_STRIDE_KEY];
    return debugAnimFor(ARMS_STRIDE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_STRIDE_KEY, armsStrideAnimation);

  // Per-limb flail (drop & jump) — action > debug. Four independent capabilities.
  // Each flail is driven only while flailActive (inside the action's flail window); when the window
  // ends (landing crouch begins) it falls through to debug/null so the engine eases the limb from
  // its flail pose back to rest.
  const armsLeftFlailAnimation = useMemo(() => (flailActive && activeAction?.animations[ARMS_LEFT_FLAIL_KEY]) || debugAnimFor(ARMS_LEFT_FLAIL_KEY), [activeAction, debugAnimFor, flailActive]);
  useCapabilityAnimation(ARMS_LEFT_FLAIL_KEY, armsLeftFlailAnimation);
  const armsRightFlailAnimation = useMemo(() => (flailActive && activeAction?.animations[ARMS_RIGHT_FLAIL_KEY]) || debugAnimFor(ARMS_RIGHT_FLAIL_KEY), [activeAction, debugAnimFor, flailActive]);
  useCapabilityAnimation(ARMS_RIGHT_FLAIL_KEY, armsRightFlailAnimation);
  const legsLeftFlailAnimation = useMemo(() => (flailActive && activeAction?.animations[LEGS_LEFT_FLAIL_KEY]) || debugAnimFor(LEGS_LEFT_FLAIL_KEY), [activeAction, debugAnimFor, flailActive]);
  useCapabilityAnimation(LEGS_LEFT_FLAIL_KEY, legsLeftFlailAnimation);
  const legsRightFlailAnimation = useMemo(() => (flailActive && activeAction?.animations[LEGS_RIGHT_FLAIL_KEY]) || debugAnimFor(LEGS_RIGHT_FLAIL_KEY), [activeAction, debugAnimFor, flailActive]);
  useCapabilityAnimation(LEGS_RIGHT_FLAIL_KEY, legsRightFlailAnimation);

  // body.crouch — action > debug. No mode-level idle; no action drives it yet (debug-scrubbable).
  const bodyCrouchAnimation = useMemo(() => {
    if (activeAction?.animations[BODY_CROUCH_KEY]) return activeAction.animations[BODY_CROUCH_KEY];
    return debugAnimFor(BODY_CROUCH_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(BODY_CROUCH_KEY, bodyCrouchAnimation);

  const headBobAnimation = useMemo(() => {
    if (activeAction?.animations[HEAD_BOB_KEY]) return activeAction.animations[HEAD_BOB_KEY];
    const dbg = debugAnimFor(HEAD_BOB_KEY);
    if (dbg) return dbg;
    if (mode === "connecting") return makeFreeze(HEAD_BOB_KEY);
    return lookAround?.headBob ?? null;
  }, [activeAction, debugAnimFor, lookAround, mode, makeFreeze]);
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

  // arms.right.raise — action > debug. Right-arm mirror of arms.left.raise (the renderer sign-flips
  // the right side). Required for two-armed gestures (disagree, shrug) — without it the right arm's
  // raise capability is read by the renderer but never driven, so the right arm stays at rest.
  const armsRightRaiseAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_RIGHT_RAISE_KEY]) return activeAction.animations[ARMS_RIGHT_RAISE_KEY];
    return debugAnimFor(ARMS_RIGHT_RAISE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_RIGHT_RAISE_KEY, armsRightRaiseAnimation);

  // arms.right.wave — action > debug. Right-arm mirror of arms.left.wave (same fix as right.raise).
  const armsRightWaveAnimation = useMemo(() => {
    if (activeAction?.animations[ARMS_RIGHT_WAVE_KEY]) return activeAction.animations[ARMS_RIGHT_WAVE_KEY];
    return debugAnimFor(ARMS_RIGHT_WAVE_KEY);
  }, [activeAction, debugAnimFor]);
  useCapabilityAnimation(ARMS_RIGHT_WAVE_KEY, armsRightWaveAnimation);

  // antenna.wiggle — action > debug > hangout's occasional damped wiggles. !activeAction
  // gating mirrors lookAround so actions interrupt cleanly; debug overrides regardless.
  const antennaWiggleAnimation = useMemo(() => {
    if (activeAction?.animations[ANTENNA_WIGGLE_KEY]) return activeAction.animations[ANTENNA_WIGGLE_KEY];
    const dbg = debugAnimFor(ANTENNA_WIGGLE_KEY);
    if (dbg) return dbg;
    if ((mode === "hangout" || mode === "track") && !activeAction) return createAntennaWiggleAnimation();
    return null;
  }, [activeAction, mode, debugAnimFor]);
  useCapabilityAnimation(ANTENNA_WIGGLE_KEY, antennaWiggleAnimation);

  // Speech overlay lifecycle — parallel to the action lifecycle above, but a separate channel: it
  // doesn't touch any capability or the action slot, so the bubble coexists with whatever Tally is
  // doing. The active bubble carries a per-fire `id` (so re-saying identical text remounts a fresh
  // bubble with its entrance) and dedupes the prop by value, mirroring the action dedupe. A new
  // speech replaces a still-showing one immediately.
  const [activeSpeech, setActiveSpeech] = useState<{ text: string; side: "left" | "right"; id: number } | null>(null);
  // Two-phase teardown so the bubble can play an exit animation: the read timer flips `leaving`
  // true (the bubble switches to its exit animation), then after SPEECH_EXIT_MS it unmounts.
  const [speechLeaving, setSpeechLeaving] = useState(false);
  // Seeded with the current prop value (like lastActionKeyRef) so a remount — e.g. a character switch —
  // doesn't re-say a stale `speech` prop on the new figure. Only genuine prop CHANGES fire the bubble.
  const lastSpeechKeyRef = useRef<string | null>(speech ? JSON.stringify(speech) : null);
  const speechCounterRef = useRef(0);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onSpeechEndRef.current = onSpeechEnd;
  // Resolve "auto" to a concrete side from the figure's horizontal screen position. We measure the
  // locomotion wrapper, NOT the root: the wrapper is a 0-size box that carries the body.x walk
  // displacement, so its rect.left is the figure's CURRENT center on screen (the root stays pinned
  // at the original anchor and wouldn't reflect where Tally walked to). If that's left of the
  // viewport center, open the bubble to the right (the roomier side), and vice-versa. Resolved
  // once, at show-time. Falls back to "left" if unmeasurable.
  const resolveSide = useCallback((side: SpeechSide): "left" | "right" => {
    if (side !== "auto") return side;
    const el = locomotionRef.current;
    if (!el || typeof window === "undefined") return "left";
    return el.getBoundingClientRect().left < window.innerWidth / 2 ? "right" : "left";
  }, []);
  useEffect(() => {
    const key = speech ? JSON.stringify(speech) : null;
    if (key === lastSpeechKeyRef.current) return;
    lastSpeechKeyRef.current = key;
    if (!speech) return; // null/clear is a no-op — the bubble dismisses on its own timer
    setSpeechLeaving(false); // fresh utterance plays its entrance, even if one was exiting
    setActiveSpeech({ text: speech.text, side: resolveSide(speech.side ?? "auto"), id: ++speechCounterRef.current });
  }, [speech, resolveSide]);
  // Hold for the read duration, then begin the exit animation.
  useEffect(() => {
    if (!activeSpeech) return;
    const timer = setTimeout(() => setSpeechLeaving(true), speechDurationMs(activeSpeech.text));
    return () => clearTimeout(timer);
  }, [activeSpeech]);
  // Once leaving, let the exit animation play, then unmount and notify.
  useEffect(() => {
    if (!speechLeaving) return;
    const timer = setTimeout(() => {
      setActiveSpeech(null);
      setSpeechLeaving(false);
      onSpeechEndRef.current?.();
    }, SPEECH_EXIT_MS);
    return () => clearTimeout(timer);
  }, [speechLeaving]);

  return (
    <div
      ref={rootRef}
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
      {/* Outer wrapper carries HORIZONTAL travel (body.x) — figure + shadow slide together. */}
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
        {/* Shadow stays at the anchor (horizontal travel only — it does NOT rise/fall with body.y). */}
        <Shadow scale={scale} theme={theme} groundShadow={groundShadow} />
        {/* Inner wrapper carries VERTICAL travel (body.y drop/jump) — only the figure rises/falls. */}
        <div
          ref={verticalWrapRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            overflow: "visible",
          }}
        >
          <Body scale={scale} theme={theme} showAnchor={showAnchor} chestImage={chestImage} groundingOffset={groundingOffset}>
            <Head scale={scale} theme={theme} showAnchor={showAnchor}>
              <LeftEye scale={scale} theme={theme} />
              <RightEye scale={scale} theme={theme} />
              <LeftEar scale={scale} theme={theme} />
              <RightEar scale={scale} theme={theme} />
              <Antenna scale={scale} theme={theme} showAnchor={showAnchor} signal={mode === "connecting"} />
            </Head>
            <LeftArm scale={scale} theme={theme} showAnchor={showAnchor} />
            <RightArm scale={scale} theme={theme} showAnchor={showAnchor} />
            <LeftLeg scale={scale} theme={theme} showAnchor={showAnchor} />
            <RightLeg scale={scale} theme={theme} showAnchor={showAnchor} />
          </Body>
          {/* Speech bubble rides with the figure (body.x via the outer wrapper, body.y via this one). */}
          {activeSpeech && (
            <SpeechBubble
              key={activeSpeech.id}
              text={activeSpeech.text}
              side={activeSpeech.side}
              scale={scale}
              speechScale={speechScale}
              theme={theme}
              leaving={speechLeaving}
              headHalfW={HEAD_HALF_W}
              headCenterAboveAnchor={HEAD_CENTER_ABOVE_ANCHOR}
              gap={SPEECH_GAP}
              maxWidth={SPEECH_MAX_WIDTH}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Body anatomy (dimensions, radii, pivot, depth, chest decal) — and the grounding output BODY_BOTTOM
// (computed from the leg+foot stack so the feet land on the ground) — are resolved in resolveRig().

// body.crouch tuning. The body face shrinks vertically to CROUCH_HEIGHT_RATIO at full crouch
// (bottom-anchored — the hips stay, the top/shoulders come down) and the whole body sinks by
// CROUCH_DROP. Shoulders, head and chest track this via crouchPointDrop.
const CROUCH_HEIGHT_RATIO = 0.7;   // body vertical scale at full crouch (foreshorten)
const CROUCH_DROP = 10 / 76;       // body sink at full crouch, as a fraction of body full height (× bodyFullH = BODY_H + BODY_OFFSET)
const crouchHeightFactor = (crouch: number) => 1 - crouch * (1 - CROUCH_HEIGHT_RATIO);
// Unscaled px a body-fixed point lowers at the given crouch, by its vertical fraction from the top
// (0 = top edge / shoulders, 1 = bottom edge / hips). The bottom-anchored shrink lowers upper
// points more; the sink (CROUCH_DROP) lowers everything equally.
const crouchPointDrop = (crouch: number, pFromTop: number, bodyFullH: number) =>
  bodyFullH * (1 - crouchHeightFactor(crouch)) * (1 - pFromTop) + crouch * CROUCH_DROP * bodyFullH;

// Drives two body.turn effects on the chest: width shrinks linearly toward CHEST_TURN_MIN_RATIO,
// and the whole element slides horizontally in the SIGNED direction of the turn. The chest div
// uses left:50% + translateX(-50%) for centering — the renderer rewrites the full transform so
// the slide composes with the centering offset.
function useChestRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const { CHEST_SIZE, CHEST_TURN_MIN_RATIO, CHEST_TURN_SLIDE, CHEST_CROUCH_MIN_RATIO, CHEST_TOP_RATIO, CHEST_CROUCH_RISE, BODY_H, BODY_OFFSET } = rig;
      const bodyTurn = effectiveUpperTurn(caps);
      const signedDistance = (bodyTurn - 0.5) * 2;
      const distance = Math.abs(signedDistance);
      const factor = 1 - distance * (1 - CHEST_TURN_MIN_RATIO);
      el.style.width = `${CHEST_SIZE * scale * factor}px`;
      const slideOffset = signedDistance * CHEST_TURN_SLIDE * scale;
      // body.crouch — compress the logo VERTICALLY (perspective foreshorten, the vertical analog
      // of the body.turn width squash) and lower it so it tracks its spot on the sinking torso.
      const crouch = caps.get(BODY_CROUCH_KEY) ?? 0;
      const vFactor = 1 - crouch * (1 - CHEST_CROUCH_MIN_RATIO);
      const chestH = CHEST_SIZE * scale * vFactor;
      el.style.height = `${chestH}px`;
      // The div is top-anchored, so add half the height loss to keep the logo centered on its spot;
      // then slide it slightly UP (CHEST_CROUCH_RISE, negative) as it compresses.
      const crouchDrop = crouchPointDrop(crouch, CHEST_TOP_RATIO, BODY_H + BODY_OFFSET) * scale + (CHEST_SIZE * scale - chestH) / 2
        - crouch * CHEST_CROUCH_RISE * BODY_H * scale;
      el.style.transform = `translateX(calc(-50% + ${slideOffset}px)) translateY(${crouchDrop}px)`;
    },
    [scale, rig],
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
  const rig = useRig();
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const { BODY_W, BODY_H, BODY_OFFSET, BODY_TURN_RATIO, BODY_ROTATION, GAIT_BOUNCE_RATIO, GAIT_LEAN_DEG, GAIT_WALK_DROP } = rig;
      const bodyTurn = effectiveUpperTurn(caps);
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      const turnFactor = 1 - distance * (1 - BODY_TURN_RATIO);

      const fullW = (BODY_W + BODY_OFFSET) * scale;
      const shadowW = fullW * turnFactor;
      const shadowLeft = (fullW - shadowW) / 2;
      const mainW = shadowW - BODY_OFFSET * scale;
      const mainLeft = shadowLeft + (BODY_OFFSET / 2) * scale;

      // body.crouch — shrink the body face vertically (bottom-anchored: bottom edge stays, top
      // comes down) and sink the whole face. Main face keeps a constant BODY_OFFSET/2 inset from
      // the shadow on every side, so the outline thickness stays uniform (mirrors the width logic).
      const crouch = caps.get(BODY_CROUCH_KEY) ?? 0;
      const cf = crouchHeightFactor(crouch);
      const fullH = (BODY_H + BODY_OFFSET) * scale;
      const shadowH = fullH * cf;
      const shadowTop = (fullH - shadowH) + crouch * CROUCH_DROP * (BODY_H + BODY_OFFSET) * scale; // bottom-anchored shrink, then sink
      const mainH = shadowH - BODY_OFFSET * scale;
      const mainTop = shadowTop + (BODY_OFFSET / 2) * scale;

      const shadow = el.firstElementChild as HTMLElement | null;
      if (shadow) {
        shadow.style.width = `${shadowW}px`;
        shadow.style.left = `${shadowLeft}px`;
        shadow.style.height = `${shadowH}px`;
        shadow.style.top = `${shadowTop}px`;
      }
      const mainFace = el.children[1] as HTMLElement | null;
      if (mainFace) {
        mainFace.style.width = `${mainW}px`;
        mainFace.style.left = `${mainLeft}px`;
        mainFace.style.height = `${mainH}px`;
        mainFace.style.top = `${mainTop}px`;
      }

      // Walk gait — vertical step bounce (body.bounce) and lean into the travel direction
      // (body.lean) compose into the body's own transform, on top of the static centering +
      // rotation. The shadow is a sibling of Body, so it neither bounces nor leans (stays grounded).
      const bounce = caps.get(BODY_BOUNCE_KEY) ?? 0;
      const lean = caps.get(BODY_LEAN_KEY) ?? 0.5;
      const sink = caps.get(BODY_SINK_KEY) ?? 0;
      const leanDeg = (lean - 0.5) * 2 * GAIT_LEAN_DEG;
      // bounce lifts (−), the walk sink drops (+) by a flat scaled-px offset so the lean's pivot
      // doesn't float the feet; both compose into the body's own vertical transform.
      const bounceLiftPx = -bounce * GAIT_BOUNCE_RATIO * BODY_H * scale;
      const sinkDropPx = sink * GAIT_WALK_DROP * scale;
      el.style.transform = `translateX(-50%) translateY(${bounceLiftPx + sinkDropPx}px) rotate(${BODY_ROTATION + leanDeg}deg)`;
    },
    [scale, rig],
  );
  useAnimationRenderer(render);
  return ref;
}

// Wraps Body + Shadow and slides the whole figure by body.x (horizontal, walk/come) and body.y
// (vertical, drop free-fall), both in scaled px. The wrapper is a zero-size box at the figure's
// origin, so its children keep their existing absolute positioning; only the translate moves.
// HORIZONTAL travel only (body.x walk/come). Wraps the figure AND the shadow, so the shadow slides
// along the ground with the figure but does NOT rise/fall with it.
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

// VERTICAL travel only (body.y drop free-fall / jump). Wraps the figure but NOT the shadow, so the
// shadow stays pinned to the ground while the figure rises and falls.
function useVerticalRef() {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translateY(${caps.get(BODY_Y_KEY) ?? 0}px)`;
  }, []);
  useAnimationRenderer(render);
  return ref;
}

function Body({
  scale = 1,
  theme,
  showAnchor = false,
  chestImage,
  groundingOffset = 0,
  children,
}: {
  scale: number;
  theme: ColorTheme;
  showAnchor?: boolean;
  chestImage?: string;
  groundingOffset?: number;
  children: React.ReactNode;
}) {
  const s = (v: number) => v * scale;
  const bodyRef = useBodyRef(scale);
  const chestRef = useChestRef(scale);
  const { BODY_W, BODY_H, BODY_OFFSET, BODY_BOTTOM, BODY_RADIUS_TOP, BODY_RADIUS_BOT, BODY_ROTATION, BODY_PIVOT_X, BODY_PIVOT_Y, CHEST_SIZE, CHEST_TOP_RATIO, CHEST_LOGO_SHADOW_OFFSET, CHEST_LOGO_SHADOW_BLUR } = useRig();

  // Chained drop-shadows in all 8 directions at the same offset → a uniform outline halo around the
  // logo silhouette. (filter applies before mask, so it lives on a wrapper around the masked div.)
  const chestLogoShadow = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
    .map(
      ([dx, dy]) =>
        `drop-shadow(${s(dx * CHEST_LOGO_SHADOW_OFFSET)}px ${s(dy * CHEST_LOGO_SHADOW_OFFSET)}px ${s(CHEST_LOGO_SHADOW_BLUR)}px ${theme.primaryMidDark})`,
    )
    .join(" ");

  const baseRadius = (extra: number) =>
    `${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_BOT + extra)}px ${s(BODY_RADIUS_BOT + extra)}px`;

  return (
    <div
      ref={bodyRef}
      style={{
        position: "absolute",
        bottom: s(BODY_BOTTOM + groundingOffset),
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
          zIndex: 4, // above the arms (z3) so the arms never render in front of the torso
          top: s(BODY_OFFSET / 2),
          left: s(BODY_OFFSET / 2),
          width: s(BODY_W),
          height: s(BODY_H),
          backgroundColor: theme.primary,
          borderRadius: baseRadius(0),
        }}
      />
      {/* Chest — just the logo PNG, mask-tinted in the brightest palette tone and scaled to fill the
          chest box. No background panel. Foreshortens/slides/crouches via useChestRef. */}
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
        {chestImage && (
          // Outer wrapper carries the drop-shadow; inner div carries the mask. The filter must live
          // on a SEPARATE element from the mask — CSS applies `filter` before `mask`, so a shadow on
          // the masked element itself gets clipped away by its own mask. Applied to the wrapper, the
          // shadow follows the already-masked silhouette.
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter: chestLogoShadow,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: theme.primaryDark,
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
          </div>
        )}
      </div>
      {children}
      {showAnchor && <PivotMarker scale={scale} x={BODY_PIVOT_X} y={BODY_PIVOT_Y} />}
    </div>
  );
}

function useHeadRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const { HEAD_W, HEAD_H, HEAD_OFFSET, HEAD_ROTATION, HEAD_ROUNDNESS, HEAD_TURN_RATIO, HEAD_TILT_RATIO, HEAD_TURN_RADIUS_GROW, HEAD_TILT_RADIUS_GROW, HEAD_LIGHT_INSET, HEAD_LIGHT_MARGIN, HEAD_MAIN_INSET, HEAD_MAIN_MARGIN, HEAD_SHADOW_OFFSET, BODY_H, BODY_OFFSET } = rig;

    // head.bob — tilts the whole head left/right via rotation. body.crouch lowers the whole head
    // (wrapper translateY) so it tracks the body's top dropping; applied here, NOT to the inner
    // layers, so it composes cleanly with head.tilt (which shifts those layers vertically).
    const bob = caps.get(HEAD_BOB_KEY) ?? 0.5;
    const angle = (bob - 0.5) * 2 * MAX_HEAD_BOB_DEGREES;
    const crouchDrop = crouchPointDrop(caps.get(BODY_CROUCH_KEY) ?? 0, 0, BODY_H + BODY_OFFSET) * scale; // top-edge drop
    el.style.transform = `translateX(-50%) translateY(${crouchDrop}px) rotate(${HEAD_ROTATION + angle}deg)`;

    // head.turn — horizontal foreshortening. Width shrinks symmetrically around the center.
    // Side outlines stay constant thickness because the inner divs use constant pixel insets
    // from the (potentially shifted) base.
    const turn = effectiveHeadTurn(caps);
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const baseW = (HEAD_W + HEAD_OFFSET) * scale * turnFactor;
    const turnShift = ((HEAD_W + HEAD_OFFSET) * scale - baseW) / 2;
    const lightLeftInset = HEAD_LIGHT_INSET;
    const lightSideMargin = HEAD_LIGHT_MARGIN;
    const mainLeftInset = HEAD_MAIN_INSET;
    const mainSideMargin = HEAD_MAIN_MARGIN;

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
    const lightTopInset = HEAD_LIGHT_INSET;
    const lightVerticalMargin = HEAD_LIGHT_MARGIN;
    const mainTopInset = HEAD_MAIN_INSET;
    const mainVerticalMargin = HEAD_MAIN_MARGIN;

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
      headMain.style.borderRadius = radiusShorthand((HEAD_ROUNDNESS + HEAD_OFFSET / 2 - mainLeftInset) * scale);
    }

    // Shadow layer — the main-face box shifted down-right by HEAD_SHADOW_OFFSET, beneath the face
    // (z2), so only its bottom-right crescent peeks out (the dark mirror of the top-left highlight).
    const headShadow = el.children[3] as HTMLElement | null;
    if (headShadow) {
      // Mirror of the highlight: top-left anchored to the face, grown bottom-right by the crescent
      // offset (radius grown to match) so the crescent reaches the top-right & bottom-left corners.
      headShadow.style.width = `${baseW - mainSideMargin * scale + HEAD_SHADOW_OFFSET * scale}px`;
      headShadow.style.height = `${baseH - mainVerticalMargin * scale + HEAD_SHADOW_OFFSET * scale}px`;
      headShadow.style.left = `${turnShift + mainLeftInset * scale}px`;
      headShadow.style.top = `${tiltShift + (mainTopInset + HEAD_SHADOW_NUDGE) * scale}px`;
      headShadow.style.borderRadius = radiusShorthand((HEAD_ROUNDNESS + HEAD_OFFSET / 2 - mainLeftInset + HEAD_SHADOW_OFFSET) * scale);
    }
  }, [scale, rig]);
  useAnimationRenderer(render);
  return ref;
}

// Head anatomy (dimensions, roundness, pivot, foreshorten/radius-grow, shading insets, attachment
// top) is resolved in resolveRig(). HEAD_SHADOW_NUDGE below is render tuning — it covers a sub-px
// bright seam along the shadow's bottom edge.
const HEAD_SHADOW_NUDGE = 0.5; // px the shadow sits BELOW the face. TWEAK ME.

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
  const { HEAD_W, HEAD_H, HEAD_OFFSET, HEAD_TOP, HEAD_ROTATION, HEAD_ROUNDNESS, HEAD_PIVOT_X, HEAD_PIVOT_Y, HEAD_LIGHT_INSET, HEAD_LIGHT_MARGIN, HEAD_MAIN_INSET, HEAD_MAIN_MARGIN, HEAD_SHADOW_OFFSET } = useRig();

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
          top: s(HEAD_LIGHT_INSET),
          left: s(HEAD_LIGHT_INSET),
          width: s(HEAD_W + HEAD_OFFSET - HEAD_LIGHT_MARGIN),
          height: s(HEAD_H + HEAD_OFFSET - HEAD_LIGHT_MARGIN),
          backgroundColor: theme.primaryMidDark,
          borderRadius: s(HEAD_ROUNDNESS),
        }}
      />
      {/* Main face — top layer, centered, slightly smaller */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          top: s(HEAD_MAIN_INSET),
          left: s(HEAD_MAIN_INSET),
          width: s(HEAD_W + HEAD_OFFSET - HEAD_MAIN_MARGIN),
          height: s(HEAD_H + HEAD_OFFSET - HEAD_MAIN_MARGIN),
          background: `linear-gradient(135deg, ${theme.primaryMid} 0%, ${theme.primary} 40%, ${theme.primaryDark} 100%)`,
          borderRadius: s(HEAD_ROUNDNESS + HEAD_OFFSET / 2 - HEAD_MAIN_INSET),
        }}
      />
      {/* Shadow — beneath the main face (z2), the face box shifted down-right so only its
          bottom-right crescent shows. The dark mirror of the top-left highlight. */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          // Mirror of the highlight: top-left anchored to the face (nudged ~0.5px down to cover a sub-px
          // seam along the bottom), grown bottom-right by the crescent offset (radius grown to match).
          top: s(HEAD_MAIN_INSET + HEAD_SHADOW_NUDGE),
          left: s(HEAD_MAIN_INSET),
          width: s(HEAD_W + HEAD_OFFSET - HEAD_MAIN_MARGIN + HEAD_SHADOW_OFFSET),
          height: s(HEAD_H + HEAD_OFFSET - HEAD_MAIN_MARGIN + HEAD_SHADOW_OFFSET),
          backgroundColor: theme.primaryDark,
          borderRadius: s(HEAD_ROUNDNESS + HEAD_OFFSET / 2 - HEAD_MAIN_INSET + HEAD_SHADOW_OFFSET),
        }}
      />
      {children}
      {showAnchor && <PivotMarker scale={scale} x={HEAD_PIVOT_X} y={HEAD_PIVOT_Y} />}
    </div>
  );
}

// Eye anatomy (dims, placement, roundness, pupil inset, foreshorten ratios) is resolved in resolveRig().
const MAX_BLINK_CLOSE = .84;             // motion-tuning: how far the eye closes on a full blink
const EYE_TILT_SLIDE_UP = 58 / 90;            // motion-tuning: tilt-up slide, fraction of head height (× HEAD_H)
const EYE_TILT_SLIDE_DOWN = 14 / 90;          // motion-tuning: tilt-down slide, fraction of head height (× HEAD_H)

// Shared eye renderer. Handles both eyes.blink (vertical) and head.turn (horizontal)
// in a single tick, on the same element + pupil child. `side` is the CSS property
// the eye is positioned with ("left" for LeftEye, "right" for RightEye).
function useEyeRefShared(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const { EYE_W, EYE_H, EYE_TOP_RATIO, EYE_SIDE_RATIO, EYE_TURN_CLOSER_INSET, EYE_TURN_FURTHER_INSET, EYE_OFFSET_V, EYE_OFFSET_H, EYE_TURN_W_RATIO, EYE_TILT_H_RATIO, EYE_TILT_PERSPECTIVE_POWER, HEAD_W, HEAD_H, HEAD_OFFSET, HEAD_TILT_RATIO } = rig;
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
    const tiltSlideMagnitude = (signedTiltDistance >= 0 ? EYE_TILT_SLIDE_UP : EYE_TILT_SLIDE_DOWN) * HEAD_H;
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
    // Derive the shared gaze slide (ease-out, both eyes toward the gaze) and the per-eye convergence
    // (ease-in, near/far differentiation) from the two authorable full-turn insets, so each endpoint
    // lands exactly on its inset while the motion feel is preserved. At full turn the closer eye sits
    // at EYE_TURN_CLOSER_INSET and the further eye at EYE_TURN_FURTHER_INSET (× headW from its own edge).
    const turnGaze = (EYE_TURN_FURTHER_INSET - EYE_TURN_CLOSER_INSET) / 2;
    const turnConverge = (EYE_TURN_CLOSER_INSET + EYE_TURN_FURTHER_INSET) / 2 - EYE_SIDE_RATIO;
    const screenDx =
      easedTurnGazeSigned * turnGaze * HEAD_W +
      (isLeft ? 1 : -1) * easedTurnPerspective * turnConverge * HEAD_W;
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

    // eyes.spin (connecting mode) — rotate the whole eye around its own center. 0 = upright;
    // a 0→1 sweep is one full turn. transform-origin defaults to the element center.
    const spin = caps.get(EYE_SPIN_KEY) ?? 0;
    el.style.transform = spin ? `rotate(${spin * 360}deg)` : "";
  }, [scale, side, rig]);
  useAnimationRenderer(render);
  return ref;
}

function LeftEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const eyeRef = useEyeRefShared(scale, "left");
  const { HEAD_W, HEAD_H, EYE_W, EYE_H, EYE_TOP_RATIO, EYE_SIDE_RATIO, EYE_ROUNDNESS_RATIO, PUPIL_W, PUPIL_H } = useRig();

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
        borderRadius: s(EYE_W * EYE_ROUNDNESS_RATIO),
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
          borderRadius: s(PUPIL_W * EYE_ROUNDNESS_RATIO),
        }}
      />
    </div>
  );
}

function RightEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const eyeRef = useEyeRefShared(scale, "right");
  const { HEAD_W, HEAD_H, EYE_W, EYE_H, EYE_TOP_RATIO, EYE_SIDE_RATIO, EYE_ROUNDNESS_RATIO, PUPIL_W, PUPIL_H } = useRig();

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
        borderRadius: s(EYE_W * EYE_ROUNDNESS_RATIO),
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
          borderRadius: s(PUPIL_W * EYE_ROUNDNESS_RATIO),
        }}
      />
    </div>
  );
}

// Ear anatomy (placement, height/roundness ratios, rest size derived from the outline) is resolved in
// resolveRig(). The turn-inward slide is universal across robots, so it's a shared constant here.
const EAR_TURN_INWARD_RATIO = 0.25;       // how far the cup slides inward at full turn (× headW) — shared
const EAR_HIDE_RATE = 3;                  // motion-tuning: how quickly the ear disappears (higher = faster)
const EAR_TILT_SLIDE = 8 / 90;            // motion-tuning: vertical slide on full tilt, fraction of head height (× HEAD_H)
const EAR_Z_BEHIND = -1;                  // always behind the head outline (cartoon style) — the head silhouette occludes the ear

// Shared shape math — `side` is the "left" or "right" CSS property name.
function useEarRefShared(scale: number, side: "left" | "right", hideWhenTurnGreater: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const { EAR_REST_W, EAR_REST_OFFSET, EAR_HIDE_MIN_W, EAR_RADIUS_RATIO, EAR_HEIGHT_RATIO, EAR_TOP_RATIO, HEAD_W, HEAD_H, HEAD_OFFSET, HEAD_TURN_RATIO } = rig;
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
    // Behind the head outline (cartoon style) — the head occludes the ear; only the part poking
    // past the silhouette shows.
    el.style.zIndex = String(EAR_Z_BEHIND);

    // head.tilt — small vertical slide in the gaze direction. No size change, no horizontal
    // change. tilt=1 (look up) → slide up (top decreases); tilt=0 (look down) → slide down.
    const tiltSlide = -(tilt - 0.5) * 2 * EAR_TILT_SLIDE * HEAD_H;
    el.style.top = `${(HEAD_H * EAR_TOP_RATIO + tiltSlide) * scale}px`;
  }, [scale, side, hideWhenTurnGreater, rig]);
  useAnimationRenderer(render);
  return ref;
}

function LeftEar({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const earRef = useEarRefShared(scale, "left", false);
  const { HEAD_H, EAR_TOP_RATIO, EAR_REST_OFFSET, EAR_REST_W, EAR_HEIGHT_RATIO, EAR_RADIUS_RATIO } = useRig();

  return (
    <div
      ref={earRef}
      style={{
        position: "absolute",
        zIndex: EAR_Z_BEHIND,
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
  const { HEAD_H, EAR_TOP_RATIO, EAR_REST_OFFSET, EAR_REST_W, EAR_HEIGHT_RATIO, EAR_RADIUS_RATIO } = useRig();

  return (
    <div
      ref={earRef}
      style={{
        position: "absolute",
        zIndex: EAR_Z_BEHIND,
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

// Antenna anatomy (dims, base-anchored top, right placement, radius, rest lean, tilt foreshorten)
// is resolved in resolveRig().
const ANTENNA_TURN_ANGLE_DELTA = 8;            // motion-tuning: gaze lean (deg)
const ANTENNA_TILT_SLIDE = 18 / 90;            // motion-tuning: vertical slide at full tilt, fraction of head height (× HEAD_H)
const ANTENNA_Z_BEHIND = -1;                  // always behind the head outline (cartoon occlusion), like the ears
const ANTENNA_WIGGLE_AMPLITUDE_DEG = 25;      // motion-tuning: max wiggle rotation offset at antenna.wiggle = 0 or 1

function useAntennaRef(scale: number, showAnchor: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const { ANTENNA_H, ANTENNA_TOP, ANTENNA_RIGHT, ANTENNA_ANGLE, ANTENNA_TILT_H_RATIO, HEAD_W, HEAD_H, HEAD_OFFSET, HEAD_TURN_RATIO } = rig;
    const turn = effectiveHeadTurn(caps);
    const rawTilt = caps.get(HEAD_TILT_KEY) ?? 0.5;
    const tilt = remapTilt(rawTilt);

    // Z-order: always behind the head outline (cartoon occlusion), same as the ears — the silhouette
    // occludes the antenna root and only the part poking past the crown shows. (The tilt/turn-driven
    // front/behind flip was dropped — it read messy at combined head angles.) showAnchor (debug)
    // keeps it on top regardless so the pivot markers stay visible.
    el.style.zIndex = String(showAnchor ? 999 : ANTENNA_Z_BEHIND);

    // Position: stay glued to the visible head's right edge as it turns AND track the head's
    // top edge as it foreshortens vertically on tilt (antenna sits on the crown).
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const turnShift = (HEAD_W + HEAD_OFFSET) * Math.abs(turn - .5) * (1 - HEAD_TURN_RATIO);
    const baseW = (HEAD_W + HEAD_OFFSET) * turnFactor;
    const restAntennaRight = HEAD_OFFSET / 2 + ANTENNA_RIGHT;
    el.style.right = `${((HEAD_W + HEAD_OFFSET) + restAntennaRight - turnShift - baseW) * scale}px`;

    // head.tilt — two effects on the antenna (it always stays behind the head outline now):
    //   1. foreshortening (height shrinks) — the stick compresses out of the picture plane.
    //   2. whole-antenna slide DOWN — the base sinks toward the head as the crown rotates
    //      out of view. Symmetric at both extremes.
    // The shrink (1) is bottom-anchored relative to the antenna itself, so its top moves down.
    // The slide (2) adds an additional drop to BOTH ends. Net result at extreme: top moves down
    // by shrink + slide; base moves down by slide.
    const tiltDistance = Math.abs(tilt - 0.5) * 2;
    const antennaHFactor = 1 - tiltDistance * (1 - ANTENNA_TILT_H_RATIO);
    const antennaH = ANTENNA_H * antennaHFactor;
    const antennaShrink = ANTENNA_H - antennaH;
    const antennaTiltSlide = tiltDistance * ANTENNA_TILT_SLIDE * HEAD_H;
    el.style.height = `${antennaH * scale}px`;
    el.style.top = `${(ANTENNA_TOP + antennaShrink + antennaTiltSlide) * scale}px`;

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
  }, [scale, showAnchor, rig]);
  useAnimationRenderer(render);
  return ref;
}

function Antenna({ scale = 1, theme, showAnchor = false, signal = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean; signal?: boolean }) {
  const s = (v: number) => v * scale;
  const antennaRef = useAntennaRef(scale, showAnchor);
  const { ANTENNA_W, ANTENNA_H, ANTENNA_TOP, ANTENNA_RIGHT, ANTENNA_RADIUS, ANTENNA_ANGLE, HEAD_OFFSET } = useRig();

  return (
    <div
      ref={antennaRef}
      style={{
        position: "absolute",
        zIndex: showAnchor ? 999 : ANTENNA_Z_BEHIND,
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
      {/* Connecting-mode signal rings, anchored to the antenna tip so they ride its wiggle/turn. */}
      {signal && <SignalWaves scale={scale} theme={theme} />}
      {showAnchor && <PivotMarker scale={scale} x={ANTENNA_W / 2} y={ANTENNA_H} />}
    </div>
  );
}

// Connecting-mode "signal" rings that radiate from near the antenna tip: concentric circles that
// expand outward and fade, staggered so a fresh ripple leaves the tip continuously (a radar-ping /
// broadcasting feel). Pure CSS keyframe loop (no capability) — rendered only while in connecting
// mode. Positioned in Head coordinates near the antenna tip; the head is held calm in connecting
// mode so a fixed emitter point tracks the tip well. Sits above the head face (zIndex) so the rings
// read clearly instead of hiding behind it (unlike the antenna itself, which is behind the head).
const SIGNAL_TIP_OFFSET = 0;   // emitter position along the antenna's top edge (unscaled px; negative = above the tip)
const SIGNAL_RING_COUNT = 3;   // number of concurrent rings (staggered)
const SIGNAL_PERIOD_MS = 1600; // one ring's full expand+fade cycle
const SIGNAL_MIN = 8 / 120;          // ring diameter at emission, as a fraction of head width (× HEAD_W)
const SIGNAL_MAX = 52 / 120;         // ring diameter when fully expanded, fraction of head width (× HEAD_W)
const SIGNAL_THICKNESS = 3 / 120;    // ring line thickness, fraction of head width (× HEAD_W) — CONSTANT as the ring expands

// Rendered as a child of the Antenna, anchored at its tip (top-center, local coords), so the rings
// inherit the antenna's transform and ride its wiggle/turn/tilt for free.
function SignalWaves({ scale, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const { HEAD_W, SIGNAL_SCALE } = useRig();
  // The rings are head-relative (× HEAD_W); SIGNAL_SCALE is a per-character uniform multiplier on the
  // whole signal — diameters AND line thickness — so it reads as the same graphic, just bigger/smaller.
  const sig = HEAD_W * SIGNAL_SCALE;
  const min = s(SIGNAL_MIN * sig);
  const max = s(SIGNAL_MAX * sig);
  // Grow via width/height (NOT transform: scale) so the border stays a constant SIGNAL_THICKNESS as
  // the ring expands. A constant translate(-50%,-50%) keeps each ring centered on the emitter point
  // at every size. fill-mode "both" holds the 0% keyframe (tiny + transparent) during the staggered
  // start delay, so there's no full-size static ring before a ring's cycle begins.
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",                 // antenna's horizontal center
        top: s(SIGNAL_TIP_OFFSET),   // the antenna's top edge = the tip
        width: 0,
        height: 0,
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes tally-signal {
        0%   { width: ${min}px; height: ${min}px; opacity: 0; }
        25%  { opacity: 0.85; }
        100% { width: ${max}px; height: ${max}px; opacity: 0; }
      }`}</style>
      {Array.from({ length: SIGNAL_RING_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: max,
            height: max,
            border: `${s(SIGNAL_THICKNESS * sig)}px solid ${theme.outline}`,
            borderRadius: "50%",
            boxSizing: "border-box",
            transform: "translate(-50%, -50%)",
            animation: `tally-signal ${SIGNAL_PERIOD_MS}ms linear ${(i * SIGNAL_PERIOD_MS) / SIGNAL_RING_COUNT}ms infinite both`,
          }}
        />
      ))}
    </div>
  );
}

// Arm anatomy (upper/lower dims, offset, shoulder anchor, rest angles incl. their right-mirrors)
// is resolved in resolveRig().
const ARM_HAND_ROUNDNESS = 0.35;       // forearm's BOTTOM (hand) corner radius ÷ forearm width — slightly flatter than the 0.5 elbow end, to imply a hand. Shared across characters.
const SHOULDER_TURN_INWARD = 16 / 52;  // motion-tuning: max shoulder inward shift at full body.turn, fraction of body width (× BODY_W)
// body.crouch arm pose (degrees at full crouch, mirrored per side). Upper arms rotate further
// OUTWARD so the elbows stick out; forearms rotate INWARD so the hands turn toward the feet.
const CROUCH_UPPER_OUT_DEG = 20;
const CROUCH_FOREARM_IN_DEG = 70;

// Target angles for the LeftArm at arms.left.raise = 1. Interpolated linearly from the rest
// angles above. Tuned for a "stop" gesture: upper arm rotated up-and-outward, lower arm bent
// at the elbow so the forearm is roughly vertical and the hand sits at face level.
const LEFT_UPPER_RAISED_ANGLE = 45;
const LEFT_LOWER_RAISED_ANGLE = 130;

// Shared renderer for both layers (outer outline + inner face) of an arm, for either side. The
// wrapper div carries the ref; the renderer walks its children and sets each upper's transform
// plus the corresponding lower's transform (the lower is the upper's firstElementChild — both
// layers have the lower as their first child even when showAnchor adds a sibling PivotMarker).
// Drives: body.turn inward shift; arms.stride (rotate the whole arm from the shoulder, anti-phase
// across the two arms and counter to the same-side leg — so left arm swings forward as left leg
// goes back); and, left arm only, the arms.left.raise "stop" gesture composed on top.
function useArmRef(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const { ARM_SHOULDER_RATIO, ARM_FLAIL_REST_CAP, LEFT_UPPER_ANGLE, RIGHT_UPPER_ANGLE, LEFT_LOWER_ANGLE, RIGHT_LOWER_ANGLE, BODY_W, BODY_H, BODY_OFFSET, GAIT_ARM_SWING_DEG } = rig;
      const isLeft = side === "left";

      // upper-body turn — shift the entire arm wrapper inward by sliding its edge toward center.
      const bodyTurn = effectiveUpperTurn(caps);
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      el.style[side] = `${distance * SHOULDER_TURN_INWARD * BODY_W * scale}px`;

      // body.crouch — lower the whole arm wrapper so the shoulder tracks its spot on the sinking
      // body. (Position via the side edge above; vertical via transform — independent axes.)
      const crouch = caps.get(BODY_CROUCH_KEY) ?? 0;
      const crouchDrop = crouchPointDrop(crouch, ARM_SHOULDER_RATIO, BODY_H + BODY_OFFSET) * scale;
      el.style.transform = `translateY(${crouchDrop}px)`;
      // body.crouch arm pose: upper arm rotates OUTWARD (elbows out), forearm rotates INWARD
      // (hands toward the feet). Mirrored per side — sign tracks each side's rest-angle direction.
      const crouchUpperDelta = (isLeft ? 1 : -1) * crouch * CROUCH_UPPER_OUT_DEG;
      const crouchLowerDelta = (isLeft ? -1 : 1) * crouch * CROUCH_FOREARM_IN_DEG;

      // arms.stride — rotate the upper arm about the shoulder. swingSign is the opposite of the
      // same-side leg's (legs: left +1 / right -1) so each arm counter-swings its leg.
      const swing = caps.get(ARMS_STRIDE_KEY) ?? 0.5;
      const swingSign = isLeft ? -1 : 1;
      const swingDelta = swingSign * (swing - 0.5) * 2 * GAIT_ARM_SWING_DEG;

      // *.flail (drop) — per-arm. The cap maps linearly to an absolute upper-arm angle in
      // [ARM_FLAIL_MIN, ARM_FLAIL_MAX]; at its rest cap the arm sits at LEFT_UPPER_ANGLE (rest), so
      // the flail is a no-op when not applied. Mirrored per side (sign flip). Expressed as a delta.
      const armFlailCap = caps.get(isLeft ? ARMS_LEFT_FLAIL_KEY : ARMS_RIGHT_FLAIL_KEY) ?? ARM_FLAIL_REST_CAP;
      const flailMag = ARM_FLAIL_MIN + armFlailCap * (ARM_FLAIL_MAX - ARM_FLAIL_MIN);
      const flailDelta = (isLeft ? 1 : -1) * (flailMag - LEFT_UPPER_ANGLE);

      // arms.*.raise — the "stop" gesture composes on top of the rest pose. Per-side capability;
      // the raise delta is computed from the LEFT convention and sign-flipped for the right so the
      // arms mirror (same pattern as flail/crouch above).
      const raise = caps.get(isLeft ? ARMS_LEFT_RAISE_KEY : ARMS_RIGHT_RAISE_KEY) ?? 0;
      const mirror = isLeft ? 1 : -1;
      const restUpper = isLeft ? LEFT_UPPER_ANGLE : RIGHT_UPPER_ANGLE;
      const restLower = isLeft ? LEFT_LOWER_ANGLE : RIGHT_LOWER_ANGLE;
      const raiseUpperDelta = mirror * raise * (LEFT_UPPER_RAISED_ANGLE - LEFT_UPPER_ANGLE);
      const upperAngle = restUpper + raiseUpperDelta + swingDelta + crouchUpperDelta + flailDelta;
      // arms.*.wave — rotates the FOREARM about the elbow (upper arm/elbow stay put), waving the hand
      // side to side. Composes on top of the raised forearm angle; mirrored on the right.
      const wave = caps.get(isLeft ? ARMS_LEFT_WAVE_KEY : ARMS_RIGHT_WAVE_KEY) ?? 0.5;
      const waveDelta = mirror * (wave - 0.5) * 2 * HAND_WAVE_DEG;
      const raiseLowerDelta = mirror * raise * (LEFT_LOWER_RAISED_ANGLE - LEFT_LOWER_ANGLE);
      const lowerAngle = restLower + raiseLowerDelta + waveDelta + crouchLowerDelta;

      for (let i = 0; i < el.children.length; i++) {
        const upper = el.children[i] as HTMLElement;
        upper.style.transform = `rotate(${upperAngle}deg)`;
        const lower = upper.firstElementChild as HTMLElement | null;
        if (lower) lower.style.transform = `rotate(${lowerAngle}deg)`;
      }
    },
    [scale, side, rig],
  );
  useAnimationRenderer(render);
  return ref;
}

function LeftArm({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const armRef = useArmRef(scale, "left");
  const { BODY_H, ARM_SHOULDER_RATIO, ARM_UPPER_W, ARM_UPPER_H, ARM_LOWER_W, ARM_LOWER_H, ARM_OFFSET, LEFT_UPPER_ANGLE, LEFT_LOWER_ANGLE } = useRig();

  return (
    <div
      ref={armRef}
      style={{
        position: "absolute",
        // The wrapper carries a transform (crouch translateY), so it's its own stacking context —
        // z-index must live HERE (not on the inner layers) to lift the whole arm above the legs
        // (now z2) so hands render above feet, while staying BELOW the body face (z4) so the arms
        // never render in front of the torso.
        zIndex: 3,
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
          zIndex: 4,
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
            // Forearm: round top (elbow), slightly flatter bottom (hand) — see ARM_HAND_ROUNDNESS.
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W * ARM_HAND_ROUNDNESS)}px ${s(ARM_LOWER_W * ARM_HAND_ROUNDNESS)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s(ARM_UPPER_W / 2)}px ${s(ARM_LOWER_W / 2)}px`,
            transform: `rotate(${LEFT_LOWER_ANGLE}deg)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: showAnchor ? 999 : 4,
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
            borderRadius: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) * ARM_HAND_ROUNDNESS)}px ${s((ARM_LOWER_W - ARM_OFFSET) * ARM_HAND_ROUNDNESS)}px`,
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
  const { BODY_H, ARM_SHOULDER_RATIO, ARM_UPPER_W, ARM_UPPER_H, ARM_LOWER_W, ARM_LOWER_H, ARM_OFFSET, RIGHT_UPPER_ANGLE, RIGHT_LOWER_ANGLE } = useRig();

  return (
    <div
      ref={armRef}
      style={{
        position: "absolute",
        zIndex: 3, // wrapper is a stacking context (transform) — z-index belongs here (see LeftArm)
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
          zIndex: 4,
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
            // Forearm: round top (elbow), slightly flatter bottom (hand) — see ARM_HAND_ROUNDNESS.
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W * ARM_HAND_ROUNDNESS)}px ${s(ARM_LOWER_W * ARM_HAND_ROUNDNESS)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px`,
            transform: `rotate(${RIGHT_LOWER_ANGLE}deg)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: showAnchor ? 999 : 4,
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
            borderRadius: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) * ARM_HAND_ROUNDNESS)}px ${s((ARM_LOWER_W - ARM_OFFSET) * ARM_HAND_ROUNDNESS)}px`,
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

// Leg + foot anatomy (dims, offset, hip inset/tuck, rest splay angles incl. right-mirrors, foot
// rest inset derived from the outline) is resolved in resolveRig().
const HIP_TURN_INWARD = 12 / 52;     // motion-tuning: max hip inward shift at full body.turn, fraction of body width (× BODY_W)
const FOOT_SOLE_ROUNDNESS = 0.25;    // foot SOLE (bottom) corner radius ÷ foot width — shared shoe shape (top corners domed at 0.5)

// Leg renderer — hip-inward shift + foot horizontal slide. Feet move in opposite local
// directions so they don't cross:
//   TRAILING foot slides INWARD across its leg's local frame (toward body center).
//   LEADING foot slides OUTWARD across its leg's local frame (away from body center).
// The TRAILING contribution INCREASES the CSS prop value; the LEADING contribution DECREASES
// it. Only one of the two contributions is non-zero at a time.
function useLegRef(scale: number, side: "left" | "right") {
  const ref = useRef<HTMLDivElement>(null);
  const rig = useRig();
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const { LEFT_LEG_ANGLE, RIGHT_LEG_ANGLE, LEG_W, FOOT_H, LEG_FLAIL_REST_CAP, BODY_W, GAIT_STRIDE_DEG } = rig;
      const bodyTurn = caps.get(BODY_TURN_KEY) ?? 0.5;
      const distance = Math.abs(bodyTurn - 0.5) * 2;
      const isLeft = side === "left";

      // Depth z-order: turning right (body.turn > 0.5) rotates the body's LEFT side toward the viewer,
      // so the left leg rides on top of the right (mirror for turning left). The NEAR leg LIFTS to z3
      // (above the other leg and the body's z2 shadow, still below the body face z4 so its hip stays
      // tucked); the FAR leg and BOTH legs at neutral stay at z2 — on top of the shadow, so every leg's
      // inner blue reads in front of the body outline, never swallowed behind it. z3 momentarily ties
      // the arms (also z3), but only for the forward leg mid-turn, where overlap is rare and the forward
      // leg reading on top is fine. Setting z-index makes the wrapper a stacking context (whole leg as a
      // unit); the flip is at the neutral 0.5 point where the legs are splayed apart, so it's seamless.
      const isNear = isLeft ? bodyTurn > 0.5 : bodyTurn < 0.5;
      el.style.zIndex = isNear ? "3" : "2";

      // Hip inward shift — slide the leg wrapper's edge toward body center as body.turn departs 0.5.
      el.style[side] = `${distance * HIP_TURN_INWARD * BODY_W * scale}px`;

      // legs.stride — rotate the whole leg about the hip, anti-phase across the two legs, so they
      // alternate during a walk. Composes on top of each leg's rest angle. Both upper-leg layers
      // (outline + face) share the angle; the foot rides along since it's their child.
      const swing = caps.get(LEGS_STRIDE_KEY) ?? 0.5;
      const swingSign = isLeft ? 1 : -1;
      const restAngle = isLeft ? LEFT_LEG_ANGLE : RIGHT_LEG_ANGLE;
      // *.flail (drop) — per-leg, exactly like the arms: the cap maps linearly to an absolute leg
      // angle in [LEG_FLAIL_MIN, LEG_FLAIL_MAX]; at its rest cap the leg sits at LEFT_LEG_ANGLE
      // (rest), so it's a no-op when not applied. Mirrored per side (sign flip). Expressed as a delta.
      const legFlailCap = caps.get(isLeft ? LEGS_LEFT_FLAIL_KEY : LEGS_RIGHT_FLAIL_KEY) ?? LEG_FLAIL_REST_CAP;
      const legFlailMag = LEG_FLAIL_MIN + legFlailCap * (LEG_FLAIL_MAX - LEG_FLAIL_MIN);
      const flailDelta = (isLeft ? 1 : -1) * (legFlailMag - LEFT_LEG_ANGLE);
      const legAngle = restAngle + swingSign * (swing - 0.5) * 2 * GAIT_STRIDE_DEG + flailDelta;

      // Foot horizontal anchor: centered on the leg (the foot box's center sits on the leg centerline),
      // so the symmetric foot has no left/right lean — a body turn never reveals a wrong-pointing foot.
      const footInset = ((LEG_W - FOOT_H) / 2) * scale;

      // Two upper-leg layers (outer outline + inner face) — each has the foot as its
      // firstElementChild. Apply the swing rotation to each layer and update both feet together.
      // (Foot rotation is anatomy — a static JSX transform — and is correct on mount/remount.)
      for (let i = 0; i < el.children.length; i++) {
        const upperLeg = el.children[i] as HTMLElement;
        upperLeg.style.transform = `rotate(${legAngle}deg)`;
        const foot = upperLeg.firstElementChild as HTMLElement | null;
        if (foot) foot.style[side] = `${footInset}px`;
      }
    },
    [scale, side, rig],
  );
  useAnimationRenderer(render);
  return ref;
}

function LeftLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const legRef = useLegRef(scale, "left");
  const { LEG_W, LEG_H, LEG_OFFSET, LEG_HIP_TUCK, LEG_HIP_INSET, BODY_W, BODY_OFFSET, FOOT_W, FOOT_H, LEFT_LEG_ANGLE, LEFT_FOOT_ANGLE } = useRig();

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
          data-tally-foot=""
          style={{
            position: "absolute",
            // Anchored about the foot's OWN geometric center (transformOrigin = box center): the foot is
            // a symmetric capsule sitting centered on the leg, so it has no left/right direction. `top`
            // is shifted by (FOOT_H−FOOT_W)/2 so the ankle (now the box center) stays where it was.
            top: s(LEG_H - (FOOT_H + FOOT_W) / 2 + LEG_OFFSET / 2),
            left: s((LEG_W - FOOT_H) / 2),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(FOOT_H / 2)}px ${s(FOOT_W / 2)}px`,
            backgroundColor: theme.outline,
            // Shoe shape: domed top corners (0.5), flatter sole corners (FOOT_SOLE_ROUNDNESS). Mirrored
            // vs the right foot, since the two feet lay flat by OPPOSITE ±90° rotations.
            borderRadius: `${s(FOOT_H * 0.5)}px ${s(FOOT_H * FOOT_SOLE_ROUNDNESS)}px ${s(FOOT_H * FOOT_SOLE_ROUNDNESS)}px ${s(FOOT_H * 0.5)}px`,
            transform: `rotate(${LEFT_FOOT_ANGLE + 90}deg)`,
          }}
        />
      </div>
      {/* Inner face layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
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
            top: s(LEG_H - (FOOT_H + FOOT_W) / 2 + LEG_OFFSET / 2),
            left: s((LEG_W - FOOT_H) / 2),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * FOOT_SOLE_ROUNDNESS)}px ${s((FOOT_H - LEG_OFFSET) * FOOT_SOLE_ROUNDNESS)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px`,
            // Rotates about its own geometric center; sole corners flatter than the domed top.
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_W - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${LEFT_FOOT_ANGLE + 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_W - LEG_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </div>
  );
}

function RightLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;
  const legRef = useLegRef(scale, "right");
  const { LEG_W, LEG_H, LEG_OFFSET, LEG_HIP_TUCK, LEG_HIP_INSET, BODY_W, BODY_OFFSET, FOOT_W, FOOT_H, RIGHT_LEG_ANGLE, RIGHT_FOOT_ANGLE } = useRig();

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
          data-tally-foot=""
          style={{
            position: "absolute",
            // Symmetric capsule centered about its own geometric center (see LeftLeg) → no direction.
            top: s(LEG_H - (FOOT_H + FOOT_W) / 2 + LEG_OFFSET / 2),
            right: s((LEG_W - FOOT_H) / 2),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(FOOT_H / 2)}px ${s(FOOT_W / 2)}px`,
            backgroundColor: theme.outline,
            borderRadius: `${s(FOOT_H * FOOT_SOLE_ROUNDNESS)}px ${s(FOOT_H * 0.5)}px ${s(FOOT_H * 0.5)}px ${s(FOOT_H * FOOT_SOLE_ROUNDNESS)}px`,
            transform: `rotate(${RIGHT_FOOT_ANGLE - 90}deg)`,
          }}
        />
      </div>
      {/* Inner face layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
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
            top: s(LEG_H - (FOOT_H + FOOT_W) / 2 + LEG_OFFSET / 2),
            right: s((LEG_W - FOOT_H) / 2),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * FOOT_SOLE_ROUNDNESS)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * 0.5)}px ${s((FOOT_H - LEG_OFFSET) * FOOT_SOLE_ROUNDNESS)}px`,
            // Rotates about its own geometric center; sole corners flatter than the domed top.
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_W - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${RIGHT_FOOT_ANGLE - 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_W - LEG_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </div>
  );
}

// Shadow anatomy (width/height/blur/opacity/fadeOutBodyWidths) is resolved in resolveRig().

// The shadow stays pinned to the ground (it's outside the vertical-travel wrapper). The only thing
// body.y (jump/drop) does to it is FADE: full strength when grounded, linearly weaker the higher up,
// reaching fully invisible at SHADOW_FADE_OUT_BW body-widths of lift (and staying invisible above it).
function Shadow({ scale = 1, theme, groundShadow = false }: { scale: number; theme: ColorTheme; groundShadow?: boolean }) {
  const s = (v: number) => v * scale;
  const { SHADOW_W, SHADOW_H, SHADOW_BLUR, SHADOW_OPACITY, SHADOW_FADE_OUT_BW, BODY_W } = useRig();
  const GROUND_DROP = 9; // shadow center sits this many px below the anchor (the feet's ground-contact line)
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = ref.current;
      if (!el) return;
      const bodyY = caps.get(BODY_Y_KEY) ?? 0; // scaled px; ≤ 0 = airborne (above the ground)
      const fadeLift = SHADOW_FADE_OUT_BW * BODY_W * scale; // lift at which opacity hits 0
      const t = fadeLift > 0 ? Math.min(1, Math.max(0, -bodyY) / fadeLift) : 0;
      el.style.opacity = String(1 - t); // full at the ground → 0 at (and above) fadeLift
    },
    [scale, BODY_W, SHADOW_FADE_OUT_BW],
  );
  useAnimationRenderer(render);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        zIndex: -1,
        bottom: s(-GROUND_DROP),
        left: "50%",
        transform: "translateX(-50%)",
        width: s(SHADOW_W),
        height: s(SHADOW_H),
        backgroundColor: `color-mix(in srgb, ${theme.outline} ${SHADOW_OPACITY * 100}%, transparent)`,
        borderRadius: "50%",
        filter: `blur(${s(SHADOW_BLUR)}px)`,
        // "ground" mode: clip the shadow to the pixels AT/BELOW the feet contact line (the anchor) so it
        // doesn't smudge above the ground line. The box sits GROUND_DROP px below the anchor, so the
        // contact line is s(SHADOW_H − GROUND_DROP) down from the box top; the polygon clips above that,
        // while reaching far on the sides/bottom so the soft side/bottom blur is preserved.
        clipPath: groundShadow
          ? `polygon(-100% ${s(SHADOW_H - GROUND_DROP)}px, 200% ${s(SHADOW_H - GROUND_DROP)}px, 200% 300%, -100% 300%)`
          : undefined,
      }}
    />
  );
}
