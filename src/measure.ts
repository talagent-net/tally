import { resolveRig } from "./Avagent";
import { avagent } from "./anatomy";
import type { Anatomy } from "./anatomy";

// measureFigure — the figure's REST-POSE bounding box, computed analytically (no DOM).
//
// Why analytical: the <Avagent> root is a 0×0 `overflow:visible` anchor div, so there is nothing
// to measure with getBoundingClientRect — every part is an absolutely-positioned, individually
// rotated rectangle hanging off that anchor. This module reproduces the EXACT CSS transform chain
// the component applies to each part (position + transformOrigin + rotate, composed through the
// nesting) and unions the transformed corners. It mirrors the head-only `view="head"` box, which
// likewise derives its size from the rig rather than the DOM — same approach, whole figure.
//
// "Rest pose" = every motion capability at its neutral value (turn/tilt/stride/flail/crouch/raise
// = rest), which is what the engine settles to when idle. In rest pose all the motion-driven
// offsets in the renderers are zero, so only the static JSX transforms remain — exactly what this
// reproduces. The box does NOT account for transient motion (a raised arm, a mid-stride leg, a jump).
//
// What the box bounds: the silhouette OUTLINE layers of body, head, antenna (incl. its lean and the
// protrusion above the crown), both arms (upper + forearm), and both legs + feet — i.e. the robot.
// It EXCLUDES the ground shadow (see `withShadow` for the shadow-inclusive box) and the ears, which
// poke only OFFSET/2 beyond the head edge and are treated as within tolerance — the same call the
// shipped head-only box makes ("head width × head height", ears not counted).
//
// Coordinate convention: the anchor (feet/ground contact line) is the origin; y increases DOWNWARD
// (CSS screen convention). The figure occupies mostly negative y (above the anchor). All math is at
// scale 1 — the rig values are unscaled — then the result is multiplied by `scale`.

// 2D affine matrix as CSS matrix(a,b,c,d,e,f): x' = a·x + c·y + e, y' = b·x + d·y + f.
type Mat = readonly [number, number, number, number, number, number];

// m ∘ n — apply n first, then m (same order CSS composes a parent's transform over a child's).
function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}
// CSS rotate(deg): positive = clockwise in a y-down space.
function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Local→parent map for an element positioned at top-left (lx,ly) in its parent's content box, with
// `transform: rotate(deg)` about `transform-origin: (ox,oy)` (origin in the element's own box).
// = translate(lx,ly) ∘ translate(ox,oy) ∘ rotate(deg) ∘ translate(-ox,-oy).
function elem(lx: number, ly: number, ox: number, oy: number, deg: number): Mat {
  return mul(translate(lx, ly), mul(translate(ox, oy), mul(rotate(deg), translate(-ox, -oy))));
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
// Fold a w×h rectangle (local box 0,0→w,h), mapped to anchor coords by `m`, into the running bounds.
function addRect(b: Bounds, m: Mat, w: number, h: number): void {
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    const [x, y] = apply(m, cx, cy);
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
}

const GROUND_DROP = 9; // shadow center sits this many px below the anchor (matches Shadow in Avagent.tsx)

export interface FigureBox {
  /** Figure silhouette bounding box at the requested scale (excludes ground shadow + ears). */
  width: number;
  height: number;
  /** Same box, padded out to include the ground shadow ellipse (and its blur). */
  withShadow: { width: number; height: number };
}

/**
 * Measure the rest-pose bounding box of a Avagent figure for a given anatomy, without rendering it.
 * Returns the figure silhouette `{ width, height }` plus a shadow-inclusive `withShadow` box, all at
 * `scale` (default 1). Use it to size a layout slot per character instead of hand-tuning box literals.
 * Analytical and deterministic — see the module header for exactly what it does and doesn't bound.
 */
export function measureFigure(anatomy: Anatomy = avagent, scale = 1): FigureBox {
  const r = resolveRig(anatomy);

  const W_b = r.BODY_W + r.BODY_OFFSET;
  const H_b = r.BODY_H + r.BODY_OFFSET;
  const W_h = r.HEAD_W + r.HEAD_OFFSET;
  const H_h = r.HEAD_H + r.HEAD_OFFSET;

  // Body: bottom edge BODY_BOTTOM above the anchor, horizontally centered (left:50% + translateX(-50%)),
  // rotated restRotation about its pivot.
  const mBody = elem(-W_b / 2, -r.BODY_BOTTOM - H_b, r.BODY_PIVOT_X, r.BODY_PIVOT_Y, r.BODY_ROTATION);

  // Head: child of body, horizontally centered in the body box, top at HEAD_TOP (neck-anchored, negative).
  const mHead = mul(mBody, elem((W_b - W_h) / 2, r.HEAD_TOP, r.HEAD_PIVOT_X, r.HEAD_PIVOT_Y, r.HEAD_ROTATION));
  // Antenna: child of head, right-anchored (right: HEAD_OFFSET/2 + ANTENNA_RIGHT), leaning about bottom-center.
  const antLeft = W_h - (r.HEAD_OFFSET / 2 + r.ANTENNA_RIGHT) - r.ANTENNA_W;
  const mAnt = mul(mHead, elem(antLeft, r.ANTENNA_TOP, r.ANTENNA_W / 2, r.ANTENNA_H, r.ANTENNA_ANGLE));

  // Arms (outline layer). Left wrapper sits at the body's left edge (left:0); right wrapper at the right
  // edge (right:0). Upper rotates about the shoulder; forearm rotates about the elbow within the upper.
  const shoulderTop = r.BODY_H * r.ARM_SHOULDER_RATIO;
  const mLUpper = mul(mBody, elem(0, shoulderTop, r.ARM_UPPER_W / 2, r.ARM_UPPER_W / 2, r.LEFT_UPPER_ANGLE));
  const mLFore = mul(mLUpper, elem(0, r.ARM_UPPER_H - r.ARM_LOWER_W, r.ARM_UPPER_W / 2, r.ARM_LOWER_W / 2, r.LEFT_LOWER_ANGLE));
  const mRUpper = mul(mBody, elem(W_b - r.ARM_UPPER_W, shoulderTop, r.ARM_UPPER_W / 2, r.ARM_UPPER_W / 2, r.RIGHT_UPPER_ANGLE));
  const mRFore = mul(mRUpper, elem(r.ARM_UPPER_W - r.ARM_LOWER_W, r.ARM_UPPER_H - r.ARM_LOWER_W, r.ARM_LOWER_W / 2, r.ARM_LOWER_W / 2, r.RIGHT_LOWER_ANGLE));

  // Legs (outline layer) + feet. Hip top is HEAD-... no: the leg wrapper spans the body box height, and
  // the leg's top (hip) lands LEG_HIP_TUCK up from the body bottom → y = H_b - LEG_HIP_TUCK in body coords.
  const hipTop = H_b - r.LEG_HIP_TUCK;
  const legInset = r.BODY_OFFSET / 2 + r.BODY_W * r.LEG_HIP_INSET;
  const footTop = r.LEG_H - (r.FOOT_H + r.FOOT_W) / 2 + r.LEG_OFFSET / 2;
  const footLeft = (r.LEG_W - r.FOOT_H) / 2; // identical on both sides (symmetric capsule)
  const mLLeg = mul(mBody, elem(legInset, hipTop, r.LEG_W / 2, r.LEG_W / 2, r.LEFT_LEG_ANGLE));
  const mLFoot = mul(mLLeg, elem(footLeft, footTop, r.FOOT_H / 2, r.FOOT_W / 2, r.LEFT_FOOT_ANGLE + 90));
  const mRLeg = mul(mBody, elem(W_b - legInset - r.LEG_W, hipTop, r.LEG_W / 2, r.LEG_W / 2, r.RIGHT_LEG_ANGLE));
  const mRFoot = mul(mRLeg, elem(footLeft, footTop, r.FOOT_H / 2, r.FOOT_W / 2, r.RIGHT_FOOT_ANGLE - 90));

  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  addRect(b, mBody, W_b, H_b);
  addRect(b, mHead, W_h, H_h);
  addRect(b, mAnt, r.ANTENNA_W, r.ANTENNA_H);
  addRect(b, mLUpper, r.ARM_UPPER_W, r.ARM_UPPER_H);
  addRect(b, mLFore, r.ARM_LOWER_W, r.ARM_LOWER_H);
  addRect(b, mRUpper, r.ARM_UPPER_W, r.ARM_UPPER_H);
  addRect(b, mRFore, r.ARM_LOWER_W, r.ARM_LOWER_H);
  addRect(b, mLLeg, r.LEG_W, r.LEG_H);
  addRect(b, mLFoot, r.FOOT_H, r.FOOT_W); // foot box is FOOT_H wide × FOOT_W tall (pre-rotation)
  addRect(b, mRLeg, r.LEG_W, r.LEG_H);
  addRect(b, mRFoot, r.FOOT_H, r.FOOT_W);

  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;

  // Shadow ellipse: centered on the anchor x, its box bottom GROUND_DROP below the anchor, expanded each
  // way by the blur radius. Union with the figure box for the shadow-inclusive extent.
  const shadowHalfW = r.SHADOW_W / 2 + r.SHADOW_BLUR;
  const shadowTop = GROUND_DROP - r.SHADOW_H - r.SHADOW_BLUR;
  const shadowBottom = GROUND_DROP + r.SHADOW_BLUR;
  const withW = Math.max(b.maxX, shadowHalfW) - Math.min(b.minX, -shadowHalfW);
  const withH = Math.max(b.maxY, shadowBottom) - Math.min(b.minY, shadowTop);

  return {
    width: width * scale,
    height: height * scale,
    withShadow: { width: withW * scale, height: withH * scale },
  };
}
