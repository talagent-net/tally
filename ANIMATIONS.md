# Avagent — Animation Architecture

Avagent's animation system is organized in three layers. Higher layers compose from lower layers. This doc describes the model; implementation will follow.

## Layer 1 — Mode animations

The top level. A mode is the character's current behavior. Two channels expose modes to the consumer:

- **`mode`** — the active **looping** behavior. Repeats forever until changed.
  Examples: `hangout`, `walk`, `sleep`, `code`.
- **`reaction`** — a **one-shot** behavior that plays through once, then control returns to `mode`.
  Examples: `laugh`, `cough`, `sneeze`, `surprised`.

### Transitions

Every transition interpolates smoothly. This applies to:
- `mode` changing (e.g. `hangout` → `walk`)
- `reaction` firing while in a mode
- A new `reaction` firing while another reaction is still playing → interpolate immediately to the new reaction
- A reaction finishing and resuming `mode`

### Re-firing the same reaction

If the consumer sets `reaction` to the value that is already playing, it's a **no-op** — the in-flight reaction plays out untouched. To fire the same reaction again after it completes, the consumer must briefly change the value (e.g., `null` → `"laugh"`) so React sees a new prop value.

The component internally tracks "last played reaction value" and ignores duplicates. Managing the clear-and-refire dance is the consumer's responsibility (a wrapper around `<Avagent />` is expected to handle this).

## Layer 2 — Body-part animations

A mode animation is **not** monolithic. It's a **set of independent body-part-level animations** running in parallel, with no shared clock or sync between them.

Example: `hangout` mode composes:
- `blink` on the eyes
- `head bob` on the head
- `foot tap` on a foot

Each runs on its own timer. They are not coordinated.

### Cascade

When a body part has sub-parts, the parent's animation cascades to children via CSS transform inheritance. Sub-parts can also have their own animations running independently — these **stack on top** of the parent's transform. Eyes blink while the head bobs; both apply.

### Reactions take over

When a `reaction` is active, it **fully takes over the whole body** for its duration. The mode's body-part animations are suspended. When the reaction ends, the mode resumes from a smoothly interpolated state.

## Layer 3 — Body-part capabilities

Each body part exposes a small set of normalized scalar **capabilities**. A capability is the abstract dimension along which a part can move, decoupled from how it's rendered.

All capabilities use the **`0..1`** range. Each capability declares its own **rest value** — the value it holds when no animation is driving it. The rest value is whatever makes anatomical sense:
- `eyes.blink` rests at `1` (fully open).
- `head.bob` rests at `0.5` (centered; `0` is fully left, `1` is fully right).

The body part component knows how to translate a capability value into concrete CSS (transforms, scale, opacity, etc.). The body-part animation only ever outputs a number in `0..1`.

### Animations drive capabilities

A body-part animation is a function over time that produces capability values. `blink` might output sudden 1 → 0 → 1 transitions at irregular intervals. `head bob` might output a low-frequency sine wave bounded by ±0.3.

### Rules (simple version)

- **One animation per capability at a time.** We don't try to compose multiple animations on the same capability.
- **Rest values are per-capability**, declared at capability registration. A capability not currently driven by any animation sits at its rest value.

These can be revisited if real cases force the issue.

## Debug mode

A reserved `"debug"` mode disables all regular mode animations. Two props let outside controls drive a single capability directly:

- `debugCapability` — string key of the capability to override.
- `debugValue` — the value to push into that capability (`0..1`).

When `mode === "debug"`, the component registers a "constant" animation on `debugCapability` that yields `debugValue` each frame. The value flows through the engine and renderers exactly like a real animation, so debug uses the same rendering path as production.

The dev page exposes a capability dropdown and a 0–1 slider that drive these props. Useful for visually testing the rendering of a capability before writing its animation.

## Open questions / future

- Interpolation duration for transitions — likely a small fixed value (e.g. 200ms), TBD.
- How modes register which body-part animations they compose (declarative table vs. code).
- Whether `mode` and `reaction` need richer payloads later (e.g. parameters per fire).
