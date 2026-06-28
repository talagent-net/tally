import { useCallback, useRef } from "react";
import type { ColorTheme } from "./Avagent";
import { useAnimationRenderer } from "./animation/context";

// `say` is an OVERLAY, not a body-part action. Unlike the entries in ActionSpec it doesn't drive
// any 0..1 capability and it doesn't occupy the (single, non-interruptible) action slot — it rides
// on top of whatever Avagent is already doing (idle look-around, cursor tracking, a gesture mid-flight)
// as a separate channel, then times itself out. So it gets its own prop (`speech`) and its own
// little lifecycle in Avagent, parallel to the action lifecycle, rather than a slot in createAction.

/**
 * Which side of the figure a speech bubble opens on. `"auto"` picks left/right at show-time from the
 * figure's horizontal position in the viewport — it opens toward the roomier side (figure on the left
 * half of the screen → bubble opens right) and is resolved to a concrete side before rendering.
 */
export type SpeechSide = "left" | "right" | "auto";

// Default font stack for the bubble text. References IBM Plex Sans (the consumer app's paragraph
// font) WITHOUT bundling it: if the host app already loads Plex the bubble matches automatically,
// otherwise it falls back cleanly to the system UI font. Consumers override via theme.fontFamily.
export const DEFAULT_FONT_FAMILY = '"IBM Plex Sans", system-ui, -apple-system, sans-serif';

/** A speech bubble to show beside the figure — see the `speech` prop on {@link AvagentProps}. */
export type SpeechSpec = {
  /** The bubble's text. Display duration is read-time-proportional unless held open via `speechHold`. */
  text: string;
  /**
   * Which side of the figure the bubble sits on; the tail always points back toward the head. Defaults
   * to `"auto"` (opens toward the roomier side based on the figure's position in the viewport).
   */
  side?: SpeechSide;
};

// Read-time-proportional display duration. A short base (time to notice the bubble at all) plus a
// per-character reading budget, clamped so one word doesn't flash by and a paragraph doesn't hang
// forever. ~55ms/char ≈ a relaxed 200-ish wpm — generous, since the reader also has to find the
// bubble first.
const SPEECH_BASE_MS = 1200;
const SPEECH_PER_CHAR_MS = 55;
const SPEECH_MIN_MS = 1800;
const SPEECH_MAX_MS = 9000;
export function speechDurationMs(text: string): number {
  const raw = SPEECH_BASE_MS + text.length * SPEECH_PER_CHAR_MS;
  return Math.max(SPEECH_MIN_MS, Math.min(SPEECH_MAX_MS, raw));
}

// Geometry (unscaled px, multiplied by `scale` at render). The head anchor (the bubble's side edge +
// vertical center) and the authored gap/maxWidth arrive as props from the resolved rig, so they track
// the character's actual head. The chrome below (padding, radius, font, border, tail) is SHARED across
// all characters — behavioral/style, not proportions.
const SPEECH_PAD_V = 8;
const SPEECH_PAD_H = 12;
const SPEECH_RADIUS = 12;
const SPEECH_FONT = 15;
const SPEECH_BORDER = 4;
const SPEECH_TAIL_LEN = 14; // how far the tail protrudes from the bubble side toward the head
const SPEECH_TAIL_HALF = 12; // half the tail's base height (the base is flush against the bubble side)

// Head-follow: the bubble drifts slightly with head motion so it feels attached to Avagent. All in
// unscaled px at full capability deflection (multiplied by `scale` and by the live deflection).
// Head turn always pulls the bubble CLOSER to the head (inward), never away — with separate
// magnitudes for the head turning toward the bubble vs away from it.
const SPEECH_FOLLOW_TURN_TOWARD_PX = 24; // head turning TOWARD the bubble → bubble moves inward (closer)
const SPEECH_FOLLOW_TURN_AWAY_PX = 24; // head turning AWAY from the bubble → bubble moves inward (closer)
const SPEECH_FOLLOW_TILT_PX = 12; // head.tilt up/down → bubble up/down
const SPEECH_FOLLOW_BOB_Y_PX = 14; // head.bob: right-bob → up, left-bob → down (vertical component)
const SPEECH_FOLLOW_BOB_X_PX = 14; // head.bob horizontal: right-bob → inward, left-bob → outward

// Entrance/exit timing. The entrance uses an easeOutBack curve (overshoots past full size then
// settles) for a springy "pop". The exit is a quick, subtle shrink-and-fade back toward Avagent.
const SPEECH_IN_MS = 240;
const SPEECH_OUT_MS = 160;
// Exported so Avagent knows how long to keep the bubble mounted while the exit animation plays before
// it unmounts (and fires onSpeechEnd).
export const SPEECH_EXIT_MS = SPEECH_OUT_MS;

export function SpeechBubble({
  text,
  side,
  scale,
  speechScale = 1,
  theme,
  leaving = false,
  headHalfW,
  headCenterAboveAnchor,
  gap,
  maxWidth,
}: {
  text: string;
  side: "left" | "right"; // already resolved (Avagent turns "auto" into a concrete side)
  scale: number;
  // Enlarge the bubble's box + text independently of the figure (see AvagentProps.speechScale).
  speechScale?: number;
  theme: ColorTheme;
  leaving?: boolean; // when true, play the exit animation (Avagent unmounts after SPEECH_EXIT_MS)
  // Head anchor (DERIVED from rig) + authored rules — the bubble parks at the real head's side/center.
  headHalfW: number; // (HEAD_W + HEAD_OFFSET) / 2
  headCenterAboveAnchor: number; // head vertical center above the anchor
  gap: number; // head edge → bubble inner edge
  maxWidth: number; // text wrap column
}) {
  // Two scale factors. `s` is the plain FIGURE scale and drives everything structural — the anchor
  // (offset, top), head-follow drift, the whole tail (length, body, outline), the outline stroke
  // (border), the corner radius, and the padding. `sb` folds in speechScale and is applied to ONLY
  // the font size and the max-width (text-wrap column). So raising speechScale enlarges the text and
  // widens its wrap column proportionally, while every other dimension — chrome, tail, position —
  // holds at figure scale. The box still reflows taller/wider to hug the bigger text, but no chrome
  // is independently scaled. speechScale=1 → sb === s → byte-identical to before.
  const s = (v: number) => v * scale;
  const sb = (v: number) => v * scale * speechScale;
  const offset = s(headHalfW + gap);

  // Head-follow. A per-frame renderer translates an outer wrapper (NOT the bubble itself, whose
  // transform is owned by the entrance/exit keyframes) by a small offset derived from the live head
  // capabilities, so the bubble drifts with the head. `bubbleDir` is the screen side the bubble
  // sits on (−1 left of head, +1 right); `inwardSign` is the opposite (toward the head).
  const followRef = useRef<HTMLDivElement>(null);
  const bubbleDir = side === "left" ? -1 : 1;
  const inwardSign = -bubbleDir;
  const followRender = useCallback(
    (caps: ReadonlyMap<string, number>) => {
      const el = followRef.current;
      if (!el) return;
      const tilt = caps.get("head.tilt") ?? 0.5;
      const bob = caps.get("head.bob") ?? 0.5;
      // Effective head turn = body + upper-body offset + head offset (matches the head renderer),
      // so the bubble tracks the head's actual visible direction, not just the raw head.turn.
      const bodyTurn = caps.get("body.turn") ?? 0.5;
      const upper = caps.get("upperbody.turn") ?? 0.5;
      const headTurn = caps.get("head.turn") ?? 0.5;
      const effTurn = Math.max(0, Math.min(1, bodyTurn + (upper - 0.5) + (headTurn - 0.5)));

      // Head turn ALWAYS pulls the bubble inward (closer to the head); only the magnitude differs by
      // whether the head is turning toward the bubble side or away from it.
      const turnDefl = effTurn - 0.5; // + = looking right, − = looking left
      const towardBubble = Math.sign(turnDefl) === bubbleDir;
      const turnPx = towardBubble ? SPEECH_FOLLOW_TURN_TOWARD_PX : SPEECH_FOLLOW_TURN_AWAY_PX;
      const turnDx = inwardSign * Math.abs(turnDefl) * 2 * turnPx; // inward in both directions

      const tiltDy = -(tilt - 0.5) * 2 * SPEECH_FOLLOW_TILT_PX; // look up (tilt>0.5) → move up (−y)
      const bobDefl = bob - 0.5; // + = right-bob, − = left-bob
      const bobDy = -bobDefl * 2 * SPEECH_FOLLOW_BOB_Y_PX; // right-bob → up, left-bob → down
      // Signed (not abs): right-bob → inward, left-bob → outward.
      const bobDx = inwardSign * bobDefl * 2 * SPEECH_FOLLOW_BOB_X_PX;

      const dx = (turnDx + bobDx) * scale;
      const dy = (tiltDy + bobDy) * scale;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    },
    [scale, inwardSign, bubbleDir],
  );
  useAnimationRenderer(followRender);

  // The tail is a triangle whose flat BASE is flush against the bubble's inner side and whose apex
  // points back at the head. It's drawn as two stacked CSS border-triangles: a larger outline-
  // colored one flush at the bubble edge, then a slightly smaller white one shifted a border-width
  // INTO the bubble — so the white fill bridges into the bubble interior (no seam) while the outline
  // peeks out as a uniform border along the two slanted edges and the apex.
  const B = s(SPEECH_BORDER * 0.75); // tail outline stroke — figure scale (matches the bubble border)
  const L = s(SPEECH_TAIL_LEN); // tail reach to the head — figure scale (keeps the apex on the head)
  const HH = s(SPEECH_TAIL_HALF); // tail body half-height — figure scale (tail unaffected by speechScale)
  const outlineTail: React.CSSProperties =
    side === "left"
      ? {
          // base flush at the bubble's right edge, apex pointing right (toward the head)
          position: "absolute",
          top: "50%",
          left: "100%",
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${HH}px solid transparent`,
          borderBottom: `${HH}px solid transparent`,
          borderLeft: `${L}px solid ${theme.outline}`,
        }
      : {
          // base flush at the bubble's left edge, apex pointing left (toward the head)
          position: "absolute",
          top: "50%",
          right: "100%",
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${HH}px solid transparent`,
          borderBottom: `${HH}px solid transparent`,
          borderRight: `${L}px solid ${theme.outline}`,
        };
  const fillTail: React.CSSProperties =
    side === "left"
      ? {
          position: "absolute",
          top: "50%",
          left: `calc(100% - ${B}px)`,
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${HH - B}px solid transparent`,
          borderBottom: `${HH - B}px solid transparent`,
          borderLeft: `${L - B}px solid #ffffff`,
        }
      : {
          position: "absolute",
          top: "50%",
          right: `calc(100% - ${B}px)`,
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${HH - B}px solid transparent`,
          borderBottom: `${HH - B}px solid transparent`,
          borderRight: `${L - B}px solid #ffffff`,
        };

  return (
    // Follow wrapper: a 0-size box at the figure origin that the head-follow renderer translates.
    // The bubble (with its own keyframe transform) lives inside, so the two transforms compose
    // without fighting.
    <div ref={followRef} style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
      <div
        style={{
          position: "absolute",
          top: s(-headCenterAboveAnchor),
          // Park the inner edge `offset` from center; the bubble grows away from the head, the tail
          // toward it. translateY(-50%) centers the bubble on the head's vertical center; the entrance
          // grows from the tail side (origin toward the head) so it reads as coming out of Avagent.
          ...(side === "left" ? { right: offset } : { left: offset }),
          transform: "translateY(-50%)",
          transformOrigin: side === "left" ? "right center" : "left center",
          zIndex: 50, // above the whole figure (Body establishes its own stacking context below this)
          // Size to the text's natural width, but wrap once it would exceed SPEECH_MAX_WIDTH. Without
          // an explicit width an absolutely-positioned box is shrink-to-fit and collapses to one
          // character per line; max-content sizes to the content and the cap forces normal wrapping.
          width: "max-content",
          maxWidth: sb(maxWidth), // text-wrap column widens with the font
          boxSizing: "border-box",
          padding: `${s(SPEECH_PAD_V)}px ${s(SPEECH_PAD_H)}px`,
          background: "#ffffff",
          border: `${s(SPEECH_BORDER)}px solid ${theme.outline}`,
          borderRadius: s(SPEECH_RADIUS),
          color: theme.outline,
          fontSize: sb(SPEECH_FONT), // the only true text-size scale
          lineHeight: 1.3,
          fontFamily: theme.fontFamily ?? DEFAULT_FONT_FAMILY,
          fontWeight: 500,
          whiteSpace: "normal",
          overflowWrap: "break-word", // only break a single over-long token, not every word
          textAlign: "left",
          pointerEvents: "none",
          userSelect: "none",
          // Springy entrance (easeOutBack overshoots then settles); subtle shrink-and-fade exit. Both
          // keep translateY(-50%) so vertical centering holds, and scale from the tail side (the
          // bubble's transformOrigin) so it pops out of / retracts back toward Avagent.
          animation: leaving
            ? `avagent-speech-out ${SPEECH_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards`
            : `avagent-speech-in ${SPEECH_IN_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
        }}
      >
        <style>{`@keyframes avagent-speech-in {
        from { opacity: 0; transform: translateY(-50%) scale(0.4); }
        to { opacity: 1; transform: translateY(-50%) scale(1); }
      }
      @keyframes avagent-speech-out {
        from { opacity: 1; transform: translateY(-50%) scale(1); }
        to { opacity: 0; transform: translateY(-50%) scale(0.6); }
      }`}</style>
        {text}
        <div style={outlineTail} />
        <div style={fillTail} />
      </div>
    </div>
  );
}
