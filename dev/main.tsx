import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tally } from "../src";
import type { ColorTheme, Mode } from "../src";
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
const debugCapabilities = ["eyes.blink", "head.bob", "head.turn", "head.tilt"];

function App() {
  const [themeName, setThemeName] = useState("default");
  const [scale, setScale] = useState(2);
  const [showAnchor, setShowAnchor] = useState(false);
  const [logoName, setLogoName] = useState<string>("talagent");
  const [mode, setMode] = useState<Mode>("hangout");
  const [debugCapability, setDebugCapability] = useState<string>(debugCapabilities[0]);
  const [debugValue, setDebugValue] = useState<number>(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 32, gap: 24 }}>
      <div style={{ display: "flex", gap: 16 }}>
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
      <div style={{ display: "flex", gap: 16, alignItems: "center", opacity: mode === "debug" ? 1 : 0.4 }}>
        <label style={{ fontSize: 14, color: "#666" }}>
          Capability
          <select
            value={debugCapability}
            onChange={(e) => setDebugCapability(e.target.value)}
            disabled={mode !== "debug"}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            {debugCapabilities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: "#666", display: "flex", alignItems: "center", gap: 8 }}>
          Value
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={debugValue}
            disabled={mode !== "debug"}
            onChange={(e) => setDebugValue(Number(e.target.value))}
            style={{ width: 180 }}
          />
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{debugValue.toFixed(2)}</span>
        </label>
      </div>
      <div style={{ marginTop: scale * 240 + 40 }}>
        <Tally
          scale={scale}
          mode={mode}
          theme={themes[themeName]}
          showAnchor={showAnchor}
          chestImage={logos[logoName]?.inner}
          chestOutline={logos[logoName]?.outer}
          debugCapability={debugCapability}
          debugValue={debugValue}
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
