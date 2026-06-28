import type { ColorTheme } from "./Avagent";

const OUTLINE = "#2a2a2a";

/**
 * Eight built-in colorways spanning the hue wheel (seven chromatic + one neutral), ordered AROUND the
 * wheel so a picker reads as a spectrum. These are optional presets — pass any of them to the `theme`
 * prop, or roll your own {@link ColorTheme}. `steel` is the brand blue ({@link defaultTheme} uses it).
 */
export const themes: Record<string, ColorTheme> = {
  slate: {
    primary: "#5a5a6a",
    primaryDark: "#3a3a48",
    primaryMidDark: "#717185",
    primaryMid: "#8888a0",
    outline: OUTLINE,
  },
  steel: {
    primary: "#415e74",
    primaryDark: "#2c3f50",
    primaryMidDark: "#56768d",
    primaryMid: "#6b8ea6",
    outline: OUTLINE,
  },
  tide: {
    primary: "#3a7a78",
    primaryDark: "#265251",
    primaryMidDark: "#569693",
    primaryMid: "#71b0ad",
    outline: OUTLINE,
  },
  forest: {
    primary: "#4a7351",
    primaryDark: "#2e4a33",
    primaryMidDark: "#628f6a",
    primaryMid: "#7aab82",
    outline: OUTLINE,
  },
  honey: {
    primary: "#9a7d3e",
    primaryDark: "#6b5628",
    primaryMidDark: "#b3955a",
    primaryMid: "#c9af74",
    outline: OUTLINE,
  },
  ember: {
    primary: "#8b5e3c",
    primaryDark: "#5c3a24",
    primaryMidDark: "#a87c54",
    primaryMid: "#c49a6c",
    outline: OUTLINE,
  },
  coral: {
    primary: "#9e5a5a",
    primaryDark: "#6e3838",
    primaryMidDark: "#b17272",
    primaryMid: "#c48a8a",
    outline: OUTLINE,
  },
  berry: {
    primary: "#6b4c7a",
    primaryDark: "#453054",
    primaryMidDark: "#856695",
    primaryMid: "#9e7fb0",
    outline: OUTLINE,
  },
};
