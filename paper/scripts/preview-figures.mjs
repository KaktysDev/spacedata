// Renders each SVG figure with the paper stylesheet, in both editions, to PNG.
// Run: node paper/scripts/preview-figures.mjs [name ...]
import { chromium } from "playwright";
import { homedir } from "node:os";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";

const css = readFileSync("paper/src/paper.css", "utf8");
const only = process.argv.slice(2);
const names = readdirSync("paper/figures")
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.replace(/\.svg$/, ""))
  .filter((n) => !only.length || only.includes(n));
mkdirSync("paper/.review/figs", { recursive: true });

const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
for (const theme of ["dark", "print"]) {
  const body = names
    .map((n) => `<figure id="f-${n}" style="width:6.8in;margin:0 0 20px;padding:10px">${readFileSync(`paper/figures/${n}.svg`, "utf8")}</figure>`)
    .join("");
  await page.setContent(`<!doctype html><html class="${theme}"><head><style>${css}</style></head><body>${body}</body></html>`);
  await page.waitForTimeout(150);
  for (const n of names) await page.locator(`#f-${n}`).screenshot({ path: `paper/.review/figs/${n}-${theme}.png` });
}
await browser.close();
console.log("previewed", names.join(", "));
