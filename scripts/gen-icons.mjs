// Generates the playground's brand assets from the source artwork (run: `npm run icons`):
//   dev/public/favicon-16x16.png, favicon-32x32.png
//   dev/public/apple-touch-icon.png        (180, on an opaque tile for iOS)
//   dev/public/android-chrome-192x192.png, android-chrome-512x512.png
//   dev/public/og.png                       (1200×630 social share card)
// Source of truth: scripts/icon-source.png — the avatar head (840×840, transparent), supplied by Peter.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const SRC = "scripts/icon-source.png";
const OUT = "dev/public";
mkdirSync(OUT, { recursive: true });

const dataUri = `data:image/png;base64,${readFileSync(SRC).toString("base64")}`;
const render = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

// Square icon: the head art, with an optional opaque tile + padding (px in the icon's own space).
function icon(size, { bg, pad = 0 } = {}) {
  const inner =
    (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : "") +
    `<image href="${dataUri}" x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}"/>`;
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${inner}</svg>`, size);
}

writeFileSync(`${OUT}/favicon-16x16.png`, icon(16));
writeFileSync(`${OUT}/favicon-32x32.png`, icon(32));
writeFileSync(`${OUT}/android-chrome-192x192.png`, icon(192));
writeFileSync(`${OUT}/android-chrome-512x512.png`, icon(512));
// iOS shows apple-touch-icon opaque (transparency → black), so tile it on the brand canvas.
writeFileSync(`${OUT}/apple-touch-icon.png`, icon(180, { bg: "#f7f8fa", pad: 14 }));

// OG share card — the head art on the ambient field + wordmark + tagline.
const W = 1200,
  H = 630,
  S = 300;
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="84%" cy="100%" r="72%"><stop offset="0%" stop-color="#37ac4a" stop-opacity="0.10"/><stop offset="70%" stop-color="#37ac4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="14%" cy="2%" r="60%"><stop offset="0%" stop-color="#0284c7" stop-opacity="0.09"/><stop offset="70%" stop-color="#0284c7" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f7f8fa"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <image href="${dataUri}" x="${(W - S) / 2}" y="60" width="${S}" height="${S}"/>
  <text x="${W / 2}" y="452" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="800" letter-spacing="-3" fill="#1a1d21">avagent</text>
  <text x="${W / 2}" y="510" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="33" fill="#5b636e">Animated avatar characters for your agents</text>
</svg>`;
writeFileSync(
  `${OUT}/og.png`,
  new Resvg(og, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: true } }).render().asPng(),
);

console.log("generated: favicon-16/32, apple-touch-icon, android-chrome-192/512, og.png");
