import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, ButtonHTMLAttributes, RefObject } from "react";
import { createRoot } from "react-dom/client";
import { Avagent, avagent, characters, measureFigure, themes } from "../src";
import type { ColorTheme, Mode, ActionSpec, SpeechSpec, SpeechSide, Anatomy } from "../src";
import openclaw from "./openclaw.png";
import claudecode from "./claudecode.png";
import codex from "./codex.png";
import avagentMark from "./avagent-mark.webp";
import "./styles.css";

// Single logo PNG, rendered light-tinted on top of the solid chest panel.
const logos: Record<string, string> = {
  openclaw,
  "claude code": claudecode,
  codex,
};

const scales = [0.36, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const modes: Mode[] = ["hangout", "track", "connecting", "frozen", "snooze", "debug"];
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
  { key: "body.sink", rest: 0 },
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
// Capabilities grouped by their first path segment (eyes / head / body / arms / …), so the dense
// override panel reads as labeled clusters instead of one long list.
const debugGroups: Record<string, { key: string; rest: number; sub: string }[]> = (() => {
  const groups: Record<string, { key: string; rest: number; sub: string }[]> = {};
  for (const cap of debugCapabilities) {
    const [head, ...rest] = cap.key.split(".");
    (groups[head] ||= []).push({ ...cap, sub: rest.join(".") });
  }
  return groups;
})();
// Gesture actions fire with a fixed spec; walk takes direction + distance (body-widths).
const gestures: ActionSpec[] = [
  { name: "disagree" },
  { name: "agree" },
  { name: "disagreeShort" },
  { name: "agreeShort" },
  { name: "greet" },
  { name: "shrug" },
  { name: "hangHead" },
];

const GROUND_Y = 480; // px from the demo pane's top to the figure's anchor — i.e. the ground line.
const DEFAULT_SPEECH = "Hi, I'm Avagent. Agent and avatar built by Talagent.";

// ── Small presentational primitives (Talagent design language) ─────────────────────────────────
function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function NpmMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span className="mono" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          className="color-swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          className="tinput-sm"
          style={{ width: 84 }}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

function Btn({
  variant = "ghost",
  className = "",
  ...props
}: { variant?: "ghost" | "primary" | "accent" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`tbtn tbtn-${variant} ${className}`} {...props} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="section-label">{title}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--color-line)" }} />;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: "block", width: "100%" }}>
      <span className="field-label">{label}</span>
      <select className="tselect" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: disabled ? 0.45 : 1 }}
    >
      <span style={{ fontSize: 13, color: "var(--color-ink)" }}>{label}</span>
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-on={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span className="field-label" style={{ margin: 0 }}>
          {label}
        </span>
        <span
          className="mono"
          style={{ fontSize: 12, color: "var(--color-ink-muted)", fontVariantNumeric: "tabular-nums" }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

// ---- Anatomy editor ----------------------------------------------------------------------------
// The editor is built by WALKING the anatomy object, so it needs no hand-maintained field list and
// stays in sync if the `Anatomy` shape changes. Every numeric leaf (including nested ones like
// `chest.size` or `pivot.xFrac`) becomes an input; top-level keys (body, head, …) become groups.
type Leaf = { path: string[]; value: number };

function numericLeaves(obj: Record<string, unknown>, prefix: string[] = []): Leaf[] {
  const leaves: Leaf[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = [...prefix, k];
    if (typeof v === "number") leaves.push({ path, value: v });
    else if (v && typeof v === "object") leaves.push(...numericLeaves(v as Record<string, unknown>, path));
  }
  return leaves;
}

// Immutably set a numeric value at a nested path, cloning only the spine along the way.
function setAtPath<T>(root: T, path: string[], value: number): T {
  const [head, ...rest] = path;
  const obj = root as Record<string, unknown>;
  if (rest.length === 0) return { ...obj, [head]: value } as T;
  return { ...obj, [head]: setAtPath(obj[head], rest, value) } as T;
}

function AnatomyEditor({
  anatomy,
  onChange,
  onExport,
  onReset,
  copied,
}: {
  anatomy: Anatomy;
  onChange: (path: string[], value: number) => void;
  onExport: () => void;
  onReset: () => void;
  copied: boolean;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="section-label">Anatomy</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onReset}>
            Reset
          </Btn>
          <Btn variant="accent" onClick={onExport} style={{ minWidth: 78 }}>
            {copied ? "Copied!" : "Export"}
          </Btn>
        </div>
      </div>
      {Object.entries(anatomy).map(([part, partObj]) => (
        <div key={part} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="section-label">{part}</span>
          {numericLeaves(partObj as Record<string, unknown>).map(({ path, value }) => {
            const fullPath = [part, ...path];
            const k = fullPath.join(".");
            const step = Math.abs(value) < 2 ? 0.01 : 1; // ratios/angles scrub finely; px in whole steps
            return (
              <label key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                  {path.join(".")}
                </span>
                <input
                  className="tinput-sm"
                  type="number"
                  value={value}
                  step={step}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value !== "" && !Number.isNaN(n)) onChange(fullPath, n);
                  }}
                  style={{ width: 92 }}
                />
              </label>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ---- Bounding-box overlay (Cmd/Ctrl+Shift+B) ---------------------------------------------------
// Validates the published `measureFigure` against the REAL DOM: it unions getBoundingClientRect over
// every rendered part inside the figure wrapper (the live, possibly mid-animation box) and draws it,
// then overlays the analytical `measureFigure` box (anchored at the feet contact line) so the two can
// be compared by eye. The panel prints both at scale 1.0. `measureFigure` is a REST-pose box, so the
// closest match shows with mode="frozen" (or any calm frame); idle breathing nudges the DOM box a hair.
function BBoxOverlay({
  wrapRef,
  scale,
  anatomy,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  scale: number;
  anatomy: Anatomy;
}) {
  const [dom, setDom] = useState<{ left: number; top: number; width: number; height: number; feetY: number } | null>(
    null,
  );
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const wrap = wrapRef.current;
      if (wrap) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity,
          feetY = -Infinity;
        for (const el of wrap.querySelectorAll<HTMLElement>("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          minX = Math.min(minX, r.left);
          minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.right);
          maxY = Math.max(maxY, r.bottom);
        }
        for (const el of wrap.querySelectorAll<HTMLElement>("[data-avagent-foot]")) {
          feetY = Math.max(feetY, el.getBoundingClientRect().bottom);
        }
        if (Number.isFinite(minX)) {
          setDom({
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY,
            feetY: Number.isFinite(feetY) ? feetY : maxY,
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wrapRef]);

  const m = measureFigure(anatomy, scale);
  const r1 = (n: number) => Math.round((n / scale) * 10) / 10; // back to scale-1.0
  if (!dom) return null;
  const aLeft = dom.left + dom.width / 2 - m.width / 2; // analytical box, centered on the DOM box, feet-anchored
  return (
    <>
      {/* live DOM union box (incl. shadow) */}
      <div
        style={{
          position: "fixed",
          left: dom.left,
          top: dom.top,
          width: dom.width,
          height: dom.height,
          border: "1px dashed #d11",
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
      {/* analytical measureFigure box (figure silhouette, feet-anchored) */}
      <div
        style={{
          position: "fixed",
          left: aLeft,
          top: dom.feetY - m.height,
          width: m.width,
          height: m.height,
          border: "1px solid #06c",
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
      <div
        style={{
          position: "fixed",
          left: 12,
          bottom: 12,
          zIndex: 1001,
          background: "rgba(20,20,20,.9)",
          color: "#fff",
          font: "12px ui-monospace, monospace",
          padding: "8px 10px",
          borderRadius: 6,
          lineHeight: 1.5,
          pointerEvents: "none",
        }}
      >
        <div>
          <span style={{ color: "#f66" }}>▭ DOM union</span> (incl. shadow): {r1(dom.width)} × {r1(dom.height)} @1.0
        </div>
        <div>
          <span style={{ color: "#6af" }}>▭ measureFigure</span>: figure {r1(m.width)} × {r1(m.height)} · withShadow{" "}
          {r1(m.withShadow.width)} × {r1(m.withShadow.height)}
        </div>
        <div style={{ color: "#aaa" }}>scale {scale} · DOM excludes blur; rest-pose match w/ frozen mode</div>
      </div>
    </>
  );
}

type TabId = "general" | "actions" | "debug" | "anatomy" | "colors";
const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "actions", label: "Actions" },
  { id: "debug", label: "Debug" },
  { id: "anatomy", label: "Anatomy" },
  { id: "colors", label: "Colors" },
];

// ── Persistence ──────────────────────────────────────────────────────────────────────────────────
// A curated subset of settings survives reloads (per-browser). Transient/debug state — overrides,
// anatomy draft, fired action/speech, the anchor + bbox overlays — is intentionally excluded so a
// reload never lands in a broken-looking pose. First-time visitors always get the curated default.
const STORAGE_KEY = "avagent.playground.v1";
type SavedState = {
  characterName: string;
  themeName: string;
  scale: number;
  logoName: string;
  mode: Mode;
  view: "full" | "head";
  groundShadow: boolean;
  showGround: boolean;
  plainBg: boolean;
  swapped: boolean;
  walkDistance: number;
  speechText: string;
  speechSide: SpeechSide;
  tab: TabId;
};
function loadSaved(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<SavedState>) : {};
  } catch {
    return {};
  }
}

function App() {
  const saved = useMemo(loadSaved, []);
  const initialThemeName = saved.themeName && saved.themeName in themes ? saved.themeName : "steel";
  const [themeName, setThemeName] = useState(initialThemeName);
  // Editable copy of the active colorway — the Colors tab edits this, and the figure renders from it.
  const [themeDraft, setThemeDraft] = useState<ColorTheme>(() => ({ ...themes[initialThemeName] }));
  const [themeCopied, setThemeCopied] = useState(false);
  const [characterName, setCharacterName] = useState(
    saved.characterName && saved.characterName in characters ? saved.characterName : "Avagent",
  );
  const [scale, setScale] = useState(typeof saved.scale === "number" ? saved.scale : 1);
  const [showAnchor, setShowAnchor] = useState(false); // debug overlay — not persisted
  const [groundShadow, setGroundShadow] = useState(saved.groundShadow ?? false);
  const [showGround, setShowGround] = useState(saved.showGround ?? true);
  const [plainBg, setPlainBg] = useState(saved.plainBg ?? false); // flat white stage for clean recording
  const [mode, setMode] = useState<Mode>(saved.mode && modes.includes(saved.mode) ? saved.mode : "hangout");
  const [view, setView] = useState<"full" | "head">(saved.view === "head" ? "head" : "full");
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // debug — not persisted
  const [logoName, setLogoName] = useState<string>(
    saved.logoName && (saved.logoName === "none" || saved.logoName in logos) ? saved.logoName : "none",
  );
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [walkDistance, setWalkDistance] = useState(typeof saved.walkDistance === "number" ? saved.walkDistance : 2); // body-widths per walk press
  const [speech, setSpeech] = useState<SpeechSpec | null>(null);
  const [speechText, setSpeechText] = useState(
    typeof saved.speechText === "string" ? saved.speechText : DEFAULT_SPEECH,
  );
  const [speechSide, setSpeechSide] = useState<SpeechSide>(
    saved.speechSide === "left" || saved.speechSide === "right" ? saved.speechSide : "auto",
  );
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Anatomy>(avagent);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<TabId>(saved.tab && TABS.some((t) => t.id === saved.tab) ? saved.tab : "general");
  const [swapped, setSwapped] = useState(saved.swapped ?? false); // false = avatar left / rail right

  // Anatomy edit mode: render the figure from a mutable `draft` (cloned from the selected preset) so
  // edits show in real time while the rest of the rail keeps driving actions/modes against it.
  const enterEditMode = () => {
    setDraft(structuredClone(characters[characterName]));
    setEditMode(true);
  };
  const changeCharacter = (name: string) => {
    setCharacterName(name);
    if (editMode) setDraft(structuredClone(characters[name]));
  };
  // Selecting a colorway loads it into the editable draft (the figure renders from the draft).
  const changeColorway = (name: string) => {
    setThemeName(name);
    setThemeDraft({ ...themes[name] });
  };
  const setThemeColor = (key: keyof ColorTheme, value: string) => setThemeDraft((t) => ({ ...t, [key]: value }));
  const resetTheme = () => setThemeDraft({ ...themes[themeName] });
  const exportTheme = async () => {
    await navigator.clipboard.writeText(JSON.stringify(themeDraft, null, 2));
    setThemeCopied(true);
    setTimeout(() => setThemeCopied(false), 1500);
  };
  const editAnatomy = (path: string[], value: number) => setDraft((d) => setAtPath(d, path, value));
  const resetAnatomy = () => setDraft(structuredClone(characters[characterName]));
  const exportAnatomy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const activeAnatomy = editMode ? draft : characters[characterName];

  // Opening the Anatomy tab IS entering edit mode (the old "Edit anatomy" toggle). Edit mode then
  // persists across tabs so actions/modes can be tested against the edited body.
  useEffect(() => {
    if (tab === "anatomy" && !editMode) enterEditMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Landing entrance: the avatar drops in shortly after mount.
  useEffect(() => {
    const t = setTimeout(() => fireAction({ name: "drop", distance: 6 }), 250);
    return () => clearTimeout(t);
  }, []);

  // Persist the curated settings subset whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          characterName,
          themeName,
          scale,
          logoName,
          mode,
          view,
          groundShadow,
          showGround,
          plainBg,
          swapped,
          walkDistance,
          speechText,
          speechSide,
          tab,
        }),
      );
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [
    characterName,
    themeName,
    scale,
    logoName,
    mode,
    view,
    groundShadow,
    showGround,
    plainBg,
    swapped,
    walkDistance,
    speechText,
    speechSide,
    tab,
  ]);

  // Cmd/Ctrl+Shift+B toggles the bounding-box overlay (measureFigure vs live DOM).
  const [showBBox, setShowBBox] = useState(false);
  const figureWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        setShowBBox((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Toggle a capability override on (pinned at its rest value) or off. Engaged capabilities
  // hold independently, so you can pin several at once.
  const toggleOverride = (key: string, rest: number) =>
    setOverrides((o) => {
      const next = { ...o };
      if (key in next) delete next[key];
      else next[key] = rest;
      return next;
    });
  const setOverrideValue = (key: string, value: number) => setOverrides((o) => ({ ...o, [key]: value }));

  // Fire an action by toggling null → spec. The Avagent component dedupes against its last
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

  // Reset every control to its first-load default and clear persisted state — including the transient
  // debug state (overrides, anatomy draft, anchor) for a true clean slate. The persist effect then
  // re-writes the defaults to storage, which loads back identically.
  const resetAll = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setCharacterName("Avagent");
    setThemeName("steel");
    setThemeDraft({ ...themes["steel"] });
    setThemeCopied(false);
    setScale(1);
    setLogoName("none");
    setMode("hangout");
    setView("full");
    setGroundShadow(false);
    setShowGround(true);
    setPlainBg(false);
    setSwapped(false);
    setWalkDistance(2);
    setSpeechText(DEFAULT_SPEECH);
    setSpeechSide("auto");
    setTab("general");
    setOverrides({});
    setShowAnchor(false);
    setEditMode(false);
    setDraft(avagent);
    setAction(null);
    setSpeech(null);
  };

  const stage = (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: view === "head" ? "center" : "flex-start",
        paddingTop: view === "head" ? 0 : GROUND_Y,
        overflow: "visible",
      }}
    >
      {/* Ground plane at the figure's anchor (feet/ground line) — full-body view, when enabled. */}
      {view !== "head" && showGround && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GROUND_Y,
            bottom: 0,
            background: "var(--color-surface-2)",
            borderTop: "1px solid var(--color-line-2)",
            pointerEvents: "none",
          }}
        />
      )}
      <div ref={figureWrapRef} style={{ position: "relative" }}>
        <Avagent
          scale={scale}
          mode={mode}
          view={view}
          anatomy={activeAnatomy}
          theme={themeDraft}
          showAnchor={showAnchor}
          groundShadow={groundShadow}
          chestImage={logos[logoName]}
          debugOverrides={overrides}
          action={action}
          speech={speech}
        />
      </div>
      {showBBox && <BBoxOverlay wrapRef={figureWrapRef} scale={scale} anatomy={activeAnatomy} />}
    </div>
  );

  const rail = (
    <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "visible" }}>
      <div style={{ padding: 14, paddingBottom: 0 }}>
        <div className="seg">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="seg-tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {tab === "general" && (
          <>
            <Section title="Character & Look">
              <SelectField
                label="Character"
                value={characterName}
                onChange={changeCharacter}
                options={Object.keys(characters).map((n) => ({ value: n, label: n }))}
              />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SelectField
                    label="Colorway"
                    value={themeName}
                    onChange={changeColorway}
                    options={Object.keys(themes).map((n) => ({ value: n, label: n }))}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SelectField
                    label="Scale"
                    value={String(scale)}
                    onChange={(v) => setScale(Number(v))}
                    options={scales.map((s) => ({ value: String(s), label: `${s}×` }))}
                  />
                </div>
              </div>
              <SelectField
                label="Logo"
                value={logoName}
                onChange={setLogoName}
                options={[{ value: "none", label: "none" }, ...Object.keys(logos).map((n) => ({ value: n, label: n }))]}
              />
            </Section>
            <Divider />
            <Section title="Stage">
              <SelectField
                label="Mode"
                value={mode}
                onChange={(v) => setMode(v as Mode)}
                options={modes.map((m) => ({ value: m, label: m }))}
              />
              <Toggle label="Head only" checked={view === "head"} onChange={(on) => setView(on ? "head" : "full")} />
              <Toggle label="Ground line" checked={showGround} onChange={setShowGround} disabled={view === "head"} />
              <Toggle label="Ground shadow" checked={groundShadow} onChange={setGroundShadow} />
              <Toggle label="Plain background" checked={plainBg} onChange={setPlainBg} />
              <Toggle label="Anchor" checked={showAnchor} onChange={setShowAnchor} />
            </Section>
          </>
        )}

        {tab === "actions" && (
          <>
            <SelectField
              label="Mode (test actions in context)"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={modes.map((m) => ({ value: m, label: m }))}
            />
            <Section title="Gestures">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {gestures.map((spec) => (
                  <Btn key={spec.name} onClick={() => fireAction(spec)}>
                    {spec.name}
                  </Btn>
                ))}
              </div>
            </Section>
            <Divider />
            <Section title="Movement">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Btn onClick={() => fireAction({ name: "walk", direction: "left", distance: walkDistance })}>
                  walk ←
                </Btn>
                <Btn onClick={() => fireAction({ name: "walk", direction: "right", distance: walkDistance })}>
                  walk →
                </Btn>
                <Btn
                  title="come in from the left"
                  onClick={() => fireAction({ name: "come", direction: "left", distance: walkDistance })}
                >
                  come ↦
                </Btn>
                <Btn
                  title="come in from the right"
                  onClick={() => fireAction({ name: "come", direction: "right", distance: walkDistance })}
                >
                  come ↤
                </Btn>
                <Btn onClick={() => fireAction({ name: "drop", distance: walkDistance })}>drop ↓</Btn>
                <Btn onClick={() => fireAction({ name: "jump" })}>jump ↑</Btn>
              </div>
              <Slider
                label="Distance"
                min={0.5}
                max={10}
                step={0.5}
                value={walkDistance}
                onChange={setWalkDistance}
                format={(v) => v.toFixed(1)}
              />
            </Section>
            <Divider />
            <Section title="Speech">
              <textarea
                className="tinput"
                rows={2}
                value={speechText}
                onChange={(e) => setSpeechText(e.target.value)}
                placeholder="What should Avagent say?"
                style={{ resize: "vertical", fontFamily: "var(--font-body)" }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ width: 120 }}>
                  <SelectField
                    label="Side"
                    value={speechSide}
                    onChange={(v) => setSpeechSide(v as SpeechSide)}
                    options={[
                      { value: "auto", label: "auto" },
                      { value: "left", label: "left" },
                      { value: "right", label: "right" },
                    ]}
                  />
                </div>
                <Btn variant="accent" onClick={fireSpeech} disabled={speechText.length === 0} style={{ flex: 1 }}>
                  Say
                </Btn>
              </div>
            </Section>
          </>
        )}

        {tab === "debug" && (
          <>
            <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
              Override any capability — engage any combination; each pins at its rest value, then scrub.
            </span>
            {Object.entries(debugGroups).map(([group, caps]) => (
              <Section key={group} title={group}>
                {caps.map(({ key, rest, sub }) => {
                  const engaged = key in overrides;
                  const value = engaged ? overrides[key] : rest;
                  return (
                    <div
                      key={key}
                      style={{ display: "flex", alignItems: "center", gap: 10, opacity: engaged ? 1 : 0.55 }}
                    >
                      <button
                        type="button"
                        className="switch"
                        role="switch"
                        aria-checked={engaged}
                        aria-label={key}
                        data-on={engaged}
                        onClick={() => toggleOverride(key, rest)}
                        style={{ transform: "scale(0.82)", transformOrigin: "left center" }}
                      />
                      <span className="mono" style={{ fontSize: 12, width: 92, color: "var(--color-ink)" }}>
                        {sub}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={value}
                        disabled={!engaged}
                        onChange={(e) => setOverrideValue(key, Number(e.target.value))}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <span
                        className="mono"
                        style={{
                          fontSize: 12,
                          width: 32,
                          textAlign: "right",
                          color: "var(--color-ink-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {value.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </Section>
            ))}
          </>
        )}

        {tab === "anatomy" && (
          <AnatomyEditor
            anatomy={draft}
            onChange={editAnatomy}
            onExport={exportAnatomy}
            onReset={resetAnatomy}
            copied={copied}
          />
        )}

        {tab === "colors" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="section-label">Colors</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="ghost" onClick={resetTheme}>
                  Reset
                </Btn>
                <Btn variant="accent" onClick={exportTheme} style={{ minWidth: 78 }}>
                  {themeCopied ? "Copied!" : "Export"}
                </Btn>
              </div>
            </div>
            <Section title={`Palette · ${themeName}`}>
              <ColorField label="primary" value={themeDraft.primary} onChange={(v) => setThemeColor("primary", v)} />
              <ColorField
                label="primaryDark"
                value={themeDraft.primaryDark}
                onChange={(v) => setThemeColor("primaryDark", v)}
              />
              <ColorField
                label="primaryMidDark"
                value={themeDraft.primaryMidDark}
                onChange={(v) => setThemeColor("primaryMidDark", v)}
              />
              <ColorField
                label="primaryMid"
                value={themeDraft.primaryMid}
                onChange={(v) => setThemeColor("primaryMid", v)}
              />
              <ColorField label="outline" value={themeDraft.outline} onChange={(v) => setThemeColor("outline", v)} />
            </Section>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="ambient-field"
      style={{ display: "flex", flexDirection: "column", height: "100vh", background: plainBg ? "#ffffff" : undefined }}
    >
      {/* Top bar: wordmark · swap · Talagent funnel CTA */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          padding: "0 20px",
          flexShrink: 0,
          position: "relative",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            role="img"
            aria-label="avagent"
            style={{
              display: "block",
              width: 32,
              height: 32,
              flexShrink: 0,
              background: "var(--color-brand)",
              WebkitMaskImage: `url(${avagentMark})`,
              maskImage: `url(${avagentMark})`,
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              // The asset's mass sits ~8px below its geometric center (antenna pulls the
              // bbox up while the head is low), so nudge up to optically center the head.
              transform: "translateY(-3px)",
            }}
          />
          <span className="wordmark">avagent</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn
            variant="ghost"
            className="icon-btn"
            title="Reset all settings"
            aria-label="Reset all settings"
            onClick={resetAll}
          >
            ↺
          </Btn>
          <Btn
            variant="ghost"
            className="icon-btn"
            title="Swap sides"
            aria-label="Swap sides"
            onClick={() => setSwapped((s) => !s)}
          >
            ⇄
          </Btn>
          <a
            className="tbtn tbtn-ghost icon-btn"
            href="https://github.com/talagent-net/avagent"
            target="_blank"
            rel="noreferrer"
            title="GitHub repository"
            aria-label="GitHub repository"
          >
            <GithubMark />
          </a>
          <a
            className="tbtn tbtn-ghost icon-btn"
            href="https://www.npmjs.com/package/@talagent-net/avagent"
            target="_blank"
            rel="noreferrer"
            title="npm package"
            aria-label="npm package"
          >
            <NpmMark />
          </a>
          <a
            className="tbtn tbtn-ghost"
            href="https://talagent.net"
            target="_blank"
            rel="noreferrer"
            style={{ height: 36 }}
          >
            See live production demo ↗
          </a>
        </div>
      </header>

      {/* Body: two columns, swappable */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: swapped ? "row-reverse" : "row",
          gap: 18,
          padding: "0 18px 18px",
          boxSizing: "border-box",
        }}
      >
        {stage}
        {rail}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
