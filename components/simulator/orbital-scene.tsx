"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { traceProgress, type RoutePhase } from "@/lib/starcloud/route-timeline";
import { useRouteClock, type RouteClock } from "@/components/simulator/simulator-provider";

type StageLayout = {
  spread: number;
  antenna: THREE.Vector3;
  cluster: THREE.Vector3;
  campus: THREE.Vector3;
  uplink: THREE.QuadraticBezierCurve3;
  toSpace: THREE.QuadraticBezierCurve3;
  toGround: THREE.QuadraticBezierCurve3;
  poses: Record<RoutePhase, { position: THREE.Vector3; lookAt: THREE.Vector3 }>;
};

function buildLayout(aspect: number): StageLayout {
  const safeAspect = Math.min(2.2, Math.max(0.72, aspect || 1));
  const spread = Math.min(1.45, Math.max(0.92, safeAspect * 0.7));
  const antenna = new THREE.Vector3(-spread, 0.92, 0);
  const cluster = new THREE.Vector3(0, 1.42, 0);
  const campus = new THREE.Vector3(spread, 0.62, 0);
  const idleZ = safeAspect < 1.05 ? 3.35 : 2.8;
  const chat = new THREE.Vector3(-spread * 0.15, -1.05, 0.15);
  const uplink = new THREE.QuadraticBezierCurve3(
    chat,
    new THREE.Vector3(-spread * 0.7, 0.05, 0.28),
    antenna,
  );
  const toSpace = new THREE.QuadraticBezierCurve3(
    antenna,
    new THREE.Vector3(-spread * 0.28, 1.55, 0.08),
    cluster,
  );
  const toGround = new THREE.QuadraticBezierCurve3(
    antenna,
    new THREE.Vector3(0, 1.05, 0.18),
    campus,
  );
  return {
    spread,
    antenna,
    cluster,
    campus,
    uplink,
    toSpace,
    toGround,
    poses: {
      idle: {
        position: new THREE.Vector3(0, 1.02, idleZ),
        lookAt: new THREE.Vector3(0, 0.96, 0),
      },
      uplink: {
        position: new THREE.Vector3(-spread * 0.55, 0.58, 1.55),
        lookAt: antenna.clone(),
      },
      split: {
        position: new THREE.Vector3(0, 1.05, 2.35),
        lookAt: new THREE.Vector3(0, 0.92, 0),
      },
      pullback: {
        position: new THREE.Vector3(0, 0.98, idleZ + 0.45),
        lookAt: new THREE.Vector3(0, 0.88, 0),
      },
      compare: {
        position: new THREE.Vector3(0, 0.98, idleZ + 0.45),
        lookAt: new THREE.Vector3(0, 0.88, 0),
      },
    },
  };
}

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

function CameraRig({
  clockRef,
  layout,
}: {
  clockRef: RefObject<RouteClock>;
  layout: StageLayout;
}) {
  const { camera } = useThree();
  const look = useRef(layout.poses.idle.lookAt.clone());

  useFrame((_, dt) => {
    const clock = clockRef.current;
    if (!clock) return;
    const pose = layout.poses[clock.phase];
    const k = clock.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
    camera.position.lerp(pose.position, k);
    look.current.lerp(pose.lookAt, k);
    camera.lookAt(look.current);
  });

  return null;
}

function Routes({
  clockRef,
  layout,
}: {
  clockRef: RefObject<RouteClock>;
  layout: StageLayout;
}) {
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
    writeCurve(uplink.geom, layout.uplink, up);
    writeCurve(space.geom, layout.toSpace, orbital);
    writeCurve(ground.geom, layout.toGround, terrestrial);
    placePacket(uplinkPacket.current, layout.uplink, up, up > 0 && up < 1);
    placePacket(spacePacket.current, layout.toSpace, orbital, orbital > 0);
    placePacket(
      groundPacket.current,
      layout.toGround,
      terrestrial,
      terrestrial > 0,
    );
  });

  return (
    <>
      <primitive object={uplink.line} />
      <primitive object={space.line} />
      <primitive object={ground.line} />
      <mesh ref={uplinkPacket} visible={false}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={spacePacket} visible={false}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={groundPacket} visible={false}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

function OrbitArc({ spread }: { spread: number }) {
  const line = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      points.push(
        new THREE.Vector3(
          -spread * 0.95 + t * spread * 1.9,
          1.02 + Math.sin(t * Math.PI) * 0.48,
          -0.08,
        ),
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });
    return new THREE.Line(geometry, material);
  }, [spread]);
  return <primitive object={line} />;
}

function Satellite({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.28, 0.12, 0.12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.4, 0, 0]}>
        <boxGeometry args={[0.52, 0.24, 0.02]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.52, 0.24, 0.02]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
    </group>
  );
}

function Constellation({
  position,
  spread,
}: {
  position: THREE.Vector3;
  spread: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const gap = Math.min(0.92, spread * 0.62);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y =
      position.y + Math.sin(clock.elapsedTime * 0.6) * 0.03;
  });
  return (
    <group ref={ref} position={position}>
      <Satellite position={[0, 0, 0]} />
      <Satellite position={[-gap, 0.08, 0]} />
      <Satellite position={[gap, -0.04, 0]} />
    </group>
  );
}

function Antenna({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.018, 0.028, 0.84, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[0.5, 0.25, 0]}>
        <coneGeometry args={[0.32, 0.16, 16, 1, true]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[0.04, 1.02, 0.08]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function Campus({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[0.7, 0.92, 0.52]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[0.58, 0.28, 0.06]}>
        <boxGeometry args={[0.4, 0.56, 0.4]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position={[-0.5, 0.22, -0.04]}>
        <boxGeometry args={[0.32, 0.44, 0.32]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
    </group>
  );
}

function SceneContents({
  clockRef,
}: {
  clockRef: RefObject<RouteClock>;
}) {
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const layout = useMemo(() => buildLayout(aspect), [aspect]);

  return (
    <>
      <CameraRig clockRef={clockRef} layout={layout} />
      <OrbitArc spread={layout.spread} />
      <Constellation position={layout.cluster} spread={layout.spread} />
      <Antenna x={layout.antenna.x} />
      <Campus x={layout.campus.x} />
      <Routes clockRef={clockRef} layout={layout} />
    </>
  );
}

export function OrbitalScene() {
  const clockRef = useRouteClock();
  return (
    <Canvas
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.02, 2.8], fov: 34, near: 0.1, far: 30 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <SceneContents clockRef={clockRef} />
    </Canvas>
  );
}
