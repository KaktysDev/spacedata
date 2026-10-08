// Captures SpaceVision screenshots for the paper. Needs `next dev -p 3123`.
// /api/chat is answered by a fixed fixture, so no provider is called.
// Date.now() is pinned to the model epoch so the route matches the worked example.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const HEADLESS_SHELL = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const BASE = process.env.BASE ?? "http://localhost:3123";
const OUT = "paper/assets/app";
const EPOCH = Date.UTC(2026, 8, 25, 12);
mkdirSync(OUT, { recursive: true });

const groundText =
  "Most large data centers remove heat with evaporative cooling. Warm water from the cooling loop runs through a tower where part of it evaporates, carrying the heat away. The evaporated water is gone, so the site keeps drawing fresh water to replace it.\n\nEvaporation uses less electricity than running chillers alone, which is why many hot or dry sites rely on it. Newer designs cut the water with air cooling, closed loops, or reclaimed water.";
const spaceText =
  "Servers turn almost all of their electricity into heat, and the cheapest way to move that heat is often to evaporate water. Cooling towers spray warm water so that some of it evaporates; that evaporated share is the water a data center consumes.\n\nThe amount depends on climate and design. Air-cooled and closed-loop sites use far less, at the cost of more electricity for fans or chillers.";
const answer = (text, completionTokens, latencyMs) => ({
  text,
  promptTokens: 190,
  completionTokens,
  totalTokens: 190 + completionTokens,
  cachedTokens: 0,
  usageEstimated: false,
  latencyMs,
});
const fixture = {
  provider: "gemini",
  model: "gemini-3.8-flash",
  ground: answer(groundText, 262, 2140),
  space: answer(spaceText, 241, 2210),
  latencyMs: 2260,
  completedAt: new Date(EPOCH).toISOString(),
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? HEADLESS_SHELL,
  args: [`--use-angle=${process.env.ANGLE ?? "metal"}`, "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DPR ?? 2),
  reducedMotion: "no-preference",
});
context.setDefaultTimeout(120_000);
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.head.append(style);
  });
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text());
});
await page.clock.setFixedTime(EPOCH);
await page.route("**/api/chat", async (route) => {
  await new Promise((r) => setTimeout(r, 2400));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.waitForSelector(".loading-scene", { state: "detached", timeout: 180_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/idle.png` });
console.log("idle");

// Clean globe for the cover band: hide interface chrome.
await page.addStyleTag({
  content:
    ".site-header,.composer,.map-controls,.site-footer,.origin-pin,.scene-label,.site-leader{visibility:hidden!important}",
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/cover.png` });
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".loading-scene", { state: "detached", timeout: 180_000 });
await page.waitForTimeout(2000);

const box = page.getByLabel("Your message");
await box.fill("Why do data centers use so much water?");
const sent = Date.now();
await box.press("Enter");
const shots = [
  ["flight-0400", 400],
  ["flight-0900", 900],
  ["flight-1300", 1300],
  ["flight-2200", 2200],
  ["flight-3700", 3700],
];
for (const [name, at] of shots) {
  const wait = at - (Date.now() - sent);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, "taken at", Date.now() - sent, "ms");
}
await page.waitForSelector(".results-card", { timeout: 60_000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/results.png` });
const card = page.locator(".results-card");
await card.screenshot({ path: `${OUT}/results-card.png` });
console.log("results");

await browser.close();
console.log("done");
