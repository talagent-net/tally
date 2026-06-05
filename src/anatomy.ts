// Parametric anatomy spec — see ANATOMY_SPEC.md for the full design.
//
// An `Anatomy` is the complete set of PROPORTIONS that define one robot character. It is the only
// thing that varies between characters: theme (colorway) and behavior (capabilities + animations +
// motion-tuning) are orthogonal, shared concerns and live elsewhere. `tally` below is the default
// preset and reproduces today's figure.
//
// Conventions:
//   • Values are in RENDER UNITS (1 unit = 1px at scale 1); a single `scale` multiplier hits
//     everything uniformly at render.
//   • `*Ratio` / `*Frac` fields are fractions of a named reference (the parent dimension, an own
//     dimension, or the global outline) — these are inherently scale- and proportion-portable.
//   • Angles are in degrees (also portable).
//   • Pivots are stored as fractions of the part's own box; the actual pixel pivot is DERIVED.
//   • Mirror convention: a single (left) rest angle is stored; the right side is its negation.
//   • Motion-tuning (stride°, wave°, gaze slides, …), capability rest values, z-order and the
//     conditional-layer machinery are NOT here — they are shared engine concerns.
//
// NOTE (step-3 sequencing): a handful of layout values below are still ABSOLUTE px and tagged
// `// → relative:` — they are slated for conversion to anatomy-relative fractions once the resolver
// (Anatomy + scale → ResolvedRig) lands. They hold today's literal values for now so this preset
// reproduces the current figure exactly.

export interface Pivot {
  /** fraction across the part's own width (0 = left edge, 1 = right edge) */
  xFrac: number;
  /** fraction down the part's own height (0 = top edge, 1 = bottom edge) */
  yFrac: number;
}

/** The dark silhouette stroke + soft ground shadow — character-level globals. */
export interface GlobalAnatomy {
  /** VISIBLE silhouette stroke thickness. The renderer uses 2× internally as container padding. */
  outlineThickness: number;
  shadow: {
    width: number;
    height: number;
    blur: number;
    opacity: number;
    // Ground-clip (mask the shadow to below the feet) is NOT here: it depends on whether the host renders
    // a ground plane behind the figure, so it's a render-context choice — the `groundShadow` prop.
  };
}

/** The chest logo decal — a sub-part of the body (the logo image itself comes from a prop). */
export interface ChestDecal {
  /** decal box size in px — ABSOLUTE (not body-relative), so the chest image is the same size across
   *  characters regardless of body width */
  size: number;
  /** vertical placement ÷ body height */
  topRatio: number;
  /** visible width fraction at full body turn (depth foreshorten) */
  turnMinRatio: number;
  /** visible height fraction at full crouch (depth foreshorten) */
  crouchMinRatio: number;
  /** horizontal slide at full turn ÷ body width */
  turnSlideRatio: number;
  /** how far the panel rises at full crouch, as a fraction of body height (× bodyH) */
  crouchRise: number;
  /** logo outline halo thickness / blur (px) */
  haloOffset: number;
  haloBlur: number;
}

export interface BodyAnatomy {
  width: number;
  height: number;
  radiusTop: number;
  radiusBottom: number;
  restRotation: number;
  pivot: Pivot;
  /** visible width fraction at full profile — the body's implied front-to-back depth */
  turnDepthRatio: number;
  chest: ChestDecal;
  // BODY_BOTTOM is intentionally absent: the body's ground elevation is a COMPUTED grounding output
  // (resolve the rest-pose leg+foot stack, pin the foot-bottom to the anchor).
}

export interface HeadAnatomy {
  width: number;
  height: number;
  roundness: number;
  restRotation: number;
  pivot: Pivot;
  /** implied depth as the head turns / tilts, and how the trailing corners bulge */
  turnDepthRatio: number;
  tiltDepthRatio: number;
  turnRadiusGrow: number;
  tiltRadiusGrow: number;
  /** top-left highlight band & bottom-right shadow crescent, each × global outlineThickness */
  shading: {
    highlightRatio: number;
    shadowCrescentRatio: number;
  };
  /** how far the head's bottom (neck) sinks into the body's top, in px. CSS top is derived as
   *  bodyOverlap − (height + outline), so a shorter/taller head keeps its neck rooted in the body. */
  bodyOverlap: number;
}

export interface AntennaAnatomy {
  width: number;
  height: number;
  /** fixed corner radius (px) — solid dark stick, no outline band */
  radius: number;
  /** rest lean (deg); pivots about its base */
  restLean: number;
  pivot: Pivot;
  /** vertical attachment: the base roots this many px into the head crown. CSS top = baseInset − height,
   *  so shortening the stick keeps the base rooted and only lowers the tip. */
  baseInset: number;
  /** horizontal placement in from the head's right edge, as a fraction of head width (× headW). */
  rightRatio: number;
  /** stick height fraction at full head tilt (depth foreshorten) */
  tiltHeightRatio: number;
  /** uniform scale of the connecting-mode signal rings emitted from the tip (ring diameters AND line
   *  thickness, all of which are otherwise head-relative). 1 = default; <1 shrinks, >1 enlarges. */
  signalScale: number;
}

export interface EyeAnatomy {
  width: number;
  height: number;
  /** border-radius ÷ width (0.5 = capsule) */
  roundnessRatio: number;
  pivot: Pivot;
  /** placement on the head (already relative) */
  topRatio: number;
  sideRatio: number;
  /** each eye's horizontal inset at FULL head-turn (× headW), measured from its OWN edge: the closer
   *  eye (on the side the head turns toward) from the leading edge, the further eye from the trailing
   *  edge. Auto-mirrored for the opposite turn. The eye eases from sideRatio (rest) to these at full turn. */
  turnCloserInset: number;
  turnFurtherInset: number;
  /** uniform px inset of the pupil within the eye (the colored rim; held constant through a blink) */
  pupilInset: number;
  /** foreshortening as the head turns / tilts */
  turnWidthRatio: number;
  tiltHeightRatio: number;
  tiltPerspectivePower: number;
}

export interface EarAnatomy {
  /** placement on the head */
  topRatio: number;
  /** rest height ÷ headH (also the grown earphone-cup width) */
  heightRatio: number;
  /** border-radius ÷ current width */
  roundnessRatio: number;
  // turn-inward slide, rest width / offset / hide-min are NOT stored: the slide is a shared constant
  // (× headW, universal), the rest sizes are DERIVED from the global outlineThickness.
}

export interface ArmAnatomy {
  upperWidth: number;
  upperHeight: number;
  lowerWidth: number;
  lowerHeight: number;
  /** rest-pose angles for the LEFT arm (right = negation); upper pivots at the shoulder, lower at the elbow */
  upperAngle: number;
  lowerAngle: number;
  /** shoulder anchor ÷ body height */
  shoulderRatio: number;
  // pivots (shoulder = upper-cap center, elbow = forearm-cap center) and the forearm overlap
  // (upperHeight − lowerWidth) are DERIVED; capsule rounding is fixed (no knob).
}

export interface LegAnatomy {
  legWidth: number;
  legHeight: number;
  footWidth: number;
  footHeight: number;
  /** rest-pose splay for the LEFT side (right = negation); the foot's ±90° lay-flat is structural */
  legAngle: number;
  footAngle: number;
  // foot sole roundness (bottom corners vs the domed top) is a shared constant, not per-character.
  /** horizontal hip placement ÷ body width (stance width) */
  hipInsetRatio: number;
  /** how far the hip tucks up into the body top, as a fraction of body height (× bodyH). */
  hipTuckRatio: number;
  // hip / ankle pivots are DERIVED; leg capsule + foot toe/heel radii are fixed shapes (no knob).
}

export interface SpeechAnatomy {
  /** gap from the head's side edge to the bubble's inner edge (px). The head anchor itself (the
   *  bubble's side + vertical center) is DERIVED from the head geometry, not authored. */
  gap: number;
  /** content width past which the bubble text wraps (px) */
  maxWidth: number;
  // Everything else about the bubble — padding, radius, font, border, tail, head-follow drift, and the
  // read-duration timing — is SHARED across characters (behavioral/chrome), so it lives in speech.tsx.
}

// Per-character BEHAVIOR (motion-tuning), the start of a class we'll formalize later. Today the rest of
// behavior (gesture angles, stride waveform, etc.) is shared; this is a first beachhead for the bits
// that genuinely read as character (a tall robot strolls differently than a stocky one).
export interface GaitAnatomy {
  /** peak leg swing during a walk step (degrees) — the leg's stride extension. */
  strideDeg: number;
  /** peak arm swing during a walk step (degrees) — the upper arm's counter-swing to the legs. */
  armSwingDeg: number;
  /** peak vertical lift of the body.bounce capability, as a fraction of body height. The walk's
   *  per-step bounce scales with this, so higher = a bouncier walk. */
  bounceHeightRatio: number;
  /** peak body lean of the body.lean capability at its extremes (degrees). The walk's lean into
   *  the travel direction scales with this, so higher = leans harder into the walk. */
  leanDeg: number;
  /** walk pace: ms of walk per body-width travelled. Sets the walk duration AND the step cadence
   *  together (cadence = this ÷ steps), so higher = a slower, more deliberate gait. */
  walkMsPerBodyWidth: number;
  /** horizontal screen travel per body-width of walk, in body-widths. Decoupled from the gait
   *  cycle (step count + cadence are unchanged), so raising it just covers more ground per walk —
   *  the legs keep cycling at the same rate, so the feet glide a little. 1.0 = feet roughly track
   *  the ground. */
  travelPerBodyWidth: number;
}

export interface Anatomy {
  global: GlobalAnatomy;
  body: BodyAnatomy;
  head: HeadAnatomy;
  antenna: AntennaAnatomy;
  eye: EyeAnatomy;
  ear: EarAnatomy;
  arm: ArmAnatomy;
  leg: LegAnatomy;
  speech: SpeechAnatomy;
  gait: GaitAnatomy;
}

/** The default preset — reproduces today's Tally. */
export const tally: Anatomy = {
  global: {
    outlineThickness: 6, // visible stroke; container padding is 2× (today's BODY_OFFSET etc. = 12)
    shadow: { width: 80, height: 16, blur: 5, opacity: 0.24 },
  },
  body: {
    width: 52,
    height: 64,
    radiusTop: 32,
    radiusBottom: 24,
    restRotation: 0,
    pivot: { xFrac: 0.5, yFrac: 0.6 },
    turnDepthRatio: 0.84,
    chest: {
      size: 25,
      topRatio: 0.25,
      turnMinRatio: 0.15,
      crouchMinRatio: 0.6,
      turnSlideRatio: 16 / 52, // → relative (was CHEST_TURN_SLIDE 16px)
      crouchRise: 1 / 64,
      haloOffset: 1,
      haloBlur: 0,
    },
  },
  head: {
    width: 120,
    height: 90,
    roundness: 28,
    restRotation: 0,
    pivot: { xFrac: 0.5, yFrac: 0.85 },
    turnDepthRatio: 0.84,
    tiltDepthRatio: 0.92,
    turnRadiusGrow: 1.4,
    tiltRadiusGrow: 1.25,
    shading: { highlightRatio: .5, shadowCrescentRatio: .5 },
    bodyOverlap: 17, // head neck sinks 17px into the body top (today: top −85 + full height 102)
  },
  antenna: {
    width: 9,
    height: 38,
    radius: 3,
    restLean: -15,
    pivot: { xFrac: 0.5, yFrac: 1 },
    baseInset: 10, // base roots 10px into the crown (today: top −28 + height 38)
    rightRatio: 18 / 120, // in from the head's right edge, as a fraction of head width
    tiltHeightRatio: 0.5,
    signalScale: 1, // connecting-mode signal rings at default (head-relative) size
  },
  eye: {
    width: 16,
    height: 28,
    roundnessRatio: 0.42,
    pivot: { xFrac: 0.5, yFrac: 0.5 },
    topRatio: 0.55,
    sideRatio: 0.24,
    turnCloserInset: 26.8 / 120,  // closer eye's inset from its leading edge at full turn (× headW) — reproduces today
    turnFurtherInset: 78.8 / 120, // further eye's inset from its trailing edge at full turn (× headW) — reproduces today
    pupilInset: 4,
    turnWidthRatio: 0.24,
    tiltHeightRatio: 0.7,
    tiltPerspectivePower: 3,
  },
  ear: {
    topRatio: 0.42,
    heightRatio: 0.4,
    roundnessRatio: 0.4,
  },
  arm: {
    upperWidth: 24,
    upperHeight: 48,
    lowerWidth: 24,
    lowerHeight: 40,
    upperAngle: 25,
    lowerAngle: -15,
    shoulderRatio: 0.15,
  },
  leg: {
    legWidth: 24,
    legHeight: 36,
    footWidth: 32,
    footHeight: 24,
    legAngle: 9,
    footAngle: -9, // left foot splays opposite the leg (right = negation → +9)
    hipInsetRatio: 0,
    hipTuckRatio: 26 / 64, // hip overlap into the body top, as a fraction of body height
  },
  speech: {
    gap: 19,        // head edge → bubble inner edge
    maxWidth: 192,  // text wrap column
  },
  gait: {
    strideDeg: 40,             // leg swing extension (matches today)
    armSwingDeg: 22,           // arm counter-swing (matches today's ARM_STRIDE_DEG)
    bounceHeightRatio: 7 / 64, // walk step bounce height (matches today's BODY_BOUNCE_PX)
    leanDeg: 7,                // walk lean into travel (matches today's BODY_LEAN_DEG)
    walkMsPerBodyWidth: 240,   // walk pace (matches today)
    travelPerBodyWidth: 2.2,   // ground covered per walk (matches today's WALK_TRAVEL_PER_BODYWIDTH)
  },
};
