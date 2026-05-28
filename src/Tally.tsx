import { useCallback, useEffect, useMemo, useRef } from "react";
import { colors as defaultColors } from "./colors";
import { AnimationProvider, useAnimationRenderer, useCapability, useCapabilityAnimation } from "./animation/context";
import { createBlinkAnimation } from "./animation/blink";

const BLINK_KEY = "eyes.blink";
const HEAD_BOB_KEY = "head.bob";
const HEAD_TURN_KEY = "head.turn";
const HEAD_TILT_KEY = "head.tilt";
const MAX_HEAD_BOB_DEGREES = 18;

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
  // When mode === "debug", these drive a single capability directly,
  // bypassing the regular mode animations.
  debugCapability?: string;
  debugValue?: number;
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

function TallyInner({ scale = 1, mode = "hangout", theme = defaultTheme, showAnchor = false, chestImage, chestOutline, debugCapability, debugValue }: TallyProps) {
  const s = (v: number) => v * scale;

  // Capabilities — declared once at the root with their rest values.
  useCapability(BLINK_KEY, 1);      // 1 = fully open
  useCapability(HEAD_BOB_KEY, 0.5); // 0.5 = centered, 0 = max left tilt, 1 = max right tilt
  useCapability(HEAD_TURN_KEY, 0.5); // 0.5 = looking straight, 0 = looking left, 1 = looking right
  useCapability(HEAD_TILT_KEY, 0.5); // 0.5 = looking straight, 0 = looking down, 1 = looking up

  // Debug value is read live via a ref so the animation closure stays stable.
  const debugValueRef = useRef(debugValue ?? 0);
  useEffect(() => {
    debugValueRef.current = debugValue ?? 0;
  }, [debugValue]);

  const debugAnimFor = useCallback(
    (key: string) =>
      mode === "debug" && debugCapability === key ? () => debugValueRef.current : null,
    [mode, debugCapability],
  );

  // eyes.blink — debug overrides; otherwise hangout default of random blinks.
  const blinkAnimation = useMemo(() => {
    if (mode === "debug") return debugAnimFor(BLINK_KEY);
    return createBlinkAnimation();
  }, [mode, debugAnimFor]);
  useCapabilityAnimation(BLINK_KEY, blinkAnimation);

  // head.bob / head.turn / head.tilt — debug-only for now; no mode animations yet.
  const headBobAnimation = useMemo(() => debugAnimFor(HEAD_BOB_KEY), [debugAnimFor]);
  useCapabilityAnimation(HEAD_BOB_KEY, headBobAnimation);

  const headTurnAnimation = useMemo(() => debugAnimFor(HEAD_TURN_KEY), [debugAnimFor]);
  useCapabilityAnimation(HEAD_TURN_KEY, headTurnAnimation);

  const headTiltAnimation = useMemo(() => debugAnimFor(HEAD_TILT_KEY), [debugAnimFor]);
  useCapabilityAnimation(HEAD_TILT_KEY, headTiltAnimation);

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
const CHEST_WIDTH = 34;
const CHEST_HEIGHT = 28;
const CHEST_TOP_RATIO = 0.25;

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

  const baseRadius = (extra: number) =>
    `${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_TOP + extra)}px ${s(BODY_RADIUS_BOT + extra)}px ${s(BODY_RADIUS_BOT + extra)}px`;

  return (
    <div
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
          style={{
            position: "absolute",
            zIndex: 4,
            top: s(BODY_OFFSET / 2 + BODY_H * CHEST_TOP_RATIO),
            left: "50%",
            transform: "translateX(-50%)",
            width: s(CHEST_WIDTH),
            height: s(CHEST_HEIGHT),
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
                WebkitMaskSize: "contain",
                maskSize: "contain",
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
                WebkitMaskSize: "contain",
                maskSize: "contain",
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

    // head.turn — PLACEHOLDER: linearly scales width with the value (0 → 50%, 1 → 150%).
    // Replace with real 3D-turn rendering.
    const turn = caps.get(HEAD_TURN_KEY) ?? 0.5;
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const turnShift = (HEAD_W + HEAD_OFFSET) * scale * Math.abs(turn - .5) * (1 - HEAD_TURN_RATIO);
    const baseW = (HEAD_W + HEAD_OFFSET) * scale * turnFactor;

    // Constant insets (in unscaled units) preserve outline thickness regardless of turn.
    const lightLeftInset = HEAD_OFFSET / 2;
    const lightSideMargin = HEAD_OFFSET * 9 / 8;
    const mainLeftInset = HEAD_OFFSET * HEAD_FACE_INSET;
    const mainSideMargin = HEAD_OFFSET * (2 - HEAD_FACE_INSET);

    // Border-radius shrinks toward the edges of the turn: full at center, HEAD_TURN_RADIUS_RATIO at extremes.
    const radiusFactor = 1 - Math.abs(turn - .5) * 2 * (1 - HEAD_TURN_RADIUS_RATIO);

    const headBase = el.firstElementChild as HTMLElement | null;
    if (headBase) {
      headBase.style.width = `${baseW}px`;
      headBase.style.left = `${turnShift}px`;
      headBase.style.borderRadius = `${(HEAD_ROUNDNESS + HEAD_OFFSET / 2) * scale * radiusFactor}px`;
    }

    const headLight = el.children[1] as HTMLElement | null;
    if (headLight) {
      headLight.style.width = `${baseW - lightSideMargin * scale}px`;
      headLight.style.left = `${turnShift + lightLeftInset * scale}px`;
      headLight.style.borderRadius = `${HEAD_ROUNDNESS * scale * radiusFactor}px`;
    }

    const headMain = el.children[2] as HTMLElement | null;
    if (headMain) {
      headMain.style.width = `${baseW - mainSideMargin * scale}px`;
      headMain.style.left = `${turnShift + mainLeftInset * scale}px`;
      headMain.style.borderRadius = `${(HEAD_ROUNDNESS - HEAD_OFFSET * (1 - HEAD_FACE_INSET)) * scale * radiusFactor}px`;
    }

    // head.tilt — PLACEHOLDER: linearly scales height with the value (0 → 50%, 1 → 150%).
    // Replace with real up/down rendering.
    const tilt = caps.get(HEAD_TILT_KEY) ?? 0.5;
    el.style.height = `${(HEAD_H + HEAD_OFFSET) * scale * (0.5 + tilt)}px`;
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
const HEAD_TURN_RATIO = .72;
const HEAD_TURN_RADIUS_RATIO = .75;

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
const EYE_OFFSET = EYE_H - PUPIL_H;
const MAX_BLINK_CLOSE = .84;

function useBlinkRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const blink = caps.get(BLINK_KEY) ?? 1;
    el.style.height = `${(blink * MAX_BLINK_CLOSE + (1 - MAX_BLINK_CLOSE)) * EYE_H * scale}px`;
    el.style.top = `${(HEAD_H * EYE_TOP_RATIO + ((1 - blink) * (EYE_H / 2) * MAX_BLINK_CLOSE)) * scale}px`;
    const pupil = el.firstElementChild as HTMLElement | null;
    if (pupil) pupil.style.height = `${Math.max(0, (blink * MAX_BLINK_CLOSE + (1 - MAX_BLINK_CLOSE)) * EYE_H - EYE_OFFSET) * scale}px`;
  }, [scale]);
  useAnimationRenderer(render);
  return ref;
}

function LeftEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;
  const eyeRef = useBlinkRef(scale);

  return (
    <div
      ref={eyeRef}
      style={{
        position: "absolute",
        zIndex: 3,
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
  const eyeRef = useBlinkRef(scale);

  return (
    <div
      ref={eyeRef}
      style={{
        position: "absolute",
        zIndex: 3,
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

// Shared shape math — `side` is the "left" or "right" CSS property name.
function useEarRefShared(scale: number, side: "left" | "right", hideWhenTurnGreater: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const turn = caps.get(HEAD_TURN_KEY) ?? 0.5;
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

function useAntennaRef(scale: number) {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((caps: ReadonlyMap<string, number>) => {
    const el = ref.current;
    if (!el) return;
    const turn = caps.get(HEAD_TURN_KEY) ?? 0.5;

    // Position: stay glued to the visible head's right edge as it turns.
    const turnFactor = (1 - HEAD_TURN_RATIO) * 2 * (.5 - Math.abs(turn - .5)) + HEAD_TURN_RATIO;
    const turnShift = (HEAD_W + HEAD_OFFSET) * Math.abs(turn - .5) * (1 - HEAD_TURN_RATIO);
    const baseW = (HEAD_W + HEAD_OFFSET) * turnFactor;
    const restAntennaRight = HEAD_OFFSET / 2 + ANTENNA_RIGHT;
    el.style.right = `${((HEAD_W + HEAD_OFFSET) + restAntennaRight - turnShift - baseW) * scale}px`;

    // Angle: rest lean fades out toward the extremes, replaced by a signed offset
    // pointing in the head's gaze direction (forward lean).
    // turn=0.5 → ANTENNA_ANGLE (default left lean).
    // turn=1   → +ANTENNA_TURN_ANGLE_DELTA → tilts right (with the gaze).
    // turn=0   → -ANTENNA_TURN_ANGLE_DELTA → tilts left (with the gaze).
    const distance = Math.abs(turn - 0.5) * 2;
    const signedOffset = (turn - 0.5) * 2 * ANTENNA_TURN_ANGLE_DELTA;
    el.style.transform = `rotate(${ANTENNA_ANGLE * (1 - distance) + signedOffset}deg)`;
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

const LEFT_UPPER_ANGLE = 25;
const RIGHT_UPPER_ANGLE = -25;
const LEFT_LOWER_ANGLE = -15;
const RIGHT_LOWER_ANGLE = 15;

function LeftArm({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;

  return (
    <>
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
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 4)}px ${s(ARM_LOWER_W / 2)}px`,
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
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 4)}px ${s(ARM_LOWER_W / 2)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px`,
            transform: `rotate(${LEFT_LOWER_ANGLE}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(ARM_LOWER_W - ARM_OFFSET) / 2} y={(ARM_LOWER_W - ARM_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(ARM_UPPER_W - ARM_OFFSET) / 2} y={(ARM_UPPER_W - ARM_OFFSET) / 2} />}
      </div>
    </>
  );
}

function RightArm({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;

  return (
    <>
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
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 4)}px`,
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
            borderRadius: `${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 2)}px ${s(ARM_LOWER_W / 4)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px ${s((ARM_LOWER_W - ARM_OFFSET) / 2)}px`,
            transform: `rotate(${RIGHT_LOWER_ANGLE}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(ARM_LOWER_W - ARM_OFFSET) / 2} y={(ARM_LOWER_W - ARM_OFFSET) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(ARM_UPPER_W - ARM_OFFSET) / 2} y={(ARM_UPPER_W - ARM_OFFSET) / 2} />}
      </div>
    </>
  );
}

const LEG_HIP_INSET = 0;
const LEG_W = 24;
const LEG_H = 36;
const LEG_HIP_TUCK = 26;
const FOOT_W = 32;
const FOOT_H = 24;
const LEG_OFFSET = 12;

const LEFT_LEG_ANGLE = 9;
const RIGHT_LEG_ANGLE = -9;
const LEFT_FOOT_ANGLE = -9;
const RIGHT_FOOT_ANGLE = 9;

function LeftLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;

  return (
    <>
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
            left: s(LEG_OFFSET * .25),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(LEG_W / 2)}px ${s(FOOT_H / 2)}px`,
            backgroundColor: theme.outline,
            borderRadius: `${s((FOOT_H) * .25)}px ${s((FOOT_H) * .25)}px ${s((FOOT_H) * .25)}px ${s((FOOT_H) * .5)}px`,
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
            left: s(LEG_OFFSET * .25),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * .25)}px ${s((FOOT_H - LEG_OFFSET) * .25)}px ${s((FOOT_H - LEG_OFFSET) * .25)}px ${s((FOOT_H - LEG_OFFSET) * .5)}px`,
            // Elbow pivot: center top
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_H - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${LEFT_FOOT_ANGLE + 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_H - LEG_OFFSET / 2) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </>
  );
}

function RightLeg({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;

  return (
    <>
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
            right: s(LEG_OFFSET * .25),
            width: s(FOOT_H),
            height: s(FOOT_W),
            transformOrigin: `${s(FOOT_H - LEG_W / 2)}px ${s(FOOT_H / 2)}px`,
            backgroundColor: theme.outline,
            borderRadius: `${s((FOOT_H) * .25)}px ${s((FOOT_H) * .25)}px ${s((FOOT_H) * .5)}px ${s((FOOT_H) * .25)}px`,
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
            right: s(LEG_OFFSET * .25),
            width: s(FOOT_H - LEG_OFFSET),
            height: s(FOOT_W - LEG_OFFSET),
            backgroundColor: theme.primary,
            borderRadius: `${s((FOOT_H - LEG_OFFSET) * .25)}px ${s((FOOT_H - LEG_OFFSET) * .25)}px ${s((FOOT_H - LEG_OFFSET) * .5)}px ${s((FOOT_H - LEG_OFFSET) * .25)}px`,
            // Ankle pivot: center
            transformOrigin: `${s((FOOT_H - LEG_OFFSET) / 2)}px ${s((FOOT_H - LEG_OFFSET) / 2)}px`,
            transform: `rotate(${RIGHT_FOOT_ANGLE - 90}deg)`,
          }}
        >
          {showAnchor && <PivotMarker scale={scale} x={(FOOT_H - LEG_OFFSET) / 2} y={(FOOT_H - LEG_OFFSET / 2) / 2} />}
        </div>
        {showAnchor && <PivotMarker scale={scale} x={(LEG_W - LEG_OFFSET) / 2} y={(LEG_W - LEG_OFFSET) / 2} />}
      </div>
    </>
  );
}

const SHADOW_W = 110;
const SHADOW_H = 14;
const SHADOW_BLUR = 5;
const SHADOW_OPACITY = 0.2;

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
