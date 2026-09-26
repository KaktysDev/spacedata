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
  sunSyncInclination,
  type OrbitalNode,
  interpolateLocation,
  type OrbitalRoute,
} from "@/lib/starcloud/network";
import {
  satelliteGeometry,
  satelliteOverviewGeometry,
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
  onLocation: (p: Location) => void;
  focusId: number;
  zoom: number;
  onReady: () => void;
};
const R = 3.5,
  ORBIT_R = 5.8,
  UP = new THREE.Vector3(0, 1, 0);
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
export function OrbitalScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    pin = useRef<HTMLButtonElement>(null),
    groundLabel = useRef<HTMLDivElement>(null),
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
    // Opening view. Planes are distributed in RAAN, so this is not an edge-on
    // look down a single meridian.
    const inclination = sunSyncInclination(725);
    const overview = position({ lat: 180 - inclination, lon: -91 }, 1);
    const fitDistance = (direction: THREE.Vector3, w: number, h: number) => {
      const forward = direction.clone().normalize();
      const viewUp = UP.clone()
        .addScaledVector(forward, -UP.dot(forward))
        .normalize();
      const normal = position({ lat: 90 - inclination, lon: -91 }, 1);
      // Fit the projected orbital band and globe independently.
      const verticalExtent = Math.max(
        R + 0.2,
        ORBIT_R * Math.sqrt(Math.max(0, 1 - normal.dot(viewUp) ** 2)) + 0.4,
      );
      const focal = h / (2 * Math.tan((43 * Math.PI) / 360));
      return Math.max(
        ((ORBIT_R + 0.25) * focal) / (w * 0.42),
        (verticalExtent * focal) / Math.max(120, (h - 355) / 2),
      );
    };
    let homeDistance = fitDistance(overview, el.clientWidth, el.clientHeight);
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
    const selected = new THREE.InstancedMesh(hardware, routeHardwareMat, 5);
    selected.frustumCulled = false;
    scene.add(selected);
    selected.visible = false;
    const carrier = new THREE.Mesh(hardware, routeHardwareMat);
    carrier.scale.setScalar(0.36);
    scene.add(carrier);
    const matrix = new THREE.Object3D();
    const hardwareOrientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      position({ lat: -8, lon: -91 }, 1),
    );
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    scene.add(originMarker);
    const dc = datacenter();
    scene.add(dc);
    const providerGroup = new THREE.Group();
    scene.add(providerGroup);
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
      gatewayPath: THREE.Vector3[] = [],
      laserPath: THREE.Vector3[] = [],
      uplink: THREE.Vector3[] = [],
      returnPath: THREE.Vector3[] = [];
    let routeKey = "",
      providerKey = "",
      lastNodeTime = -Infinity,
      lastDetailTime = -Infinity,
      lastFlight = 0,
      lastFocus = latest.current.focusId,
      lastZoom = latest.current.zoom;
    let routeTarget = new THREE.Vector3(),
      routeCamera = new THREE.Vector3();
    const idleCamera = camera.position.clone(),
      idleTarget = new THREE.Vector3();
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      epoch = Date.now(),
      clockStart = performance.now();
    let returning: {
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
      const fit = fitDistance(overview, width, height);
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
      if (node === groundLabel.current) {
        const lx = x0 - x,
          ly = y0 - y;
        node.style.setProperty("--leader-length", `${Math.hypot(lx, ly)}px`);
        node.style.setProperty("--leader-angle", `${Math.atan2(ly, lx)}rad`);
      }
    }
    function orient(
      instance: THREE.InstancedMesh,
      index: number,
      v: THREE.Vector3,
      scale: number,
    ) {
      matrix.position.copy(v);
      matrix.quaternion.copy(hardwareOrientation);
      matrix.scale.setScalar(scale);
      matrix.updateMatrix();
      instance.setMatrixAt(index, matrix.matrix);
    }
    function cameraBetween(a: THREE.Vector3, b: THREE.Vector3, t: number) {
      const q = new THREE.Quaternion().setFromUnitVectors(
        a.clone().normalize(),
        b.clone().normalize(),
      );
      camera.position
        .copy(a)
        .normalize()
        .applyQuaternion(new THREE.Quaternion().slerp(q, t))
        .multiplyScalar(THREE.MathUtils.lerp(a.length(), b.length(), t));
    }
    function render(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      const p = latest.current,
        active = !!p.flight;
      hardwareMat.color.setScalar(active ? 0.28 : 1);
      const networkTime =
        p.flight?.id ?? (motion.matches ? epoch : epoch + now - clockStart);
      const nextRoute = `${p.origin.lat},${p.origin.lon},${p.site.name},${p.flight?.id ?? 0}`;
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
        vectors = nodes.map((n) =>
          position(n, 5.35 + ((n.altitudeKm - 725) / 80) * 0.22),
        );
        lastNodeTime = now;
        lastDetailTime = -Infinity;
      }
      if (providerKey !== p.provider) {
        providerKey = p.provider;
        disposeTree(providerGroup);
        providerGroup.clear();
        for (const site of SITES[p.provider]) {
          const campus = datacenter();
          campus.scale.setScalar(0.42);
          campus.position.copy(position(site, R + 0.012));
          campus.quaternion.setFromUnitVectors(
            UP,
            campus.position.clone().normalize(),
          );
          providerGroup.add(campus);
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
        if (network && active) {
          disposeTree(fiberGroup);
          fiberGroup.clear();
          disposeTree(orbitalGroup);
          orbitalGroup.clear();
          groundPath = surface(network.ground.points);
          gatewayPath = surface(network.gatewayRoute.points);
          carrier.position.copy(position(network.relay, 3.95));
          carrier.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            position({ lat: -8, lon: -91 }, 1),
          );
          uplink = [
            position(network.gateway, R + 0.016),
            carrier.position.clone(),
          ];
          laserPath = [
            carrier.position.clone(),
            ...network.hops.map((i) => vectors[i]),
          ];
          returnPath = [...groundPath, ...gatewayPath, ...uplink, ...laserPath];
          fiberGroup.add(line(groundPath, 0.8, true));
          orbitalGroup.add(
            line(gatewayPath, 0.5, true),
            line(uplink, 0.6),
            line(laserPath, 0.85),
          );
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
          network.hops.forEach((index, i) =>
            orient(selected, i, vectors[index], i === 4 ? 0.56 : 0.39),
          );
          selected.instanceMatrix.needsUpdate = true;
          const landmarks = [
            ...network.ground.points,
            ...network.gatewayRoute.points,
            ...network.hops.map((i) => nodes[i]),
          ];
          const center = landmarks
            .reduce((sum, p) => sum.add(position(p, 1)), new THREE.Vector3())
            .normalize();
          routeTarget = center.clone().multiplyScalar(0.4);
          routeCamera = center
            .clone()
            .multiplyScalar(fitDistance(center, width, height));
          const alreadyVisible = returnPath.every((v) => {
            const ray = v.clone().sub(camera.position);
            const t = THREE.MathUtils.clamp(
              -camera.position.dot(ray) / ray.lengthSq(),
              0,
              1,
            );
            const screen = v.clone().project(camera);
            return (
              camera.position.clone().addScaledVector(ray, t).length() >=
                R - 0.003 &&
              Math.abs(screen.x) < 0.9 &&
              screen.y < 0.86 &&
              screen.y > -0.15
            );
          });
          // Preserve the user's view whenever it already shows the entire trip.
          if (alreadyVisible) {
            routeCamera.copy(camera.position);
            routeTarget.copy(controls.target);
          }
        }
      }
      if (now - lastDetailTime > 400) {
        // Pixel-based detail preserves the hardware up close without drawing
        // thousands of subpixel solar cells in the overview.
        const activeIds = new Set(active ? network?.hops : []);
        const scale = 0.11;
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
        focusing = {
          at: now,
          camera: camera.position.clone(),
          to: overview.clone().multiplyScalar(fitDistance(overview, width, height)),
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
      if (p.flight) {
        if (lastFlight !== p.flight.id) {
          lastFlight = p.flight.id;
          idleCamera.copy(camera.position);
          idleTarget.copy(controls.target);
          returning = null;
          focusing = null;
        }
        const elapsed = now - p.flight.started,
          t = p.flight.reduced ? 0 : smooth(elapsed / 2400);
        if (!p.flight.reduced) {
          cameraBetween(idleCamera, routeCamera, t);
          controls.target.lerpVectors(idleTarget, routeTarget, t);
        }
        // One establishing move, then hold the full route. No spinning between endpoints.
      } else if (lastFlight) {
        lastFlight = 0;
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
      controls.minDistance = active ? 1 : 4.18;
      camera.setViewOffset(width, height, 0, -height * offset, width, height);
      controls.update();
      camera.updateMatrixWorld();
      routes.visible = active;
      selected.visible = active;
      gateway.visible = active;
      carrier.visible = active;
      groundDot.visible = spaceDot.visible = active;
      if (active && network) {
        const ms = p.flight!.reduced ? 10000 : now - p.flight!.started;
        orbitalGroup.visible = ms >= 4400;
        groundDot.visible = ms < 8100;
        follow(
          groundPath,
          ms < 4400 ? ms / 3400 : 1 - (ms - 4400) / 3700,
          groundDot.position,
        );
        if (ms < 3400) follow(groundPath, ms / 3400, spaceDot.position);
        else if (ms < 4400) spaceDot.position.copy(groundPath.at(-1)!);
        else if (ms < 5900)
          follow(gatewayPath, (ms - 4400) / 1500, spaceDot.position);
        else if (ms < 7600)
          follow(uplink, (ms - 5900) / 1700, spaceDot.position);
        else if (ms < 10000)
          follow(laserPath, (ms - 7600) / 2400, spaceDot.position);
        else if (ms < 11400) spaceDot.position.copy(laserPath.at(-1)!);
        else follow(returnPath, 1 - (ms - 11400) / 3400, spaceDot.position);
        spaceDot.scale.setScalar(
          ms >= 10000 && ms < 11400 ? 1 + Math.sin(now / 160) * 0.25 : 1,
        );
      }
      occupied.length = 0;
      const labelTime = p.flight
        ? p.flight.reduced
          ? 10000
          : now - p.flight.started
        : 0;
      project(pin.current, originMarker.position, !active, 0, 0);
      project(
        groundLabel.current,
        dc.position,
        !active || labelTime < 4400,
        width < 700 ? -105 : -155,
        -30,
      );
      if (network) {
        // One stage callout at a time leaves the actual links unobstructed.
        const ms = labelTime;
        project(
          gatewayLabel.current,
          gateway.position,
          active && ms >= 4400 && ms < 5900,
          80,
          -15,
        );
        project(
          relayLabel.current,
          carrier.position,
          active && ms >= 5900 && ms < 7600,
          -70,
          -25,
        );
        project(
          spaceLabel.current,
          vectors[network.compute],
          active && ms >= 7600 && ms < 11400,
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
        <span className="label-card" key={props.provider}>
          <span className="datacenter-brand">
            <ProviderLogo provider={props.provider} />
            <span>
              {PROVIDERS[props.provider].company}
              <small>{props.site.kind}</small>
            </span>
            <i />
          </span>
          <strong>{props.site.name}</strong>
          <span className="label-caption">Reference location</span>
        </span>
      </div>
      <div ref={spaceLabel} className="scene-label route-label">
        Orbital compute<small>MODELED</small>
      </div>
      <div ref={relayLabel} className="scene-label route-label">
        Communications relay<small>RF → OPTICAL</small>
      </div>
      <div ref={gatewayLabel} className="scene-label route-label">
        Ground gateway<small>FIBER → RF</small>
      </div>
      {error && (
        <p className="scene-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
