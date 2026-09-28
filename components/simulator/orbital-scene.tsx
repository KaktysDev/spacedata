"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  SITES,
  PROVIDERS,
  type Location,
  type Site,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import {
  orbitalNodes,
  routeAt,
  NODE_COUNT,
  RING_INCLINATION_DEG,
  RING_RAAN_DEG,
  SHELL_ALTITUDE_MIN_KM,
  SHELL_ALTITUDE_MAX_KM,
  type OrbitalNode,
  interpolateLocation,
  type OrbitalRoute,
} from "@/lib/starcloud/network";
import {
  satelliteGeometry,
  satelliteOverviewGeometry,
  satelliteBrand,
  orbitalComputeCraft,
  hardwareMaterial,
  datacenter,
} from "./space-hardware";
import { ProviderLogo } from "./provider-picker";
export type Flight = { id: number; started: number; reduced: boolean };
type Props = {
  origin: Location;
  site: Site;
  provider: ProviderId;
  flight: Flight | null;
  answerReady: boolean;
  answerReadyAt: number | null;
  onLocation: (p: Location) => void;
  focusId: number;
  zoom: number;
  onReady: () => void;
};
const R = 3.5,
  // Thick visual shell. Physical altitudes span SHELL_ALTITUDE_MIN/MAX;
  // the on-screen radii are enlarged so that span reads as a wide band.
  BELT_INNER = 4.75,
  BELT_OUTER = 8.7,
  UP = new THREE.Vector3(0, 1, 0);
function displayRadius(altitudeKm: number) {
  const span = SHELL_ALTITUDE_MAX_KM - SHELL_ALTITUDE_MIN_KM;
  const t = (altitudeKm - SHELL_ALTITUDE_MIN_KM) / span;
  return BELT_INNER + Math.min(1, Math.max(0, t)) * (BELT_OUTER - BELT_INNER);
}
function position(p: Location, r = R) {
  const lat = (p.lat * Math.PI) / 180,
    lon = (p.lon * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  ).multiplyScalar(r);
}
function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geometries.add(m.geometry);
    if (m.material)
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((v) =>
        materials.add(v),
      );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
function line(points: THREE.Vector3[], opacity = 0.6, dashed = false) {
  const material = dashed
    ? new THREE.LineDashedMaterial({
        color: 0xffffff,
        transparent: true,
        opacity,
        dashSize: 0.027,
        gapSize: 0.025,
      })
    : new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity,
      });
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    material,
  );
  if (dashed) l.computeLineDistances();
  return l;
}
function surface(locations: Location[]) {
  const points: THREE.Vector3[] = [];
  for (let i = 1; i < locations.length; i++)
    for (let j = 0; j <= 64; j++)
      points.push(
        position(
          interpolateLocation(locations[i - 1], locations[i], j / 64),
          R + 0.008,
        ),
      );
  return points;
}
function follow(points: THREE.Vector3[], t: number, target: THREE.Vector3) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const wanted = t * lengths[lengths.length - 1];
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < wanted) i++;
  target
    .copy(points[i - 1])
    .lerp(
      points[i],
      (wanted - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1),
    );
}
const smooth = (t: number) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
// Where the connector meets the card. (x, y) is the card's bottom center.
function cardAnchor(
  x: number,
  y: number,
  w: number,
  h: number,
  x0: number,
  y0: number,
) {
  const left = x - w / 2,
    right = x + w / 2,
    top = y - h,
    bottom = y,
    cx = x,
    cy = (top + bottom) / 2,
    dx = x0 - cx,
    dy = y0 - cy;
  const candidates: number[] = [];
  if (dx !== 0) candidates.push((left - cx) / dx, (right - cx) / dx);
  if (dy !== 0) candidates.push((top - cy) / dy, (bottom - cy) / dy);
  let best = Infinity,
    ax = cx,
    ay = bottom;
  for (const t of candidates) {
    if (t <= 0) continue;
    const px = cx + dx * t,
      py = cy + dy * t;
    if (px < left - 1 || px > right + 1 || py < top - 1 || py > bottom + 1)
      continue;
    if (t < best) {
      best = t;
      ax = px;
      ay = py;
    }
  }
  return { x: ax, y: ay };
}
export function OrbitalScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    pin = useRef<HTMLButtonElement>(null),
    groundLabel = useRef<HTMLDivElement>(null),
    leaderSvg = useRef<SVGSVGElement>(null),
    leaderLine = useRef<SVGLineElement>(null),
    leaderSite = useRef<SVGCircleElement>(null),
    leaderCore = useRef<SVGCircleElement>(null),
    leaderJoint = useRef<SVGCircleElement>(null),
    spaceLabel = useRef<HTMLDivElement>(null),
    relayLabel = useRef<HTMLDivElement>(null),
    gatewayLabel = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  const [error, setError] = useState("");
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      const id = setTimeout(() => {
        setError(
          "3D is unavailable. You can still choose a location and compare a request.",
        );
        latest.current.onReady();
      }, 0);
      return () => clearTimeout(id);
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.setClearColor(0x030303, 1);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive Earth. Drag to rotate, scroll to zoom, double-click to move your pin.",
    );
    renderer.domElement.setAttribute("role", "img");
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(43, 1, 0.03, 100);
    // Three-quarter view over the central United States, the previous
    // black-and-white framing. An edge-on look down the terminator collapsed
    // every altitude and node into one dark line.
    const overview = position({ lat: 35, lon: -100 }, 1);
    const ringTilt = (RING_INCLINATION_DEG * Math.PI) / 180,
      ringNode = (RING_RAAN_DEG * Math.PI) / 180;
    const ringNormal = new THREE.Vector3(
      -Math.cos(ringNode) * Math.sin(ringTilt),
      Math.cos(ringTilt),
      Math.sin(ringNode) * Math.sin(ringTilt),
    ).normalize();
    const fitDistance = (w: number, h: number) => {
      const outer = BELT_OUTER + 0.55;
      const focal = h / (2 * Math.tan((43 * Math.PI) / 360));
      return Math.max(
        (outer * focal) / (w * 0.42),
        (outer * focal) / Math.max(120, (h - 355) / 2),
      );
    };
    let homeDistance = fitDistance(el.clientWidth, el.clientHeight);
    camera.position.copy(overview).multiplyScalar(homeDistance);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 4.18;
    controls.maxDistance = 38;
    controls.rotateSpeed = 0.45;
    controls.zoomSpeed = 0.6;
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3.5);
    sun.position.set(-8, 10, 12);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(10, -4, -5);
    scene.add(fill);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x090909 }),
    );
    scene.add(earth);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.002, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader:
          "varying vec3 n; varying vec3 v; void main(){vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}",
        fragmentShader:
          "varying vec3 n;varying vec3 v;void main(){float rim=pow(1.-max(0.,dot(n,v)),5.);gl_FragColor=vec4(vec3(.7),rim*.2);}",
      }),
    );
    scene.add(atmosphere);
    const abort = new AbortController();
    let disposed = false;
    const roundPoints = (
      coordinates: THREE.Vector3[],
      size: number,
      opacity: number,
    ) =>
      new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(coordinates),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { size: { value: size }, opacity: { value: opacity } },
          vertexShader:
            "uniform float size;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}",
          fragmentShader:
            "uniform float opacity;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(vec3(1.),opacity*(1.-smoothstep(.3,.5,d)));}",
        }),
      );
    fetch("/globe-land.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("map");
        return r.json();
      })
      .then(
        (data: {
          dots: [number, number][];
          borderDots: [number, number][];
        }) => {
          if (disposed) return;
          scene.add(
            roundPoints(
              data.dots.map(([lon, lat]) => position({ lon, lat }, R + 0.004)),
              1.65 * renderer.getPixelRatio(),
              0.42,
            ),
          );
          scene.add(
            roundPoints(
              data.borderDots.map(([lon, lat]) =>
                position({ lon, lat }, R + 0.005),
              ),
              1.85 * renderer.getPixelRatio(),
              0.8,
            ),
          );
          latest.current.onReady();
        },
      )
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(
            "Map detail could not load. Reload to restore country outlines.",
          );
          latest.current.onReady();
        }
      });
    const stars: THREE.Vector3[] = [];
    let seed = 917;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 850; i++) {
      const y = random() * 2 - 1,
        a = random() * Math.PI * 2;
      stars.push(
        new THREE.Vector3(
          Math.sqrt(1 - y * y) * Math.cos(a),
          y,
          Math.sqrt(1 - y * y) * Math.sin(a),
        ).multiplyScalar(35),
      );
    }
    scene.add(roundPoints(stars, 1.15 * renderer.getPixelRatio(), 0.38));
    const hardware = satelliteGeometry(),
      hardwareMat = hardwareMaterial();
    const detailCount = 384,
      detailed = new THREE.InstancedMesh(hardware, hardwareMat, detailCount);
    detailed.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    detailed.frustumCulled = false;
    scene.add(detailed);
    const distant = new THREE.InstancedMesh(
      satelliteOverviewGeometry(),
      hardwareMat,
      NODE_COUNT,
    );
    distant.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    distant.frustumCulled = false;
    scene.add(distant);
    const routeHardwareMat = hardwareMat.clone();
    routeHardwareMat.emissive.setHex(0xffffff);
    routeHardwareMat.emissiveIntensity = 0.3;
    const selected = new THREE.InstancedMesh(hardware, routeHardwareMat, 16);
    selected.frustumCulled = false;
    selected.count = 0;
    scene.add(selected);
    const odcCraft = orbitalComputeCraft(),
      computeBrand = satelliteBrand();
    scene.add(odcCraft, computeBrand);
    odcCraft.visible = computeBrand.visible = false;
    selected.visible = false;
    const carrier = new THREE.Mesh(hardware, routeHardwareMat);
    carrier.scale.setScalar(0.36);
    scene.add(carrier);
    const matrix = new THREE.Object3D();
    const radialAxis = new THREE.Vector3(),
      acrossAxis = new THREE.Vector3(),
      alongAxis = new THREE.Vector3(),
      craftBasis = new THREE.Matrix4();
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    scene.add(originMarker);
    let dc = new THREE.Group();
    scene.add(dc);
    const providerGroup = new THREE.Group();
    scene.add(providerGroup);
    let campuses: { site: Site; object: THREE.Object3D }[] = [];
    const routes = new THREE.Group();
    scene.add(routes);
    const fiberGroup = new THREE.Group(),
      orbitalGroup = new THREE.Group();
    routes.add(fiberGroup, orbitalGroup);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const groundDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 12, 8),
        dotMat,
      ),
      spaceDot = groundDot.clone();
    scene.add(groundDot, spaceDot);
    const gateway = new THREE.Mesh(
      new THREE.ConeGeometry(0.034, 0.055, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xe5e5e5,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(gateway);
    let network: OrbitalRoute | null = null,
      nodes: OrbitalNode[] = [],
      vectors: THREE.Vector3[] = [],
      groundPath: THREE.Vector3[] = [],
      feederPath: THREE.Vector3[] = [],
      laserPath: THREE.Vector3[] = [],
      uplink: THREE.Vector3[] = [],
      returnPath: THREE.Vector3[] = [],
      computeVector = new THREE.Vector3();
    let routeKey = "",
      providerKey = "",
      lastNodeTime = -Infinity,
      lastDetailTime = -Infinity,
      lastFlight = 0,
      lastFocus = latest.current.focusId,
      lastZoom = latest.current.zoom;
    let routeTarget = new THREE.Vector3(),
      routeCamera = new THREE.Vector3(),
      riseTarget = new THREE.Vector3(),
      riseCamera = new THREE.Vector3();
    const idleCamera = camera.position.clone(),
      idleTarget = new THREE.Vector3(),
      // Abeam side chosen on the way up. Kept so the reversed return path
      // does not swap the camera to the other side of the shell.
      sideReference = new THREE.Vector3();
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      epoch = Date.now(),
      clockStart = performance.now();
    let returning: {
      at: number;
      camera: THREE.Vector3;
      target: THREE.Vector3;
    } | null = null;
    // Pose the follow camera held when the reply turned around. Blended into
    // the live return pose so the look direction does not pop 180°.
    let returnHandoff: {
      at: number;
      camera: THREE.Vector3;
      target: THREE.Vector3;
    } | null = null;
    let focusing: {
      at: number;
      camera: THREE.Vector3;
      to: THREE.Vector3;
    } | null = null;
    let width = 1,
      height = 1,
      frame = 0,
      drag = false,
      pointerId = -1;
    const resize = () => {
      width = el.clientWidth;
      height = el.clientHeight;
      renderer.setSize(width, height);
      const fit = fitDistance(width, height);
      camera.position.multiplyScalar(fit / homeDistance);
      homeDistance = fit;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);
    resize();
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const hit = (e: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(earth)[0]?.point;
    };
    const placePoint = (v: THREE.Vector3) => {
      const n = v.clone().normalize();
      latest.current.onLocation({
        lat: (Math.asin(n.y) * 180) / Math.PI,
        lon: (Math.atan2(n.x, n.z) * 180) / Math.PI,
      });
    };
    const down = (e: PointerEvent) => {
      if (latest.current.flight) return;
      e.stopPropagation();
      drag = true;
      pointerId = e.pointerId;
      controls.enabled = false;
      pin.current?.setPointerCapture(pointerId);
      pin.current?.classList.add("dragging");
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const v = hit(e);
        if (v) placePoint(v);
      }
    };
    const end = () => {
      drag = false;
      controls.enabled = !latest.current.flight;
      pin.current?.classList.remove("dragging");
      if (pointerId >= 0 && pin.current?.hasPointerCapture(pointerId))
        pin.current.releasePointerCapture(pointerId);
      pointerId = -1;
    };
    const place = (e: MouseEvent) => {
      if (!latest.current.flight) {
        const v = hit(e);
        if (v) placePoint(v);
      }
    };
    const button = pin.current;
    button?.addEventListener("pointerdown", down);
    button?.addEventListener("pointermove", move);
    button?.addEventListener("pointerup", end);
    button?.addEventListener("pointercancel", end);
    renderer.domElement.addEventListener("dblclick", place);
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "3D paused. Reload to restore the globe; comparison is still available.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const occupied: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }[] = [];
    function project(
      node: HTMLElement | null,
      v: THREE.Vector3,
      show = true,
      dx = 0,
      dy = -18,
    ) {
      if (!node) return;
      const projected = v.clone().project(camera),
        x0 = (projected.x * 0.5 + 0.5) * width,
        y0 = (-projected.y * 0.5 + 0.5) * height;
      const isPin = node === pin.current,
        w = node.offsetWidth,
        h = node.offsetHeight;
      const x = THREE.MathUtils.clamp(x0 + dx, w / 2 + 16, width - w / 2 - 16);
      let y = Math.max(90 + h, y0 + dy);
      const box = () => ({
        left: x - w / 2,
        right: x + w / 2,
        top: y - h,
        bottom: y + 8,
      });
      for (let attempt = 0; attempt < 4 && !isPin; attempt++) {
        const b = box();
        if (
          !occupied.some(
            (a) =>
              b.left < a.right + 10 &&
              b.right > a.left - 10 &&
              b.top < a.bottom + 10 &&
              b.bottom > a.top - 10,
          )
        )
          break;
        y -= h + 12;
      }
      const b = box(),
        panel = el?.parentElement
          ?.querySelector(".composer, .journey-status")
          ?.getBoundingClientRect();
      const blocked =
        panel &&
        b.left < panel.right &&
        b.right > panel.left &&
        b.top < panel.bottom &&
        b.bottom > panel.top;
      // Segment/sphere occlusion works for both elevated satellites and ground anchors.
      const ray = v.clone().sub(camera.position),
        t = THREE.MathUtils.clamp(
          -camera.position.dot(ray) / ray.lengthSq(),
          0,
          1,
        );
      const occulted =
        camera.position.clone().addScaledVector(ray, t).length() < R - 0.003;
      const visible =
        show &&
        !occulted &&
        !blocked &&
        b.top > 78 &&
        b.bottom < height - 44 &&
        x0 > 0 &&
        x0 < width &&
        projected.z < 1;
      node.style.visibility = visible ? "visible" : "hidden";
      node.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      if (visible && !isPin) occupied.push(b);
      if (node === groundLabel.current && leaderSvg.current) {
        leaderSvg.current.style.visibility = visible ? "visible" : "hidden";
        if (visible && w > 0 && h > 0) {
          const anchor = cardAnchor(x, y, w, h, x0, y0);
          leaderLine.current?.setAttribute("x1", `${anchor.x}`);
          leaderLine.current?.setAttribute("y1", `${anchor.y}`);
          leaderLine.current?.setAttribute("x2", `${x0}`);
          leaderLine.current?.setAttribute("y2", `${y0}`);
          for (const dot of [leaderSite.current, leaderCore.current]) {
            dot?.setAttribute("cx", `${x0}`);
            dot?.setAttribute("cy", `${y0}`);
          }
          leaderJoint.current?.setAttribute("cx", `${anchor.x}`);
          leaderJoint.current?.setAttribute("cy", `${anchor.y}`);
        }
      }
    }
    function orient(
      instance: THREE.InstancedMesh,
      index: number,
      v: THREE.Vector3,
      scale: number,
    ) {
      // Dawn-dusk: panel normal (local Z) faces the sun, which is the orbit
      // normal. The array span (local X) lies in the orbital plane, so the
      // shell stays a thin terminator line instead of a wide cross-track band.
      radialAxis.copy(v).normalize();
      acrossAxis.copy(ringNormal);
      alongAxis.crossVectors(acrossAxis, radialAxis);
      if (alongAxis.lengthSq() < 1e-8) alongAxis.crossVectors(acrossAxis, UP);
      alongAxis.normalize();
      radialAxis.crossVectors(alongAxis, acrossAxis).normalize();
      craftBasis.makeBasis(alongAxis, radialAxis, acrossAxis);
      matrix.quaternion.setFromRotationMatrix(craftBasis);
      matrix.position.copy(v);
      matrix.scale.setScalar(scale);
      matrix.updateMatrix();
      instance.setMatrixAt(index, matrix.matrix);
    }
    function samplePath(from: THREE.Vector3, to: THREE.Vector3, t: number) {
      const minR = R + 1.45;
      const ax = to.x - from.x,
        ay = to.y - from.y,
        az = to.z - from.z;
      const lenSq = ax * ax + ay * ay + az * az;
      if (lenSq < 1e-12) return from.clone();
      const closestT = THREE.MathUtils.clamp(
        -(from.x * ax + from.y * ay + from.z * az) / lenSq,
        0,
        1,
      );
      const cx = from.x + ax * closestT,
        cy = from.y + ay * closestT,
        cz = from.z + az * closestT;
      const closestLen = Math.hypot(cx, cy, cz);
      // World-space lerp. A radial slerp ends on the ray through the satellite
      // and never settles on the offset side pose.
      if (closestLen >= minR) return from.clone().lerp(to, t);
      // Chord would enter the keep-out sphere. Bulge it, in world space, just
      // outside R+1.45. Endpoints stay exact so a blend can hand off without a pop.
      let dx: number, dy: number, dz: number;
      if (closestLen > 1e-4) {
        dx = cx / closestLen;
        dy = cy / closestLen;
        dz = cz / closestLen;
      } else {
        const px = from.y * to.z - from.z * to.y,
          py = from.z * to.x - from.x * to.z,
          pz = from.x * to.y - from.y * to.x,
          pl = Math.hypot(px, py, pz);
        if (pl > 1e-4) {
          dx = px / pl;
          dy = py / pl;
          dz = pz / pl;
        } else {
          dx = 0;
          dy = 1;
          dz = 0;
        }
      }
      const limit = minR + 0.08;
      const clearance = (radius: number, s: number) => {
        const u = 1 - s,
          w = 2 * u * s * radius;
        return Math.hypot(
          u * u * from.x + w * dx + s * s * to.x,
          u * u * from.y + w * dy + s * s * to.y,
          u * u * from.z + w * dz + s * s * to.z,
        );
      };
      let radius = limit;
      for (let pass = 0; pass < 14 && radius < 80; pass++) {
        let deficit = 0;
        for (let i = 1; i < 64; i++) {
          const d = clearance(radius, i / 64);
          if (d < limit) deficit = Math.max(deficit, limit - d);
        }
        if (deficit === 0) break;
        radius += deficit + 0.05;
      }
      const u = 1 - t,
        w = 2 * u * t * radius;
      return new THREE.Vector3(
        u * u * from.x + w * dx + t * t * to.x,
        u * u * from.y + w * dy + t * t * to.y,
        u * u * from.z + w * dz + t * t * to.z,
      );
    }
    function cameraBetween(a: THREE.Vector3, b: THREE.Vector3, t: number) {
      camera.position.copy(samplePath(a, b, t));
    }
    function blendPose(
      fromCamera: THREE.Vector3,
      fromTarget: THREE.Vector3,
      toCamera: THREE.Vector3,
      toTarget: THREE.Vector3,
      t: number,
    ) {
      const k = smooth(t);
      if (k >= 1) {
        camera.position.copy(toCamera);
        controls.target.copy(toTarget);
        return;
      }
      camera.position.copy(samplePath(fromCamera, toCamera, k));
      controls.target.lerpVectors(fromTarget, toTarget, k);
    }
    function pathTangent(points: THREE.Vector3[], point: THREE.Vector3) {
      if (points.length < 2) return new THREE.Vector3(1, 0, 0);
      let best = -1,
        bestD = Infinity;
      const scratch = new THREE.Vector3();
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          ab = b.clone().sub(a);
        const len2 = ab.lengthSq();
        // A repeated waypoint is a vertex. Using it would flip the tangent 180°.
        if (len2 < 1e-8) continue;
        const span = THREE.MathUtils.clamp(
          scratch.copy(point).sub(a).dot(ab) / len2,
          0,
          1,
        );
        const d = scratch.copy(a).lerp(b, span).distanceToSquared(point);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 1) return new THREE.Vector3(1, 0, 0);
      return points[best].clone().sub(points[best - 1]).normalize();
    }
    function sidePose(point: THREE.Vector3, points: THREE.Vector3[]) {
      const radial = point.clone().normalize();
      const tangent = pathTangent(points.length > 1 ? points : [point, point.clone().add(UP)], point);
      tangent.addScaledVector(radial, -tangent.dot(radial));
      if (tangent.lengthSq() < 1e-8) tangent.crossVectors(UP, radial);
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      tangent.normalize();
      const side = new THREE.Vector3().crossVectors(radial, tangent);
      if (side.lengthSq() < 1e-6) side.crossVectors(radial, UP);
      side.normalize();
      if (sideReference.lengthSq() > 0.25 && side.dot(sideReference) < 0)
        side.negate();
      sideReference.copy(side);
      // Look stays in the local horizontal plane, so Earth stays outside the frame.
      const radialOffset = 0.55;
      return {
        camera: point
          .clone()
          .addScaledVector(side, 2.4)
          .addScaledVector(radial, radialOffset),
        target: point
          .clone()
          .addScaledVector(tangent, 2.2)
          .addScaledVector(radial, radialOffset),
      };
    }
    function outwardPose(point: THREE.Vector3) {
      const radial = point.clone().normalize();
      const lateral = new THREE.Vector3().crossVectors(radial, UP);
      if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
      else lateral.normalize();
      if (sideReference.lengthSq() > 0.25 && lateral.dot(sideReference) < 0)
        lateral.negate();
      const cameraPos = point
        .clone()
        .addScaledVector(radial, 4.4)
        .addScaledVector(lateral, 2.2);
      if (cameraPos.length() < R + 1.45) cameraPos.setLength(R + 1.45);
      return { camera: cameraPos, target: point.clone() };
    }
    function trackedPose(
      point: THREE.Vector3,
      points: THREE.Vector3[],
      elapsed: number,
    ) {
      const side = sidePose(point, points);
      // The abeam pose is for the shell. Once the reply is back near the
      // surface, pull outward and look at the dot itself.
      if (elapsed < 10400) return side;
      const inner = R + 0.8,
        outer = R + 1.6;
      const alt = point.length();
      if (alt >= outer) return side;
      const pulled = outwardPose(point);
      if (alt <= inner) return pulled;
      const k = smooth((outer - alt) / (outer - inner));
      return {
        camera: samplePath(side.camera, pulled.camera, k),
        target: side.target.clone().lerp(pulled.target, k),
      };
    }
    function render(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      const p = latest.current,
        active = !!p.flight;
      hardwareMat.color.setScalar(active ? 0.28 : 1);
      const networkTime =
        p.flight?.id ?? (motion.matches ? epoch : epoch + now - clockStart);
      const nextRoute = `${p.provider},${p.origin.lat},${p.origin.lon},${p.site.name},${p.flight?.id ?? 0}`;
      const changed = nextRoute !== routeKey;
      if (changed || (!active && now - lastNodeTime > 250)) {
        if (active) {
          network = routeAt(p.origin, networkTime, p.site);
          nodes = network.nodes;
        } else {
          nodes = orbitalNodes(networkTime);
        }
        // Display radius only. Routing still uses each node's altitude in km.
        // The base is farther out than the previous shell so the ring clears Earth.
        vectors = nodes.map((n) => position(n, displayRadius(n.altitudeKm)));
        lastNodeTime = now;
        lastDetailTime = -Infinity;
      }
      if (providerKey !== p.provider) {
        providerKey = p.provider;
        disposeTree(providerGroup);
        providerGroup.clear();
        scene.remove(dc);
        disposeTree(dc);
        dc = datacenter(p.provider);
        scene.add(dc);
        campuses = [];
        for (const site of SITES[p.provider]) {
          const campus = datacenter(p.provider);
          campus.scale.setScalar(0.42);
          campus.position.copy(position(site, R + 0.012));
          campus.quaternion.setFromUnitVectors(
            UP,
            campus.position.clone().normalize(),
          );
          providerGroup.add(campus);
          campuses.push({ site, object: campus });
          const marker = new THREE.Mesh(
            new THREE.RingGeometry(0.024, 0.031, 24),
            new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.55,
              side: THREE.DoubleSide,
            }),
          );
          marker.position.copy(position(site, R + 0.01));
          marker.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            marker.position.clone().normalize(),
          );
          providerGroup.add(marker);
        }
      }
      if (changed) {
        routeKey = nextRoute;
        originMarker.position.copy(position(p.origin, R + 0.016));
        dc.position.copy(position(p.site, R + 0.014));
        dc.quaternion.setFromUnitVectors(UP, dc.position.clone().normalize());
        dc.scale.setScalar(0.7);
        for (const campus of campuses)
          campus.object.visible = !(
            campus.site.name === p.site.name &&
            campus.site.lat === p.site.lat &&
            campus.site.lon === p.site.lon
          );
        if (network && active) {
          disposeTree(fiberGroup);
          fiberGroup.clear();
          disposeTree(orbitalGroup);
          orbitalGroup.clear();
          groundPath = surface(network.ground.points);
          feederPath =
            network.gatewayRoute.km > 0
              ? surface(network.gatewayRoute.points)
              : [];
          carrier.position.copy(vectors[network.ingress].clone());
          carrier.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            vectors[network.ingress].clone().normalize(),
          );
          uplink = [
            position(network.uplinkAnchor, R + 0.016),
            vectors[network.ingress].clone(),
          ];
          laserPath = network.hops.map((i) => vectors[i].clone());
          computeVector = laserPath[laserPath.length - 1].clone();
          returnPath = [
            ...laserPath.slice().reverse(),
            ...uplink.slice().reverse().slice(1),
            ...feederPath.slice().reverse().slice(1),
          ];
          fiberGroup.add(line(groundPath, 0.8, true));
          if (feederPath.length) orbitalGroup.add(line(feederPath, 0.65, true));
          orbitalGroup.add(line(uplink, 0.65), line(laserPath, 0.85));
          for (const segment of [uplink, laserPath])
            for (let i = 1; i < segment.length; i++) {
              const a = segment[i - 1],
                b = segment[i],
                delta = b.clone().sub(a);
              const beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.009, 0.009, delta.length(), 6),
                new THREE.MeshBasicMaterial({
                  color: 0xffffff,
                  transparent: true,
                  opacity: 0.7,
                }),
              );
              beam.position.copy(a).lerp(b, 0.5);
              beam.quaternion.setFromUnitVectors(UP, delta.normalize());
              orbitalGroup.add(beam);
            }
          for (const stop of network.ground.stops) {
            const node = new THREE.Mesh(
              new THREE.SphereGeometry(0.017, 8, 6),
              dotMat.clone(),
            );
            node.position.copy(position(stop, R + 0.013));
            fiberGroup.add(node);
          }
          gateway.position.copy(position(network.gateway, R + 0.022));
          gateway.quaternion.setFromUnitVectors(
            UP,
            gateway.position.clone().normalize(),
          );
          const relayHops = network.hops.slice(0, -1);
          const hopCount = Math.min(relayHops.length, 16);
          relayHops.slice(0, hopCount).forEach((index, i) =>
            orient(selected, i, vectors[index], 0.39),
          );
          selected.count = hopCount;
          selected.instanceMatrix.needsUpdate = true;
          odcCraft.position.copy(computeVector);
          radialAxis.copy(computeVector).normalize();
          acrossAxis.copy(ringNormal);
          alongAxis.crossVectors(acrossAxis, radialAxis);
          if (alongAxis.lengthSq() < 1e-8) alongAxis.crossVectors(acrossAxis, UP);
          alongAxis.normalize();
          radialAxis.crossVectors(alongAxis, acrossAxis).normalize();
          craftBasis.makeBasis(alongAxis, radialAxis, acrossAxis);
          odcCraft.quaternion.setFromRotationMatrix(craftBasis);
          computeBrand.position
            .copy(computeVector)
            .addScaledVector(computeVector.clone().normalize(), 0.28);
          const pathPoints = [
            position(p.origin, R),
            position(p.site, R),
            position(network.uplinkAnchor, R),
            ...network.hops.map((i) => vectors[i]),
            computeVector,
          ];
          const box = new THREE.Box3().setFromPoints(pathPoints);
          const center = box.getCenter(new THREE.Vector3());
          const originDir = position(p.origin, 1);
          const focusCenter =
            center.length() < R * 0.35
              ? position(p.origin, R).lerp(computeVector, 0.45)
              : center;
          const viewDir = focusCenter
            .clone()
            .normalize()
            .addScaledVector(originDir, 0.22)
            .normalize();
          const side = new THREE.Vector3().crossVectors(viewDir, UP);
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
          side.normalize();
          routeTarget = focusCenter.clone();
          const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
          const verticalFov = (camera.fov * Math.PI) / 180;
          const horizontalFov =
            2 *
            Math.atan(Math.tan(verticalFov / 2) * Math.max(width / height, 0.5));
          const fitted =
            (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.4;
          const dist = THREE.MathUtils.clamp(
            Math.max(fitted, homeDistance * 0.78),
            6,
            homeDistance,
          );
          routeCamera = focusCenter
            .clone()
            .addScaledVector(viewDir, dist)
            .addScaledVector(side, dist * 0.06);
          if (routeCamera.length() < R + 1.4) routeCamera.setLength(R + 1.4);
          const anchor = position(network.uplinkAnchor, R);
          const radial = anchor.clone().normalize();
          const riseSide = new THREE.Vector3().crossVectors(radial, UP);
          if (riseSide.lengthSq() < 1e-6) riseSide.set(1, 0, 0);
          riseSide.normalize();
          const uplinkHeight = Math.max(
            0.9,
            vectors[network.ingress].length() - R,
          );
          riseCamera = radial
            .clone()
            .multiplyScalar(R + uplinkHeight * 0.72)
            .addScaledVector(riseSide, Math.min(2.4, uplinkHeight * 0.9));
          riseTarget = anchor.clone().lerp(vectors[network.ingress], 0.62);
        }
      }
      if (now - lastDetailTime > 400) {
        // Pixel-based detail preserves the hardware up close without drawing
        // thousands of subpixel solar cells in the overview.
        const activeIds = new Set(active ? network?.hops : []);
        // 0.11 × the 0.56 array span is 0.062. At the display radius a
        // half-degree of cross-track is about 0.05, so neighbors still read
        // as separate craft where the band is ragged.
        const scale = 0.2;
        const focal = height / (2 * Math.tan((43 * Math.PI) / 360));
        const candidates = vectors
          .map((v, i) => ({ i, distance: v.distanceTo(camera.position) }))
          .filter(
            ({ i, distance }) =>
              !activeIds.has(i) && (0.56 * scale * focal) / distance > 6,
          )
          .sort((a, b) => a.distance - b.distance)
          .slice(0, detailCount);
        const detailIds = new Set(candidates.map(({ i }) => i));
        vectors.forEach((v, i) =>
          orient(
            distant,
            i,
            v,
            activeIds.has(i) || detailIds.has(i) ? 0 : scale,
          ),
        );
        candidates.forEach(({ i }, slot) =>
          orient(detailed, slot, vectors[i], scale),
        );
        detailed.count = candidates.length;
        detailed.instanceMatrix.needsUpdate = true;
        distant.instanceMatrix.needsUpdate = true;
        lastDetailTime = now;
      }
      if (p.focusId !== lastFocus) {
        lastFocus = p.focusId;
        const focusDirection = position(p.origin, 1);
        focusing = {
          at: now,
          camera: camera.position.clone(),
          to: focusDirection.multiplyScalar(fitDistance(width, height)),
        };
      }
      if (p.zoom !== lastZoom) {
        camera.position
          .sub(controls.target)
          .multiplyScalar(p.zoom > lastZoom ? 0.87 : 1.15)
          .clampLength(4.18, 38)
          .add(controls.target);
        lastZoom = p.zoom;
        focusing = null;
      }
      const offset = -(width < 700 ? 20 : 72) / height;
      const rawElapsed = p.flight ? Math.max(0, now - p.flight.started) : 0;
      const answerAt = p.answerReadyAt;
      const visualElapsed = p.flight?.reduced
        ? answerAt === null
          ? 10399
          : 10400
        : answerAt === null
          ? Math.min(rawElapsed, 10399)
          : Math.max(0, rawElapsed - Math.max(0, answerAt - 10400));
      let spacePath = laserPath;
      if (active && network) {
        const ms = visualElapsed;
        if (ms < 2200) follow(groundPath, ms / 2200, groundDot.position);
        else if (ms < 10400) groundDot.position.copy(groundPath.at(-1)!);
        else follow(groundPath, 1 - (ms - 10400) / 4400, groundDot.position);
        if (ms < 2800) {
          const feederMs = feederPath.length ? 900 : 0;
          if (feederMs && ms < feederMs) {
            spacePath = feederPath;
            follow(feederPath, ms / feederMs, spaceDot.position);
          } else {
            spacePath = uplink;
            follow(
              uplink,
              (ms - feederMs) / (2800 - feederMs),
              spaceDot.position,
            );
          }
        } else if (ms < 6200) {
          spacePath = laserPath;
          follow(laserPath, (ms - 2800) / 3400, spaceDot.position);
        } else if (ms < 10400) {
          spacePath = laserPath;
          spaceDot.position.copy(laserPath.at(-1)!);
        } else {
          spacePath = returnPath;
          follow(returnPath, (ms - 10400) / 4400, spaceDot.position);
        }
        spaceDot.scale.setScalar(
          ms >= 6200 && ms < 10400 ? 1 + Math.sin(now / 160) * 0.25 : 1,
        );
      }
      if (p.flight) {
        if (lastFlight !== p.flight.id) {
          lastFlight = p.flight.id;
          idleCamera.copy(camera.position);
          idleTarget.copy(controls.target);
          sideReference.set(0, 0, 0);
          returning = null;
          focusing = null;
          returnHandoff = null;
        }
        if (!p.flight.reduced) {
          if (visualElapsed < 2400) {
            blendPose(
              idleCamera,
              idleTarget,
              routeCamera,
              routeTarget,
              visualElapsed / 2400,
            );
          } else if (visualElapsed < 4800) {
            blendPose(
              routeCamera,
              routeTarget,
              riseCamera,
              riseTarget,
              (visualElapsed - 2400) / 2400,
            );
          } else if (network && spacePath.length > 1) {
            const pose = trackedPose(
              spaceDot.position,
              spacePath,
              visualElapsed,
            );
            const followBlend = (visualElapsed - 4800) / 2000;
            if (followBlend < 1)
              blendPose(
                riseCamera,
                riseTarget,
                pose.camera,
                pose.target,
                followBlend,
              );
            else if (visualElapsed >= 10400) {
              if (!returnHandoff)
                returnHandoff = {
                  at: now,
                  camera: camera.position.clone(),
                  target: controls.target.clone(),
                };
              const handoff = (now - returnHandoff.at) / 700;
              if (handoff < 1)
                blendPose(
                  returnHandoff.camera,
                  returnHandoff.target,
                  pose.camera,
                  pose.target,
                  handoff,
                );
              else {
                camera.position.copy(pose.camera);
                controls.target.copy(pose.target);
              }
            } else {
              camera.position.copy(pose.camera);
              controls.target.copy(pose.target);
            }
          }
        }
      } else if (lastFlight) {
        lastFlight = 0;
        returnHandoff = null;
        if (
          camera.position.distanceTo(idleCamera) > 0.01 ||
          controls.target.distanceTo(idleTarget) > 0.01
        )
          returning = {
            at: now,
            camera: camera.position.clone(),
            target: controls.target.clone(),
          };
      }
      if (returning) {
        const t = motion.matches ? 1 : smooth((now - returning.at) / 1300);
        cameraBetween(returning.camera, idleCamera, t);
        controls.target.lerpVectors(returning.target, idleTarget, t);
        if (t === 1) returning = null;
      }
      if (focusing && !active) {
        const t = motion.matches ? 1 : smooth((now - focusing.at) / 1100);
        cameraBetween(focusing.camera, focusing.to, t);
        controls.target.set(0, 0, 0);
        if (t === 1) focusing = null;
      }
      controls.enabled = !active && !drag && !returning && !focusing;
      controls.enableDamping = controls.enabled;
      controls.minDistance = active ? 1.7 : 4.18;
      camera.setViewOffset(width, height, 0, -height * offset, width, height);
      if (controls.enabled) controls.update();
      else camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      routes.visible = active;
      selected.visible = active;
      odcCraft.visible = computeBrand.visible = active;
      gateway.visible = active && feederPath.length > 0;
      carrier.visible = active;
      groundDot.visible = spaceDot.visible = active;
      if (active) orbitalGroup.visible = true;
      occupied.length = 0;
      const labelTime = p.flight ? visualElapsed : 0;
      project(pin.current, originMarker.position, !active, 0, 0);
      project(
        groundLabel.current,
        dc.position,
        !active || labelTime < 2200,
        width < 700 ? -70 : -96,
        -30,
      );
      if (network) {
        // One stage callout at a time leaves the actual links unobstructed.
        const ms = labelTime;
        project(gatewayLabel.current, gateway.position, false, 80, -15);
        project(
          relayLabel.current,
          carrier.position,
          active && ms < 2800,
          -70,
          -25,
        );
        project(
          spaceLabel.current,
          computeVector,
          active && ms >= 2800 && ms < 10400,
          70,
          -30,
        );
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      button?.removeEventListener("pointerdown", down);
      button?.removeEventListener("pointermove", move);
      button?.removeEventListener("pointerup", end);
      button?.removeEventListener("pointercancel", end);
      renderer.domElement.removeEventListener("dblclick", place);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      className="orbital-scene"
      data-provider={props.provider}
      data-satellites={NODE_COUNT}
    >
      <button
        ref={pin}
        className="origin-pin"
        aria-label="Drag your location pin. Use Location for keyboard controls."
        title="Drag to move your location"
      >
        <span className="pin-head">
          <span />
        </span>
        <span className="pin-caption">YOU</span>
      </button>
      <div ref={groundLabel} className="scene-label ground-label">
        <div className="label-card" key={props.provider}>
          <span className="datacenter-mark">
            <ProviderLogo provider={props.provider} />
          </span>
          <span className="datacenter-id">
            <strong>{props.site.name}</strong>
            <small>{PROVIDERS[props.provider].company}</small>
          </span>
        </div>
      </div>
      <svg ref={leaderSvg} className="site-leader" aria-hidden="true">
        <line ref={leaderLine} x1="0" y1="0" x2="0" y2="0" />
        <circle ref={leaderSite} className="leader-site" cx="0" cy="0" r="5" />
        <circle ref={leaderCore} className="leader-core" cx="0" cy="0" r="1.5" />
        <circle
          ref={leaderJoint}
          className="leader-joint"
          cx="0"
          cy="0"
          r="2.25"
        />
      </svg>
      <div ref={spaceLabel} className="scene-label route-label">
        Starcloud<small>COMPUTE</small>
      </div>
      <div ref={relayLabel} className="scene-label route-label">
        LEO ingress<small>USER UPLINK</small>
      </div>
      <div ref={gatewayLabel} className="scene-label route-label">
        Ground gateway<small>BACKHAUL</small>
      </div>
      {error && (
        <p className="scene-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
