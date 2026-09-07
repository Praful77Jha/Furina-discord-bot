// Shared canvas drawing helpers — keeps build.js/banner.js/reminders.js
// focused on layout decisions instead of re-implementing primitives.
// Requires: npm install @napi-rs/canvas  (faster + easier native build than node-canvas on most hosts)
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function loadImageSafe(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch (err) {
    console.error(`Canvas: failed to load image ${url}:`, err.message);
    return null;
  }
}

// Draws an image "cover"-fit into a target box (crops overflow, no distortion),
// same behavior as CSS background-size: cover.
function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Dark gradient over the bottom/left of the art so text stays readable
// regardless of the splash art's own colors — same trick Akasha's cards use.
function drawReadabilityGradient(ctx, width, height, direction = "bottom") {
  let grad;
  if (direction === "bottom") {
    grad = ctx.createLinearGradient(0, height * 0.4, 0, height);
  } else {
    grad = ctx.createLinearGradient(0, 0, width * 0.7, 0);
  }
  grad.addColorStop(0, "rgba(10,10,15,0)");
  grad.addColorStop(1, "rgba(10,10,15,0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawStatRow(ctx, x, y, label, value, opts = {}) {
  const { labelColor = "#B8C4D9", valueColor = "#FFFFFF", labelSize = 20, valueSize = 24 } = opts;
  ctx.textAlign = "left";
  ctx.fillStyle = labelColor;
  ctx.font = `${labelSize}px sans-serif`;
  ctx.fillText(label, x, y);

  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.font = `bold ${valueSize}px sans-serif`;
  ctx.fillText(value, x + opts.rowWidth || 260, y);
}

// Filled/empty block bar, same tiering used in the /build embed version.
function cvBarText(cv) {
  const value = parseFloat(cv);
  const capped = Math.max(0, Math.min(value, 250));
  const filled = Math.round((capped / 250) * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  let tier = "Needs Work";
  if (value >= 220) tier = "Godly";
  else if (value >= 180) tier = "Great";
  else if (value >= 140) tier = "Good";
  else if (value >= 100) tier = "Decent";
  return { bar, tier };
}

module.exports = {
  createCanvas,
  loadImage,
  loadImageSafe,
  roundRect,
  drawImageCover,
  drawReadabilityGradient,
  drawStatRow,
  cvBarText
};
