/**
 * Full-viewport dotted map. React Three Fiber mounts in the open band
 * above this plate so the halftone world stays the background.
 */
export function SceneCanvas() {
  return (
    <div
      id="scene-canvas"
      data-scene="dotted-map"
      className="scene-canvas pointer-events-none absolute inset-0"
      role="img"
      aria-label="Dotted world map on a black field. Orbital scene canvas."
    />
  );
}
