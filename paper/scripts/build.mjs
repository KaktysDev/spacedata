// Builds the paper: inlines figures, generates tables from analysis.json,
// numbers figures, tables, equations and references, then prints two PDFs.
//   node paper/scripts/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const A = JSON.parse(read("paper/data/analysis.json"));
const REFS = JSON.parse(read("paper/src/references.json"));
const BUILD = join(ROOT, "paper/build");
const TITLE = "Routing Efficiency of AI Data Centers in Space";
const FOOTER = `© Oleh Lahoda, October 2026, Engineering Paper: ${TITLE}`;
const EDITIONS = {
  dark: { bg: "#000", footer: "#8c8c8c", pdf: "paper/Routing-Efficiency-of-AI-Data-Centers-in-Space.pdf" },
  print: { bg: "#fff", footer: "#777", pdf: "paper/Routing-Efficiency-of-AI-Data-Centers-in-Space-print.pdf" },
};
const PROVIDERS = ["gemini", "openai", "anthropic", "xai"];
const COMPANY = { gemini: "Google", openai: "OpenAI", anthropic: "Anthropic", xai: "xAI" };
const HOST = { gemini: "Google data centers", openai: "Azure AI regions", anthropic: "AWS Bedrock regions", xai: "xAI endpoint regions" };
const SOURCE_REF = { gemini: "googleloc", openai: "azure", anthropic: "aws", xai: "xai" };

// Number formatting: grouped digits and a true minus sign.
const num = (v, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-/, "\u2212");
const pct = (v, d = 1) => `${num(v * 100, d)}%`;
const city = (name) => A.cities.find((c) => c.name === name);
const orbit = (h) => A.orbit.find((o) => o.altitudeKm === h);
const scope = { A, K: A.constants, W: A.worked, G: A.grid, M: A.metrics, S: A.shell, city, orbit, num, pct };
function value(expr, format) {
  const v = new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));
  if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) throw new Error(`No value for {{=${expr}}}`);
  if (!format) return typeof v === "number" ? num(v, Number.isInteger(v) ? 0 : 2) : String(v);
  const m = /^([npe])(\d)$/.exec(format);
  if (!m) throw new Error(`Unknown format ${format}`);
  const d = Number(m[2]);
  if (m[1] === "n") return num(v, d);
  if (m[1] === "p") return pct(v, d);
  return v.toExponential(d).replace(/e([+-])(\d+)/, (_, s, e) => ` × 10<sup>${s === "-" ? "\u2212" : ""}${e}</sup>`);
}

// Generated tables.
const td = (v, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${v}</td>`;
const table = (id, caption, head, rows, cls = "wide") =>
  `<table id="tab-${id}" class="${cls}"><caption>Table {{#tab:${id}}}. ${caption}</caption><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
const tables = {
  sites: () =>
    table(
      "sites",
      "The public reference catalog. Each site is a city or region center, not a facility address.",
      `<th>Provider · model</th><th>Reference sites</th><th class="r">Sites</th>`,
      PROVIDERS.map((p) => {
        const pr = A.providers[p];
        return `<tr>${td(`<b>${COMPANY[p]}</b> · ${pr.model}<br><span class="u">${HOST[p]}</span> [[${SOURCE_REF[p]}]]`)}${td(A.sites[p].map((s) => s.name).join("; "))}${td(pr.siteCount, "r")}</tr>`;
      }),
    ),
  ground: () =>
    table(
      "ground",
      "Ground round trip from each preset city to the nearest reference site, at c/1.35 over the great-circle distance.",
      `<th>City</th>${PROVIDERS.map((p) => `<th>${COMPANY[p]}</th>`).join("")}`,
      A.cities.map(
        (c) =>
          `<tr>${td(`<b>${c.name}</b>`)}${PROVIDERS.map((p) => {
            const g = c.ground[p];
            return td(`${g.site}<br><span class="u">${num(g.km)} km · ${num(g.rttMs, 2)} ms</span>`);
          }).join("")}</tr>`,
      ),
    ),
  worked: () => {
    const w = A.worked;
    const rows = [
      ["User", `New York (40.71° N, 74.01° W), ${w.epochIso.slice(0, 16).replace("T", " ")} UTC`],
      ["Backhaul craft", `slot ${num(w.ingress.slot)} at ${num(w.ingress.lat, 2)}° N, ${num(Math.abs(w.ingress.lon), 2)}° W, ${num(w.ingress.altitudeKm, 1)} km altitude`],
      ["Elevation from the user", `${num(w.ingress.elevationDeg, 1)}° (${num(w.visible.horizon)} craft above the horizon, ${num(w.visible.mask25)} above 25°)`],
      ["RF uplink, one way", `${num(w.uplinkKm, 1)} km → ${num(w.uplinkOneWayMs, 3)} ms at c`],
      ["Optical leg, one way", `${num(w.laserKm, 1)} km straight chord (${num(w.separationDeg, 2)}° apart, clears Earth) → ${num(w.laserOneWayMs, 3)} ms`],
      ["Orbital round trip", `<b>${num(w.rttMs, 2)} ms</b>`],
      ["Ground round trip", `${num(w.ground.km, 1)} km to ${w.ground.site} at c/1.35 → <b>${num(w.ground.rttMs, 2)} ms</b>`],
    ];
    return table("worked", "Worked example: New York at the model epoch with Google’s nearest site.", `<th>Quantity</th><th>Value</th>`, rows.map(([k, v]) => `<tr>${td(k)}${td(v)}</tr>`));
  },
  cities: () =>
    table(
      "cities",
      `Orbital path for the six preset cities over one orbit, sampled every ${A.sampling.stepMs / 1000} s (${A.sampling.samples} samples). β is the angle from the ring plane; positive is the sunlit side.`,
      `<th>City</th><th class="r">β</th><th class="r">Best elev.<br>850 km</th><th class="r">Median<br>uplink</th><th class="r">RTT min</th><th class="r">p10</th><th class="r">Median</th><th class="r">p90</th><th class="r">Max</th><th class="r">Chord<br>share</th>`,
      A.cities.map(
        (c) =>
          `<tr>${td(`<b>${c.name}</b>`)}${td(`${num(c.offPlaneDeg, 1)}°`, "r")}${td(`${num(c.bestElevation850Deg, 1)}°`, "r")}${td(`${num(c.uplinkMedianKm)} km`, "r")}${["min", "p10", "median", "p90", "max"].map((k) => td(num(c.rttMs[k], 1), "r")).join("")}${td(pct(c.chordShare, 0), "r")}</tr>`,
      ),
    ),
  shares: () =>
    table(
      "shares",
      "Share of one orbit in which the orbital round trip is shorter than the ground round trip, by city and provider.",
      `<th>City</th><th class="r">Best elev.</th>${PROVIDERS.map((p) => `<th class="r">${COMPANY[p]}</th>`).join("")}`,
      A.cities.map(
        (c) =>
          `<tr>${td(`<b>${c.name}</b>`)}${td(`${num(c.bestElevation850Deg, 1)}°`, "r")}${PROVIDERS.map((p) => td(c.share[p] ? pct(c.share[p]) : "0", "r")).join("")}</tr>`,
      ),
      "",
    ),
  global: () =>
    table(
      "global",
      `Orbit-faster share over the whole Earth (${A.grid.stepDeg}° cells, ${A.grid.samplesPerOrbit} instants per orbit, area-weighted), read four ways.`,
      `<th>Provider</th><th class="r">Overall</th><th class="r">In sight</th><th class="r">Out of sight<br>counted as 0</th><th class="r">Under a<br>25° mask</th><th class="r">Area with<br>any win</th><th class="r">Area with<br>majority win</th>`,
      PROVIDERS.map((p) => {
        const s = A.grid.summary[p];
        return `<tr>${td(`<b>${COMPANY[p]}</b>`)}${[s.overall, s.inSight, s.outOfSightAsZero, s.inMask, s.anyWinArea, s.majorityArea].map((v) => td(pct(v), "r")).join("")}</tr>`;
      }),
    ),
  density: () =>
    table(
      "density",
      "Median orbital round trip (ms) for three shell densities drawn by the same rule.",
      `<th>City</th>${A.density.map((d) => `<th class="r">${num(d.count)} craft</th>`).join("")}<th class="r">8,800 → 88,000</th>`,
      A.cities.map((c) => {
        const v = A.density.map((d) => d.medianRttMs[c.name]);
        return `<tr>${td(`<b>${c.name}</b>`)}${v.map((x) => td(num(x, 2), "r")).join("")}${td(`${v[2] - v[1] >= 0 ? "+" : ""}${num(v[2] - v[1], 2)}`, "r")}</tr>`;
      }),
      "",
    ),
  rule: () =>
    table(
      "rule",
      "Cost of the highest-elevation rule against a shortest-slant-range rule, over one orbit.",
      `<th>City</th><th class="r">Median extra uplink</th><th class="r">Median extra RTT</th><th class="r">Range of RTT difference</th>`,
      A.cities.map(
        (c) =>
          `<tr>${td(`<b>${c.name}</b>`)}${td(`${num(c.rule.uplinkPenaltyMedianKm, 1)} km`, "r")}${td(`${num(c.rule.rttPenaltyMedianMs, 2)} ms`, "r")}${td(`${num(c.rule.rttPenaltyMinMs, 2)} to ${num(c.rule.rttPenaltyMaxMs, 2)} ms`, "r")}</tr>`,
      ),
      "",
    ),
  perquery: () => {
    const m = A.metrics;
    const g = m.per500.gemini;
    const o = m.per500.openai;
    const bg = m.perBillion.gemini;
    const bo = m.perBillion.openai;
    const usd = (v) => `$${v < 0.001 ? v.toFixed(8) : num(v, 2)}`;
    const row = (name, pue, s, kwh, liters, cost) =>
      `<tr>${td(name)}${td(num(pue, 2), "r")}${td(num(s.energyWh, 4), "r")}${td(num(s.waterMl, 3), "r")}${td(usd(s.powerCostUsd), "r")}${td(num(kwh, 1), "r")}${td(num(liters, 1), "r")}${td(usd(cost), "r")}</tr>`;
    return table(
      "perquery",
      `Modeled energy, cooling water and electricity cost for one ${m.example.tokens}-token exchange (${m.example.prompt} prompt + ${m.example.completion} completion tokens) and for one billion tokens, at e = ${m.joulesPerToken} J/token.`,
      `<th rowspan="2">Path</th><th class="r" rowspan="2">PUE</th><th class="c" colspan="3">Per ${m.example.tokens} tokens</th><th class="c" colspan="3">Per billion tokens</th></tr><tr><th class="r">Wh</th><th class="r">mL water</th><th class="r">Electricity</th><th class="r">kWh</th><th class="r">L water</th><th class="r">Electricity</th>`,
      [
        row("Ground, Google", g.ground.pue, g.ground, bg.groundKWh, bg.groundWaterL, bg.groundCostUsd),
        row("Ground, other providers", o.ground.pue, o.ground, bo.groundKWh, bo.groundWaterL, bo.groundCostUsd),
        row("Orbit", g.space.pue, g.space, bg.spaceKWh, bg.spaceWaterL, bg.spaceCostUsd),
      ],
    );
  },
};

let html = read("paper/src/paper.html");
html = html.replace(/<!--svg:([\w-]+)-->/g, (_, name) => read(`paper/figures/${name}.svg`).trim());
html = html.replace(/<!--table:([\w-]+)-->/g, (_, name) => {
  if (!tables[name]) throw new Error(`Unknown table ${name}`);
  return tables[name]();
});
html = html.replace(/\{\{=\s*([^}|]+?)\s*(?:\|\s*(\w+))?\s*\}\}/g, (_, expr, format) => value(expr, format));

// Figure, table and equation numbers in document order.
for (const [kind, pattern] of [
  ["fig", /<figure[^>]*\sid="fig-([\w-]+)"/g],
  ["tab", /<table[^>]*\sid="tab-([\w-]+)"/g],
  ["eq", /<div class="eq"[^>]*\sid="eq-([\w-]+)"/g],
]) {
  const ids = [...html.matchAll(pattern)].map((m) => m[1]);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`Duplicate ${kind} id ${dup}`);
  html = html.replace(new RegExp(`\\{\\{#${kind}:([\\w-]+)\\}\\}`, "g"), (_, id) => {
    const n = ids.indexOf(id);
    if (n < 0) throw new Error(`Unknown ${kind} ${id}`);
    return String(n + 1);
  });
}

// References, numbered by first citation.
const order = [];
html = html.replace(/\[\[([\w,\s]+)\]\]/g, (_, keys) => {
  const links = keys.split(",").map((k) => {
    const key = k.trim();
    if (!REFS[key]) throw new Error(`Unknown reference ${key}`);
    if (!order.includes(key)) order.push(key);
    const n = order.indexOf(key) + 1;
    return `<a href="#ref-${n}">${n}</a>`;
  });
  return `<sup class="c">${links.join(",")}</sup>`;
});
const unused = Object.keys(REFS).filter((k) => !order.includes(k));
if (unused.length) console.warn(`Uncited references: ${unused.join(", ")}`);
html = html.replace("<!--references-->", `<ol class="refs">${order.map((k, i) => `<li id="ref-${i + 1}">${REFS[k]}</li>`).join("")}</ol>`);
const leftover = html.match(/\{\{[^}]*\}\}|\[\[[^\]]*\]\]|<!--(svg|table):/);
if (leftover) throw new Error(`Unprocessed token: ${leftover[0]}`);

// Chromium only writes the title, so the document information is replaced by
// an incremental update: a new Info object, one xref subsection and a trailer.
function setInfo(path, info) {
  const pdf = readFileSync(path);
  const tail = pdf.subarray(Math.max(0, pdf.length - 4096)).toString("latin1");
  const trailer = tail.slice(tail.lastIndexOf("trailer"));
  const size = Number(/\/Size (\d+)/.exec(trailer)[1]);
  const root = /\/Root (\d+ \d+ R)/.exec(trailer)[1];
  const prev = Number(/startxref\s+(\d+)/.exec(tail.slice(tail.lastIndexOf("startxref")))[1]);
  const text = (s) => `<FEFF${[...s].map((ch) => ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join("")}>`;
  const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const entries = Object.entries({ ...info, CreationDate: `D:${now}Z`, ModDate: `D:${now}Z` })
    .map(([k, v]) => `/${k} ${k.endsWith("Date") ? `(${v})` : text(v)}`)
    .join("\n");
  const object = `\n${size} 0 obj\n<<\n${entries}\n>>\nendobj\n`;
  const xref = pdf.length + Buffer.byteLength(object, "latin1");
  const offset = String(pdf.length + 1).padStart(10, "0");
  const update = `${object}xref\n${size} 1\n${offset} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${prev} >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(path, Buffer.concat([pdf, Buffer.from(update, "latin1")]));
}
const INFO = {
  Title: TITLE,
  Author: "Oleh Lahoda",
  Subject: "How SpaceVision models the network path of an AI request to a ground data center and to an orbital data center, and what the model says about latency, energy, cooling water and cost.",
  Keywords: "orbital data centers; Starcloud; sun-synchronous orbit; satellite routing; network latency; AI inference; cooling water; PUE",
  Creator: "SpaceVision paper build (paper/scripts/build.mjs)",
  Producer: "Chromium (Skia/PDF)",
};

mkdirSync(BUILD, { recursive: true });
const browser = await chromium.launch();
for (const [theme, edition] of Object.entries(EDITIONS)) {
  const page = `@page { background: ${edition.bg};
    @bottom-left { content: "${FOOTER}"; font: 8pt Arial, Arimo, sans-serif; color: ${edition.footer}; vertical-align: top; padding-top: 0.32in; }
    @bottom-right { content: counter(page); font: 8pt Arial, Arimo, sans-serif; color: ${edition.footer}; vertical-align: top; padding-top: 0.32in; } }
  @page :first { @bottom-left { content: none; } @bottom-right { content: none; } }`;
  const out = html
    .replace(/<html lang="en">/, `<html lang="en" class="${theme}">`)
    .replace("</head>", `<style>${page}</style></head>`);
  const file = join(BUILD, `paper-${theme}.html`);
  writeFileSync(file, out);
  // A Letter-wide print viewport lays the cover out as it will be printed.
  const tab = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  await tab.emulateMedia({ media: "print" });
  await tab.goto(pathToFileURL(file).href, { waitUntil: "load" });
  // The cover fade is painted into an opaque JPEG rather than drawn with a CSS
  // mask: black-and-white printers render PDF soft masks as gray bands.
  const heroSrc = await tab.getAttribute(".hero img", "src");
  const hero = `data:image/png;base64,${readFileSync(join(BUILD, heroSrc)).toString("base64")}`;
  await tab.evaluate(async ({ hero, bg, fadeIn }) => {
    const load = (el, src) =>
      new Promise((resolve, reject) => {
        el.onload = resolve;
        el.onerror = () => reject(new Error("cover render did not load"));
        el.src = src;
      });
    const img = document.querySelector(".hero img");
    const source = new Image();
    await load(source, hero);
    const box = img.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = Math.round((source.naturalWidth * box.height) / box.width);
    const g = canvas.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, 0);
    const fade = g.createLinearGradient(0, canvas.height * (1 - (fadeIn * 96) / box.height), 0, canvas.height);
    fade.addColorStop(0, `${bg}0`);
    fade.addColorStop(1, bg);
    g.fillStyle = fade;
    g.fillRect(0, 0, canvas.width, canvas.height);
    await load(img, canvas.toDataURL("image/jpeg", 0.95));
  }, { hero, bg: edition.bg, fadeIn: 0.4 });
  const problems = await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    const out = [...document.images].filter((img) => !img.naturalWidth).map((img) => `image did not load: ${img.getAttribute("src")}`);
    const cover = document.querySelector(".cover");
    if (cover.scrollHeight > cover.clientHeight) out.push("cover overflows page 1");
    const blocks = [".titles", ".front", ".fn", ".foot"].map((s) => cover.querySelector(s).getBoundingClientRect());
    blocks.slice(1).forEach((b, i) => b.top < blocks[i].bottom && out.push(`cover blocks overlap: ${[".titles", ".front", ".fn", ".foot"][i]} and the next`));
    return out;
  });
  if (problems.length) throw new Error(`${theme}: ${problems.join("; ")}`);
  await tab.pdf({ path: join(ROOT, edition.pdf), preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  await tab.close();
  setInfo(join(ROOT, edition.pdf), INFO);
  console.log(`${edition.pdf}`);
}
await browser.close();
console.log(`${order.length} references`);
