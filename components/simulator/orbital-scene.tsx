"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { traceProgress, type RoutePhase } from "@/lib/starcloud/route-timeline";
import { useRouteClock, type RouteClock } from "@/components/simulator/simulator-provider";

const CHAT = new THREE.Vector3(-0.2, -1.35, 0.2);
const ANTENNA = new THREE.Vector3(-2.15, 0.62, 0);
const CLUSTER = new THREE.Vector3(0.25, 1.95, 0);
const CAMPUS = new THREE.Vector3(2.2, 0.48, 0);

const UPLINK = new THREE.QuadraticBezierCurve3(
  CHAT,
  new THREE.Vector3(-1.35, -0.15, 0.35),
  ANTENNA,
);
const TO_SPACE = new THREE.QuadraticBezierCurve3(
  ANTENNA,
  new THREE.Vector3(-0.85, 1.85, 0.15),
  CLUSTER,
);
const TO_GROUND = new THREE.QuadraticBezierCurve3(
  ANTENNA,
  new THREE.Vector3(0.15, 0.95, 0.25),
  CAMPUS,
);

const POSES: Record<
  RoutePhase,
  { position: THREE.Vector3; lookAt: THREE.Vector3 }
> = {
  idle: {
    position: new THREE.Vector3(0.15, 1.15, 7.2),
    lookAt: new THREE.Vector3(0.1, 0.8, 0),
  },
  uplink: {
    position: new THREE.Vector3(-1.45, 0.35, 3.2),
    lookAt: new THREE.Vector3(-1.55, 0.35, 0),
  },
  split: {
    position: new THREE.Vector3(0.1, 1.55, 5.5),
    lookAt: new THREE.Vector3(0.05, 1.05, 0),
  },
  pullback: {
    position: new THREE.Vector3(0.15, 1.4, 8.7),
    lookAt: new THREE.Vector3(0.1, 0.9, 0),
  },
  compare: {
    position: new THREE.Vector3(0.15, 1.4, 8.7),
    lookAt: new THREE.Vector3(0.1, 0.9, 0),
  },
};

function useRouteLine() {
  const geom = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(49 * 3), 3),
    );
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const object = new THREE.Line(geom, material);
    object.frustumCulled = false;
    return object;
  }, [geom]);
  return { geom, line };
}

function writeCurve(
  geom: THREE.BufferGeometry,
  curve: THREE.QuadraticBezierCurve3,
  progress: number,
) {
  const attr = geom.getAttribute("position") as THREE.BufferAttribute;
  const array = attr.array as Float32Array;
  if (progress <= 0.001) {
    geom.setDrawRange(0, 0);
    return;
  }
  const steps = 48;
  const count = Math.max(2, Math.round(Math.min(1, progress) * steps));
  for (let i = 0; i < count; i += 1) {
    const point = curve.getPoint((i / (count - 1)) * progress);
    array[i * 3] = point.x;
    array[i * 3 + 1] = point.y;
    array[i * 3 + 2] = point.z;
  }
  attr.needsUpdate = true;
  geom.setDrawRange(0, count);
}

function placePacket(
  mesh: THREE.Mesh | null,
  curve: THREE.QuadraticBezierCurve3,
  progress: number,
  visible: boolean,
) {
  if (!mesh) return;
  mesh.visible = visible && progress > 0.001;
  if (!mesh.visible) return;
  curve.getPoint(Math.min(1, progress), mesh.position);
}

function CameraRig({ clockRef }: { clockRef: RefObject<RouteClock> }) {
  const { camera } = useThree();
  const look = useRef(POSES.idle.lookAt.clone());

  useFrame((_, dt) => {
    const clock = clockRef.current;
    if (!clock) return;
    const pose = POSES[clock.phase];
    const k = clock.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
    camera.position.lerp(pose.position, k);
    look.current.lerp(pose.lookAt, k);
    camera.lookAt(look.current);
  });

  return null;
}

function Routes({ clockRef }: { clockRef: RefObject<RouteClock> }) {
  const uplink = useRouteLine();
  const space = useRouteLine();
  const ground = useRouteLine();
  const uplinkPacket = useRef<THREE.Mesh>(null);
  const spacePacket = useRef<THREE.Mesh>(null);
  const groundPacket = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const clock = clockRef.current;
    if (!clock) return;
    const now = performance.now();
    const up = traceProgress(
      clock.phase,
      clock.phaseStarted,
      now,
      clock.reducedMotion,
      "uplink",
    );
    const orbital = traceProgress(
      clock.phase,
      clock.phaseStarted,
      now,
      clock.reducedMotion,
      "space",
    );
    const terrestrial = traceProgress(
      clock.phase,
      clock.phaseStarted,
      now,
      clock.reducedMotion,
      "ground",
    );
    writeCurve(uplink.geom, UPLINK, up);
    writeCurve(space.geom, TO_SPACE, orbital);
    writeCurve(ground.geom, TO_GROUND, terrestrial);
    placePacket(uplinkPacket.current, UPLINK, up, up > 0 && up < 1);
    placePacket(spacePacket.current, TO_SPACE, orbital, orbital > 0);
    placePacket(groundPacket.current, TO_GROUND, terrestrial, terrestrial > 0);
  });

  return (
    <>
      <primitive object={uplink.line} />
      <primitive object={space.line} />
      <primitive object={ground.line} />
      <mesh ref={uplinkPacket} visible={false}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={spacePacket} visible={false}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={groundPacket} visible={false}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

function OrbitArc() {
  const line = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i += 1) {
      const angle = -1.15 + (i / 72) * 2.55;
      points.push(
        new THREE.Vector3(
          Math.sin(angle) * 2.7,
          1.62 + Math.cos(angle) * 0.38,
          -0.15,
        ),
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
    });
    return new THREE.Line(geometry, material);
  }, []);
  return <primitive object={line} />;
}

function Satellite({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.16, 0.07, 0.07]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.24, 0, 0]}>
        <boxGeometry args={[0.28, 0.14, 0.012]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[0.24, 0, 0]}>
        <boxGeometry args={[0.28, 0.14, 0.012]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
    </group>
  );
}

function Constellation() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.18;
  });
  return (
    <group ref={ref} position={[CLUSTER.x, CLUSTER.y, CLUSTER.z]}>
      <Satellite position={[0, 0, 0]} />
      <Satellite position={[-0.62, 0.08, 0]} />
      <Satellite position={[0.62, -0.05, 0.05]} />
    </group>
  );
}

function Antenna() {
  return (
    <group position={[ANTENNA.x, 0, ANTENNA.z]}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.56, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[0.55, 0.2, 0]}>
        <coneGeometry args={[0.2, 0.1, 14, 1, true]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[0.02, 0.68, 0.06]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function WireBox({
  position,
  size,
}: {
  position: [number, number, number];
  size: [number, number, number];
}) {
  const [width, height, depth] = size;
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, depth);
    const geometry = new THREE.EdgesGeometry(box);
    box.dispose();
    return geometry;
  }, [width, height, depth]);
  return (
    <lineSegments position={position} geometry={edges}>
      <lineBasicMaterial color="#ffffff" />
    </lineSegments>
  );
}

function Campus() {
  return (
    <group position={[CAMPUS.x, 0, CAMPUS.z]}>
      <WireBox position={[0, 0.28, 0]} size={[0.46, 0.56, 0.4]} />
      <WireBox position={[0.4, 0.16, 0.08]} size={[0.28, 0.32, 0.28]} />
      <WireBox position={[-0.34, 0.12, -0.04]} size={[0.22, 0.24, 0.22]} />
    </group>
  );
}

function SceneContents({
  clockRef,
}: {
  clockRef: RefObject<RouteClock>;
}) {
  return (
    <>
      <CameraRig clockRef={clockRef} />
      <OrbitArc />
      <Constellation />
      <Antenna />
      <Campus />
      <Routes clockRef={clockRef} />
    </>
  );
}

export function OrbitalScene() {
  const clockRef = useRouteClock();
  return (
    <Canvas
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 1.5]}
      camera={{ position: [0.15, 1.15, 7.2], fov: 42, near: 0.1, far: 40 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <SceneContents clockRef={clockRef} />
    </Canvas>
  );
}
