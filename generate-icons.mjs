// Run once: node generate-icons.mjs
// Generates public/icon-192.png and public/icon-512.png using Canvas API via node-canvas,
// or falls back to writing SVG files that browsers can use.
import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");

  // Background gradient (navy → purple)
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1e3a8a");
  grad.addColorStop(1, "#3b0764");
  ctx.fillStyle = grad;
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Emoji 🏛️
  ctx.font = `${size * 0.52}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏛️", size / 2, size / 2);

  return c.toBuffer("image/png");
}

try {
  writeFileSync("public/icon-192.png", drawIcon(192));
  writeFileSync("public/icon-512.png", drawIcon(512));
  console.log("Icons written.");
} catch (e) {
  console.log("node-canvas not available, writing SVG fallbacks.");
  const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#3b0764"/></linearGradient></defs>
  <rect width="${s}" height="${s}" rx="${s * 0.18}" fill="url(#g)"/>
  <text x="${s / 2}" y="${s * 0.62}" font-size="${s * 0.52}" text-anchor="middle">🏛️</text>
</svg>`;
  writeFileSync("public/icon-192.png", svg(192));
  writeFileSync("public/icon-512.png", svg(512));
}
