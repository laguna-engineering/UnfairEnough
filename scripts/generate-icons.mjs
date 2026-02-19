#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Pink gradient: slightly darker than #E84580 → lighter #FF6B9D
const GRADIENT_FROM = "#D03570"; // slightly darker shade
const GRADIENT_TO = "#FF85B0"; // slightly lighter shade
const EMOJI = "😏";

// All icons to generate
const icons = [
  // Mobile app — iOS icon (square, gradient bg)
  { path: "apps/mobile/assets/icon.png", w: 1024, h: 1024 },
  // Mobile app — Android adaptive icon foreground (emoji on transparent)
  {
    path: "apps/mobile/assets/adaptive-icon.png",
    w: 1024,
    h: 1024,
    transparent: true,
  },
  // Mobile app — Android adaptive icon background (gradient only)
  {
    path: "apps/mobile/assets/adaptive-icon-bg.png",
    w: 1024,
    h: 1024,
    bgOnly: true,
  },
  // TV host app — Apple TV images + Android TV banner
  { path: "apps/tv-host/assets/images/icon-400x240.png", w: 400, h: 240 },
  { path: "apps/tv-host/assets/images/icon-800x480.png", w: 800, h: 480 },
  { path: "apps/tv-host/assets/images/icon-1280x768.png", w: 1280, h: 768 },
  { path: "apps/tv-host/assets/images/icon-1920x720.png", w: 1920, h: 720 },
  { path: "apps/tv-host/assets/images/icon-2320x720.png", w: 2320, h: 720 },
  { path: "apps/tv-host/assets/images/icon-3840x1440.png", w: 3840, h: 1440 },
  { path: "apps/tv-host/assets/images/icon-4640x1440.png", w: 4640, h: 1440 },
];

function buildHtml(w, h, { transparent = false, bgOnly = false } = {}) {
  // Emoji font size: 60% of the smaller dimension
  const emojiSize = Math.round(Math.min(w, h) * 0.6);
  const bg = transparent
    ? "transparent"
    : `linear-gradient(135deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`;

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body {
    width: ${w}px;
    height: ${h}px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${bg};
  }
  .emoji {
    font-size: ${emojiSize}px;
    line-height: 1;
    text-align: center;
  }
</style>
</head>
<body>
  ${bgOnly ? "" : `<div class="emoji">${EMOJI}</div>`}
</body>
</html>`;
}

const rootDir = join(import.meta.dirname, "..");

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });

for (const icon of icons) {
  const page = await context.newPage();
  await page.setViewportSize({ width: icon.w, height: icon.h });
  await page.setContent(
    buildHtml(icon.w, icon.h, {
      transparent: icon.transparent,
      bgOnly: icon.bgOnly,
    }),
    { waitUntil: "networkidle" },
  );

  const outPath = join(rootDir, icon.path);
  mkdirSync(dirname(outPath), { recursive: true });

  const screenshotOpts = { path: outPath, type: "png" };
  if (icon.transparent) screenshotOpts.omitBackground = true;

  await page.screenshot(screenshotOpts);
  console.log(`✓ ${icon.path} (${icon.w}x${icon.h})`);
  await page.close();
}

await browser.close();
console.log("\nDone! All icons generated.");
