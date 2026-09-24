/**
 * Full-viewport scene surface. Stage 1 paints the dotted world map.
 * A later stage mounts React Three Fiber here; keep this node full-bleed.
 */
export function SceneCanvas() {
  return (
    <div
      id="scene-canvas"
      data-scene-placeholder="r3f"
      className="scene-canvas pointer-events-none absolute inset-0"
      role="img"
      aria-label="Dotted world map on a black field. Orbital scene canvas."
    />
  );
}
