<div align="center">

# avagent

**Expressive, animated avatar characters for your agents in chat or any UI.**
**A React component rendered in plain HTML and CSS.**

[![npm version](https://img.shields.io/npm/v/@talagent-net/avagent.svg)](https://www.npmjs.com/package/@talagent-net/avagent)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[**Open the live playground at avagent.net**](https://avagent.net)

![The avagent roster, six characters across colorways](assets/avagent-roster.png)

</div>

Give your agent a face. avagent renders a friendly robot avatar built entirely from HTML and CSS, with no SVG, canvas, or image files. It blinks, tracks the cursor, gestures, walks, and talks, so a chat bot, a copilot, or any agent UI can show a character with real personality.

## Why avagent

- **Pure HTML and CSS.** No SVG, canvas, or WebGL. The avatar scales crisply at any size and themes with plain color values.
- **A real cast.** Six characters ship out of the box, and a character is just a small object of proportions, so you can design your own without touching rendering code.
- **Themeable.** Eight built-in colorways, or pass any colors you like.
- **It moves.** Gestures, walking, jumping, cursor tracking, and timed speech bubbles.
- **One component.** Drop in `<Avagent />` and bring your own everything else.
- **Typed and documented.** Every prop carries inline documentation in your editor.

## Install

```sh
npm install @talagent-net/avagent
```

`react` and `react-dom` (version 18 or newer) are peer dependencies.

## Quick start

```tsx
import { Avagent } from "@talagent-net/avagent";

export function Demo() {
  return <Avagent mode="track" speech={{ text: "Hi, I am Avagent." }} />;
}
```

With no props, `<Avagent />` renders the default character idling. Every prop is optional.

## Characters

Six presets ship in the `characters` map. Pass any of them to the `anatomy` prop.

```tsx
import { Avagent, characters } from "@talagent-net/avagent";

export function Cast() {
  return <Avagent anatomy={characters.Loop} />;
}
```

The roster: `Avagent`, `Stilt`, `Scratch`, `Float`, `Glitch`, `Loop`.

A character is purely proportions (a plain `Anatomy` object). Copy a preset, change the numbers, and you have a new character. The presets are optional. The `anatomy` prop accepts any object you build.

## Colorways

Eight colorways ship in the `themes` map. Pass any to the `theme` prop, or supply your own tones.

```tsx
import { Avagent, themes } from "@talagent-net/avagent";

export function Themed() {
  return <Avagent theme={themes.forest} />;
}
```

The set: `slate`, `steel`, `tide`, `forest`, `honey`, `ember`, `coral`, `berry`.

## Actions and speech

Fire one-shot actions with the `action` prop, and show a speech bubble with `speech`. Both are independent of `mode`.

```tsx
<Avagent action={{ name: "agree" }} />
<Avagent action={{ name: "walk", direction: "right", distance: 2 }} />
<Avagent speech={{ text: "On it." }} />
```

Gestures include `agree`, `disagree`, `greet`, `shrug`, `hangHead`, and short variants. Movement includes `walk`, `come`, `drop`, and `jump`.

## Modes

The `mode` prop sets the ambient behavior the avatar settles into between actions: `hangout`, `track` (follows the cursor), `connecting`, `frozen` (a still portrait), `snooze`, and `debug`.

## Three independent axes

avagent splits a character into three orthogonal parts, so you can mix them freely.

1. **Anatomy** (`anatomy`) decides which character it is. This is proportions.
2. **Colorway** (`theme`) decides how it looks.
3. **Behavior** (`mode`, `action`, `speech`) decides what it does.

Any character works with any colorway and any behavior.

## TypeScript

avagent is written in TypeScript and ships full type definitions. Props, characters, colorways, actions, and the `Anatomy` shape are typed and documented inline, so your editor guides you as you go.

## In production

avagent powers the avatars across the Talagent platform, where they greet visitors, act out scenes, and answer questions through language models. See them live at [talagent.net](https://talagent.net).

## License

MIT. Built by [Talagent](https://talagent.net).
