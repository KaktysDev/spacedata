import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ProviderId } from "@/lib/starcloud/catalog";

// Conceptual modular hardware, informed by Starcloud's solar / radiator / compute architecture.
// One merged mesh keeps detailed instancing inexpensive; all colors are neutral.
export function satelliteGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  function add(
    g: THREE.BufferGeometry,
    color: number,
    x = 0,
    y = 0,
    z = 0,
    rotation = 0,
  ) {
    const geometry = g.index ? g.toNonIndexed() : g;
    if (geometry !== g) g.dispose();
    geometry.rotateZ(rotation).translate(x, y, z);
    const c = new THREE.Color(color),
      colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute("uv");
    parts.push(geometry);
  }
  const box = (
    w: number,
    h: number,
    d: number,
    c: number,
    x = 0,
    y = 0,
    z = 0,
    r = 0,
  ) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, r);
  // Shielded compute bus, docking collars and four ribbed equipment bays.
  add(
    new THREE.CylinderGeometry(0.039, 0.039, 0.21, 12),
    0xbcbcbc,
    0,
    0,
    0.015,
  );
  for (const y of [-0.1, -0.055, 0, 0.055, 0.1])
    add(
      new THREE.CylinderGeometry(0.043, 0.043, 0.008, 16),
      0xe4e4e4,
      0,
      y,
      0.015,
    );
  for (const x of [-0.032, 0.032])
    for (let i = 0; i < 4; i++)
      box(0.019, 0.039, 0.071, 0x777777, x, -0.078 + i * 0.051, 0.016);
  box(0.036, 0.25, 0.014, 0xe0e0e0, 0, 0, -0.031);
  // Paired deployable arrays with individually inset cells, silver rails and busbars.
  for (const side of [-1, 1]) {
    box(0.2, 0.008, 0.008, 0xbcbcbc, side * 0.12, 0, 0);
    box(0.22, 0.27, 0.006, 0x8f8f8f, side * 0.17, 0, -0.007);
    for (let col = 0; col < 6; col++)
      for (let row = 0; row < 8; row++)
        box(
          0.032,
          0.03,
          0.0018,
          (row + col) % 3 === 0 ? 0x292929 : 0x191919,
          side * 0.17 - 0.0925 + col * 0.037,
          -0.116 + row * 0.033,
          0.0,
        );
    for (let row = 0; row < 8; row++)
      box(
        0.214,
        0.0015,
        0.002,
        0x888888,
        side * 0.17,
        -0.114 + row * 0.033,
        0.002,
      );
    for (let j = -1; j <= 1; j++)
      box(0.003, 0.27, 0.012, 0xc9c9c9, side * 0.17 + j * 0.108, 0, -0.004);
    box(0.218, 0.004, 0.013, 0xc9c9c9, side * 0.17, 0.135, -0.004);
    box(0.218, 0.004, 0.013, 0xc9c9c9, side * 0.17, -0.135, -0.004);
    // Thermal panels on the opposite face with cooling channels and structural bracing.
    box(0.115, 0.2, 0.005, 0xd5d5d5, side * 0.097, -0.24, -0.015);
    for (let j = 0; j < 9; j++)
      box(
        0.002,
        0.187,
        0.003,
        0x999999,
        side * 0.097 - 0.048 + j * 0.012,
        -0.24,
        -0.011,
      );
    box(0.006, 0.14, 0.009, 0xababab, side * 0.066, -0.13, -0.013, side * 0.35);
    box(0.004, 0.13, 0.005, 0xd9d9d9, side * 0.043, -0.22, -0.009);
    // Optical terminals: dark aperture within silver gimbal housing.
    add(
      new THREE.SphereGeometry(0.019, 10, 8),
      0xbebebe,
      side * 0.052,
      0.093,
      0.044,
    );
    const optic = new THREE.CylinderGeometry(0.012, 0.014, 0.025, 12);
    optic.rotateX(Math.PI / 2);
    add(optic, 0xe3e3e3, side * 0.052, 0.093, 0.061);
    const lens = new THREE.CircleGeometry(0.009, 12);
    add(lens, 0x141414, side * 0.052, 0.093, 0.075);
    // Truss diagonals, deployment hinges and propulsion nozzles.
    box(0.004, 0.18, 0.004, 0xa5a5a5, side * 0.09, 0.015, -0.021, side * 1.05);
    add(new THREE.SphereGeometry(0.009, 8, 6), 0xf1f1f1, side * 0.063, 0, 0);
    add(
      new THREE.ConeGeometry(0.009, 0.023, 10),
      0x444444,
      side * 0.027,
      -0.127,
      0.024,
      Math.PI,
    );
  }
  const antenna = new THREE.SphereGeometry(
    0.032,
    16,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  antenna.rotateX(Math.PI / 2);
  add(antenna, 0xdadada, 0, 0.015, 0.069);
  box(0.002, 0.085, 0.002, 0xe5e5e5, 0, 0.15, 0.015);
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

// The same bus / twin arrays / radiators silhouette for spacecraft only a few
// pixels wide. Detailed cells and gimbals appear when the camera gets closer.
export function satelliteOverviewGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    d: number,
    color: number,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  };
  box(0.075, 0.23, 0.075, 0xcacaca, 0, 0, 0.015);
  box(0.56, 0.012, 0.014, 0xbcbcbc);
  for (const side of [-1, 1]) {
    // Light array faces. At overview scale the old near-black cells fell
    // under the clear color, so the lane area disappeared and only stacked
    // buses remained. Close-up meshes keep the dark cell grid.
    box(0.22, 0.27, 0.008, 0xc4c4c4, side * 0.17);
    box(0.22, 0.007, 0.011, 0xc9c9c9, side * 0.17, 0.13);
    box(0.22, 0.007, 0.011, 0xc9c9c9, side * 0.17, -0.13);
    box(0.115, 0.2, 0.006, 0xd5d5d5, side * 0.097, -0.24, -0.015);
    box(0.025, 0.025, 0.035, 0xe3e3e3, side * 0.052, 0.093, 0.06);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}
export function hardwareMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.42,
    roughness: 0.53,
    side: THREE.DoubleSide,
  });
}

// The wordmark belongs on the compute craft. The paper's containers carry the
// name; stamping it on every access relay would be unreadable at 8,800 copies.
export function satelliteBrand() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(8, 8, 8, 0.93)";
    context.beginPath();
    context.roundRect(8, 8, 1008, 240, 28);
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 8;
    context.stroke();
    context.beginPath();
    context.ellipse(130, 128, 78, 44, -Math.PI / 4, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.moveTo(130, 38);
    context.lineTo(143, 115);
    context.lineTo(218, 128);
    context.lineTo(143, 141);
    context.lineTo(130, 218);
    context.lineTo(117, 141);
    context.lineTo(42, 128);
    context.lineTo(117, 115);
    context.closePath();
    context.fill();
    context.font = "bold 104px Arial, Helvetica, sans-serif";
    context.textBaseline = "middle";
    context.fillText("Starcloud", 255, 132);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(0.72, 0.18, 1);
  return sprite;
}

// Compact container cluster, separate from the access-relay mesh.
export function orbitalComputeCraft() {
  const craft = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xe6e6e6,
    metalness: 0.32,
    roughness: 0.48,
  });
  const frame = new THREE.MeshStandardMaterial({
    color: 0x8f8f8f,
    metalness: 0.68,
    roughness: 0.34,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x272727,
    metalness: 0.3,
    roughness: 0.68,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    part.position.set(x, y, z);
    craft.add(part);
  };
  box(0.71, 0.025, 0.045, 0, 0, 0, frame);
  for (const x of [-0.22, 0, 0.22]) {
    box(0.19, 0.28, 0.16, x, 0.025, 0.03, white);
    box(0.15, 0.018, 0.168, x, 0.176, 0.03, frame);
    box(0.15, 0.07, 0.006, x, -0.04, 0.114, dark);
  }
  for (const side of [-1, 1]) {
    box(0.14, 0.34, 0.012, side * 0.43, 0, -0.01, frame);
    for (let fin = -3; fin <= 3; fin++)
      box(0.13, 0.004, 0.024, side * 0.43, fin * 0.045, 0, white);
  }
  return craft;
}
type CampusMat = "silver" | "dark" | "white" | "steel" | "trim";
// One grayscale campus per company. Value contrast carries the silhouette;
// the globe stays neutral, so these are forms rather than brand colors.
export function datacenter(provider: ProviderId) {
  const g = new THREE.Group();
  const materials: Record<CampusMat, THREE.MeshStandardMaterial> = {
    silver: new THREE.MeshStandardMaterial({
      color: 0xb7b7b7,
      metalness: 0.34,
      roughness: 0.52,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x161616,
      roughness: 0.74,
      metalness: 0.12,
    }),
    white: new THREE.MeshStandardMaterial({
      color: 0xe7e7e7,
      roughness: 0.42,
      metalness: 0.08,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x8d8d8d,
      metalness: 0.62,
      roughness: 0.32,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x2c2c2c,
      roughness: 0.58,
      metalness: 0.22,
    }),
  };
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: CampusMat,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  const cyl = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    mat: CampusMat,
    rotZ = 0,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10),
      materials[mat],
    );
    mesh.rotation.z = rotZ;
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  if (provider === "gemini") googleCampus(box, cyl);
  else if (provider === "openai") azureCampus(box);
  else if (provider === "anthropic") awsCampus(box);
  else xaiCampus(box, cyl);
  return g;
}
type Box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: CampusMat,
) => void;
type Cyl = (
  radiusTop: number,
  radiusBottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  mat: CampusMat,
  rotZ?: number,
) => void;
// Google: two long halls and the exterior pipe gallery.
function googleCampus(box: Box, cyl: Cyl) {
  box(0.3, 0.008, 0.2, 0, 0.004, 0, "dark");
  for (const x of [-0.074, 0.074]) {
    box(0.118, 0.046, 0.15, x, 0.031, 0, "silver");
    box(0.122, 0.007, 0.154, x, 0.057, 0, "white");
    for (let i = 0; i < 5; i++)
      box(0.018, 0.012, 0.022, x, 0.066, -0.048 + i * 0.024, "trim");
    box(0.03, 0.028, 0.004, x, 0.024, 0.077, "dark");
  }
  cyl(0.007, 0.007, 0.27, 0, 0.03, 0.1, "steel", Math.PI / 2);
  for (const x of [-0.11, -0.04, 0.04, 0.11]) {
    cyl(0.005, 0.005, 0.034, x, 0.02, 0.1, "steel");
    box(0.012, 0.01, 0.028, x > 0 ? 0.1 : -0.1, 0.048, 0.086, "steel");
  }
  box(0.27, 0.03, 0.028, 0, 0.023, -0.096, "white");
  box(0.05, 0.016, 0.006, 0, 0.02, -0.082, "dark");
}
// Azure: one louvered hall, a generator yard, and a taller network block.
function azureCampus(box: Box) {
  box(0.26, 0.008, 0.24, 0, 0.004, 0, "dark");
  box(0.16, 0.07, 0.15, -0.01, 0.043, -0.01, "trim");
  box(0.166, 0.008, 0.156, -0.01, 0.082, -0.01, "steel");
  for (let i = 0; i < 8; i++)
    box(0.008, 0.058, 0.012, -0.062 + i * 0.016, 0.042, 0.072, "white");
  for (let i = 0; i < 4; i++)
    box(0.03, 0.02, 0.022, -0.115, 0.018, -0.04 + i * 0.032, "dark");
  box(0.052, 0.098, 0.052, 0.095, 0.057, -0.075, "silver");
  box(0.056, 0.007, 0.056, 0.095, 0.109, -0.075, "white");
  box(0.028, 0.04, 0.006, 0.122, 0.05, -0.075, "dark");
}
// AWS: three repeated modules and a transformer line.
function awsCampus(box: Box) {
  box(0.36, 0.008, 0.16, 0, 0.004, 0, "dark");
  for (const x of [-0.12, 0, 0.12]) {
    box(0.088, 0.048, 0.1, x, 0.032, 0, "silver");
    box(0.092, 0.007, 0.104, x, 0.059, 0, "white");
    box(0.04, 0.016, 0.038, x, 0.07, 0, "trim");
    box(0.022, 0.008, 0.02, x, 0.082, 0, "dark");
    box(0.02, 0.024, 0.004, x, 0.024, 0.052, "dark");
  }
  for (let i = 0; i < 6; i++)
    box(0.016, 0.016, 0.016, -0.1 + i * 0.04, 0.016, 0.078, "steel");
}
// xAI: one dense hall, cooling towers, and a packed substation yard.
function xaiCampus(box: Box, cyl: Cyl) {
  box(0.3, 0.008, 0.26, 0, 0.004, 0, "dark");
  box(0.18, 0.086, 0.14, -0.02, 0.051, -0.02, "trim");
  box(0.186, 0.008, 0.146, -0.02, 0.098, -0.02, "steel");
  box(0.05, 0.022, 0.06, -0.05, 0.113, -0.02, "dark");
  box(0.04, 0.018, 0.04, 0.02, 0.111, 0.01, "dark");
  for (const z of [-0.045, 0.03]) {
    cyl(0.02, 0.022, 0.078, 0.12, 0.047, z, "white");
    cyl(0.026, 0.026, 0.008, 0.12, 0.088, z, "steel");
  }
  box(0.012, 0.012, 0.05, 0.09, 0.028, 0.04, "steel");
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      box(
        0.016,
        0.022,
        0.016,
        -0.13 + i * 0.024,
        0.019,
        0.07 + j * 0.026,
        i === 1 ? "trim" : "steel",
      );
}
