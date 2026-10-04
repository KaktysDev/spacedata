// Builds the paper's SVG figures from paper/data/analysis.json.
// Colors come from classes in paper/src/paper.css, so one SVG serves both editions.
// Run: node paper/scripts/figures.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { geoEqualEarth, geoPath, geoGraticule10, geoCircle, geoArea } from "d3-geo";
import { feature } from "topojson-client";

const A = JSON.parse(readFileSync("paper/data/analysis.json", "utf8"));
const world = JSON.parse(readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const LAND = feature(world, world.objects.land);
const OUT = "paper/figures";
mkdirSync(OUT, { recursive: true });

const rad = Math.PI / 180;
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (v, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// "RTT_{g}" and "r^{2}" become tspans; the zero-width space restores the baseline.
function rich(s) {
  const re = /([_^])\{([^}]*)\}/g;
  let out = "",
    last = 0,
    m;
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index));
    const dy = m[1] === "_" ? 3 : -4.5;
    out += `<tspan dy="${dy}" font-size="72%">${esc(m[2])}</tspan><tspan dy="${-dy}">\u200b</tspan>`;
    last = re.lastIndex;
  }
  return out + esc(s.slice(last));
}
const T = (x, y, s, cls = "tx", attrs = "") =>
  `<text x="${n1(x)}" y="${n1(y)}" class="${cls}"${attrs ? " " + attrs : ""}>${rich(s)}</text>`;
const L = (x1, y1, x2, y2, cls = "st", attrs = "") =>
  `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" class="${cls}"${attrs ? " " + attrs : ""}/>`;
const P = (d, cls = "st", attrs = "") => `<path d="${d}" class="${cls}"${attrs ? " " + attrs : ""}/>`;
const C = (cx, cy, r, cls = "fl-fg", attrs = "") =>
  `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" class="${cls}"${attrs ? " " + attrs : ""}/>`;
const R = (x, y, w, h, cls = "box", attrs = "") =>
  `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" class="${cls}"${attrs ? " " + attrs : ""}/>`;
const poly = (pts) => "M" + pts.map((p) => `${n1(p[0])},${n1(p[1])}`).join("L");

function markers(id) {
  return `<defs>${["fg", "m", "orb", "gnd"]
    .map(
      (c) =>
        `<marker id="${id}-ah-${c}" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1.2 L10,5 L0,8.8 z" class="fl-${c}"/></marker>`,
    )
    .join("")}</defs>`;
}
const arrow = (id, c, both = false) =>
  `marker-end="url(#${id}-ah-${c})"${both ? ` marker-start="url(#${id}-ah-${c})"` : ""}`;
function svg(id, w, h, body, label) {
  return `<svg class="fig-svg" id="svg-${id}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${markers(id)}${body}</svg>`;
}
const save = (name, content) => writeFileSync(`${OUT}/${name}.svg`, content);

function satIcon(x, y, cls = "fl-fg", s = 1) {
  const stroke = cls === "fl-fg" ? "st" : cls.replace("fl-", "st-");
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${s})">${R(-9.5, -2.2, 6, 4.4, cls)}${R(3.5, -2.2, 6, 4.4, cls)}${L(-3.5, 0, 3.5, 0, stroke, 'stroke-width="1"')}${R(-2.6, -2.6, 5.2, 5.2, cls)}</g>`;
}
function pin(x, y, cls = "fl-fg") {
  // Tip at (x, y).
  return `<path d="M${x},${y} C${x - 6},${y - 9} ${x - 9},${y - 13} ${x - 9},${y - 18} A9,9 0 1 1 ${x + 9},${y - 18} C${x + 9},${y - 13} ${x + 6},${y - 9} ${x},${y} Z" class="${cls}"/>${C(x, y - 18, 3.4, "fl-bg")}`;
}

// --------------------------------------------------------------------------
// Map helpers
// --------------------------------------------------------------------------
const PROVIDERS = A.catalog.providers;
const providerLabel = {
  gemini: "Google · Gemini",
  openai: "OpenAI · Azure",
  anthropic: "Anthropic · AWS Bedrock",
  xai: "xAI · Grok",
};
function symbol(provider, x, y, size = 3.6, cls = "dot") {
  const s = size;
  if (provider === "gemini") return C(x, y, s, cls);
  if (provider === "openai") return R(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8, cls);
  if (provider === "anthropic")
    return P(`M${n1(x)},${n1(y - s * 1.15)}L${n1(x + s * 1.05)},${n1(y + s * 0.8)}L${n1(x - s * 1.05)},${n1(y + s * 0.8)}Z`, cls);
  return P(`M${n1(x)},${n1(y - s * 1.2)}L${n1(x + s * 1.05)},${n1(y)}L${n1(x)},${n1(y + s * 1.2)}L${n1(x - s * 1.05)},${n1(y)}Z`, cls);
}
function cellPath(proj, lon0, lon1, lat0, lat1, step = 2) {
  const pts = [];
  const n = Math.max(1, Math.ceil((lon1 - lon0) / step));
  for (let i = 0; i <= n; i++) pts.push(proj([lon0 + ((lon1 - lon0) * i) / n, lat0]));
  for (let i = n; i >= 0; i--) pts.push(proj([lon0 + ((lon1 - lon0) * i) / n, lat1]));
  return poly(pts) + "Z";
}
function centralAngle(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * rad,
    p2 = lat2 * rad,
    dp = p2 - p1,
    dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const SUB = [A.shell.subsolar.lon, A.shell.subsolar.lat];
const cap = (r) => geoCircle().center(SUB).radius(r).precision(0.5)();
function band(inner, outer) {
  return {
    type: "Polygon",
    coordinates: [cap(outer).coordinates[0], cap(inner).coordinates[0].slice().reverse()],
  };
}
{
  // The visible band must cover 47.07 % of the sphere at 850 km.
  const share = geoArea(band(90 - A.coverage.horizonOffDeg850, 90 + A.coverage.horizonOffDeg850)) / (4 * Math.PI);
  if (Math.abs(share - A.coverage.surfaceShareHorizon850) > 0.002)
    throw new Error(`band winding: share ${share}`);
}
const TRACK = { type: "LineString", coordinates: A.figures.track };
const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948",
  "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6", "#d37295",
];

// --------------------------------------------------------------------------
// Figure: system overview
// --------------------------------------------------------------------------
function figSystem() {
  const id = "system";
  const W = 640, H = 300;
  let b = "";
  // Lane captions
  b += T(78, 18, "GROUND PATH · MODELED", "tx-gnd caps");
  b += T(78, 128, "ORBITAL PATH · MODELED", "tx-orb caps");
  // You
  b += pin(36, 122, "fl-fg");
  b += T(36, 140, "You", "tx b mid");
  b += T(36, 152, "pin anywhere", "tx-m s mid");
  b += L(48, 104, 72, 104, "st-m", 'stroke-width="1.2"');
  b += L(72, 52, 72, 160, "st-m", 'stroke-width="1.2"');
  // Ground lane
  b += L(72, 52, 190, 52, "st-gnd", `stroke-width="1.6" ${arrow(id, "gnd", true)}`);
  b += T(131, 45, "fiber · great-circle d", "tx s mid");
  b += T(131, 64, "v = c / 1.35", "tx-gnd s mid");
  b += R(192, 30, 124, 44, "box-gnd", 'rx="6"');
  b += T(254, 49, "Nearest public site", "tx b mid");
  b += T(254, 63, "1 of 28 reference sites", "tx-m s mid");
  b += L(316, 52, 520, 52, "st-f", 'stroke-dasharray="2 3"');
  b += T(418, 46, "New York → Ashburn, VA: d = 350 km", "tx-m s mid");
  b += T(528, 49, "RTT_{g} = 2d / v", "tx b");
  b += T(528, 63, "3.15 ms", "tx-gnd s");
  // Orbital lane
  b += L(72, 160, 178, 160, "st-orb", `stroke-width="1.6" ${arrow(id, "orb", true)}`);
  b += T(125, 153, "RF uplink · ρ", "tx s mid");
  b += T(125, 172, "at c", "tx-orb s mid");
  b += R(180, 138, 124, 44, "box-orb", 'rx="6"');
  b += satIcon(196, 160, "fl-orb", 0.8);
  b += T(250, 156, "Backhaul craft", "tx b mid");
  b += T(250, 170, "highest elevation", "tx-m s mid");
  b += L(304, 160, 376, 160, "st-orb", `stroke-width="1.6" ${arrow(id, "orb", true)}`);
  b += T(340, 153, "optical · L", "tx s mid");
  b += T(340, 172, "chord or arc, c", "tx-orb s mid");
  b += R(378, 138, 130, 44, "box-orb", 'rx="6"');
  b += satIcon(394, 160, "fl-fg", 0.8);
  b += T(448, 156, "Starcloud-2", "tx b mid");
  b += T(448, 170, "slot 0 · 725 km", "tx-m s mid");
  b += T(528, 157, "RTT_{o} = 2(ρ + L) / c", "tx b");
  b += T(528, 171, "41.4 ms", "tx-orb s");
  b += T(304, 200, "New York at the epoch: ρ = 1,301 km, L = 4,907 km (straight chord)", "tx-m s mid");
  // Replies
  b += R(20, 222, 600, 66, "box-dash", 'rx="7"');
  b += T(34, 240, "REPLIES · MEASURED", "tx caps");
  b += T(34, 256, "One prompt → two parallel, identical calls to the same provider API on Earth", "tx");
  b += T(34, 271, "(same system prompt, same 4,096-token cap). Each call returns reply text, token usage and call duration.", "tx-m s");
  b += T(34, 283, "The results card pairs each reply with its path's modeled network time, energy, water and electricity cost.", "tx-m s");
  save(id, svg(id, W, H, b, "One question, two modeled paths and one measured reply source"));
}

// --------------------------------------------------------------------------
// Figure: shell cell structure (uses the shipped placement rule)
// --------------------------------------------------------------------------
function shellHash(i, salt) {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function figShell() {
  const id = "shell";
  const W = 640, H = 262;
  let b = "";
  // (a) along-track x altitude wedge, bins 52..57
  const x0 = 46, y0 = 34, cw = 41, ch = 17.5, bins = [52, 53, 54, 55, 56, 57];
  const gw = cw * bins.length, gh = ch * 10;
  b += T(x0 - 36, 18, "(a) Orbital plane: along-track × altitude, six of 110 bins", "tx b");
  b += R(x0, y0, gw, gh, "box", 'stroke-width="0.8"');
  for (let k = 1; k < bins.length; k++) b += L(x0 + k * cw, y0, x0 + k * cw, y0 + gh, "st-f");
  for (let k = 1; k < 10; k++) b += L(x0, y0 + k * ch, x0 + gw, y0 + k * ch, "st-f");
  // highlighted cell: along bin 53, radial 7
  const hx = x0 + (53 - 52) * cw, hy = y0 + (9 - 7) * ch;
  b += R(hx, hy, cw, ch, "box-orb", 'fill="none"');
  b += R(hx + 0.22 * cw, hy + 0.22 * ch, 0.56 * cw, 0.56 * ch, "st-orb", 'stroke-dasharray="2 1.5" stroke-width="0.7"');
  for (let i = 1; i < 8800; i++) {
    const along = i % 110;
    if (along < 52 || along > 57) continue;
    const rest = Math.floor(i / 110);
    const radial = rest % 10;
    const alongPos = along + 0.22 + shellHash(i, 3) * 0.56;
    const altPos = radial + 0.22 + shellHash(i, 1) * 0.56;
    b += C(x0 + (alongPos - 52) * cw, y0 + gh - altPos * ch, 0.95, "fl-m");
  }
  // Starcloud-2 at alongT = 0.5 (bin edge 55), altT = 0.5 (725 km)
  const sx = x0 + 3 * cw, sy = y0 + gh / 2;
  b += C(sx, sy, 5.2, "st", 'stroke-width="1.3"');
  b += C(sx, sy, 2.3, "fl-fg");
  b += L(sx + 4, sy + 4, sx + 14, sy + 50, "st-m", 'stroke-width="0.8"');
  b += T(sx + 16, sy + 58, "Starcloud-2: slot 0, the corner", "tx s b halo");
  b += T(sx + 16, sy + 69, "shared by 8 cells (725 km)", "tx s halo");
  b += T(x0 - 6, y0 + 4, "850 km", "tx-m s end");
  b += T(x0 - 6, y0 + gh / 2 + 3, "725", "tx-m s end");
  b += T(x0 - 6, y0 + gh + 3, "600 km", "tx-m s end");
  b += T(x0 + gw / 2, y0 + gh + 16, "along-track →  (bin = 3.27°, about 405 km at 725 km)", "tx-m s mid");
  b += T(x0 + gw / 2, y0 + gh + 28, "10 radial layers × 25 km · not to scale", "tx-m s mid");
  // (b) one cell
  const bx = 340, by = 44, bs = 112;
  b += T(bx - 8, 18, "(b) One cell", "tx b");
  b += R(bx, by, bs, bs, "box-orb", 'fill="none"');
  b += R(bx + 0.22 * bs, by + 0.22 * bs, 0.56 * bs, 0.56 * bs, "st-orb", 'stroke-dasharray="3 2"');
  b += C(bx + 0.62 * bs, by + 0.41 * bs, 3, "fl-fg");
  b += L(bx, by + bs + 7, bx + 0.22 * bs, by + bs + 7, "st-m", `${arrow(id, "m", true)}`);
  b += T(bx + 0.11 * bs, by + bs + 19, "0.22", "tx-m s mid");
  b += T(bx + 0.5 * bs, by + bs + 19, "0.56", "tx-m s mid");
  b += L(bx + 0.22 * bs, by + bs + 7, bx + 0.78 * bs, by + bs + 7, "st-m", `${arrow(id, "m", true)}`);
  b += T(bx - 6, by + bs + 38, "t = (k + 0.22 + 0.56·h) / N", "tx math");
  b += T(bx - 6, by + bs + 52, "h = hash(slot, axis), deterministic", "tx-m s");
  b += T(bx - 6, by + bs + 63, "the margin keeps a gap to every neighbour", "tx-m s");
  // (c) counts
  const cx = 470;
  b += T(cx, 18, "(c) Counts", "tx b");
  const rows = [
    ["88,000", "FCC filing ceiling", "tx b xl"],
    ["÷ 10", "spacing picture", "tx-m"],
    ["8,800", "drawn craft", "tx-orb b xl"],
    ["10", "radial layers, 25 km", "tx"],
    ["× 8", "cross-track bins (drawing only)", "tx"],
    ["× 110", "along-track bins, 3.27°", "tx"],
  ];
  rows.forEach(([v, d, cls], k) => {
    const y = 44 + k * 27;
    b += T(cx + 40, y, v, `${cls} end`);
    b += T(cx + 47, y, d, "tx-m s");
  });
  b += L(cx, 44 + 2 * 27 + 9, cx + 166, 44 + 2 * 27 + 9, "st-r");
  save(id, svg(id, W, H, b, "Cell structure of the 8,800-craft shell"));
}

// --------------------------------------------------------------------------
// Figure: link geometry (uplink elevation, chord vs arc)
// --------------------------------------------------------------------------
function polar(cx, cy, r, aDeg) {
  return [cx + r * Math.sin(aDeg * rad), cy - r * Math.cos(aDeg * rad)];
}
function arcPath(cx, cy, r, a1, a2) {
  const p1 = polar(cx, cy, r, a1), p2 = polar(cx, cy, r, a2);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sweep = a2 > a1 ? 1 : 0;
  return `M${n1(p1[0])},${n1(p1[1])}A${n1(r)},${n1(r)} 0 ${large} ${sweep} ${n1(p2[0])},${n1(p2[1])}`;
}
function figGeometry() {
  const id = "geometry";
  const W = 640, H = 302;
  let b = "";
  // (a) uplink
  const O = [158, 296], Re = 158, r = 213, th = 19;
  b += T(8, 16, "(a) RF uplink: elevation ε and slant range ρ", "tx b");
  b += P(arcPath(O[0], O[1], Re, -52, 52), "st", 'stroke-width="1.4"');
  b += P(arcPath(O[0], O[1], r, -40, 40), "st-m", 'stroke-dasharray="3 3"');
  b += T(polar(O[0], O[1], r, 40)[0] + 4, polar(O[0], O[1], r, 40)[1] + 4, "shell", "tx-m s");
  const U = polar(O[0], O[1], Re, 0), S = polar(O[0], O[1], r, th);
  b += L(O[0], O[1], U[0], U[1], "st-m", 'stroke-width="0.8"');
  b += L(O[0], O[1], S[0], S[1], "st-m", 'stroke-width="0.8"');
  b += C(O[0], O[1], 2.4, "fl-m");
  b += T(O[0] - 8, O[1] - 2, "O", "tx-m s end");
  b += P(arcPath(O[0], O[1], 34, 0, th), "st", 'stroke-width="0.9"');
  b += T(O[0] + 8, O[1] - 38, "θ", "tx math");
  b += T(U[0] - 7, U[1] + 66, "R⊕", "tx math end");
  b += T(S[0] + 9, (O[1] + S[1]) / 2 + 30, "r = R⊕ + h", "tx math");
  b += L(U[0] - 70, U[1], U[0] + 108, U[1], "st-m", 'stroke-dasharray="4 3"');
  b += T(U[0] - 70, U[1] - 5, "local horizon", "tx-m s");
  const elev = Math.atan2(r * Math.cos(th * rad) - Re, r * Math.sin(th * rad)) / rad;
  b += L(U[0], U[1], S[0], S[1], "st-orb", 'stroke-width="1.8"');
  const eArc = 30;
  b += `<path d="M${n1(U[0] + eArc)},${n1(U[1])}A${eArc},${eArc} 0 0 0 ${n1(U[0] + eArc * Math.cos(elev * rad))},${n1(U[1] - eArc * Math.sin(elev * rad))}" class="st" stroke-width="0.9"/>`;
  b += T(U[0] + eArc + 5, U[1] - 6, "ε", "tx math");
  const mid = [(U[0] + S[0]) / 2, (U[1] + S[1]) / 2];
  b += T(mid[0] - 8, mid[1] - 6, "ρ", "tx-orb math end");
  b += C(U[0], U[1], 3.2, "fl-fg");
  b += T(U[0] - 6, U[1] + 15, "U (you)", "tx s end");
  b += satIcon(S[0], S[1], "fl-orb", 0.95);
  b += T(S[0] + 13, S[1] - 9, "S (backhaul craft)", "tx s");
  b += T(8, 296, "altitude exaggerated", "tx-m xs");
  // (b) optical leg, true scale
  const Q = [478, 160], Rq = 92, rq = Rq * (6371 + 725) / 6371;
  b += T(342, 16, "(b) Optical leg: straight chord or shell arc", "tx b");
  b += C(Q[0], Q[1], Rq, "box", 'stroke-width="1.4"');
  b += C(Q[0], Q[1], rq, "st-m", 'stroke-dasharray="3 3"');
  b += T(Q[0], Q[1] + 4, "Earth", "tx-m mid");
  // pair 1: 45 deg apart, clears
  const A1 = polar(Q[0], Q[1], rq, -22.5), B1 = polar(Q[0], Q[1], rq, 22.5);
  b += L(A1[0], A1[1], B1[0], B1[1], "st-orb", 'stroke-width="1.8"');
  b += satIcon(A1[0], A1[1], "fl-orb", 0.7);
  b += satIcon(B1[0], B1[1], "fl-orb", 0.7);
  b += T(Q[0], A1[1] - 22, "45° apart: the chord clears Earth", "tx s mid");
  b += T(Q[0], A1[1] - 11, "→ straight vacuum line", "tx-orb s mid");
  // pair 2: 95 deg apart, blocked
  const A2 = polar(Q[0], Q[1], rq, 132.5), B2 = polar(Q[0], Q[1], rq, 227.5);
  b += L(A2[0], A2[1], B2[0], B2[1], "st-m", 'stroke-dasharray="3 3" stroke-width="1.1"');
  const mid2 = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
  b += `<path d="M${n1(mid2[0] - 4)},${n1(mid2[1] - 4)}L${n1(mid2[0] + 4)},${n1(mid2[1] + 4)}M${n1(mid2[0] + 4)},${n1(mid2[1] - 4)}L${n1(mid2[0] - 4)},${n1(mid2[1] + 4)}" class="st" stroke-width="1.4"/>`;
  b += P(arcPath(Q[0], Q[1], rq, 132.5, 227.5), "st-orb", 'stroke-width="1.8"');
  b += satIcon(A2[0], A2[1], "fl-orb", 0.7);
  b += satIcon(B2[0], B2[1], "fl-fg", 0.7);
  b += T(B2[0] - 12, B2[1] + 4, "Starcloud-2", "tx s end");
  b += T(Q[0], Q[1] + rq + 18, "95° apart: the chord dips below the surface → arc along the shell", "tx s mid");
  b += T(Q[0], 296, "true scale at 725 km: the chord clears up to 52.3° apart", "tx-m s mid");
  save(id, svg(id, W, H, b, "Uplink and optical-leg geometry"));
}

// --------------------------------------------------------------------------
// Figure: nearest-site catchments, 2 x 2
// --------------------------------------------------------------------------
// Spherical Voronoi cells: the region nearer (by great-circle distance) to each
// site than to any other, which is exactly the haversine nearest-site rule.
const vec = (lon, lat) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
const vsub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
const vdot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const vcross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const vnorm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lonLat = (v) => [Math.atan2(v[1], v[0]) / rad, Math.asin(Math.max(-1, Math.min(1, v[2]))) / rad];
function voronoiCells(sites) {
  const S = sites.map((s) => vec(s.lon, s.lat));
  if (S.length === 2)
    return S.map((s, i) => geoCircle().center(lonLat(vnorm(vsub(s, S[1 - i])))).radius(90).precision(0.5)());
  const cells = S.map((si, i) => {
    const verts = [];
    for (let j = 0; j < S.length; j++)
      for (let k = j + 1; k < S.length; k++) {
        if (j === i || k === i) continue;
        const n = vcross(vsub(S[j], si), vsub(S[k], si));
        if (Math.hypot(...n) < 1e-12) continue;
        for (const sgn of [1, -1]) {
          const p = vnorm(n).map((v) => v * sgn);
          const di = vdot(p, si);
          if (S.some((sm) => vdot(p, sm) > di + 1e-9)) continue;
          if (!verts.some((q) => Math.hypot(...vsub(p, q)) < 1e-7)) verts.push(p);
        }
      }
    if (verts.length < 3) throw new Error(`Voronoi cell ${sites[i].name} has ${verts.length} vertices`);
    const ref = Math.abs(si[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = vnorm(vcross(ref, si)), e2 = vcross(si, e1);
    // Clockwise seen from outside, as d3-geo expects for an exterior ring.
    verts.sort((p, q) => Math.atan2(vdot(q, e2), vdot(q, e1)) - Math.atan2(vdot(p, e2), vdot(p, e1)));
    const ring = verts.map(lonLat);
    return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
  });
  const total = cells.reduce((s, c) => s + geoArea(c), 0) / (4 * Math.PI);
  if (Math.abs(total - 1) > 1e-6) throw new Error(`Voronoi cells cover ${total} of the sphere`);
  return cells;
}
function figCatchments() {
  const id = "catchments";
  const W = 640, H = 352;
  const pw = 312, ph = 158;
  let b = "";
  PROVIDERS.forEach((prov, k) => {
    const ox = (k % 2) * (pw + 16), oy = Math.floor(k / 2) * (ph + 18) + 14;
    const proj = geoEqualEarth().fitExtent([[ox + 2, oy + 4], [ox + pw - 2, oy + ph - 4]], { type: "Sphere" });
    const path = geoPath(proj);
    b += T(ox + 4, oy + 2, `${providerLabel[prov.id]} · ${prov.sites.length} ${prov.sites.length === 1 ? "site" : "sites"}`, "tx b");
    const cells = voronoiCells(prov.sites);
    b += `<g opacity="0.58">${cells
      .map((c, i) => `<path d="${path(c)}" fill="${PALETTE[i % PALETTE.length]}" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="0.6"/>`)
      .join("")}</g>`;
    b += cells.map((c) => P(path(c), "cell-edge")).join("");
    b += P(path(LAND), "coast");
    b += P(path({ type: "Sphere" }), "sphere");
    for (const s of prov.sites) {
      const [x, y] = proj([s.lon, s.lat]);
      b += symbol(prov.id, x, y, 3.1, "dot");
    }
  });
  save(id, svg(id, W, H, b, "Nearest-site catchments for the four providers"));
}

// --------------------------------------------------------------------------
// Figure: ring ground track, coverage band, Starcloud-2 positions
// --------------------------------------------------------------------------
const CITY_OFF = Object.fromEntries(A.orbital.map((o) => [o.city, o]));
function figTrack() {
  const id = "track";
  const W = 640, H = 368;
  const proj = geoEqualEarth().fitExtent([[6, 6], [634, 322]], { type: "Sphere" });
  const path = geoPath(proj);
  let b = "";
  b += P(path(cap(90)), "day");
  b += P(path(geoGraticule10()), "grat");
  b += P(path(LAND), "land");
  const h850 = A.coverage.horizonOffDeg850, m850 = A.coverage.mask25OffDeg850;
  b += P(path(band(90 - h850, 90 + h850)), "fl-orb", 'fill-opacity="0.13"');
  b += P(path(band(90 - m850, 90 + m850)), "fl-orb", 'fill-opacity="0.16"');
  b += P(path(cap(90 - h850)), "st-orb", 'stroke-dasharray="4 3" stroke-width="0.8"');
  b += P(path(cap(90 + h850)), "st-orb", 'stroke-dasharray="4 3" stroke-width="0.8"');
  b += P(path(TRACK), "st-orb", 'stroke-width="1.7"');
  b += P(path({ type: "Sphere" }), "sphere");
  // Starcloud-2 every 8.26 minutes
  A.figures.sc2Track.forEach((p, k) => {
    const [x, y] = proj([p.lon, p.lat]);
    b += C(x, y, k === 0 ? 4.6 : 2.8, k === 0 ? "dot" : "fl-fg", k === 0 ? "" : 'stroke="none"');
    const label = k === 0 ? "" : `${Math.round(p.minutes)}`;
    if (label) b += T(x + 5, y + 3.5, label, "tx xs halo");
  });
  {
    const [x, y] = proj([-70, 0]);
    b += L(x - 4, y + 3, x - 26, y + 34, "st-m", 'stroke-width="0.8"');
    b += T(x - 28, y + 44, "Starcloud-2 at the epoch", "tx s b halo end");
    b += T(x - 28, y + 55, "(0°, 70°W), heading south", "tx s halo end");
  }
  // Sun
  {
    const [x, y] = proj(SUB);
    for (let k = 0; k < 8; k++) {
      const a = (k * 45) * rad;
      b += L(x + 7 * Math.cos(a), y + 7 * Math.sin(a), x + 10.5 * Math.cos(a), y + 10.5 * Math.sin(a), "st-gnd", 'stroke-width="1.3"');
    }
    b += C(x, y, 5, "fl-gnd");
    b += T(x + 13, y + 16, "subsolar point", "tx s halo");
    b += T(x + 13, y + 27, "20°E, 8.28°S", "tx-m s halo");
  }
  // Cities
  const offsets = {
    "New York": [6, -6, "start"],
    London: [7, -6, "start"],
    Tokyo: [6, -6, "start"],
    Sydney: [6, 12, "start"],
    "São Paulo": [6, 12, "start"],
    "Cape Town": [6, 12, "start"],
  };
  for (const c of A.catalog.presets) {
    const [x, y] = proj([c.lon, c.lat]);
    const o = CITY_OFF[c.name];
    b += C(x, y, 3.4, "fl-bg");
    b += C(x, y, 3.4, "st", 'stroke-width="1.5"');
    const [dx, dy, anchor] = offsets[c.name];
    b += T(x + dx, y + dy, `${c.name} ${Math.abs(o.offPlaneDeg).toFixed(1)}°`, `tx s b halo ${anchor === "end" ? "end" : ""}`);
  }
  // Legend
  const ly = 340;
  b += L(20, ly, 44, ly, "st-orb", 'stroke-width="1.7"');
  b += T(49, ly + 3.5, "ring ground track = terminator", "tx s");
  b += R(212, ly - 6, 20, 12, "fl-orb", 'fill-opacity="0.13" stroke="none"');
  b += T(237, ly + 3.5, `line of sight to 850 km craft (±${h850.toFixed(1)}°)`, "tx s");
  b += R(212, ly + 10, 20, 12, "fl-orb", 'fill-opacity="0.29" stroke="none"');
  b += T(237, ly + 19.5, `above 25° elevation (±${m850.toFixed(1)}°)`, "tx s");
  b += C(452, ly, 2.8, "fl-fg");
  b += T(460, ly + 3.5, "Starcloud-2 every 8.3 min (labels: minutes)", "tx s");
  b += R(445, ly + 10, 14, 12, "day", 'stroke="none"');
  b += T(464, ly + 19.5, "day side", "tx s");
  b += T(20, ly + 19.5, "City labels: angle from the ring plane", "tx-m s");
  save(id, svg(id, W, H, b, "Ground track of the dawn-dusk ring"));
}

// --------------------------------------------------------------------------
// Figure: best-case elevation vs angle from the ring plane
// --------------------------------------------------------------------------
function figCoverage() {
  const id = "coverage";
  const W = 640, H = 262;
  const x0 = 58, x1 = 618, y0 = 16, y1 = 222;
  const X = (d) => x0 + (d / 70) * (x1 - x0);
  const Y = (e) => y1 - ((e + 30) / 120) * (y1 - y0);
  let b = "";
  for (let d = 0; d <= 70; d += 10) {
    b += L(X(d), y0, X(d), y1, "st-f", 'stroke-width="0.6"');
    b += T(X(d), y1 + 14, `${d}°`, "tx-m s mid");
  }
  for (const e of [-30, 0, 30, 60, 90]) {
    b += L(x0, Y(e), x1, Y(e), "st-f", 'stroke-width="0.6"');
    b += T(x0 - 6, Y(e) + 3.5, `${e}°`, "tx-m s end");
  }
  b += L(x0, Y(0), x1, Y(0), "st", 'stroke-width="1"');
  b += T(x1 - 2, Y(0) - 5, "horizon", "tx s end");
  b += L(x0, Y(25), x1, Y(25), "st-gnd", 'stroke-dasharray="5 3" stroke-width="1"');
  b += T(x1 - 2, Y(25) - 5, "25° minimum elevation (example: SpaceX Gen2)", "tx-gnd s end");
  const band = A.coverage.band.filter((p) => p.offDeg <= 70);
  const line = (key) => poly(band.map((p) => [X(p.offDeg), Y(p[key])]));
  b += P(line("elev600"), "st-orb", 'stroke-width="1.3" stroke-dasharray="1.5 2.5"');
  b += P(line("elev725"), "st-orb", 'stroke-width="1.3" stroke-dasharray="5 3"');
  b += P(line("elev850"), "st-orb", 'stroke-width="1.9"');
  // limits
  for (const [d, label, dy] of [
    [A.coverage.horizonOffDeg850, `${A.coverage.horizonOffDeg850.toFixed(1)}°: last 850 km craft above the horizon`, 0],
    [A.coverage.mask25OffDeg850, `${A.coverage.mask25OffDeg850.toFixed(1)}°: last above 25°`, 0],
  ]) {
    b += L(X(d), Y(-30), X(d), Y(90), "st-m", 'stroke-dasharray="2 2" stroke-width="0.8"');
    b += T(X(d) + 4, Y(84) + dy, label, "tx-m s");
  }
  // cities
  const pts = Object.fromEntries(
    A.orbital.map((o) => [o.city, [X(Math.abs(o.offPlaneDeg)), Y(o.bestCaseElevationDeg850), o]]),
  );
  for (const [, [x, y]] of Object.entries(pts)) b += C(x, y, 3.6, "dot");
  const lab = (city, lx, ly, anchor = "start") => {
    const [x, y, o] = pts[city];
    b += L(x, y, lx + (anchor === "end" ? 3 : -3), ly - 3, "st-m", 'stroke-width="0.7"');
    const e = o.bestCaseElevationDeg850;
    b += T(lx, ly, `${city} ${e < 0 ? "−" : ""}${Math.abs(e).toFixed(1)}°`, `tx s b halo ${anchor === "end" ? "end" : ""}`);
  };
  lab("New York", pts["New York"][0] + 14, pts["New York"][1] - 8);
  lab("São Paulo", X(16.5), Y(16), "end");
  lab("Sydney", X(17.5), Y(-9.5), "end");
  lab("London", X(33), Y(13));
  lab("Tokyo", X(34.5), Y(-11));
  lab("Cape Town", X(57), Y(-17), "end");
  // legend
  const lx = 420, ly = 46;
  b += R(lx - 10, ly - 14, 196, 60, "box", 'rx="5" stroke-width="0.6"');
  b += L(lx, ly, lx + 26, ly, "st-orb", 'stroke-width="1.9"');
  b += T(lx + 32, ly + 3.5, "850 km craft", "tx s");
  b += L(lx, ly + 15, lx + 26, ly + 15, "st-orb", 'stroke-width="1.3" stroke-dasharray="5 3"');
  b += T(lx + 32, ly + 18.5, "725 km (Starcloud-2 altitude)", "tx s");
  b += L(lx, ly + 30, lx + 26, ly + 30, "st-orb", 'stroke-width="1.3" stroke-dasharray="1.5 2.5"');
  b += T(lx + 32, ly + 33.5, "600 km craft", "tx s");
  b += T((x0 + x1) / 2, H - 6, "angle between the user and the ring plane", "tx-m s mid");
  b += `<text transform="translate(14 ${n1((y0 + y1) / 2)}) rotate(-90)" class="tx-m s mid">best elevation of a ring craft</text>`;
  save(id, svg(id, W, H, b, "Best-case elevation against distance from the ring plane"));
}

// --------------------------------------------------------------------------
// Figure: RTT over one orbit, six cities
// --------------------------------------------------------------------------
const PROV_LETTER = { gemini: "G", openai: "O", anthropic: "A", xai: "X" };
function figOrbitRtt() {
  const id = "rtt";
  const W = 640, H = 352;
  const cols = 3, pw = 213, ph = 170;
  const order = ["New York", "London", "Tokyo", "Sydney", "São Paulo", "Cape Town"];
  const period = 99.15;
  let b = "";
  order.forEach((city, k) => {
    const o = CITY_OFF[city];
    const s = A.figures.series[city];
    const ox = (k % cols) * pw, oy = Math.floor(k / cols) * ph;
    const x0 = ox + 34, x1 = ox + pw - 8, y0 = oy + 26, y1 = oy + ph - 30;
    const X = (m) => x0 + (m / period) * (x1 - x0);
    const Y = (ms) => y1 - (ms / 200) * (y1 - y0);
    b += T(ox + 6, oy + 12, city, "tx b");
    b += T(x1, oy + 12, `median ${o.rttMs.median.toFixed(1)} ms`, "tx-orb s end");
    for (const ms of [0, 50, 100, 150, 200]) {
      b += L(x0, Y(ms), x1, Y(ms), "st-f", 'stroke-width="0.5"');
      b += T(x0 - 4, Y(ms) + 3, `${ms}`, "tx-m xs end");
    }
    for (const m of [0, 25, 50, 75]) b += T(X(m), y1 + 11, `${m}`, "tx-m xs mid");
    b += T(x1, y1 + 22, "minutes after the epoch", "tx-m xs end");
    if (k % cols === 0) b += T(ox + 2, y0 - 4, "ms", "tx-m xs");
    // ground lines
    const prov = o.perProvider.map((p) => ({ ...p, y: Y(p.groundRttMs) })).sort((a, c) => a.groundRttMs - c.groundRttMs);
    for (const p of prov) b += L(x0, p.y, x1, p.y, "st-gnd", 'stroke-width="1" stroke-dasharray="4 2"');
    const groups = [];
    for (const p of prov) {
      const g = groups[groups.length - 1];
      if (g && p.y > g[g.length - 1].y - 9.5) g.push(p);
      else groups.push([p]);
    }
    // orbit curve
    const pts = s.rttMs.map((v, i) => [X((i * s.stepS) / 60), Y(v)]);
    b += P(poly(pts), "st-orb", 'stroke-width="1.35"');
    for (const g of groups) {
      const ms = (v) => (v === 0 ? "0" : v < 10 ? v.toFixed(1) : `${Math.round(v)}`);
      const label = g.map((p) => `${PROV_LETTER[p.provider]} ${ms(p.groundRttMs)}`).join(" · ");
      const y = Math.min(...g.map((p) => p.y)) - 3;
      b += T(x0 + 3, y, label, "tx-gnd xs b halo");
    }
  });
  save(id, svg(id, W, H, b, "Orbital round trip over one orbit for six cities"));
}

// --------------------------------------------------------------------------
// Figure: orbit-faster share, 2 x 2 maps
// --------------------------------------------------------------------------
function figShare() {
  const id = "share";
  const W = 640, H = 408;
  const pw = 312, ph = 158;
  const step = A.grid.stepDeg;
  const LEVELS = 40;
  const level = (v) => Math.round(v * LEVELS);
  const mix = (q) => `color-mix(in srgb, var(--orb) ${(12 + (88 * q) / LEVELS).toFixed(1)}%, var(--bg))`;
  // Opaque pre-mixed fills with a matching stroke leave no seams between cells.
  let style = "";
  for (let q = 1; q <= LEVELS; q++) style += `#svg-${id} .q${q}{fill:${mix(q)};stroke:${mix(q)};stroke-width:0.5}`;
  let b = `<style>${style}</style>`;
  b += `<defs><pattern id="${id}-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" class="hatch"/></pattern></defs>`;
  const h = A.coverage.horizonOffDeg850;
  const dayCap = cap(90 - h);
  const nightCap = geoCircle().center([SUB[0] - 180, -SUB[1]]).radius(90 - h).precision(0.5)();
  const rows = new Map();
  for (const c of A.grid.cells) {
    if (!rows.has(c.lat)) rows.set(c.lat, []);
    rows.get(c.lat).push(c);
  }
  PROVIDERS.forEach((prov, k) => {
    const ox = (k % 2) * (pw + 16), oy = Math.floor(k / 2) * (ph + 22) + 16;
    const proj = geoEqualEarth().fitExtent([[ox + 2, oy + 6], [ox + pw - 2, oy + ph - 2]], { type: "Sphere" });
    const path = geoPath(proj);
    const sum = A.grid.summary[prov.id];
    b += T(ox + 4, oy + 1, providerLabel[prov.id], "tx b");
    b += T(ox + pw - 4, oy + 1, `${(sum.meanShare * 100).toFixed(1)}% overall · ${(sum.meanShareInSight * 100).toFixed(1)}% in sight`, "tx-orb s end");
    let cells = "";
    for (const [lat, row] of rows) {
      row.sort((p, q) => p.lon - q.lon);
      let start = 0;
      for (let i = 1; i <= row.length; i++) {
        const q = level(row[start].share[prov.id]);
        if (i < row.length && level(row[i].share[prov.id]) === q && row[i].lon - row[i - 1].lon === step) continue;
        if (q > 0)
          cells += `<path d="${cellPath(proj, row[start].lon - step / 2, row[i - 1].lon + step / 2, lat - step / 2, lat + step / 2, 2)}" class="q${q}"/>`;
        start = i;
      }
    }
    b += cells;
    b += P(path(dayCap), "", `fill="url(#${id}-hatch)" stroke="none"`);
    b += P(path(nightCap), "", `fill="url(#${id}-hatch)" stroke="none"`);
    b += P(path(LAND), "coast");
    b += P(path(cap(90 - h)), "st", 'stroke-dasharray="1.5 2" stroke-width="0.6"');
    b += P(path(cap(90 + h)), "st", 'stroke-dasharray="1.5 2" stroke-width="0.6"');
    b += P(path({ type: "Sphere" }), "sphere");
    for (const s of prov.sites) {
      const [x, y] = proj([s.lon, s.lat]);
      b += symbol(prov.id, x, y, 2.8, "dot");
    }
  });
  // legend
  const ly = H - 30, lx = 196;
  b += T(lx - 10, ly + 3, "share of one orbit with orbit faster:", "tx s end");
  for (let k = 0; k <= 4; k++) {
    const q = k * (LEVELS / 4);
    b += R(lx + k * 44, ly - 6, 40, 12, q === 0 ? "box" : `q${q}`, q === 0 ? 'stroke-width="0.6"' : "");
    b += T(lx + k * 44 + 20, ly + 3.5, q === 0 ? "0" : `${k * 25}%`, `${k >= 3 ? "fl-bg" : "tx"} xs mid b`);
  }
  const ly2 = H - 10;
  b += L(lx - 186, ly2, lx - 166, ly2, "st", 'stroke-dasharray="1.5 2" stroke-width="0.8"');
  b += T(lx - 161, ly2 + 3.5, "edge of line of sight to an 850 km craft", "tx s");
  b += R(lx + 44, ly2 - 6, 40, 12, "", `fill="url(#${id}-hatch)" stroke="none"`);
  b += T(lx + 90, ly2 + 3.5, "no line of sight: the model still routes, so the share is optimistic", "tx s");
  save(id, svg(id, W, H, b, "Where the orbital path is faster than the nearest ground site"));
}

// --------------------------------------------------------------------------
// Figure: playback timeline
// --------------------------------------------------------------------------
function figPlayback() {
  const id = "playback";
  const W = 640, H = 182;
  const p = A.example.playback;
  const x0 = 76, x1 = 626, tMax = 4600;
  const X = (t) => x0 + (t / tMax) * (x1 - x0);
  let b = "";
  const lane = (y, label, cls) => {
    b += T(8, y + 12, label, `${cls} b`);
  };
  const bar = (t0, t1, y, cls, attrs = "") => R(X(t0), y, Math.max(0.8, X(t1) - X(t0)), 18, cls, attrs);
  const gy = 34, oy = 92;
  lane(gy, "Ground", "tx-gnd");
  lane(oy, "Orbit", "tx-orb");
  for (const y of [gy, oy]) b += bar(0, p.launchMs, y, "fl-f");
  b += T(X(350), gy - 6, "launch 700 ms", "tx-m xs mid");
  // ground
  b += bar(p.ground.outbound.startMs, p.ground.outbound.endMs, gy, "fl-gnd");
  b += bar(p.ground.compute.startMs, p.ground.compute.endMs, gy, "box", 'stroke-dasharray="3 2"');
  b += bar(p.ground.return.startMs, p.ground.return.endMs, gy, "fl-gnd");
  b += T(X(p.ground.outbound.endMs) + 3, gy - 6, "fiber 76 ms", "tx-gnd xs");
  b += T(X((p.ground.compute.startMs + p.ground.compute.endMs) / 2), gy + 12.5, "hold at the site", "tx-m xs mid");
  b += T(X(p.ground.return.endMs) + 4, gy + 12.5, "return 76 ms", "tx-gnd xs");
  // orbit
  b += bar(p.space.uplink.startMs, p.space.uplink.endMs, oy, "fl-orb", 'fill-opacity="0.55"');
  b += bar(p.space.laser.startMs, p.space.laser.endMs, oy, "fl-orb");
  b += bar(p.space.compute.startMs, p.space.compute.endMs, oy, "box", 'stroke-dasharray="3 2"');
  b += bar(p.space.return.startMs, p.space.return.endMs, oy, "fl-orb");
  b += T(X((p.space.uplink.startMs + p.space.uplink.endMs) / 2), oy + 31, "RF 208", "tx-orb xs mid");
  b += T(X((p.space.laser.startMs + p.space.laser.endMs) / 2), oy + 31, "optical 786 ms", "tx-orb xs mid");
  b += T(X((p.space.compute.startMs + p.space.compute.endMs) / 2), oy + 12.5, "hold at Starcloud-2", "tx-m xs mid");
  b += T(X((p.space.return.startMs + p.space.return.endMs) / 2), oy + 31, "return 994 ms", "tx-orb xs mid");
  // replies line
  const tr = 2400;
  b += L(X(tr), 22, X(tr), oy + 40, "st", 'stroke-dasharray="2 2" stroke-width="0.9"');
  b += T(X(tr) + 4, 66, "both replies in (2.4 s)", "tx xs");
  b += T(X(tr) + 4, 76, "hold ends 100 ms later", "tx-m xs");
  // axis
  const ay = 146;
  b += L(x0, ay, x1, ay, "st-m", 'stroke-width="0.8"');
  for (let t = 0; t <= 4500; t += 500) {
    b += L(X(t), ay, X(t), ay + 4, "st-m", 'stroke-width="0.8"');
    b += T(X(t), ay + 14, `${t / 1000} s`, "tx-m xs mid");
  }
  b += T(x0, H - 4, "Screen time = 48 × physical light-time. Orbit one-way 20.7 ms → 994 ms on screen; ground one-way 1.58 ms → 76 ms.", "tx-m s");
  save(id, svg(id, W, H, b, "Playback timeline for the worked example"));
}

// --------------------------------------------------------------------------
// Figure: metric pipeline
// --------------------------------------------------------------------------
function figMetrics() {
  const id = "metrics";
  const W = 640, H = 262;
  let b = "";
  const box = (x, y, w, h, title, lines, cls = "box") => {
    b += R(x, y, w, h, cls, 'rx="6"');
    b += T(x + w / 2, y + 17, title, "tx b mid");
    lines.forEach((l, i) => (b += T(x + w / 2, y + 31 + i * 12, l, `${i === 0 ? "tx" : "tx-m"} s mid`)));
  };
  const top = 22, bh = 64, mid = top + bh / 2;
  box(10, top, 140, bh, "Tokens N", ["prompt + completion", "reported by the provider", "(estimated if absent)"], "box-orb");
  b += L(150, mid, 248, mid, "st", `${arrow(id, "fg")}`);
  b += T(199, mid - 7, "× e ÷ 3,600", "tx s mid");
  b += T(199, mid + 14, "e = 1.11 J/token", "tx-m xs mid");
  box(250, top, 140, bh, "IT energy", ["E_{IT} (Wh)", "chips, memory, network"]);
  b += L(390, mid, 488, mid, "st", `${arrow(id, "fg")}`);
  b += T(439, mid - 7, "× PUE", "tx s mid");
  b += T(439, mid + 14, "1.09 · 1.10 · 1.04", "tx-m xs mid");
  b += T(439, mid + 24, "Google · other · orbit", "tx-m xs mid");
  box(490, top, 140, bh, "Facility energy", ["E = PUE · E_{IT} (Wh)", "IT plus cooling and power"]);
  // outputs
  const row2 = 128;
  b += P(`M530,${top + bh} C530,${row2 - 14} 405,${row2 - 22} 405,${row2 - 2}`, "st", `${arrow(id, "fg")}`);
  b += L(560, top + bh, 560, row2 - 2, "st", `${arrow(id, "fg")}`);
  box(330, row2, 150, 58, "Cooling water", ["W = w · E", "w = 1.1 mL/Wh on the ground", "w = 0 in orbit (radiators)"]);
  box(490, row2, 140, 58, "Electricity cost", ["$ = p · E / 1000", "p = $0.045/kWh ground", "p = $0.002/kWh orbit"]);
  // measured vs modeled key
  b += T(10, row2 + 12, "MEASURED", "tx-orb caps");
  b += T(84, row2 + 12, "token counts N, from each reply", "tx s");
  b += T(10, row2 + 30, "MODELED", "tx caps");
  b += T(84, row2 + 30, "e, PUE, w and p: fixed published", "tx s");
  b += T(84, row2 + 41, "parameters, the same for every query", "tx s");
  // route lane
  b += R(10, 208, 620, 46, "box-dash", 'rx="6"');
  b += T(22, 226, "Separate lane:", "tx b");
  b += T(100, 226, "frozen satellite positions + your pin → route geometry → network round trip (ms).", "tx");
  b += T(22, 242, "Provider call duration is measured and kept with each reply, but it is not shown as a route time.", "tx-m s");
  save(id, svg(id, W, H, b, "How measured tokens become energy, water and cost"));
}

// --------------------------------------------------------------------------
// Figure: round-trip budget for the worked example
// --------------------------------------------------------------------------
function figBudget() {
  const id = "budget";
  const W = 640, H = 120;
  const x0 = 120, x1 = 620, max = 45;
  const X = (ms) => x0 + (ms / max) * (x1 - x0);
  const e = A.example;
  let b = "";
  b += T(8, 30, "Ground", "tx-gnd b");
  b += T(8, 42, "to Ashburn, VA", "tx-m xs");
  b += R(X(0), 20, X(e.groundRttMs) - X(0), 22, "fl-gnd");
  b += T(X(e.groundRttMs) + 6, 35, `${e.groundRttMs.toFixed(2)} ms · 2 × 350 km of fiber at c/1.35`, "tx s");
  b += T(8, 74, "Orbit", "tx-orb b");
  b += T(8, 86, "to Starcloud-2", "tx-m xs");
  const segs = [
    [e.oneWayUplinkMs, "RF up", 0.55],
    [e.oneWayLaserMs, "optical out", 1],
    [e.oneWayLaserMs, "optical back", 1],
    [e.oneWayUplinkMs, "RF down", 0.55],
  ];
  let t = 0;
  for (const [ms, label, op] of segs) {
    b += R(X(t), 64, X(t + ms) - X(t), 22, "fl-orb sep", `fill-opacity="${op}"`);
    b += T((X(t) + X(t + ms)) / 2, 78.5, `${label} ${ms.toFixed(1)}`, `${op === 1 ? "fl-bg" : "tx"} xs mid b`);
    t += ms;
  }
  b += T(X(t) + 6, 79, `${e.orbitalRttMs.toFixed(1)} ms`, "tx s b");
  const ay = 100;
  b += L(x0, ay, x1, ay, "st-m", 'stroke-width="0.8"');
  for (let ms = 0; ms <= 45; ms += 5) {
    b += L(X(ms), ay, X(ms), ay + 4, "st-m", 'stroke-width="0.8"');
    b += T(X(ms), ay + 14, ms === 45 ? "45 ms" : `${ms}`, "tx-m xs mid");
  }
  save(id, svg(id, W, H, b, "Round-trip budget for New York at the epoch"));
}

figSystem();
figShell();
figGeometry();
figCatchments();
figTrack();
figCoverage();
figOrbitRtt();
figShare();
figPlayback();
figMetrics();
figBudget();
console.log("figures written to", OUT);
