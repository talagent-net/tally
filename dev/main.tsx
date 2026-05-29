import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tally } from "../src";
import type { ColorTheme, Mode, ActionSpec } from "../src";
import talagentInner from "./talagent_inner.png";
import talagentOuter from "./talagent_outer.png";
import claudecodeInner from "./claudecode_inner.png";
import claudecodeOuter from "./claudecode_outer.png";
import codexInner from "./codex_innter.png";
import codexOuter from "./codex_outer.png";
import openclawInner from "./openclaw_inner.png";
import openclawOuter from "./openclaw_outer.png";

const logos: Record<string, { inner: string; outer: string }> = {
  talagent: { inner: talagentInner, outer: talagentOuter },
  "claude code": { inner: claudecodeInner, outer: claudecodeOuter },
  codex: { inner: codexInner, outer: codexOuter },
  openclaw: { inner: openclawInner, outer: openclawOuter },
};

const OUTLINE = "#2a2a2a";

const themes: Record<string, ColorTheme> = {
  default: {
    primary: "#415e74",
    primaryDark: "#2c3f50",
    primaryMid: "#6b8ea6",
    outline: OUTLINE,
  },
  ember: {
    primary: "#8b5e3c",
    primaryDark: "#5c3a24",
    primaryMid: "#c49a6c",
    outline: OUTLINE,
  },
  forest: {
    primary: "#4a7355",
    primaryDark: "#2e4a36",
    primaryMid: "#7aab8a",
    outline: OUTLINE,
  },
  berry: {
    primary: "#6b4c7a",
    primaryDark: "#453054",
    primaryMid: "#9e7fb0",
    outline: OUTLINE,
  },
  slate: {
    primary: "#5a5a6a",
    primaryDark: "#3a3a48",
    primaryMid: "#8888a0",
    outline: OUTLINE,
  },
  coral: {
    primary: "#9e5a5a",
    primaryDark: "#6e3838",
    primaryMid: "#c48a8a",
    outline: OUTLINE,
  },
};

const scales = [.36, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const modes: Mode[] = ["hangout", "debug"];
// Each debug capability with its rest value — toggling a capability on starts it at rest (no
// visual jump) so you can then scrub from there. Multiple can be engaged at once.
const debugCapabilities: { key: string; rest: number }[] = [
  { key: "eyes.blink", rest: 1 },
  { key: "head.bob", rest: 0.5 },
  { key: "head.turn", rest: 0.5 },
  { key: "head.tilt", rest: 0.5 },
  { key: "body.turn", rest: 0.5 },
  { key: "body.bounce", rest: 0 },
  { key: "body.lean", rest: 0.5 },
  { key: "legs.swing", rest: 0.5 },
  { key: "arms.swing", rest: 0.5 },
  { key: "arms.left.raise", rest: 0 },
  { key: "arms.left.wave", rest: 0.5 },
  { key: "antenna.wiggle", rest: 0.5 },
];
// Gesture actions fire with a fixed spec; walk takes direction + distance (body-widths).
const gestures: ActionSpec[] = [{ name: "disagree" }, { name: "agree" }];

function App() {
  const [themeName, setThemeName] = useState("default");
  const [scale, setScale] = useState(1);
  const [showAnchor, setShowAnchor] = useState(false);
  const [logoName, setLogoName] = useState<string>("talagent");
  const [mode, setMode] = useState<Mode>("hangout");
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [walkDistance, setWalkDistance] = useState(2); // body-widths per walk press

  // Toggle a capability override on (pinned at its rest value) or off. Engaged capabilities
  // hold independently, so you can pin several at once.
  const toggleOverride = (key: string, rest: number) =>
    setOverrides((o) => {
      const next = { ...o };
      if (key in next) delete next[key];
      else next[key] = rest;
      return next;
    });
  const setOverrideValue = (key: string, value: number) =>
    setOverrides((o) => ({ ...o, [key]: value }));

  // Fire an action by toggling null → spec. The Tally component dedupes against its last
  // value, so the null bounce is needed to re-fire an identical action.
  const fireAction = (spec: ActionSpec) => {
    setAction(null);
    setTimeout(() => setAction(spec), 50);
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "stretch" }}>
      {/* Left: controls column */}
      <div
        style={{
          width: 380,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: 24,
          borderRight: "1px solid #e2e2e2",
          background: "#fafafa",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 14, color: "#666" }}>
          Theme
          <select
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            {Object.keys(themes).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: "#666" }}>
          Scale
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            {scales.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={showAnchor}
            onChange={(e) => setShowAnchor(e.target.checked)}
          />
          Anchor
        </label>
        <label style={{ fontSize: 14, color: "#666" }}>
          Logo
          <select
            value={logoName}
            onChange={(e) => setLogoName(e.target.value)}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            <option value="none">none</option>
            {Object.keys(logos).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: "#666" }}>
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            {modes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span style={{ fontSize: 14, color: "#666" }}>Debug overrides (engage any combination):</span>
        {debugCapabilities.map(({ key, rest }) => {
          const engaged = key in overrides;
          const value = engaged ? overrides[key] : rest;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#666" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, width: 130 }}>
                <input type="checkbox" checked={engaged} onChange={() => toggleOverride(key, rest)} />
                {key}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={value}
                disabled={!engaged}
                onChange={(e) => setOverrideValue(key, Number(e.target.value))}
                style={{ width: 160 }}
              />
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 36, opacity: engaged ? 1 : 0.4 }}>{value.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: "#666", width: "100%" }}>Actions:</span>
        {gestures.map((spec) => (
          <button
            key={spec.name}
            type="button"
            onClick={() => fireAction(spec)}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            {spec.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: "#666", width: "100%" }}>Walk:</span>
        <button
          type="button"
          onClick={() => fireAction({ name: "walk", direction: "left", distance: walkDistance })}
          style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
        >
          walk ←
        </button>
        <button
          type="button"
          onClick={() => fireAction({ name: "walk", direction: "right", distance: walkDistance })}
          style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
        >
          walk →
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#666", width: "100%" }}>
          <span style={{ width: 60 }}>Distance</span>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={walkDistance}
            onChange={(e) => setWalkDistance(Number(e.target.value))}
            style={{ width: 160 }}
          />
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{walkDistance.toFixed(1)}</span>
        </label>
      </div>
      </div>

      {/* Right: demo space */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: scale * 240 + 40,
          overflow: "auto",
        }}
      >
        <Tally
          scale={scale}
          mode={mode}
          theme={themes[themeName]}
          showAnchor={showAnchor}
          chestImage={logos[logoName]?.inner}
          chestOutline={logos[logoName]?.outer}
          debugOverrides={overrides}
          action={action}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
