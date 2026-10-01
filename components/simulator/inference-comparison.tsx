"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { compare } from "@/lib/starcloud/comparison";
import { SITES, type ProviderId, type Location, type Site } from "@/lib/starcloud/catalog";
import { imageForSite, orbitImage, type SiteImage } from "@/lib/starcloud/site-images";
import type { ChatSuccessBody } from "@/lib/starcloud/chat-types";

export function preloadComparisonImages(provider: ProviderId, site?: Site) {
  const facility = imageForSite(provider, site ?? SITES[provider][0]);
  for (const url of [facility.url, orbitImage.url]) {
    const image = new window.Image();
    image.src = url;
  }
}

const number = (n: number) =>
  n === 0 ? "0" : n < 0.001 ? n.toPrecision(2) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (n: number) => `$${n.toFixed(8)}`;

function formatWater(ml: number) {
  if (ml <= 0) return "0 mL";
  if (ml >= 1000) return `${number(ml / 1000)} L`;
  return `${number(ml)} mL`;
}
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}
type AnswerBlock = { kind: "paragraph" | "bullets" | "numbers" | "heading"; lines: string[] };
function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const raw of text.trim().split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const kind: AnswerBlock["kind"] = /^#{1,4}\s+/.test(line)
      ? "heading" : /^[-*]\s+/.test(line) ? "bullets" : /^\d+[.)]\s+/.test(line) ? "numbers" : "paragraph";
    const content = line.replace(/^(?:#{1,4}|[-*]|\d+[.)])\s+/, "");
    const previous = blocks.at(-1);
    if (previous?.kind === kind && kind !== "heading") previous.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return blocks;
}
function Answer({ text }: { text: string }) {
  return (
    <div className="results-reply">
      {answerBlocks(text).map((block, i) => {
        if (block.kind === "bullets") return <ul key={i}>{block.lines.map((line, j) => <li key={j}>{inline(line)}</li>)}</ul>;
        if (block.kind === "numbers") return <ol key={i}>{block.lines.map((line, j) => <li key={j}>{inline(line)}</li>)}</ol>;
        if (block.kind === "heading") return <h4 key={i}>{inline(block.lines[0])}</h4>;
        return <p key={i}>{block.lines.map((line, j) => <span key={j}>{j > 0 && <br />}{inline(line)}</span>)}</p>;
      })}
    </div>
  );
}

function FacilityImage({ image, className = "" }: { image: SiteImage; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <figure className={`results-photo ${className}`}>
      <div className="results-photo-media">
        {(!loaded || failed) && (
          <div className="results-photo-fallback" aria-label={failed ? "Photo unavailable" : "Loading photo"}>
            {failed ? "Photo unavailable" : "Loading photo"}
          </div>
        )}
        {!failed && (
          <Image src={image.url} alt="" fill unoptimized sizes="(max-width: 650px) 100vw, 45vw" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        )}
      </div>
      <a className="results-photo-credit" href={image.source} target="_blank" rel="noreferrer">
        {image.caption} <span aria-hidden="true">↗</span>
      </a>
    </figure>
  );
}

type Metric = { label: string; ground: number; space: number; format: (value: number) => string };
function PathMetrics({ metrics, side }: { metrics: Metric[]; side: "ground" | "space" }) {
  return (
    <dl className="results-path-metrics">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dd>{metric.format(metric[side])}</dd>
          <dt>{metric.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function InferenceComparison({ result, provider, origin, site, prompt, onClose, joules, snapshotAt }: {
  result: ChatSuccessBody | null;
  provider: ProviderId;
  origin: Location;
  site: Site;
  prompt: string;
  onClose: () => void;
  joules: number;
  snapshotAt: number;
}) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !card.current) return;
      const focusable = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
      const first = focusable[0], last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus({ preventScroll: true }); };
  }, [onClose]);

  const c = compare(provider, origin, site, result, Math.ceil(prompt.length / 4) + 256, joules, snapshotAt);
  const facility = imageForSite(provider, site);
  const metrics: Metric[] = [
    { label: "Network", ground: c.ground.rttMs, space: c.space.rttMs, format: (value) => `${Math.round(value)} ms` },
    { label: "Energy", ground: c.ground.energyWh, space: c.space.energyWh, format: (value) => `${number(value)} Wh` },
    { label: "Water", ground: c.ground.waterMl, space: c.space.waterMl, format: formatWater },
    { label: "Power", ground: c.ground.powerCostUsd, space: c.space.powerCostUsd, format: money },
  ];

  return (
    <div className="results-shell" role="presentation">
      <section ref={card} tabIndex={-1} className="results-card" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="results-card-head">
          <h2 id="results-title">Results</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close results">×</button>
        </div>
        <p className="results-question"><span>You asked</span><strong>{prompt}</strong></p>

        <div className="results-paths" aria-label="Compared routes">
          <article className="results-path">
            <div className="results-path-copy">
              <span className="results-route-label">Ground</span>
              <h3>{site.name}</h3>
              <p>Modeled</p>
            </div>
            <FacilityImage image={facility} />
            <PathMetrics metrics={metrics} side="ground" />
            <div className="results-answer">
              {result?.ground.text ? <Answer text={result.ground.text} /> : <p className="results-preview">Send a prompt to see a reply.</p>}
            </div>
          </article>
          <article className="results-path">
            <div className="results-path-copy">
              <span className="results-route-label">Orbit</span>
              <h3>Starcloud-2</h3>
              <p>SSO · modeled</p>
            </div>
            <FacilityImage image={orbitImage} className="orbit" />
            <PathMetrics metrics={metrics} side="space" />
            <div className="results-answer">
              {result?.space.text ? <Answer text={result.space.text} /> : <p className="results-preview">Send a prompt to see a reply.</p>}
            </div>
          </article>
        </div>

        <button className="primary-button results-again" onClick={onClose}>Ask another question <span aria-hidden="true">↗</span></button>
      </section>
    </div>
  );
}
