import { colors as defaultColors } from "./colors";

export type Mode = "hangout" | "jump";

export interface ColorTheme {
  primary: string;
  primaryDark: string;
  primaryMid: string;
}

export const defaultTheme: ColorTheme = {
  primary: defaultColors.primary,
  primaryDark: defaultColors.primaryDark,
  primaryMid: defaultColors.primaryMid,
};

export interface TallyProps {
  scale?: number;
  mode?: Mode;
  theme?: ColorTheme;
  showAnchor?: boolean;
}

const BASE = {
  width: 200,
  height: 240,
};

export function Tally({ scale = 1, mode = "hangout", theme = defaultTheme, showAnchor = false }: TallyProps) {
  const s = (v: number) => v * scale;

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
      <Body scale={scale} theme={theme}>
        <Head scale={scale} theme={theme}>
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
      <Shadow scale={scale} />
    </div>
  );
}

const BODY_W = 52;
const BODY_H = 64;
const BODY_OFFSET = 12;
const BODY_RADIUS_TOP = 32;
const BODY_RADIUS_BOT = 24;
const BODY_BOTTOM = 15;

function Body({
  scale = 1,
  theme,
  children,
}: {
  scale: number;
  theme: ColorTheme;
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
        transform: "translateX(-50%)",
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
          backgroundColor: theme.primaryDark,
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
      {children}
    </div>
  );
}

const HEAD_W = 130;
const HEAD_H = 90;
const HEAD_OFFSET = 12;
const HEAD_ROUNDNESS = 36;
const HEAD_TOP = -85;
const HEAD_FACE_INSET = 0.8;

function Head({
  scale = 1,
  theme,
  children,
}: {
  scale: number;
  theme: ColorTheme;
  children: React.ReactNode;
}) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 4,
        top: s(HEAD_TOP),
        left: "50%",
        transform: "translateX(-50%)",
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
          backgroundColor: theme.primaryDark,
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
          width: s(HEAD_W),
          height: s(HEAD_H),
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
    </div>
  );
}

const EYE_W = 16;
const EYE_H = 28;
const EYE_TOP_RATIO = 0.55;
const EYE_SIDE_RATIO = 0.24;
const PUPIL_W = 8;
const PUPIL_H = 20;

function LeftEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;

  return (
    <div
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
          backgroundColor: theme.primaryDark,
          borderRadius: s(PUPIL_W / 2),
        }}
      />
    </div>
  );
}

function RightEye({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;

  return (
    <div
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
          backgroundColor: theme.primaryDark,
          borderRadius: s(PUPIL_W / 2),
        }}
      />
    </div>
  );
}

const EAR_TOP_RATIO = 0.35;
const EAR_HEIGHT_RATIO = 0.4;

function LeftEar({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 0,
        top: s(HEAD_H * EAR_TOP_RATIO),
        left: s(-HEAD_OFFSET / 2),
        width: s(HEAD_OFFSET),
        height: s(HEAD_H * EAR_HEIGHT_RATIO),
        backgroundColor: theme.primaryDark,
        borderRadius: `${s(HEAD_ROUNDNESS / 4)}px`,
      }}
    />
  );
}

function RightEar({ scale = 1, theme }: { scale: number; theme: ColorTheme }) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 0,
        top: s(HEAD_H * EAR_TOP_RATIO),
        right: s(-HEAD_OFFSET / 2),
        width: s(HEAD_OFFSET),
        height: s(HEAD_H * EAR_HEIGHT_RATIO),
        backgroundColor: theme.primaryDark,
        borderRadius: `${s(HEAD_ROUNDNESS / 4)}px`,
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

function Antenna({ scale = 1, theme, showAnchor = false }: { scale: number; theme: ColorTheme; showAnchor?: boolean }) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: showAnchor ? 999 : 0,
        top: s(ANTENNA_TOP),
        right: s(HEAD_OFFSET / 2 + ANTENNA_RIGHT),
        width: s(ANTENNA_W),
        height: s(ANTENNA_H),
        backgroundColor: theme.primaryDark,
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
          backgroundColor: theme.primaryDark,
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
            backgroundColor: theme.primaryDark,
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
          backgroundColor: theme.primaryDark,
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
            backgroundColor: theme.primaryDark,
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
          backgroundColor: theme.primaryDark,
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
            backgroundColor: theme.primaryDark,
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
          backgroundColor: theme.primaryDark,
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
            backgroundColor: theme.primaryDark,
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

const SHADOW_W = 90;
const SHADOW_H = 14;
const SHADOW_BLUR = 4;
const SHADOW_OPACITY = 0.16;

function Shadow({ scale = 1 }: { scale: number }) {
  const s = (v: number) => v * scale;

  return (
    <div
      style={{
        position: "absolute",
        bottom: s(-10),
        left: "50%",
        transform: "translateX(-50%)",
        width: s(SHADOW_W),
        height: s(SHADOW_H),
        backgroundColor: `rgba(0,0,0,${SHADOW_OPACITY})`,
        borderRadius: "50%",
        filter: `blur(${s(SHADOW_BLUR)}px)`,
      }}
    />
  );
}
