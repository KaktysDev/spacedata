// Clean globe renders for the paper cover. Needs `next dev -p 3123`.
import { chromium } from "playwright";
import { homedir } from "node:os";

const BASE = process.env.BASE ?? "http://localhost:3123";
const EPOCH = Date.UTC(2026, 8, 25, 12);
const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.clock.setFixedTime(EPOCH);
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.waitForSelector(".loading-scene", { state: "detached", timeout: 180_000 });
await page.waitForTimeout(2500);
const hide = () =>
  page.addStyleTag({
    content:
      "nextjs-portal,.site-header,.composer,.map-controls,.site-footer,.origin-pin,.scene-label,.site-leader{visibility:hidden!important}",
  });
let zoom = 0;
for (const target of [-2, 2, 4]) {
  await page.addStyleTag({ content: ".map-controls{visibility:visible!important}" });
  while (zoom < target) {
    await page.getByRole("button", { name: "Zoom in" }).click();
    zoom++;
    await page.waitForTimeout(250);
  }
  while (zoom > target) {
    await page.getByRole("button", { name: "Zoom out" }).click();
    zoom--;
    await page.waitForTimeout(250);
  }
  await hide();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `paper/assets/app/cover-z${target}.png` });
  console.log("zoom", target);
}
await browser.close();
