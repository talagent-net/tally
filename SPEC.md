# Avagent — Mascot Component Spec

## Overview

Avagent is a React component (`<Avagent />`) that renders an animated mascot built from simple rounded div boxes. No complex SVGs — all anatomy is CSS-native, animated with transforms.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scale` | `number` | `1` | Unitless multiplier for the base size |
| `mode` | `Mode` | `"hangout"` | Active animation mode |

### Modes (v1)

- **`hangout`** — standing idle. Gentle cyclic motion: subtle body bob, arm sway, eye blinks, antenna bobble. Eyes track the mouse cursor.
- **`jump`** — jumping up and down. Body moves vertically, limbs react, shadow expands/contracts with height.

## Visual style

- Composed of simple rounded `div` boxes
- White background
- Drop shadow beneath the figure, responsive to vertical position (spreads when airborne, tightens when grounded)
- No mouth

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#415e74` | Main body color (muted steel blue) |
| `primaryHover` | `#344a5c` | Hover / darker accent |
| `primaryLight` | `#eaeff4` | Light variant |
| `accent` | `#9c9077` | Secondary accent (warm taupe) |
| `background` | `#ffffff` | Page / container background |

## Anatomy

Two-level kinematic tree. A child part anchors to a point on its parent — when the parent transforms, children inherit that motion and apply their own on top.

```
Body (L1 — root, egg-shaped, tapers at bottom, floats above shadow)
├── Head (L2 — anchored top-center of body, wide landscape rectangle)
│   ├── Head Shadow (L3 — depth shadow offset behind head face)
│   ├── Head Face (L3 — main visible head surface)
│   ├── Left Eye (L3 — vertical rectangle, mid-blue)
│   ├── Right Eye (L3 — vertical rectangle, mid-blue)
│   ├── Left Ear (L3 — side protrusion, behind head face)
│   ├── Right Ear (L3 — side protrusion, behind head face)
│   └── Antenna (L3 — angled stick, top-right, behind head face)
├── Left Arm (L2 — stubby, rounded, anchored left side of body)
├── Right Arm (L2 — stubby, rounded, anchored right side of body)
└── [Wearables] (L2 — optional, future)
Shadow (sibling of body, anchored at ground plane)
```

No legs — Avagent floats above a soft elliptical drop shadow. The body is egg/capsule-shaped, wider at the shoulders and tapering to a rounded bottom. Arms are short, pill-shaped nubs.

### Multi-shape body parts

A single body part (e.g. an arm) may consist of multiple shapes (divs) that move independently during animation. These shapes are internal to the subcomponent — they don't add a kinematic level, but give each part richer visual and motion detail.

### Kinematic chain

Lower-order parts anchor to a defined point on the higher-order part. CSS transform inheritance through nested divs provides the cascade naturally — no manual position math needed for inherited motion. Each part applies its own transforms relative to its anchor point.

## Animation system

### Shared phase clock

A single base cycle period per mode (e.g. ~3s for hangout idle breathing). Each body part references this clock but applies its own:

- **Phase offset** — so parts don't move in lockstep
- **Random variance** — slight per-cycle timing jitter for organic feel

Result: loosely coupled motion that feels alive without being robotic or disjointed.

### Per-mode pose definition

Each animation mode defines what every body part does — described as transforms (translate, rotate, scale) with timing parameters.

| Body part | hangout | jump |
|-----------|---------|------|
| Body | gentle vertical bob (floating) | vertical jump cycle |
| Head | slight tilt cycle | tilt reacting to motion |
| Eyes | blink + cursor track | blink + cursor track |
| Ears | slight wiggle with head tilt | follow head |
| Antenna | idle bobble (spring delay) | spring follow with overshoot |
| Arms | subtle sway | raise/lower with jump |
| Shadow | soft, static | expand/contract with height |

### Mouse interactions

- **Eye tracking** — eyes follow the cursor position relative to the component
- **Hover reaction** — subtle response animation on mouseenter (e.g. eyebrows perk, antenna springs), settles back into idle cycle

## Mode transitions

When the `mode` prop changes, Avagent interpolates smoothly from the current pose to the new mode's pose. This requires tracking the previous mode's state to blend from.

## Anchor point

Each mode defines its own anchor point — the fixed reference position for the component within its parent. Default is feet/ground plane (e.g. `jump` anchors at the ground so the shadow stays fixed while the body rises). The consumer positions Avagent via its parent div; `scale` is always explicitly set by the consumer.

## Future considerations

- Additional animation modes (sleep, wave, thinking, etc.)
- Wearables system (jetpack, outfits, carried objects) as optional L2 children of Body
- Mouth (deferred — eyebrows + eyes provide sufficient expressiveness)
