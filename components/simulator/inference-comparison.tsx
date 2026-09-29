"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { compare } from "@/lib/starcloud/comparison";
import { PROVIDERS, SITES, type ProviderId, type Location, type Site } from "@/lib/starcloud/catalog";
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
function formatTime(ms: number) {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
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
    <div className={`results-path-image ${className}`}>
      {(!loaded || failed) && (
        <div className="results-image-fallback" aria-label={failed ? "Photo unavailable" : "Loading photo"}>
          <span aria-hidden="true">▤</span>{failed ? "Photo unavailable" : "Loading photo"}
        </div>
      )}
      {!failed && (
        <Image src={image.url} alt="" fill unoptimized sizes="(max-width: 650px) 100vw, 45vw" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
      <a className="results-image-caption" href={image.source} target="_blank" rel="noreferrer">
        {image.caption} <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

type MetricKind = "time" | "network" | "energy" | "water" | "cost";
function MetricSymbol({ kind }: { kind: MetricKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.55, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {kind === "time" && <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>}
      {kind === "network" && <><circle cx="4" cy="12" r="2" /><circle cx="20" cy="6" r="2" /><circle cx="20" cy="18" r="2" /><path d="m6 11 12-4M6 13l12 4" /></>}
      {kind === "energy" && <path d="m13 2-8 11h6l-1 9 9-12h-6z" />}
      {kind === "water" && <path d="M12 3C9 7 6 10.5 6 14a6 6 0 0 0 12 0c0-3.5-3-7-6-11Z" />}
      {kind === "cost" && <><circle cx="12" cy="12" r="8" /><path d="M15 8.5c-1-.9-5-.9-5 1.1 0 2.6 5 1.4 5 4.2 0 2.1-4 2.4-6 1.2M12 6v12" /></>}
    </svg>
  );
}
type Metric = { kind: MetricKind; label: string; detail: string; ground: number; space: number; format: (value: number) => string };
function MetricRow({ metric }: { metric: Metric }) {
  const max = Math.max(metric.ground, metric.space);
  const width = (value: number) => max && value ? `${Math.max(5, (value / max) * 100)}%` : "0%";
  return (
    <div className="results-metric-row">
      <div className="results-metric-title">
        <span className="results-metric-icon"><MetricSymbol kind={metric.kind} /></span>
        <span><strong>{metric.label}</strong><small>{metric.detail}</small></span>
      </div>
      <div className="results-metric-value">
        <strong>{metric.format(metric.ground)}</strong>
        <span className="results-metric-track" aria-hidden="true"><i className="ground" style={{ width: width(metric.ground) }} /></span>
      </div>
      <div className="results-metric-value">
        <strong>{metric.format(metric.space)}</strong>
        <span className="results-metric-track" aria-hidden="true"><i className="orbit" style={{ width: width(metric.space) }} /></span>
      </div>
    </div>
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
  const name = PROVIDERS[provider].name;
  const facility = imageForSite(provider, site);
  const metrics: Metric[] = [
    ...(result ? [{ kind: "time" as const, label: "Reply time", detail: "Measured API call", ground: c.ground.timeMs, space: c.space.timeMs, format: formatTime }] : []),
    { kind: "network", label: "Network delay", detail: "Modeled round trip", ground: c.ground.rttMs, space: c.space.rttMs, format: (value) => `${Math.round(value)} ms` },
    { kind: "energy", label: "Energy", detail: "Estimated for each reply", ground: c.ground.energyWh, space: c.space.energyWh, format: (value) => `${number(value)} Wh` },
    { kind: "water", label: "Cooling water", detail: "Estimated use", ground: c.ground.waterMl, space: c.space.waterMl, format: formatWater },
    { kind: "cost", label: "Power cost", detail: "Estimated electricity only", ground: c.ground.powerCostUsd, space: c.space.powerCostUsd, format: money },
  ];

  return (
    <div className="results-shell" role="presentation">
      <section ref={card} tabIndex={-1} className="results-card" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="results-card-head">
          <div><h2 id="results-title">Results</h2><p>Ground and orbit, side by side</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close results">×</button>
        </div>
        <p className="results-question"><span>You asked</span><strong>{prompt}</strong></p>

        <div className="results-paths" aria-label="Compared routes">
          <article className="results-path">
            <FacilityImage image={facility} />
            <div className="results-path-summary">
              <span className="results-route-label">Ground</span>
              <h3>{name} via {provider === "anthropic" ? "AWS" : PROVIDERS[provider].company}</h3>
              <p>Modeled near {site.name}</p>
              {!facility.siteSpecific && <small>{facility.regionSpecific ? "Regional photo · exact campus unknown" : "Provider reference photo · site image unavailable"}</small>}
            </div>
          </article>
          <article className="results-path">
            <FacilityImage image={orbitImage} className="results-orbit-image" />
            <div className="results-path-summary">
              <span className="results-route-label orbit">Orbit</span>
              <h3>{name} · orbital scenario</h3>
              <p>Starcloud-inspired route · modeled</p>
              <small>Starcloud-1 photo shows a demonstration satellite</small>
            </div>
          </article>
        </div>

        <section className="results-metrics" aria-labelledby="results-metrics-title">
          <div className="results-section-heading"><h3 id="results-metrics-title">At a glance</h3><span>Shorter bars mean less</span></div>
          <div className="results-metric-head"><span>Measure</span><span>Ground</span><span>Orbit</span></div>
          <div className="results-metric-list">{metrics.map((metric) => <MetricRow key={metric.kind} metric={metric} />)}</div>
        </section>

        <section className="results-answers" aria-labelledby="results-answers-title">
          <div className="results-section-heading"><h3 id="results-answers-title">Answers</h3><span>Two separate {name} calls</span></div>
          <div className="results-answer-grid">
            <article className="results-answer"><h4><span className="results-answer-dot ground" />Ground</h4>{result?.ground.text ? <Answer text={result.ground.text} /> : <p className="results-preview">Send a prompt to see a reply.</p>}</article>
            <article className="results-answer"><h4><span className="results-answer-dot orbit" />Orbit</h4>{result?.space.text ? <Answer text={result.space.text} /> : <p className="results-preview">Send a prompt to see a reply.</p>}</article>
          </div>
        </section>

        <p className="results-footnote">Locations and the orbital route are modeled; the provider API does not reveal the server that handled your request. Both measured reply times used ordinary provider API calls, not the illustrated orbital transport. Network, energy, water, and power cost are estimates.</p>
        <button className="primary-button results-again" onClick={onClose}>Ask another question <span aria-hidden="true">↗</span></button>
      </section>
    </div>
  );
}
