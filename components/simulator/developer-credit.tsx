"use client";
import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

export function DeveloperCredit() {
  const link = useRef<HTMLAnchorElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef(0);
  const mode = useRef<"idle" | "out" | "back">("idle");
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
    label.current?.classList.remove("is-burst");
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (node && ctx) ctx.clearRect(0, 0, node.width, node.height);
  }

  function sample() {
    const text = label.current;
    const node = canvas.current;
    const host = link.current;
    if (!text || !node || !host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pad = 36;
    const width = host.offsetWidth + pad * 2;
    const height = host.offsetHeight + pad * 2;
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
    ctx.textAlign = "left";
    ctx.fillText(text.innerText.replace(/\s+/g, " ").trim(), pad, height / 2);
    const image = ctx.getImageData(0, 0, node.width, node.height);
    const next: Particle[] = [];
    const step = Math.max(2, Math.round(dpr * 2));
    for (let y = 0; y < node.height; y += step) {
      for (let x = 0; x < node.width; x += step) {
        if (image.data[(y * node.width + x) * 4 + 3] < 40) continue;
        const px = x / dpr;
        const py = y / dpr;
        const angle = Math.atan2(py - height / 2, px - width / 2);
        const speed = 0.35 + Math.random() * 1.15;
        next.push({
          x: px,
          y: py,
          ox: px,
          oy: py,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.8,
          vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.8,
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
    ctx.fillStyle = "rgba(232,232,232,0.92)";
    for (const particle of particles.current) {
      if (mode.current === "out") {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        moving = true;
      } else {
        particle.x += (particle.ox - particle.x) * 0.2;
        particle.y += (particle.oy - particle.y) * 0.2;
        if (
          Math.hypot(particle.x - particle.ox, particle.y - particle.oy) > 0.35
        )
          moving = true;
      }
      ctx.fillRect(particle.x, particle.y, 1.4, 1.4);
    }
    if (mode.current === "back" && !moving) {
      stop();
      return;
    }
    frame.current = requestAnimationFrame(draw);
  }

  function enter() {
    if (reduced.current || mode.current === "out") return;
    cancelAnimationFrame(frame.current);
    sample();
    if (!particles.current.length) return;
    mode.current = "out";
    label.current?.classList.add("is-burst");
    frame.current = requestAnimationFrame(draw);
  }

  function leave() {
    if (mode.current !== "out") return;
    mode.current = "back";
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }

  return (
    <a
      ref={link}
      className="developer-credit"
      href="https://www.linkedin.com/in/oleh-lahoda-0847a3393/"
      target="_blank"
      rel="noreferrer"
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <span ref={label} className="credit-label">
        <span className="credit-kicker">Developed by</span>{" "}
        <span className="developer-name">Oleh Lahoda</span>
        <span aria-hidden="true" className="credit-arrow">
          ↗
        </span>
      </span>
      <canvas ref={canvas} className="credit-canvas" aria-hidden="true" />
    </a>
  );
}
