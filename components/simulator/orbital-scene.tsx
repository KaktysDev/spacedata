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
  createRoutePlayback,
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
  orbitalComputeCraft,
  hardwareMaterial,
  datacenter,
} from "./space-hardware";
import { ProviderLogo } from "./provider-picker";
export type Flight = { id: number; started: number; reduced: boolean };
export type SceneView = "space" | "overview";
export type ViewPhase = "blur" | "settled" | "returned";
type Props = {
  origin: Location;
  site: Site;
  provider: ProviderId;
  flight: Flight | null;
  resultsOpen: boolean;
  answerReady: boolean;
  answerReadyAt: number | null;
  onLocation: (p: Location) => void;
  focusId: number;
  zoom: number;
  onReady: () => void;
  sceneView: SceneView;
  onViewPhase?: (phase: ViewPhase) => void;
};
// Dublin, southern New Hampshire: the dorm where the project started.
const OVERVIEW_FOCUS = { lat: 42.9, lon: -72.06 };
const OVERVIEW_DISTANCE = 4.38;
const R = 3.5,
  // Visual shell only. The inner edge stays well clear of Earth. The outer
  // edge is what the opening camera frames. Routing still uses physical
  // kilometres.
  BELT_INNER = 8,
  BELT_OUTER = 12.2,
  // Grains on the shell, small enough that the cell gap stays visible.
  CRAFT_SCALE = 0.22,
  // Close enough for the land dots to fill the frame, still outside Earth.
  MIN_ORBIT = 4.22,
  MAX_ORBIT = 64,
  UP = new THREE.Vector3(0, 1, 0);
function fitDistance(w: number, h: number) {
  // Closer than a full fit of the outer belt. That fit left a wide black
  // margin around Earth on first load. 0.82 fills the space under the header
  // and above the headline without clipping the shell. Geometry is unchanged.
  const framed = BELT_OUTER * 0.82;
  const width = Math.max(w, 1);
  const height = Math.max(h, 1);
  const fov = (43 * Math.PI) / 180;
  const tanHalf = Math.tan(fov / 2);
  // Header, the upward view offset, and the composer. The shell has to fit
  // in that window, not in the raw canvas.
  const chromeTop = 72;
  const chromeBottom = width < 700 ? 236 : 292;
  const usableH = Math.max(180, height - chromeTop - chromeBottom);
  const usableW = Math.max(180, width * 0.9);
  const distH = framed / (tanHalf * (usableH / height));
  const horizontal =
    2 * Math.atan(tanHalf * (width / height));
  const distW = framed / (Math.tan(horizontal / 2) * (usableW / width));
  return THREE.MathUtils.clamp(
    Math.max(distH, distW),
    MIN_ORBIT + 2,
    MAX_ORBIT,
  );
}
function displayRadius(altitudeKm: number) {
  const span = SHELL_ALTITUDE_MAX_KM - SHELL_ALTITUDE_MIN_KM;
  const t = (altitudeKm - SHELL_ALTITUDE_MIN_KM) / span;
  return BELT_INNER + Math.min(1, Math.max(0, t)) * (BELT_OUTER - BELT_INNER);
}
function shellPosition(
  p: OrbitalNode,
  ringNormal: THREE.Vector3,
  radius = displayRadius(p.altitudeKm),
) {
  const across = p.across ?? 0;
  const base = position(p, 1);
  if (Math.abs(across) < 1e-8) return base.multiplyScalar(radius);
  const lifted = base
    .multiplyScalar(Math.cos(across))
    .addScaledVector(ringNormal, Math.sin(across));
  return lifted.multiplyScalar(radius / (lifted.length() || 1));
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
function directionLerp(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const qa = a.clone().normalize();
  const qb = b.clone().normalize();
  const omega = Math.acos(THREE.MathUtils.clamp(qa.dot(qb), -1, 1));
  if (omega < 1e-4) return qa.lerp(qb, t).normalize();
  if (Math.PI - omega < 1e-3) {
    const axis = Math.abs(qa.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(qa, axis).normalize();
    return qa.clone().applyAxisAngle(side, t * Math.PI);
  }
  const s = Math.sin(omega);
  return qa
    .clone()
    .multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(qb, Math.sin(t * omega) / s);
}
/** Radius grows from the surface to the craft, so the link never chords through Earth. */
function outsideLink(from: THREE.Vector3, to: THREE.Vector3, steps = 32) {
  const points: THREE.Vector3[] = [];
  const ra = from.length();
  const rb = to.length();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(
      directionLerp(from, to, t).multiplyScalar(
        Math.max(ra + (rb - ra) * t, R + 0.02),
      ),
    );
  }
  return points;
}
function follow(points: THREE.Vector3[], t: number, target: THREE.Vector3) {
  if (!points.length) return;
  if (points.length === 1) {
    target.copy(points[0]);
    return;
  }
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
function windowProgress(
  window: { startMs: number; endMs: number },
  elapsedMs: number,
) {
  if (window.endMs <= window.startMs)
    return elapsedMs < window.startMs ? 0 : 1;
  return THREE.MathUtils.clamp(
    (elapsedMs - window.startMs) / (window.endMs - window.startMs),
    0,
    1,
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
    resumeFrame = useRef<() => void>(() => {}),
    latest = useRef(props);
  const [error, setError] = useState("");
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    if (!props.resultsOpen) resumeFrame.current();
  }, [props.resultsOpen]);
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
    let homeDistance = fitDistance(el.clientWidth, el.clientHeight);
    camera.position.copy(overview).multiplyScalar(homeDistance);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.target.set(0, 0, 0);
    controls.minDistance = MIN_ORBIT;
    controls.maxDistance = MAX_ORBIT;
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
    const landPoints: { mat: THREE.ShaderMaterial; size: number }[] = [];
    const roundPoints = (
      coordinates: THREE.Vector3[],
      size: number,
      opacity: number,
    ) => {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { size: { value: size }, opacity: { value: opacity } },
        vertexShader:
          "uniform float size;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}",
        fragmentShader:
          "uniform float opacity;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(vec3(1.),opacity*(1.-smoothstep(.3,.5,d)));}",
      });
      landPoints.push({ mat, size });
      return new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(coordinates),
        mat,
      );
    };
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
    const selected = new THREE.InstancedMesh(hardware, routeHardwareMat, 64);
    selected.frustumCulled = false;
    selected.count = 0;
    scene.add(selected);
    const odcCraft = orbitalComputeCraft();
    odcCraft.scale.setScalar(0.45);
    scene.add(odcCraft);
    odcCraft.visible = false;
    selected.visible = false;
    const carrier = new THREE.Mesh(hardware, routeHardwareMat);
    carrier.scale.setScalar(CRAFT_SCALE);
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
    function packetMarker() {
      const packet = new THREE.Group();
      packet.add(
        new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), dotMat),
        new THREE.Mesh(
          new THREE.RingGeometry(0.021, 0.023, 28),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      return packet;
    }
    const groundDot = packetMarker(),
      spaceDot = packetMarker();
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
      downlinkPath: THREE.Vector3[] = [],
      returnLaserPath: THREE.Vector3[] = [],
      returnFeederPath: THREE.Vector3[] = [],
      computeVector = new THREE.Vector3();
    let routeKey = "",
      providerKey = "",
      lastNodeTime = -Infinity,
      lastDetailTime = -Infinity,
      lastFlight = 0,
      lastFocus = latest.current.focusId,
      lastZoom = latest.current.zoom;
    const routeTarget = new THREE.Vector3();
    const routeCamera = new THREE.Vector3();
    const idleCamera = camera.position.clone(),
      idleTarget = new THREE.Vector3(),
      // Preserve the follow camera's lateral side as the packet turns around.
      sideReference = new THREE.Vector3();
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      epoch = Date.now(),
      clockStart = performance.now();
    let returning: {
      at: number;
      camera: THREE.Vector3;
      target: THREE.Vector3;
    } | null = null;
    let groundHandoff: {
      at: number;
      camera: THREE.Vector3;
      target: THREE.Vector3;
    } | null = null;
    let focusing: {
      at: number;
      camera: THREE.Vector3;
      to: THREE.Vector3;
    } | null = null;
    const overviewDir = position(OVERVIEW_FOCUS, 1).normalize();
    let sceneView: SceneView = "space";
    let savedDir = camera.position.clone().normalize();
    let savedRadius = camera.position.length();
    let regionMix = 0;
    let fly: {
      kind: SceneView;
      at: number;
      fromDir: THREE.Vector3;
      fromRadius: number;
      pullRadius: number;
      blurSent: boolean;
      doneSent: boolean;
    } | null = null;
    let pauseTimer = 0,
      width = 1,
      height = 1,
      frame = 0,
      drag = false,
      pointerId = -1;
    const resize = () => {
      width = el.clientWidth;
      height = el.clientHeight;
      renderer.setSize(width, height);
      const fit = fitDistance(width, height);
      const zoom = camera.position.length() / Math.max(homeDistance, 1e-3);
      homeDistance = fit;
      // The overview shot is a fixed altitude over New Hampshire. Rescale
      // would pull that camera back out to the home framing.
      if (latest.current.sceneView !== "overview" && !fly)
        camera.position.setLength(
          THREE.MathUtils.clamp(fit * zoom, MIN_ORBIT, MAX_ORBIT),
        );
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
      controls.enabled =
        !latest.current.flight && latest.current.sceneView === "space" && !fly;
      pin.current?.classList.remove("dragging");
      if (pointerId >= 0 && pin.current?.hasPointerCapture(pointerId))
        pin.current.releasePointerCapture(pointerId);
      pointerId = -1;
    };
    const place = (e: MouseEvent) => {
      if (latest.current.flight || latest.current.sceneView !== "space" || fly)
        return;
      const v = hit(e);
      if (v) placePoint(v);
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
    function hardwareRotation(v: THREE.Vector3, out: THREE.Quaternion) {
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
      out.setFromRotationMatrix(craftBasis);
    }
    function orient(
      instance: THREE.InstancedMesh,
      index: number,
      v: THREE.Vector3,
      scale: number,
    ) {
      hardwareRotation(v, matrix.quaternion);
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
    function trackedPose(point: THREE.Vector3) {
      const radial = point.clone().normalize();
      const lateral = ringNormal
        .clone()
        .addScaledVector(radial, -ringNormal.dot(radial));
      if (lateral.lengthSq() < 1e-6)
        lateral.crossVectors(radial, UP);
      if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
      lateral.normalize();
      if (sideReference.lengthSq() > 0.25 && lateral.dot(sideReference) < 0)
        lateral.negate();
      sideReference.copy(lateral);
      // Move in close to orbital hardware, while staying above the shell
      // when the packet is still on a surface feeder or on its way home.
      const radialDistance = Math.max(
        2.6,
        BELT_OUTER + 0.85 - point.length(),
      );
      const cameraPos = point
        .clone()
        .addScaledVector(radial, radialDistance)
        .addScaledVector(lateral, 1.45);
      return { camera: cameraPos, target: point.clone() };
    }
    function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number) {
      const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
      if (dot > 0.9995) return a.clone().lerp(b, t).normalize();
      const omega = Math.acos(dot);
      const s = Math.sin(omega);
      if (s < 1e-5) return b.clone();
      return a
        .clone()
        .multiplyScalar(Math.sin((1 - t) * omega) / s)
        .addScaledVector(b, Math.sin(t * omega) / s);
    }
    function pullDistance(fromRadius: number) {
      const pulled = Math.max(
        fromRadius * 1.58,
        homeDistance * 1.05,
        fromRadius + 0.85,
      );
      return THREE.MathUtils.clamp(pulled, fromRadius, MAX_ORBIT * 0.88);
    }
    function beginFly(kind: SceneView, now: number) {
      const fromRadius = Math.max(camera.position.length(), MIN_ORBIT);
      const fromDir = camera.position.clone().normalize();
      if (kind === "overview" && fly?.kind !== "space") {
        const resting = returning ? idleCamera : camera.position;
        savedDir = resting.clone().normalize();
        savedRadius = Math.max(resting.length(), MIN_ORBIT);
      }
      returning = null;
      focusing = null;
      fly = {
        kind,
        at: now,
        fromDir,
        fromRadius,
        pullRadius: pullDistance(fromRadius),
        blurSent: false,
        doneSent: false,
      };
    }
    function emitPhase(phase: ViewPhase) {
      latest.current.onViewPhase?.(phase);
    }
    // Zoom out along the current view, swing to southern New Hampshire, then
    // dive until New England fills the frame. The UI blurs in on the callback.
    function applyOverviewFly(now: number) {
      if (!fly || fly.kind !== "overview") return 0;
      if (motion.matches) {
        camera.position.copy(overviewDir).multiplyScalar(OVERVIEW_DISTANCE);
        controls.target.set(0, 0, 0);
        if (!fly.blurSent) {
          fly.blurSent = true;
          emitPhase("blur");
        }
        if (!fly.doneSent) {
          fly.doneSent = true;
          emitPhase("settled");
        }
        fly = null;
        return 1;
      }
      const outMs = 680;
      const slewMs = 560;
      const diveMs = 980;
      const elapsed = now - fly.at;
      let dir = fly.fromDir;
      let radius = fly.fromRadius;
      let dive = 0;
      if (elapsed < outMs) {
        radius = THREE.MathUtils.lerp(
          fly.fromRadius,
          fly.pullRadius,
          smooth(elapsed / outMs),
        );
      } else if (elapsed < outMs + slewMs) {
        dir = slerpDir(fly.fromDir, overviewDir, smooth((elapsed - outMs) / slewMs));
        radius = fly.pullRadius;
      } else {
        dive = Math.min(1, (elapsed - outMs - slewMs) / diveMs);
        const approach = Math.min(fly.pullRadius, 5.15);
        if (dive <= 0.42) {
          radius = THREE.MathUtils.lerp(
            fly.pullRadius,
            approach,
            smooth(dive / 0.42),
          );
        } else {
          radius = THREE.MathUtils.lerp(
            approach,
            OVERVIEW_DISTANCE,
            smooth((dive - 0.42) / 0.58),
          );
        }
        dir = overviewDir;
        if (dive >= 0.72 && !fly.blurSent) {
          fly.blurSent = true;
          emitPhase("blur");
        }
        if (dive >= 1 && !fly.doneSent) {
          fly.doneSent = true;
          radius = OVERVIEW_DISTANCE;
          emitPhase("settled");
          fly = null;
        }
      }
      camera.position.copy(dir).multiplyScalar(radius);
      controls.target.set(0, 0, 0);
      return dive;
    }
    function applyReturnFly(now: number) {
      if (!fly || fly.kind !== "space") return;
      if (motion.matches) {
        camera.position.copy(savedDir).multiplyScalar(savedRadius);
        controls.target.set(0, 0, 0);
        if (!fly.doneSent) {
          fly.doneSent = true;
          emitPhase("returned");
        }
        fly = null;
        return;
      }
      const outMs = 420;
      const backMs = 780;
      const elapsed = now - fly.at;
      if (elapsed < outMs) {
        const radius = THREE.MathUtils.lerp(
          fly.fromRadius,
          fly.pullRadius,
          smooth(elapsed / outMs),
        );
        camera.position.copy(fly.fromDir).multiplyScalar(radius);
      } else {
        const k = smooth(Math.min(1, (elapsed - outMs) / backMs));
        const dir = slerpDir(fly.fromDir, savedDir, k);
        const radius = THREE.MathUtils.lerp(fly.pullRadius, savedRadius, k);
        camera.position.copy(dir).multiplyScalar(Math.max(radius, MIN_ORBIT));
        if (k >= 1 && !fly.doneSent) {
          camera.position.copy(savedDir).multiplyScalar(savedRadius);
          fly.doneSent = true;
          emitPhase("returned");
          fly = null;
        }
      }
      controls.target.set(0, 0, 0);
    }
    function render(now: number) {
      if (disposed) return;
      const p = latest.current;
      if (p.resultsOpen) {
        pauseTimer = window.setTimeout(() => {
          frame = requestAnimationFrame(render);
        }, 400);
        return;
      }
      frame = requestAnimationFrame(render);
      const active = !!p.flight;
      hardwareMat.color.setScalar(active ? 0.16 : 1);
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
        // Display position only. Routing still uses each node's altitude in km
        // and its place on the dawn-dusk plane.
        vectors = nodes.map((n) => shellPosition(n, ringNormal));
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
          hardwareRotation(carrier.position, carrier.quaternion);
          uplink = outsideLink(
            position(network.uplinkAnchor, R + 0.016),
            vectors[network.ingress].clone(),
          );
          laserPath = network.opticalPoints.map((p) =>
            shellPosition(p, ringNormal),
          );
          computeVector = laserPath[laserPath.length - 1].clone();
          returnLaserPath = laserPath.slice().reverse();
          downlinkPath = uplink.slice().reverse();
          returnFeederPath = feederPath.slice().reverse();
          fiberGroup.add(line(groundPath, 0.8, true));
          if (feederPath.length) orbitalGroup.add(line(feederPath, 0.65, true));
          orbitalGroup.add(line(uplink, 0.65));
          if (laserPath.length > 1) orbitalGroup.add(line(laserPath, 0.85));
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
          // The ingress craft has its own mesh and callout. Do not draw a
          // second instanced craft at the same position.
          const relayHops = network.hops.slice(1, -1);
          const hopCount = Math.min(relayHops.length, 64);
          relayHops.slice(0, hopCount).forEach((index, i) =>
            orient(selected, i, vectors[index], CRAFT_SCALE),
          );
          selected.count = hopCount;
          selected.instanceMatrix.needsUpdate = true;
          odcCraft.position.copy(computeVector);
          hardwareRotation(computeVector, odcCraft.quaternion);
          const originDir = position(p.origin, 1);
          const siteDir = position(p.site, 1);
          const routeDir = originDir.clone().lerp(siteDir, 0.24);
          if (routeDir.lengthSq() < 0.01) routeDir.copy(originDir);
          routeCamera.copy(routeDir.normalize().multiplyScalar(homeDistance));
          routeTarget.set(0, 0, 0);
        }
      }
      if (now - lastDetailTime > 400) {
        // Pixel-based detail preserves the hardware up close without drawing
        // thousands of subpixel solar cells in the overview.
        const activeIds = new Set(active ? network?.hops : []);
        // Route craft retain the same physical display size as the fleet.
        // Camera distance and light identify the path, not enlarged geometry.
        const scale = CRAFT_SCALE;
        const focal = height / (2 * Math.tan((43 * Math.PI) / 360));
        const candidates = active ? [] : vectors
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
            activeIds.has(i) || detailIds.has(i) ||
              (active && v.distanceToSquared(spaceDot.position) < 0.35)
              ? 0
              : scale,
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
      if (p.sceneView === "space" && !fly && p.focusId !== lastFocus) {
        lastFocus = p.focusId;
        const focusDirection = position(p.origin, 1);
        focusing = {
          at: now,
          camera: camera.position.clone(),
          to: focusDirection.multiplyScalar(fitDistance(width, height)),
        };
      }
      if (p.sceneView === "space" && !fly && p.zoom !== lastZoom) {
        camera.position
          .sub(controls.target)
          .multiplyScalar(p.zoom > lastZoom ? 0.87 : 1.15)
          .clampLength(MIN_ORBIT, MAX_ORBIT)
          .add(controls.target);
        lastZoom = p.zoom;
        focusing = null;
      }
      const rawElapsed = p.flight ? Math.max(0, now - p.flight.started) : 0;
      const playback =
        active && network
          ? createRoutePlayback(network, {
              elapsedMs: rawElapsed,
              answerReadyAtMs: p.answerReadyAt,
            })
          : null;
      if (playback) {
        const ms = rawElapsed,
          ground = playback.ground,
          space = playback.space;
        if (ms < ground.outbound.endMs)
          follow(groundPath, windowProgress(ground.outbound, ms), groundDot.position);
        else if (ms < ground.return.startMs)
          groundDot.position.copy(groundPath.at(-1)!);
        else
          follow(
            groundPath,
            1 - windowProgress(ground.return, ms),
            groundDot.position,
          );
        if (feederPath.length && ms < space.feeder.endMs)
          follow(feederPath, windowProgress(space.feeder, ms), spaceDot.position);
        else if (ms < space.uplink.endMs)
          follow(uplink, windowProgress(space.uplink, ms), spaceDot.position);
        else if (ms < space.laser.endMs)
          follow(laserPath, windowProgress(space.laser, ms), spaceDot.position);
        else if (ms < space.return.startMs)
          spaceDot.position.copy(computeVector);
        else {
          // Return traverses the same links in reverse order. Give each leg
          // the same share of the return window as its outbound animation.
          const feederShare = feederPath.length
              ? space.feeder.endMs - space.feeder.startMs
              : 0,
            uplinkShare = space.uplink.endMs - space.uplink.startMs,
            laserShare = space.laser.endMs - space.laser.startMs,
            shareTotal = Math.max(1, feederShare + uplinkShare + laserShare),
            t = windowProgress(space.return, ms),
            laserEnd = laserShare / shareTotal,
            uplinkEnd = (laserShare + uplinkShare) / shareTotal;
          if (t < laserEnd)
            follow(returnLaserPath, t / Math.max(laserEnd, 1e-6), spaceDot.position);
          else if (t < uplinkEnd)
            follow(
              downlinkPath,
              (t - laserEnd) / Math.max(uplinkEnd - laserEnd, 1e-6),
              spaceDot.position,
            );
          else if (feederPath.length)
            follow(
              returnFeederPath,
              (t - uplinkEnd) / Math.max(1 - uplinkEnd, 1e-6),
              spaceDot.position,
            );
          else spaceDot.position.copy(downlinkPath.at(-1)!);
        }
        spaceDot.scale.setScalar(
          ms >= space.compute.startMs && ms < space.return.startMs
            ? 1 + Math.sin(now / 170) * 0.08
            : 1,
        );
      }
      if (p.flight) {
        if (lastFlight !== p.flight.id) {
          lastFlight = p.flight.id;
          idleCamera.copy(camera.position);
          idleTarget.copy(controls.target);
          sideReference.set(0, 0, 0);
          returning = null;
          groundHandoff = null;
          focusing = null;
        }
        if (!p.flight.reduced && playback) {
          const overviewEnd = playback.launchMs;
          const trackBlendMs = 560;
          if (rawElapsed < overviewEnd) {
            blendPose(
              idleCamera,
              idleTarget,
              routeCamera,
              routeTarget,
              rawElapsed / Math.max(overviewEnd, 1),
            );
          } else if (
            rawElapsed >= playback.space.finishedMs &&
            rawElapsed < playback.ground.finishedMs
          ) {
            if (!groundHandoff)
              groundHandoff = {
                at: now,
                camera: camera.position.clone(),
                target: controls.target.clone(),
              };
            const pose = trackedPose(groundDot.position);
            blendPose(
              groundHandoff.camera,
              groundHandoff.target,
              pose.camera,
              pose.target,
              (now - groundHandoff.at) / 900,
            );
          } else if (
            rawElapsed < playback.space.finishedMs ||
            rawElapsed < playback.ground.finishedMs
          ) {
            const pose = trackedPose(spaceDot.position);
            const followBlend = (rawElapsed - overviewEnd) / trackBlendMs;
            if (followBlend < 1)
              blendPose(
                routeCamera,
                routeTarget,
                pose.camera,
                pose.target,
                followBlend,
              );
            else {
              camera.position.copy(pose.camera);
              controls.target.copy(pose.target);
            }
          }
        }
      } else if (lastFlight) {
        lastFlight = 0;
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
      if (p.sceneView !== sceneView) {
        sceneView = p.sceneView;
        beginFly(sceneView, now);
      }
      let dive = 0;
      if (fly?.kind === "overview") dive = applyOverviewFly(now);
      else if (fly?.kind === "space") applyReturnFly(now);
      else if (p.sceneView === "overview") {
        camera.position.copy(overviewDir).multiplyScalar(OVERVIEW_DISTANCE);
        controls.target.set(0, 0, 0);
        dive = 1;
      }
      const frameTarget = p.sceneView === "overview" ? dive : 0;
      regionMix = motion.matches || frameTarget >= regionMix
        ? frameTarget
        : regionMix + (frameTarget - regionMix) * 0.1;
      const cinematic = fly !== null || p.sceneView === "overview";
      const closeness = THREE.MathUtils.clamp(
        (8.5 - camera.position.length()) / 4.2,
        0,
        1,
      );
      const pointBoost = cinematic && p.sceneView === "overview" ? 1 + closeness * 2.6 : 1;
      for (const entry of landPoints)
        entry.mat.uniforms.size.value = entry.size * pointBoost;
      controls.enabled = !active && !drag && !returning && !focusing && !cinematic;
      controls.enableDamping = controls.enabled;
      controls.minDistance = active ? R + 0.45 : MIN_ORBIT;
      controls.maxDistance = MAX_ORBIT;
      const chromeOffset = height > 2 ? -(width < 700 ? 20 : 72) / height : 0;
      const framedOffset = chromeOffset * (1 - THREE.MathUtils.clamp(regionMix, 0, 1));
      if (width > 2 && height > 2)
        camera.setViewOffset(width, height, 0, -height * framedOffset, width, height);
      if (controls.enabled) controls.update();
      else camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      routes.visible = active;
      selected.visible = active;
      odcCraft.visible = active;
      gateway.visible = active && feederPath.length > 0;
      carrier.visible = active && Boolean(network && network.hops.length > 1);
      groundDot.visible = Boolean(
        playback && !p.flight?.reduced && rawElapsed < playback.ground.finishedMs,
      );
      spaceDot.visible = Boolean(
        playback && !p.flight?.reduced && rawElapsed < playback.space.finishedMs,
      );
      if (active) orbitalGroup.visible = true;
      occupied.length = 0;
      const showPlaces = p.sceneView === "space" && !fly;
      project(pin.current, originMarker.position, !active && showPlaces, 0, 0);
      project(
        groundLabel.current,
        dc.position,
        showPlaces &&
          (!active || Boolean(playback && rawElapsed < playback.ground.outbound.endMs)),
        width < 700 ? -70 : -96,
        -30,
      );
      if (network && playback) {
        // One stage callout at a time leaves the actual links unobstructed.
        const ms = rawElapsed;
        const craftDistance = Math.max(
          0.1,
          camera.position.distanceTo(computeVector),
        );
        const projectedCraftWidth =
          (0.75 * odcCraft.scale.x * height) /
          (2 * Math.tan((43 * Math.PI) / 360) * craftDistance);
        const computeScreenX =
          (computeVector.clone().project(camera).x * 0.5 + 0.5) * width;
        const labelSide = computeScreenX > width / 2 ? -1 : 1;
        project(
          gatewayLabel.current,
          gateway.position,
          active && feederPath.length > 0 && ms < playback.space.uplink.endMs,
          80,
          -15,
        );
        project(
          relayLabel.current,
          carrier.position,
          active &&
            network.hops.length > 1 &&
            ms >= playback.space.uplink.startMs &&
            ms < playback.space.laser.endMs,
          -70,
          -25,
        );
        project(
          spaceLabel.current,
          computeVector,
          active &&
            ms >= playback.space.laser.startMs &&
            ms < playback.space.return.startMs,
          width < 700
            ? 0
            : labelSide * Math.max(50, projectedCraftWidth * 0.45 + 15),
          width < 700 ? -projectedCraftWidth * 0.55 - 35 : -30,
        );
      }
      groundDot.quaternion.copy(camera.quaternion);
      spaceDot.quaternion.copy(camera.quaternion);
      renderer.render(scene, camera);
    }
    resumeFrame.current = () => {
      clearTimeout(pauseTimer);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      resumeFrame.current = () => {};
      abort.abort();
      cancelAnimationFrame(frame);
      clearTimeout(pauseTimer);
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
            <small>{PROVIDERS[props.provider].company} · modeled</small>
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
        Starcloud-2<small>MODELED</small>
      </div>
      <div ref={relayLabel} className="scene-label route-label">
        Backhaul<small>RF</small>
      </div>
      <div ref={gatewayLabel} className="scene-label route-label">
        Gateway<small>MODELED</small>
      </div>
      {error && (
        <p className="scene-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
