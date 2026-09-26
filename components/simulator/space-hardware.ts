import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
    box(0.22, 0.27, 0.008, 0x363636, side * 0.17);
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
export function datacenter() {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    metalness: 0.25,
    roughness: 0.7,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x272727,
    roughness: 0.8,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xd8d8d8,
    roughness: 0.6,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  box(0.24, 0.008, 0.18, 0, 0, 0, dark);
  for (const x of [-0.065, 0.065]) {
    box(0.095, 0.055, 0.14, x, 0.032, 0, silver);
    box(0.1, 0.006, 0.145, x, 0.063, 0, white);
    for (let j = 0; j < 4; j++) {
      box(0.085, 0.003, 0.003, x, 0.017 + j * 0.01, 0.071, dark);
      box(
        0.024,
        0.012,
        0.021,
        x - 0.024 + (j % 2) * 0.048,
        0.072,
        -0.042 + Math.floor(j / 2) * 0.08,
        dark,
      );
    }
    for (let j = 0; j < 6; j++)
      box(0.002, 0.05, 0.003, x - 0.04 + j * 0.016, 0.032, 0.073, white);
  }
  return g;
}
