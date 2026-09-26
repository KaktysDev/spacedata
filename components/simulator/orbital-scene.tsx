"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type Location, type Site } from "@/lib/starcloud/catalog";
export type Flight = { id: number; started: number; reduced: boolean };
type Props = {
  origin: Location;
  site: Site;
  flight: Flight | null;
  onLocation: (p: Location) => void;
  focusId: number;
  zoom: number;
  onReady: () => void;
};
import {
  fillOrbit,
  routeAt,
  NODE_COUNT,
  SATS_PER_PLANE,
  EARTH_KM,
  JOURNEY_MS,
  type OrbitalRoute,
} from "@/lib/starcloud/network";
const R = 3.5;
// Shell altitude is drawn 3.4× true so a 550 km orbit clears the globe.
// Distances, elevation and latency stay in physical kilometers.
const VISUAL_ALT_EXAG = 3.4;
function position(p: Location, r = R) {
  const lat = (p.lat * Math.PI) / 180,
    lon = (p.lon * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  ).multiplyScalar(r);
}
function shellRadius(altKm: number) {
  return R * (1 + (altKm / EARTH_KM) * VISUAL_ALT_EXAG);
}
function location(v: THREE.Vector3): Location {
  const n = v.clone().normalize();
  return {
    lat: (Math.asin(n.y) * 180) / Math.PI,
    lon: (Math.atan2(n.x, n.z) * 180) / Math.PI,
  };
}
function line(
  points: THREE.Vector3[],
  color: number,
  opacity = 1,
  dashed = false,
) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = dashed
    ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        dashSize: 0.035,
        gapSize: 0.045,
      })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(g, m);
  if (dashed) l.computeLineDistances();
  return l;
}
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
        (m) => m.dispose(),
      );
  });
}
function satellite() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.15, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0xb5bcc3,
      metalness: 0.7,
      roughness: 0.38,
    }),
  );
  group.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.12, 0.008),
      new THREE.MeshStandardMaterial({
        color: 0x293039,
        metalness: 0.4,
        roughness: 0.7,
      }),
    );
    wing.position.x = side * 0.19;
    group.add(wing);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(wing.geometry),
      new THREE.LineBasicMaterial({ color: 0x818b94 }),
    );
    edges.position.copy(wing.position);
    group.add(edges);
    for (let i = 0; i < 5; i++)
      group.add(
        line(
          [
            new THREE.Vector3(side * 0.08 + side * i * 0.045, -0.06, 0.006),
            new THREE.Vector3(side * 0.08 + side * i * 0.045, 0.06, 0.006),
          ],
          0x65717d,
          0.7,
        ),
      );
    const radiator = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.12, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x69717b }),
    );
    radiator.position.set(side * 0.065, -0.13, 0);
    group.add(radiator);
  }
  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.035, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xdce1e5, side: THREE.DoubleSide }),
  );
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.075;
  group.add(dish);
  return group;
}
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
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      const fallback = window.setTimeout(() => {
        setError(
          "3D is unavailable in this browser. You can still choose a location and compare a request.",
        );
        latest.current.onReady();
      }, 0);
      return () => clearTimeout(fallback);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x020304, 1);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive Earth. Drag to rotate, scroll to zoom, double-click to move your pin.",
    );
    renderer.domElement.setAttribute("role", "img");
    el.prepend(renderer.domElement);
    const homeDistance = el.clientWidth < 700 ? 9.8 : 7.8,
      homeOffset = el.clientWidth < 700 ? 0.25 : 0.4;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 100);
    camera.position.copy(position({ lat: 8, lon: -91 }, homeDistance));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 4.7;
    controls.maxDistance = 15;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.55;
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-5, 9, 7);
    scene.add(sun);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x0b0e11 }),
    );
    scene.add(earth);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.006, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader:
          "varying vec3 n; varying vec3 v; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}",
        fragmentShader:
          "varying vec3 n; varying vec3 v; void main(){float rim=pow(1.0-max(0.0,dot(n,v)),5.0); gl_FragColor=vec4(vec3(0.6,0.67,0.73),rim*0.28);}",
      }),
    );
    scene.add(atmosphere);
    const abort = new AbortController();
    let disposed = false;
    fetch("/globe-land.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("map");
        return r.json();
      })
      .then(
        (data: {
          dots: [number, number][];
          borderDots: [number, number][];
        }) => {
          if (disposed) return;
          for (const [coordinates, color, opacity] of [
            [data.dots, 0x8795a1, 0.63],
            [data.borderDots, 0xf1f6fa, 0.95],
          ] as const) {
            scene.add(
              new THREE.Points(
                new THREE.BufferGeometry().setFromPoints(
                  coordinates.map(([lon, lat]) =>
                    position({ lat, lon }, R + 0.018),
                  ),
                ),
                new THREE.PointsMaterial({
                  color,
                  size: 0.017,
                  transparent: true,
                  opacity,
                  sizeAttenuation: true,
                }),
              ),
            );
          }
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
    // In-plane optical rings across the shell. Crosslinks stay off until a route uses them,
    // so the idle view reads as orbits rather than a wire lattice.
    const shellLat = new Float64Array(NODE_COUNT),
      shellLon = new Float64Array(NODE_COUNT),
      shellAlt = new Float64Array(NODE_COUNT);
    const world: THREE.Vector3[] = Array.from(
      { length: NODE_COUNT },
      () => new THREE.Vector3(),
    );
    const shellPositions = new Float32Array(NODE_COUNT * 3);
    const shellColors = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      const brightness = 0.72 + ((i * 47) % 19) / 18 * 0.28;
      shellColors[i * 3] = brightness;
      shellColors[i * 3 + 1] = brightness;
      shellColors[i * 3 + 2] = brightness;
    }
    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(shellPositions, 3),
    );
    shellGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(shellColors, 3),
    );
    const shellMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
      depthWrite: false,
    });
    scene.add(new THREE.Points(shellGeometry, shellMaterial));
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(NODE_COUNT * 6), 3),
    );
    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x9bacba,
      transparent: true,
      opacity: 0.07,
    });
    scene.add(new THREE.LineSegments(ringGeometry, ringMaterial));
    const heroes = Array.from({ length: 5 }, () => {
      const craft = satellite();
      craft.scale.setScalar(0.24);
      craft.visible = false;
      scene.add(craft);
      return craft;
    });
    const starPositions: number[] = [],
      starColors: number[] = [];
    let seed = 917;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 1500; i++) {
      const u = random() * 2 - 1,
        a = random() * Math.PI * 2,
        r = 30;
      starPositions.push(
        r * Math.sqrt(1 - u * u) * Math.cos(a),
        r * u,
        r * Math.sqrt(1 - u * u) * Math.sin(a),
      );
      const brightness = 0.25 + random() * 0.55;
      starColors.push(brightness, brightness, brightness);
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    starsGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(starColors, 3),
    );
    scene.add(
      new THREE.Points(
        starsGeometry,
        new THREE.PointsMaterial({
          size: 0.085,
          sizeAttenuation: true,
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      ),
    );
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.033, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x78b8ee }),
    );
    scene.add(originMarker);
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    let groundPath: THREE.Vector3[] = [],
      spacePath: THREE.Vector3[] = [];
    const groundDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x86b5d5 }),
    );
    const spaceDot = groundDot.clone();
    spaceDot.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    scene.add(groundDot, spaceDot);
    const ingressPos = new THREE.Vector3(),
      computePos = new THREE.Vector3();
    let cachedRoute: OrbitalRoute = routeAt(latest.current.origin, epoch);
    let cachedKey = "";
    const FOLLOW_START = 1800,
      FOLLOW_END = 10400,
      CLOSER_OUT = 1.78,
      CLOSER_SIDE = 1.02;
    let flightSign = 1;
    let signedFor = 0;
    let pullback: { cam: THREE.Vector3; target: THREE.Vector3 } | null = null;
    // Frozen at send: a rightward yaw around the departure point onto a broadside view.
    let introYaw: {
      look: THREE.Vector3;
      radial: THREE.Vector3;
      tangent: THREE.Vector3;
      side: THREE.Vector3;
      startAngle: number;
      endAngle: number;
      startOut: number;
      startTan: number;
      local: boolean;
      endPose: THREE.Vector3;
    } | null = null;
    const tangentSmooth = new THREE.Vector3();
    const broadside = (
      look: THREE.Vector3,
      tangent: THREE.Vector3,
      sign: number,
    ) => {
      const radial = look.clone().normalize();
      const axis = new THREE.Vector3().crossVectors(radial, tangent);
      if (axis.lengthSq() < 1e-8)
        axis.crossVectors(radial, new THREE.Vector3(0, 1, 0));
      axis.normalize();
      let side = CLOSER_SIDE * sign;
      const cam = new THREE.Vector3();
      for (let i = 0; i < 4; i++) {
        cam.copy(look).addScaledVector(radial, CLOSER_OUT).addScaledVector(axis, side);
        if (cam.length() < 5.05) cam.setLength(5.05);
        const inward = look.clone().sub(cam).normalize().dot(radial.clone().negate());
        if (inward > 0.62) break;
        side *= 0.55;
      }
      return cam;
    };
    const placeCamera = (desired: THREE.Vector3, aim: THREE.Vector3, blend: number) => {
      const from = camera.position.clone();
      const q = new THREE.Quaternion().setFromUnitVectors(
        from.clone().normalize(),
        desired.clone().normalize(),
      );
      camera.position
        .copy(from)
        .normalize()
        .applyQuaternion(new THREE.Quaternion().slerp(q, blend))
        .multiplyScalar(THREE.MathUtils.lerp(from.length(), desired.length(), blend));
      controls.target.lerp(aim, blend);
    };
    const gateway = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.085, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xc8dae7,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(gateway);
    const dc = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x8d969e }),
      );
      rack.position.x = (i - 1) * 0.072;
      dc.add(rack);
    }
    scene.add(dc);
    let lastRoute = "",
      lastFocus = latest.current.focusId,
      lastZoom = latest.current.zoom,
      lastFlight = 0;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const epoch = Date.now(),
      startClock = performance.now();
    const idleCamera = camera.position.clone(),
      idleTarget = new THREE.Vector3();
    let drag = false,
      pointerId = -1;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const hit = (event: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(earth)[0]?.point;
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const point = hit(e);
      if (point) latest.current.onLocation(location(point));
    };
    const down = (e: PointerEvent) => {
      if (latest.current.flight) return;
      e.stopPropagation();
      drag = true;
      pointerId = e.pointerId;
      controls.enabled = false;
      pin.current?.setPointerCapture(e.pointerId);
      pin.current?.classList.add("dragging");
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
      if (latest.current.flight) return;
      const point = hit(e);
      if (point) latest.current.onLocation(location(point));
    };
    const button = pin.current;
    button?.addEventListener("pointerdown", down);
    button?.addEventListener("pointermove", move);
    button?.addEventListener("pointerup", end);
    button?.addEventListener("pointercancel", end);
    renderer.domElement.addEventListener("dblclick", place);
    const contextLost = (e: Event) => {
      e.preventDefault();
      setError(
        "The 3D scene paused. Reload to restore it; the comparison is still available.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    let width = 1,
      height = 1;
    const resize = () => {
      width = el.clientWidth;
      height = el.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0;
    let lastOffset = homeOffset;
    let returning: {
      started: number;
      camera: THREE.Vector3;
      target: THREE.Vector3;
      offset: number;
    } | null = null;
    const smooth = (t: number) => {
      t = Math.min(1, Math.max(0, t));
      return t * t * (3 - 2 * t);
    };
    const labelBoxes: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    const project = (
      node: HTMLElement | null,
      v: THREE.Vector3,
      show = true,
    ) => {
      if (!node) return;
      const point = v.clone().project(camera),
        anchorX = (point.x * 0.5 + 0.5) * width,
        anchorY = (-point.y * 0.5 + 0.5) * height;
      const isPin = node === pin.current;
      const nodeWidth = node.offsetWidth,
        nodeHeight = node.offsetHeight;
      let x = anchorX,
        y = anchorY;
      if (node === groundLabel.current) {
        x -= width < 700 ? 85 : 130;
        y -= 5;
      }
      if (node === gatewayLabel.current) {
        x += 90;
        y -= 30;
      }
      if (!isPin)
        x = Math.max(
          nodeWidth / 2 + 16,
          Math.min(width - nodeWidth / 2 - 16, x),
        );
      let box = {
        left: x - nodeWidth / 2,
        right: x + nodeWidth / 2,
        top: y - nodeHeight,
        bottom: y + 20,
      };
      if (!isPin) {
        for (let i = 0; i < 4; i++) {
          if (
            !labelBoxes.some(
              (b) =>
                box.left < b.right + 12 &&
                box.right > b.left - 12 &&
                box.top < b.bottom + 10 &&
                box.bottom > b.top - 10,
            )
          )
            break;
          y -= nodeHeight + 18;
          box = { ...box, top: y - nodeHeight, bottom: y + 12 };
        }
      }
      const composer = el.parentElement
        ?.querySelector(".composer, .journey-status")
        ?.getBoundingClientRect();
      if (
        !isPin &&
        composer &&
        box.right > composer.left - 10 &&
        box.left < composer.right + 10 &&
        box.bottom > composer.top - 2 &&
        box.top < composer.bottom + 15
      ) {
        y = composer.top - 30;
        box = { ...box, top: y - nodeHeight, bottom: y + 12 };
      }
      const obscured =
        composer &&
        box.right > composer.left - 10 &&
        box.left < composer.right + 10 &&
        box.bottom > composer.top - 2 &&
        box.top < composer.bottom + 15;
      const visible =
        show &&
        !obscured &&
        box.top > 82 &&
        box.bottom < height - 62 &&
        anchorX > 0 &&
        anchorX < width &&
        v.clone().normalize().dot(camera.position.clone().sub(v).normalize()) >
          -0.02 &&
        point.z < 1;
      if (node === groundLabel.current) {
        const dx = anchorX - (x + nodeWidth / 2),
          dy = anchorY - (y - nodeHeight / 2);
        node.style.setProperty("--leader-length", `${Math.hypot(dx, dy)}px`);
        node.style.setProperty("--leader-angle", `${Math.atan2(dy, dx)}rad`);
      }
      node.style.visibility = visible ? "visible" : "hidden";
      node.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      if (visible) labelBoxes.push(box);
    };
    function render(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      const p = latest.current;
      const networkTime = motionPreference.matches
        ? epoch
        : epoch + now - startClock;
      fillOrbit(networkTime, shellLat, shellLon, shellAlt);
      const linkPositions = ringGeometry.attributes
        .position as THREE.BufferAttribute;
      for (let i = 0; i < NODE_COUNT; i++) {
        const placed = position(
          { lat: shellLat[i], lon: shellLon[i] },
          shellRadius(shellAlt[i]),
        );
        world[i].copy(placed);
        shellPositions[i * 3] = placed.x;
        shellPositions[i * 3 + 1] = placed.y;
        shellPositions[i * 3 + 2] = placed.z;
        const plane = Math.floor(i / SATS_PER_PLANE);
        const slot = i % SATS_PER_PLANE;
        const next =
          plane * SATS_PER_PLANE + ((slot + 1) % SATS_PER_PLANE);
        const b = world[next];
        linkPositions.setXYZ(i * 2, placed.x, placed.y, placed.z);
        // The next satellite in a plane may not be written yet; fill it directly.
        if (b.lengthSq() === 0 || next > i) {
          const nb = position(
            { lat: shellLat[next], lon: shellLon[next] },
            shellRadius(shellAlt[next]),
          );
          world[next].copy(nb);
          linkPositions.setXYZ(i * 2 + 1, nb.x, nb.y, nb.z);
        } else linkPositions.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      }
      (shellGeometry.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
      linkPositions.needsUpdate = true;
      const routeStamp = p.flight
        ? `f${p.flight.id}:${p.origin.lat.toFixed(4)}:${p.origin.lon.toFixed(4)}:${p.site.name}`
        : `${p.origin.lat.toFixed(4)},${p.origin.lon.toFixed(4)},${p.site.name},${Math.floor(networkTime / 200)}`;
      if (routeStamp !== cachedKey) {
        cachedKey = routeStamp;
        cachedRoute = routeAt(
          p.origin,
          p.flight ? p.flight.id : networkTime,
        );
      }
      const network = cachedRoute;
      ingressPos.copy(world[network.ingress]);
      computePos.copy(world[network.compute]);
      gateway.position.copy(
        position(
          { lat: shellLat[network.ingress], lon: shellLon[network.ingress] },
          R + 0.035,
        ),
      );
      gateway.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        gateway.position.clone().normalize(),
      );
      // Update moving endpoints at 5 Hz, plus immediately on pin/provider changes.
      const routeKey = p.flight
        ? `f${p.flight.id}:${p.origin.lat.toFixed(4)}:${p.site.name}:${Math.floor(networkTime / 80)}`
        : `${p.origin.lat.toFixed(4)},${p.origin.lon.toFixed(4)},${p.site.name},${Math.floor(networkTime / 200)}`;
      if (routeKey !== lastRoute) {
        lastRoute = routeKey;
        const origin = position(p.origin, R + 0.035),
          destination = position(p.site, R + 0.035);
        originMarker.position.copy(origin);
        dc.position.copy(destination);
        dc.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          destination.clone().normalize(),
        );
        disposeTree(routeGroup);
        routeGroup.clear();
        const surface = (from: THREE.Vector3, to: THREE.Vector3) => {
          const a = from.clone().normalize(),
            b = to.clone().normalize(),
            axis = new THREE.Vector3().crossVectors(a, b);
          if (axis.lengthSq() < 1e-8)
            axis.crossVectors(a, new THREE.Vector3(0, 1, 0));
          if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
          axis.normalize();
          const angle = a.angleTo(b);
          return Array.from({ length: 129 }, (_, i) =>
            a
              .clone()
              .applyAxisAngle(axis, (angle * i) / 128)
              .multiplyScalar(
                R + 0.035 + Math.sin((Math.PI * i) / 128) * 0.025,
              ),
          );
        };
        groundPath = surface(origin, destination);
        const gatewayPath = surface(origin, gateway.position);
        spacePath = [...gatewayPath];
        const ingress = ingressPos.clone();
        for (let i = 1; i <= 48; i++)
          spacePath.push(gateway.position.clone().lerp(ingress, i / 48));
        routeGroup.add(
          line(groundPath, 0x73a9d2, 0.85, true),
          line(gatewayPath, 0xbecdd9, 0.72, true),
          line([gateway.position.clone(), ingress], 0xf0f5f8, 0.95),
        );
        for (let i = 1; i < network.hops.length; i++) {
          const a = world[network.hops[i - 1]].clone(),
            b = world[network.hops[i]].clone();
          routeGroup.add(line([a, b], 0xf3f7fa, 0.95));
          for (let j = 1; j <= 32; j++)
            spacePath.push(a.clone().lerp(b, j / 32));
        }
      }
      for (let h = 0; h < heroes.length; h++) {
        const craft = heroes[h];
        const hop = network.hops[Math.min(h, network.hops.length - 1)];
        craft.visible = Boolean(p.flight);
        if (!p.flight) continue;
        craft.position.copy(world[hop]);
        const after = network.hops[Math.min(h + 1, network.hops.length - 1)];
        const before = network.hops[Math.max(h - 1, 0)];
        const dir = (
          h === network.hops.length - 1 ? world[hop].clone().sub(world[before]) : world[after].clone().sub(world[hop])
        );
        if (dir.lengthSq() > 1e-8) craft.lookAt(craft.position.clone().add(dir));
      }
      if (p.focusId !== lastFocus) {
        lastFocus = p.focusId;
        camera.position.copy(
          position(
            {
              lat: Math.max(-65, Math.min(65, p.origin.lat - 32)),
              lon: p.origin.lon - 10,
            },
            homeDistance,
          ),
        );
        controls.target.set(0, 0, 0);
      }
      if (p.zoom !== lastZoom) {
        camera.position
          .sub(controls.target)
          .multiplyScalar(p.zoom > lastZoom ? 0.84 : 1.19)
          .clampLength(4.7, 15)
          .add(controls.target);
        lastZoom = p.zoom;
      }
      let offset = homeOffset;
      if (p.flight) {
        controls.enabled = false;
        const f = p.flight;
        if (f.id !== lastFlight) {
          if (returning) {
            camera.position.copy(idleCamera);
            controls.target.copy(idleTarget);
            returning = null;
          }
          lastFlight = f.id;
          idleCamera.copy(camera.position);
          idleTarget.copy(controls.target);
          tangentSmooth.set(0, 0, 0);
          pullback = null;
          signedFor = 0;
          introYaw = null;
        }
        const elapsed = f.reduced ? JOURNEY_MS : now - f.started;
        const routePts = [
          position(p.origin, R + 0.035),
          gateway.position.clone(),
          ...network.hops.map((hop) => world[hop].clone()),
        ];
        const lengths: number[] = [];
        let total = 0;
        for (let i = 1; i < routePts.length; i++) {
          const span = Math.max(routePts[i].distanceTo(routePts[i - 1]), 1e-4);
          lengths.push(span);
          total += span;
        }
        const sample = (u: number) => {
          let dist = Math.min(1, Math.max(0, u)) * total;
          for (let i = 0; i < lengths.length; i++) {
            if (dist <= lengths[i] || i === lengths.length - 1) {
              const span = dist / lengths[i];
              return {
                point: routePts[i]
                  .clone()
                  .lerp(routePts[i + 1], Math.min(1, Math.max(0, span))),
                tangent: routePts[i + 1].clone().sub(routePts[i]).normalize(),
              };
            }
            dist -= lengths[i];
          }
          return {
            point: routePts[routePts.length - 1].clone(),
            tangent: new THREE.Vector3(0, 1, 0),
          };
        };
        if (elapsed < FOLLOW_END && !f.reduced) {
          pullback = null;
          const opening = sample(0);
          if (tangentSmooth.lengthSq() < 1e-6) tangentSmooth.copy(opening.tangent);
          if (signedFor !== f.id) {
            signedFor = f.id;
            camera.updateMatrixWorld();
            const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(
              camera.quaternion,
            );
            const look = opening.point.clone();
            const radial = look.clone().normalize();
            const tangent = opening.tangent.clone().projectOnPlane(radial);
            if (tangent.lengthSq() < 1e-8)
              tangent.crossVectors(radial, new THREE.Vector3(0, 1, 0));
            tangent.normalize();
            const side = new THREE.Vector3()
              .crossVectors(radial, tangent)
              .normalize();
            const offset0 = idleCamera.clone().sub(look);
            const startOut = offset0.dot(radial);
            const tangential = offset0
              .clone()
              .addScaledVector(radial, -startOut);
            const startTan = tangential.length();
            const startAngle = Math.atan2(
              tangential.dot(side),
              tangential.dot(tangent),
            );
            const probe = new THREE.Quaternion().setFromAxisAngle(radial, 0.25);
            const rightSign =
              tangential
                .clone()
                .applyQuaternion(probe)
                .sub(tangential)
                .dot(screenRight) >= 0
                ? 1
                : -1;
            const sweepTo = (target: number) => {
              let d = target - startAngle;
              if (rightSign > 0)
                d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
              else {
                d = ((-d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                d = -d;
              }
              return d;
            };
            // Land broadside (90° off the path) by the rightward sweep closest to a quarter turn.
            let best = Infinity;
            let endAngle = startAngle + rightSign * (Math.PI / 2);
            for (const target of [Math.PI / 2, -Math.PI / 2]) {
              const swept = sweepTo(target);
              const score = Math.abs(Math.abs(swept) - Math.PI / 2);
              if (score < best) {
                best = score;
                endAngle = startAngle + swept;
              }
            }
            const poseAt = (angle: number, out: number, tan: number) => {
              const horiz = tangent
                .clone()
                .multiplyScalar(Math.cos(angle))
                .add(side.clone().multiplyScalar(Math.sin(angle)));
              return look
                .clone()
                .addScaledVector(radial, out)
                .addScaledVector(horiz, tan);
            };
            let minRadius = Infinity;
            for (let i = 0; i <= 8; i++) {
              const u = i / 8;
              minRadius = Math.min(
                minRadius,
                poseAt(
                  THREE.MathUtils.lerp(startAngle, endAngle, u),
                  THREE.MathUtils.lerp(startOut, CLOSER_OUT, u),
                  THREE.MathUtils.lerp(startTan, CLOSER_SIDE, u),
                ).length(),
              );
            }
            flightSign = Math.sin(endAngle) >= 0 ? 1 : -1;
            introYaw = {
              look,
              radial,
              tangent,
              side,
              startAngle,
              endAngle,
              startOut,
              startTan,
              // A local yaw stays outside the globe only when the camera already
              // sits outward of the pin. Otherwise swing around Earth to the same pose.
              local: minRadius >= 5.2 && startOut > 0.8,
              endPose: poseAt(endAngle, CLOSER_OUT, CLOSER_SIDE),
            };
          }
          if (elapsed < FOLLOW_START && introYaw) {
            const t = smooth(elapsed / FOLLOW_START);
            const yaw = introYaw;
            if (yaw.local) {
              const angle = THREE.MathUtils.lerp(yaw.startAngle, yaw.endAngle, t);
              const out = THREE.MathUtils.lerp(yaw.startOut, CLOSER_OUT, t);
              const tan = THREE.MathUtils.lerp(yaw.startTan, CLOSER_SIDE, t);
              const horiz = yaw.tangent
                .clone()
                .multiplyScalar(Math.cos(angle))
                .add(yaw.side.clone().multiplyScalar(Math.sin(angle)));
              camera.position
                .copy(yaw.look)
                .addScaledVector(yaw.radial, out)
                .addScaledVector(horiz, tan);
            } else {
              const q = new THREE.Quaternion().setFromUnitVectors(
                idleCamera.clone().normalize(),
                yaw.endPose.clone().normalize(),
              );
              camera.position
                .copy(idleCamera)
                .normalize()
                .applyQuaternion(new THREE.Quaternion().slerp(q, t))
                .multiplyScalar(
                  THREE.MathUtils.lerp(idleCamera.length(), yaw.endPose.length(), t),
                );
            }
            controls.target.lerpVectors(idleTarget, yaw.look, t);
            offset = THREE.MathUtils.lerp(homeOffset, -0.04, t);
            tangentSmooth.copy(opening.tangent);
          } else {
            const u = (elapsed - FOLLOW_START) / (FOLLOW_END - FOLLOW_START);
            const here = sample(u);
            tangentSmooth.lerp(here.tangent, 0.18).normalize();
            const pose = broadside(here.point, tangentSmooth, flightSign);
            const dt = Math.min(0.05, Math.max(0.001, (now - flightClock) / 1000));
            const blend = 1 - Math.exp(-dt / 0.28);
            placeCamera(pose, here.point, blend);
            offset = -0.04;
          }
        } else {
          if (!pullback)
            pullback = {
              cam: camera.position.clone(),
              target: controls.target.clone(),
            };
          const t = f.reduced
            ? 1
            : smooth((elapsed - FOLLOW_END) / (JOURNEY_MS - 200 - FOLLOW_END));
          const q = new THREE.Quaternion().setFromUnitVectors(
            pullback.cam.clone().normalize(),
            idleCamera.clone().normalize(),
          );
          camera.position
            .copy(pullback.cam)
            .normalize()
            .applyQuaternion(new THREE.Quaternion().slerp(q, t))
            .multiplyScalar(
              THREE.MathUtils.lerp(pullback.cam.length(), idleCamera.length(), t),
            );
          controls.target.lerpVectors(pullback.target, idleTarget, t);
          offset = THREE.MathUtils.lerp(-0.04, homeOffset, t);
        }
        flightClock = now;
      } else {
        if (lastFlight !== 0) {
          lastFlight = 0;
          if (camera.position.distanceTo(idleCamera) > 0.01)
            returning = {
              started: now,
              camera: camera.position.clone(),
              target: controls.target.clone(),
              offset: lastOffset,
            };
        }
        if (returning) {
          const t = motionPreference.matches
            ? 1
            : smooth((now - returning.started) / 950);
          const q = new THREE.Quaternion().setFromUnitVectors(
            returning.camera.clone().normalize(),
            idleCamera.clone().normalize(),
          );
          camera.position
            .copy(returning.camera)
            .normalize()
            .applyQuaternion(new THREE.Quaternion().slerp(q, t))
            .multiplyScalar(
              THREE.MathUtils.lerp(
                returning.camera.length(),
                idleCamera.length(),
                t,
              ),
            );
          controls.target.lerpVectors(returning.target, idleTarget, t);
          offset = THREE.MathUtils.lerp(returning.offset, homeOffset, t);
          if (t >= 1) returning = null;
        }
        controls.enabled = !drag && !returning;
      }
      lastOffset = offset;
      controls.minDistance = p.flight || returning ? 0.1 : 4.7;
      controls.maxDistance = p.flight || returning ? 40 : 15;
      controls.enableDamping = !p.flight && !returning;
      camera.setViewOffset(width, height, 0, -height * offset, width, height);
      controls.update();
      const active = Boolean(p.flight);
      routeGroup.visible = active;
      dc.visible = true;
      gateway.visible = active;
      ringMaterial.opacity = active ? 0.16 : 0.07;
      shellMaterial.opacity = active ? 0.55 : 0.92;
      groundDot.visible = spaceDot.visible = active;
      if (active) {
        const cycle = ((now - p.flight!.started) / 5000) % 2,
          t = p.flight!.reduced ? 0.65 : cycle <= 1 ? cycle : 2 - cycle;
        const follow = (dot: THREE.Mesh, points: THREE.Vector3[]) => {
          const n = t * (points.length - 1),
            i = Math.floor(n);
          dot.position
            .copy(points[i])
            .lerp(points[Math.min(i + 1, points.length - 1)], n - i);
        };
        follow(groundDot, groundPath);
        follow(spaceDot, spacePath);
      }
      labelBoxes.length = 0;
      project(pin.current, originMarker.position, !active);
      project(groundLabel.current, dc.position, true);
      project(spaceLabel.current, computePos, active);
      project(relayLabel.current, ingressPos, active);
      project(gatewayLabel.current, gateway.position, active);
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      button?.removeEventListener("pointerdown", down);
      button?.removeEventListener("pointermove", move);
      button?.removeEventListener("pointerup", end);
      button?.removeEventListener("pointercancel", end);
      renderer.domElement.removeEventListener("dblclick", place);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div ref={host} className="orbital-scene">
      <button
        ref={pin}
        className="origin-pin"
        aria-label="Drag your blue location pin. Use Location for keyboard controls."
        title="Hold and drag to move your location"
      >
        <span className="pin-head">
          <span />
        </span>
        <span className="pin-caption">YOU</span>
      </button>
      <div ref={groundLabel} className="scene-label ground-label">
        <span className="label-card">
          <small>{props.site.kind.toUpperCase()}</small>
          {props.site.name}
          <span className="label-caption">
            Nearest reference · not live routing
          </span>
        </span>
      </div>
      <div ref={spaceLabel} className="scene-label">
        Orbital compute<small>STARCLOUD · CONCEPT</small>
      </div>
      <div ref={relayLabel} className="scene-label relay-label">
        Uplink relay<small>4 LASER HOPS → COMPUTE</small>
      </div>
      <div ref={gatewayLabel} className="scene-label gateway-label">
        Uplink gateway<small>MODELED TERMINAL · FIBER → RF / OPTICAL</small>
      </div>
      {error && (
        <p className="scene-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
