// Generates the playground's brand assets from one vector source of truth (run: `npm run icons`):
//   dev/public/favicon.svg          — crisp SVG favicon (transparent)
//   dev/public/apple-touch-icon.png — 180×180, head on a light tile (iOS / PNG fallback)
//   dev/public/og.png               — 1200×630 social share card
// The avatar head is a flat vector rebuild of the playground figure (head + ears + antenna + eyes),
// no gloss — combining the two reference renders Peter exported from the Colors tab.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";

const SLATE = "#46576b"; // flat head tone
const EYE = "#ececec"; // light eyes
const OUT = "dev/public";
mkdirSync(OUT, { recursive: true });

// Avatar head drawn in a 100×100 box, vertically centred. Antenna + ears sit BEHIND the head (drawn
// first, then the head rect covers their roots); eyes sit on top.
const head = () => `
  <line x1="63" y1="36" x2="70" y2="14" stroke="${SLATE}" stroke-width="6" stroke-linecap="round"/>
  <rect x="10" y="50" width="9" height="18" rx="4" fill="${SLATE}"/>
  <rect x="81" y="50" width="9" height="18" rx="4" fill="${SLATE}"/>
  <rect x="16" y="34" width="68" height="48" rx="16" fill="${SLATE}"/>
  <rect x="33" y="55" width="9" height="17" rx="4.5" fill="${EYE}"/>
  <rect x="57" y="55" width="9" height="17" rx="4.5" fill="${EYE}"/>`;

const png = (svg, width, font) => new Resvg(svg, { fitTo: { mode: "width", value: width }, font }).render().asPng();

// 1) favicon.svg — transparent head.
writeFileSync(
  `${OUT}/favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${head()}\n</svg>\n`,
);

// 2) apple-touch-icon.png — head on a light tile (iOS adds its own rounded mask).
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#f7f8fa"/>
  <g transform="translate(9 9) scale(0.82)">${head()}</g>
</svg>`;
writeFileSync(`${OUT}/apple-touch-icon.png`, png(tile, 180));

// 3) og.png — 1200×630 share card on the playground's ambient field.
const W = 1200,
  H = 630;
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="84%" cy="100%" r="72%">
      <stop offset="0%" stop-color="#37ac4a" stop-opacity="0.10"/><stop offset="70%" stop-color="#37ac4a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="14%" cy="2%" r="60%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.09"/><stop offset="70%" stop-color="#0284c7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f7f8fa"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <g transform="translate(${W / 2 - 150} 86) scale(3)">${head()}</g>
  <text x="${W / 2}" y="452" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="800" letter-spacing="-3" fill="#1a1d21">avagent</text>
  <text x="${W / 2}" y="510" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="33" fill="#5b636e">Animated avatar characters for your agents</text>
</svg>`;
writeFileSync(`${OUT}/og.png`, png(og, W, { loadSystemFonts: true }));

console.log("generated: favicon.svg, apple-touch-icon.png, og.png");
