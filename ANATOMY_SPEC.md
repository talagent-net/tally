# Avagent — Parametric Anatomy Spec (Design)

> **Status:** design, pre-implementation. This document is the output of the "abstract Avagent's
> anatomy into data" design pass. No code has changed yet. The default anatomy preset must
> reproduce today's Avagent; this doc defines the parameter set that makes that possible and makes
> other robots expressible by editing numbers alone.

## 1. Vision & boundaries

Avagent is a robot built from rounded `div` boxes — fundamentally *a set of numbers* (sizes, offsets,
radii, angles). Today those numbers are hard-coded module constants. The goal is to lift them into a
declarative **anatomy spec** so that a different robot — thinner, taller, longer-legged, smaller-headed,
less rounded, eyes further apart — is *just a different anatomy object*, with no change to the rendering
or animation machinery.

Three **independent** axes:

| Axis | What it is | Per-character? |
|------|-----------|----------------|
| **Anatomy** | proportions — every size/offset/radius/rest-angle | **Yes — this *is* the character** |
| **Theme** | colorway | No — orthogonal; any character in any colorway |
| **Behavior** | capability set + animations/actions + motion-tuning | No — shared engine (motion-tuning overridable later) |

A "character" is **only** an anatomy object. Avagent is the default preset.

## 2. The model

### 2.1 Two unit kinds
- **Render units** — `1 unit = 1px at scale 1`. A single `scale` multiplier hits everything uniformly,
  so the figure resizes with no per-part math.
- **Animation values** — normalized capabilities in `[0,1]` with declared rest points. Their *render
  magnitudes* are either **angles** (degrees — intrinsically proportion-portable) or **fractions of a
  named anatomy property** (e.g. "slide by 0.4 × head width"). Animation values never carry absolute px.

### 2.2 Buckets
Every current constant sorts into exactly one of:
1. **Rest-shape anatomy** — dimensions, radii, rest-pose angles, pivots, foreshortening/depth ratios.
   *(per-character)*
2. **Motion-tuning** — the magnitudes/ranges of capabilities (stride°, wave°, flail range, gaze slides…).
   *(shared engine, overridable later)*
3. **Derived** — values computed from (1)+(2), kept as expressions, never re-hardcoded.

Plus two cross-cutting concerns: **character-level globals** (§3) and **grounding** (§2.4).

> **Sorting test** used throughout: *"Would a differently-proportioned robot have a different value?"*
> Yes → anatomy. "That's just how it moves" → motion-tuning. This is why **foreshortening ratios are
> anatomy** (they encode the implied 3rd dimension / depth) while gait magnitudes are tuning.

### 2.3 Kinematic tree, anchors, pivots
- **Body is the root.** Head → (eyes, ears, antenna), and arms/legs hang off the body. The parent→child
  cascade is the existing DOM nesting (CSS transforms inherit); no manual inherited-motion math.
- **Attachment anchors are fractions of the parent** (e.g. eyes at `0.55 × headH`, shoulders at
  `0.15 × bodyH`). Never absolute coordinates — a fraction of something that exists can't detach and
  scales for free.
- **Pivots are derived, never authored as coordinates.** Capsule limbs pivot at their rounded-cap
  centers; the body/head pivots are fractions of their own dimensions. This makes illegal states
  (detached parts, non-scaling pivots) unrepresentable while leaving *unusual* states reachable.
- **Renderers receive the resolved rig**, not just their own slice — a child reads its parent's
  resolved dimensions (the eye matches the head's tilt foreshortening; the antenna tracks the head's
  turned edge). This is a hard plumbing requirement.

### 2.4 Grounding
`BODY_BOTTOM` stops being a constant and becomes a **computed output**: the engine resolves the
rest-pose leg+foot stack, finds the lowest point (foot bottom), and places the body so that point lands
on the anchor (the ground line). Consequence — *longer legs raise the body and the feet stay planted*,
automatically. The body is the kinematic root; grounding is the final pin to the floor; the shadow sits
at the anchor (= the ground), so it stays correct.

### 2.5 Mirror convention
Store the **left** side's rest angles; the right is the negation (`rightAngle = −leftAngle`) — the
pattern the renderers already use.

### 2.6 Layering
Each part carries a base `z`. Conditional flips (the antenna renders *in front* of the head when looking
down, *behind* otherwise) are **fixed machinery** — identical for every character, baked into the
renderer, never a per-character knob.

### 2.7 Extraction discipline (the oracle)
The default preset must render **pixel-identical** to today's Avagent and run every existing gesture
unchanged. Any pixel diff during extraction is therefore a **bug signal**. Deliberate visual changes are
done as separate, labeled passes — not folded into the mechanical extraction. The **only** intended
deviation in this pass:
- **Drop the `HEAD_OFFSET/8` highlight asymmetry** (~1.5px). Negligible; documented here.
- Head shading is knob-ified but **defaulted to today's measured values** (see §4 Head) → *no* visual
  change; equalizing the bands to `1.0` is an available later art pass.

## 3. Character-level globals

| Param | Value | Notes |
|-------|-------|-------|
| `outlineThickness` | `6` | **Visible** silhouette stroke (renderer uses 2× internally for container padding). Inherited by Body, Head, Arms, Legs. Ears derive their rest size from it. **Antenna does not use it** (solid stick). |
| `grounding` | — | The resolve-stack-and-pin-feet step (§2.4). Produces the body's elevation. |
| `shadow` | `w:80 h:16 blur:5 opacity:0.24 fadeOutBodyWidths:4` | Soft ground ellipse at the anchor. Scales with the figure; fades to invisible by `fadeOutBodyWidths` of lift. |

No global light direction — shading is head-only (§4 Head).

## 4. Per-part anatomy

> Angles in degrees (portable). `*Ratio` = fraction of the named reference. Values are today's
> (default preset = Avagent). "→ fraction" marks a current absolute-px value to be converted (§5).

### Body (root)
| Group | Knobs |
|-------|-------|
| Form | `width:52`, `height:64`, `radiusTop:32`, `radiusBottom:24`, `restRotation:0` |
| Pivot | `{ xFrac:0.5, yFrac:0.6 }` |
| Depth | `turnDepthRatio:0.84` (visible width fraction at full profile) |
| Grounding | `BODY_BOTTOM` → **computed** (not a knob) |

**Chest decal (sub-part of Body):** `sizeRatio` (logo box ÷ bodyW ≈ `0.48`), `topRatio:0.25`,
depth `turnMinRatio:0.15` / `crouchMinRatio:0.6`, `turnSlide:16 → bodyW fraction`, `crouchRise:1`,
logo halo `offset:1`/`blur:0` (an effect).

### Head (child of Body)
| Group | Knobs |
|-------|-------|
| Form | `width:120`, `height:90`, `roundness:36`, `restRotation:0` |
| Pivot | `{ xFrac:0.5, yFrac:0.85 }` (neck pivot, near base) |
| Foreshorten | `turnDepthRatio:0.75`, `tiltDepthRatio:0.92`, `turnRadiusGrow:1.4`, `tiltRadiusGrow:1.25` |
| Shading | `highlightRatio:0.73`, `shadowCrescentRatio:0.5` (× `outlineThickness`; defaults = today's look) |
| Attachment | `topRatio` ← from `HEAD_TOP:-85`; head/body overlap → stack/grounding convention |
| Motion-tuning | `tiltRenderRange:[0.3,0.7]` (clamps the head.tilt visual range) |

### Antenna (child of Head)
| Group | Knobs |
|-------|-------|
| Form | `width:9`, `height:38`, `radius:3` (fixed); **solid dark stick — no outline band** |
| Rest pose | `restLean:-15°`, pivot = bottom-center |
| Placement | `topRatio` ← `ANTENNA_TOP:-28` (× headH); `rightRatio` ← `ANTENNA_RIGHT:18` (× headW) |
| Foreshorten | `tiltHeightRatio:0.5` |
| Motion-tuning | `turnLeanDeg:8`, `wiggleDeg:25`, `tiltSlide:18 → headH fraction` |
| Layer | base `z:-1`; conditional front `z:6` on look-down (machinery) |

**Signal VFX (connecting mode, not anatomy):** `ringCount:3`, `period:1600ms`, `min:8`, `max:52`
(→ optional headW fraction), `thickness:3`. Anchored to the antenna tip; rides its transform.

### Eyes (child of Head)
| Group | Knobs |
|-------|-------|
| Form | `width:16`, `height:28`, `roundnessRatio:0.5`, pivot = center |
| Placement | `topRatio:0.55`, `sideRatio:0.24` *(already relative)* |
| Pupil | `pupilInset:4` (absolute px rim — scales with avatar, holds constant through blink) |
| Foreshorten | `turnWidthRatio:0.24`, `tiltHeightRatio:0.7`, `tiltPerspectivePower:3` |
| Motion-tuning | `blinkClose:0.84`; gaze slides `turnSlideGaze:26`, `turnSlideConvergence:24`, `tiltSlideUp:58`, `tiltSlideDown:14` → **head-relative fractions** |

### Ears (child of Head)
| Group | Knobs |
|-------|-------|
| Placement | `topRatio:0.42` |
| Form | `heightRatio:0.4` (× headH; also the grown cup's width), `roundnessRatio:0.4` (× width); rest width/offset/hide-min **derived from `outlineThickness`** |
| Turn | `turnInwardRatio:0.25` (× headW) |
| Motion-tuning | `hideRate:3`; `tiltSlide:8 → headH fraction` |
| Layer | `z:-1` (behind head) |

### Arms (child of Body) — two-bone chain
| Group | Knobs |
|-------|-------|
| Form | `upperWidth:24`, `upperHeight:48`, `lowerWidth:24`, `lowerHeight:40`; capsule fixed (no roundness knob) |
| Rest pose | `upperAngle:25°`, `lowerAngle:-15°` (left; right = negation) |
| Pivots | derived — shoulder = upper-cap center, elbow = forearm-cap center |
| Attachment | `shoulderRatio:0.15` (× bodyH); forearm overlap derived |
| Motion-tuning | `strideDeg:22`, `waveDeg:25`, flail `[20,150]`, crouch `upperOut:20°`/`forearmIn:70°`, raise targets `upper:45°`/`lower:130°`; `shoulderTurnInward:16 → bodyW fraction` |

> The arm is the proof of the whole model: `upperAngle = rest + raise + swing + crouch + flail` — rest
> pose is anatomy, every animation is an additive **angular delta**. All motion is angular ⇒ portable.

### Legs + Feet (child of Body)
| Group | Knobs |
|-------|-------|
| Form | `legWidth:24`, `legHeight:36`, `footWidth:32`, `footHeight:24`; leg capsule + foot asymmetric-radius shape, both fixed |
| Rest pose | `legAngle:9°`, `footAngle:9°` (splay; left, right = negation). The `±90°` foot lay-flat is structural |
| Pivots | derived — hip = leg-cap center, ankle = foot center |
| Attachment | `hipInsetRatio:0` (× bodyW — stance width); `hipTuck:26` (hip→body overlap) → stack/grounding convention |
| Motion-tuning | `strideDeg:40`, leg flail; `hipTurnInward:12 → bodyW fraction`; `footTrailInward:0`/`footLeadOutward:0` (disabled; → bodyW if re-enabled) |

### Shadow
Ground decal at the anchor: `width:80`, `height:16`, `blur:5`, `opacity:0.24`, `fadeOutBodyWidths:4`.
The decal stays pinned to the ground; the only thing a jump/drop (`body.y`) does to it is fade. Opacity
ramps linearly from full at the ground to **fully invisible** at `fadeOutBodyWidths` body-widths of lift
(and stays invisible above that). Measured in body-widths to match the jump apex (`jump.heightBodyWidths`).

## 5. Portability fixes — absolute px → relative

The complete list of current absolute-px values that must become relative for reproportioning to hold:

| Current | Becomes | Reference |
|---------|---------|-----------|
| `BODY_BOTTOM:15` | computed | grounding (§2.4) |
| `HEAD_TOP:-85` | `topRatio` / overlap | stack convention |
| `hipTuck:26` | overlap | stack convention |
| `ANTENNA_TOP:-28`, `ANTENNA_RIGHT:18` | `topRatio`, `rightRatio` | head H / W |
| `antenna tiltSlide:18` | fraction | head H |
| `eye turnSlideGaze:26`, `turnSlideConvergence:24` | fractions | head W |
| `eye tiltSlideUp:58`, `tiltSlideDown:14` | fractions | head H |
| `ear tiltSlide:8` | fraction | head H |
| `shoulderTurnInward:16` | fraction | body W |
| `hipTurnInward:12` (+ foot slides at 0) | fraction | body W |
| `chest turnSlide:16` | fraction | body W |
| `signal max:52` *(optional)* | fraction | head W |

Everything else is already either a fraction, a derived expression, or an angle.

## 6. Shared engine (for reference — not per-character)
- **Capabilities** (rig DOF, normalized, declared with rest values in `AvagentInner`): `eyes.blink`,
  `eyes.spin`, `head.bob/turn/tilt`, `arms.{left,right}.{raise,wave,flail}`, `arms.stride`,
  `antenna.wiggle`, `body.turn`, `upperbody.turn`, `body.{x,y,bounce,lean,crouch}`, `legs.stride`,
  `legs.{left,right}.flail`.
- **Animations / actions** (`src/animation/*`): blink, lookAround, follow, antennaWiggle, eyeSpin, and
  the pure gestures + locomotion (wave, shrug, nod, shake, hangHead, walk, jump, drop…).

These are universal. They consume the resolved rig + motion-tuning; they do not change per character.

## 7. Validation plan
- **The model is already proven by the existing code:** arms use rest+delta composition, eyes/ears/antenna
  use fractional anchors and read the parent head's foreshortening — i.e. real gestures are *already*
  authored the way this model requires.
- **Oracle:** default preset renders pixel-identical Avagent (modulo the documented `/8` drop).
- **Portability test:** a deliberately-distorted preset (long legs, small head, less rounding, wide eyes)
  must render coherently and run every gesture without per-gesture edits.

## 8. Next steps (implementation — step 3+)
1. Define the `Anatomy` TypeScript types (per §3–§4), with a `avagent` default preset = today's numbers.
2. Build the **resolver**: `Anatomy + scale → ResolvedRig` (pixels, derived pivots, grounding-computed
   body elevation).
3. Convert the px values in §5 to anatomy-relative fractions (default values chosen to reproduce today).
4. Refactor the part renderers to read the `ResolvedRig` instead of module constants; thread the resolved
   rig so children can read parents.
5. Verify the oracle (pixel-identical default), then the distorted-preset portability test.
6. Refresh `SPEC.md` (currently stale — it predates legs/feet).
