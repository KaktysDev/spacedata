"use client";
import { useEffect, useRef, useState } from "react";

// LinkedIn profile linked from this credit already, and confirmed by public
// posts under the same slug (Dublin School, Stanford summer, student developer).
const LINKEDIN = "https://www.linkedin.com/in/oleh-lahoda-0847a3393/";

type Particle = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

export function DeveloperCredit() {
  const wrap = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef(0);
  const mode = useRef<"idle" | "out" | "back">("idle");
  const [open, setOpen] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduced.current = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  function stop() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    mode.current = "idle";
    particles.current = [];
    name.current?.classList.remove("is-burst");
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (node && ctx) ctx.clearRect(0, 0, node.width, node.height);
  }

  function sample() {
    const text = name.current;
    const node = canvas.current;
    if (!text || !node) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pad = 18;
    const width = text.offsetWidth + pad * 2;
    const height = text.offsetHeight + pad * 2;
    node.width = Math.max(1, Math.ceil(width * dpr));
    node.height = Math.max(1, Math.ceil(height * dpr));
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(text);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("Oleh Lahoda", width / 2, height / 2);
    const image = ctx.getImageData(0, 0, node.width, node.height);
    const next: Particle[] = [];
    const step = Math.max(1, Math.round(dpr));
    for (let y = 0; y < node.height; y += step) {
      for (let x = 0; x < node.width; x += step) {
        if (image.data[(y * node.width + x) * 4 + 3] < 50) continue;
        const px = x / dpr;
        const py = y / dpr;
        next.push({
          x: px,
          y: py,
          ox: px,
          oy: py,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
        });
      }
    }
    particles.current = next;
    ctx.clearRect(0, 0, width, height);
  }

  function draw() {
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (!node || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, node.width, node.height);
    let moving = false;
    ctx.fillStyle = "rgba(236,236,236,0.95)";
    for (const particle of particles.current) {
      if (mode.current === "out") {
        particle.x += particle.vx;
        particle.y += particle.vy;
        const dx = particle.x - particle.ox;
        const dy = particle.y - particle.oy;
        if (dx * dx + dy * dy > 5) {
          particle.vx = -dx * 0.08;
          particle.vy = -dy * 0.08;
        }
        moving = true;
      } else {
        particle.x += (particle.ox - particle.x) * 0.28;
        particle.y += (particle.oy - particle.y) * 0.28;
        if (
          Math.hypot(particle.x - particle.ox, particle.y - particle.oy) > 0.3
        )
          moving = true;
      }
      ctx.fillRect(particle.x, particle.y, 1.35, 1.35);
    }
    if (mode.current === "back" && !moving) {
      stop();
      return;
    }
    frame.current = requestAnimationFrame(draw);
  }

  function enter() {
    setOpen(true);
    if (reduced.current || mode.current === "out") return;
    cancelAnimationFrame(frame.current);
    sample();
    if (!particles.current.length) return;
    mode.current = "out";
    name.current?.classList.add("is-burst");
    frame.current = requestAnimationFrame(draw);
  }

  function leave() {
    setOpen(false);
    if (mode.current !== "out") return;
    mode.current = "back";
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }

  return (
    <span className="developer-credit">
      <span className="credit-kicker">Developed by</span>
      <span
        ref={wrap}
        className="credit-name-wrap"
        onPointerEnter={enter}
        onPointerLeave={leave}
      >
        <span ref={name} className="developer-name">
          Oleh Lahoda
        </span>
        <canvas ref={canvas} className="credit-canvas" aria-hidden="true" />
        {open && (
          <span className="credit-pop" role="group" aria-label="Oleh Lahoda">
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noreferrer"
              aria-label="LinkedIn"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4.7 3.3A1.8 1.8 0 1 0 4.7 6.9 1.8 1.8 0 0 0 4.7 3.3zM3.2 8.6h3V20.7h-3V8.6zM9.2 8.6h2.9v1.7h.1c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7v7.3h-3v-6.5c0-1.5 0-3.5-2.1-3.5s-2.5 1.7-2.5 3.4v6.6h-3V8.6z"
                />
              </svg>
            </a>
          </span>
        )}
      </span>
    </span>
  );
}
