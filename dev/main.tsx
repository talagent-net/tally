import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tally } from "../src";
import type { ColorTheme } from "../src";

const themes: Record<string, ColorTheme> = {
  default: {
    primary: "#415e74",
    primaryDark: "#2c3f50",
    primaryMid: "#6b8ea6",
  },
  ember: {
    primary: "#8b5e3c",
    primaryDark: "#5c3a24",
    primaryMid: "#c49a6c",
  },
  forest: {
    primary: "#4a7355",
    primaryDark: "#2e4a36",
    primaryMid: "#7aab8a",
  },
  berry: {
    primary: "#6b4c7a",
    primaryDark: "#453054",
    primaryMid: "#9e7fb0",
  },
  slate: {
    primary: "#5a5a6a",
    primaryDark: "#3a3a48",
    primaryMid: "#8888a0",
  },
  coral: {
    primary: "#9e5a5a",
    primaryDark: "#6e3838",
    primaryMid: "#c48a8a",
  },
};

const scales = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];

function App() {
  const [themeName, setThemeName] = useState("default");
  const [scale, setScale] = useState(2);
  const [showAnchor, setShowAnchor] = useState(true);

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
      </div>
      <div style={{ marginTop: scale * 240 + 40 }}>
        <Tally scale={scale} mode="hangout" theme={themes[themeName]} showAnchor={showAnchor} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
