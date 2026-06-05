import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tally, tally } from "../src";
import type { ColorTheme, Mode, ActionSpec, SpeechSpec, SpeechSide, Anatomy } from "../src";
import openclaw from "./openclaw.png";
import claudecode from "./claudecode.png";
import codex from "./codex.png";

// Single logo PNG, rendered light-tinted on top of the solid chest panel.
const logos: Record<string, string> = {
  openclaw,
  "claude code": claudecode,
  codex,
};

const OUTLINE = "#2a2a2a";

const themes: Record<string, ColorTheme> = {
  default: {
    primary: "#415e74",
    primaryDark: "#2c3f50",
    primaryMidDark: "#56768d",
    primaryMid: "#6b8ea6",
    outline: OUTLINE,
  },
  ember: {
    primary: "#8b5e3c",
    primaryDark: "#5c3a24",
    primaryMidDark: "#a87c54",
    primaryMid: "#c49a6c",
    outline: OUTLINE,
  },
  forest: {
    primary: "#4a7355",
    primaryDark: "#2e4a36",
    primaryMidDark: "#628f70",
    primaryMid: "#7aab8a",
    outline: OUTLINE,
  },
  berry: {
    primary: "#6b4c7a",
    primaryDark: "#453054",
    primaryMidDark: "#856695",
    primaryMid: "#9e7fb0",
    outline: OUTLINE,
  },
  slate: {
    primary: "#5a5a6a",
    primaryDark: "#3a3a48",
    primaryMidDark: "#717185",
    primaryMid: "#8888a0",
    outline: OUTLINE,
  },
  coral: {
    primary: "#9e5a5a",
    primaryDark: "#6e3838",
    primaryMidDark: "#b17272",
    primaryMid: "#c48a8a",
    outline: OUTLINE,
  },
};

// A few demo character presets — each is just an override of `tally` (proportions only; theme and
// behavior are independent). Tally is the default. NOTE: attachment/grounding for EXTREME proportions
// isn't finalized yet (HEAD_TOP, leg hipTuck, BODY_BOTTOM are still literal), so very long/short legs
// may not sit perfectly on the ground line — that's the next phase. Moderate variation looks right.
const characters: Record<string, Anatomy> = {
  Tally: tally,
  Beanpole: {
    ...tally,
    global: {
      ...tally.global, shadow: { width: 56, height: 16, blur: 5, opacity: 0.24 },
    },
    body: { ...tally.body, width: 36, height: 84 },
    head: { ...tally.head, width: 56, height: 80, bodyOverlap: 11, roundness: 16, turnDepthRatio: 1.08, tiltDepthRatio: .96, tiltRadiusGrow: 1.5 },
    eye: {
      ...tally.eye, width: 20, height: 20, roundnessRatio: .3,
      topRatio: 0.45,
      sideRatio: 0.22,
      pupilInset: 5,
      tiltHeightRatio: 0.4,
      tiltPerspectivePower: 1.5,
      turnWidthRatio: .24,
      turnCloserInset: -.1,
      turnFurtherInset: .75,
    },
    ear: { ...tally.ear, heightRatio: 0.2 },
    antenna: { ...tally.antenna, height: 24, signalScale: 2 },
    arm: { ...tally.arm, upperWidth: 20, lowerWidth: 20, upperHeight: 52, lowerHeight: 46, upperAngle: 15, lowerAngle: -10 },
    leg: { ...tally.leg, legWidth: 20, legHeight: 64, footWidth: 24, footHeight: 20, legAngle: 3, footAngle: -3 },
    gait: { ...tally.gait, strideDeg: 24, walkMsPerBodyWidth: 340 }, // tall + lanky: smaller, slower strides
  },
  Tank: {
    ...tally,
    body: { ...tally.body, width: 66, height: 58, radiusTop: 40, radiusBottom: 34 },
    head: { ...tally.head, width: 138, height: 106, roundness: 46 },
    arm: { ...tally.arm, upperWidth: 28, lowerWidth: 28, upperHeight: 40, lowerHeight: 32 },
    leg: { ...tally.leg, legWidth: 28, legHeight: 30, footWidth: 38 },
  },
  Buglet: {
    ...tally,
    body: { ...tally.body, width: 44, height: 52 },
    head: { ...tally.head, width: 150, height: 112 },
    eye: { ...tally.eye, width: 20, height: 34 },
    leg: { ...tally.leg, legHeight: 30 },
  },
  Blockhead: {
    ...tally,
    body: { ...tally.body, radiusTop: 14, radiusBottom: 10 },
    head: { ...tally.head, roundness: 14 },
    eye: { ...tally.eye, roundnessRatio: 0.2 },
    ear: { ...tally.ear, roundnessRatio: 0.2 },
  },
  Squirt: {
    ...tally,
    body: { ...tally.body, width: 40, height: 48 },
    head: { ...tally.head, width: 96, height: 74 },
    arm: { ...tally.arm, upperHeight: 40, lowerHeight: 32 },
    leg: { ...tally.leg, legHeight: 28 },
  },
};

const scales = [.36, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const modes: Mode[] = ["hangout", "track", "connecting", "debug"];
// Each debug capability with its rest value — toggling a capability on starts it at rest (no
// visual jump) so you can then scrub from there. Multiple can be engaged at once.
const debugCapabilities: { key: string; rest: number }[] = [
  { key: "eyes.blink", rest: 1 },
  { key: "eyes.spin", rest: 0 },
  { key: "head.bob", rest: 0.5 },
  { key: "head.turn", rest: 0.5 },
  { key: "head.tilt", rest: 0.5 },
  { key: "body.turn", rest: 0.5 },
  { key: "upperbody.turn", rest: 0.5 },
  { key: "body.bounce", rest: 0 },
  { key: "body.lean", rest: 0.5 },
  { key: "body.crouch", rest: 0 },
  { key: "legs.stride", rest: 0.5 },
  { key: "arms.stride", rest: 0.5 },
  { key: "arms.left.flail", rest: 0.5 },
  { key: "arms.right.flail", rest: 0.5 },
  { key: "legs.left.flail", rest: 0.5 },
  { key: "legs.right.flail", rest: 0.5 },
  { key: "arms.left.raise", rest: 0 },
  { key: "arms.left.wave", rest: 0.5 },
  { key: "arms.right.raise", rest: 0 },
  { key: "arms.right.wave", rest: 0.5 },
  { key: "antenna.wiggle", rest: 0.5 },
];
// Gesture actions fire with a fixed spec; walk takes direction + distance (body-widths).
const gestures: ActionSpec[] = [{ name: "disagree" }, { name: "agree" }, { name: "greet" }, { name: "shrug" }, { name: "hangHead" }];

const GROUND_Y = 480; // px from the demo pane's top to the figure's anchor — i.e. the ground line.

function App() {
  const [themeName, setThemeName] = useState("default");
  const [characterName, setCharacterName] = useState("Tally");
  const [scale, setScale] = useState(1);
  const [showAnchor, setShowAnchor] = useState(false);
  const [groundShadow, setGroundShadow] = useState(false);
  const [mode, setMode] = useState<Mode>("hangout");
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [logoName, setLogoName] = useState<string>("openclaw");
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [walkDistance, setWalkDistance] = useState(2); // body-widths per walk press
  const [speech, setSpeech] = useState<SpeechSpec | null>(null);
  const [speechText, setSpeechText] = useState("Hi, I'm Tally. Agent and avatar built by Peter.");
  const [speechSide, setSpeechSide] = useState<SpeechSide>("auto");

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

  // Same null-bounce as actions so identical text re-fires.
  const fireSpeech = () => {
    setSpeech(null);
    setTimeout(() => setSpeech({ text: speechText, side: speechSide }), 50);
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
            Character
            <select
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              style={{ marginLeft: 8, padding: "4px 8px" }}
            >
              {Object.keys(characters).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
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
          <label style={{ fontSize: 14, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={groundShadow}
              onChange={(e) => setGroundShadow(e.target.checked)}
            />
            Ground shadow
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
          <button
            type="button"
            onClick={() => fireAction({ name: "come", direction: "left", distance: walkDistance })}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            come ↦ (from left)
          </button>
          <button
            type="button"
            onClick={() => fireAction({ name: "come", direction: "right", distance: walkDistance })}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            come ↤ (from right)
          </button>
          <button
            type="button"
            onClick={() => fireAction({ name: "drop", distance: walkDistance })}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            drop ↓
          </button>
          <button
            type="button"
            onClick={() => fireAction({ name: "jump" })}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            jump ↑
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "#666", width: "100%" }}>Say:</span>
          <input
            type="text"
            value={speechText}
            onChange={(e) => setSpeechText(e.target.value)}
            placeholder="What should Tally say?"
            style={{ flex: 1, minWidth: 160, padding: "6px 8px", fontSize: 14 }}
          />
          <select
            value={speechSide}
            onChange={(e) => setSpeechSide(e.target.value as SpeechSide)}
            style={{ padding: "4px 8px" }}
          >
            <option value="auto">auto</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
          <button
            type="button"
            onClick={fireSpeech}
            disabled={speechText.length === 0}
            style={{ padding: "6px 14px", fontSize: 14, cursor: "pointer" }}
          >
            say
          </button>
        </div>
      </div>

      {/* Right: demo space */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: GROUND_Y,
          overflow: "auto",
        }}
      >
        {/* Ground plane at the figure's anchor (feet/ground line) — for eyeballing leg grounding. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GROUND_Y,
            bottom: 0,
            background: "#eef1f5",
            borderTop: "2px solid #c7ccd6",
            pointerEvents: "none",
          }}
        />
        <Tally
          scale={scale}
          mode={mode}
          anatomy={characters[characterName]}
          theme={themes[themeName]}
          showAnchor={showAnchor}
          groundShadow={groundShadow}
          chestImage={logos[logoName]}
          debugOverrides={overrides}
          action={action}
          speech={speech}
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
