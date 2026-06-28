/**
 * The default brand palette (the `steel` colorway) as raw hex values — a convenience for hosts that
 * want to reference the avatar's default tones elsewhere in their UI. The avatar itself is themed via
 * the `theme` prop / `ColorTheme`, not this object.
 */
export const colors = {
  background: "#ffffff",
  primary: "#415e74",
  primaryHover: "#344a5c",
  primaryDark: "#2c3f50",
  primaryMidDark: "#56768d", // 50% blend of primary + primaryMid
  primaryMid: "#6b8ea6",
  primaryLight: "#eaeff4",
  accent: "#9c9077",
} as const;
