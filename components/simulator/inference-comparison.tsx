"use client";
import { useEffect } from "react";
import { compare } from "@/lib/starcloud/comparison";
import {
  PROVIDERS,
  type ProviderId,
  type Location,
  type Site,
} from "@/lib/starcloud/catalog";
import type { ChatSuccessBody } from "@/lib/starcloud/chat-types";

const facilityImages: Record<
  ProviderId,
  { url: string; caption: string; source: string }
> = {
  gemini: {
    url: "https://www.gstatic.com/marketing-cms/assets/images/ac/30/39aa64bb4b559a06868470880a34/the-dalles-oregon-cooling-towers.jpg",
    caption: "Google data center · The Dalles, Oregon",
    source: "https://datacenters.google/discover-more/photo-gallery/",
  },
  anthropic: {
    url: "https://amazon-blogs-brightspot.s3.amazonaws.com/2d/e2/b31eea534918a828f5853b789759/inline-003-employee-final-color-mix-v2-uncompressed-mov-00-03-44-12-still024-copy.JPG",
    caption: "AWS data center · eastern Oregon",
    source: "https://www.aboutamazon.com/news/aws/aws-data-center-inside",
  },
  openai: {
    url: "https://msftstories.thesourcemediaassets.com/sites/696/2024/12/Azure-Cobalt-100-in-DC.jpg",
    caption: "Microsoft data center · reference image",
    source: "https://news.microsoft.com/datacenters/",
  },
  xai: {
    url: "https://media.x.ai/cdn-cgi/image/fit%3Dscale-down%2Conerror%3Dredirect%2Cf%3Dauto/v1/website/colossussite2-aac5dac3.jpg",
    caption: "xAI Colossus · Memphis, Tennessee",
    source: "https://x.ai/colossus",
  },
};
const orbitImage = {
  url: "https://techcrunch.com/wp-content/uploads/2026/03/Starcloud-1-deployment-virtical-e1774655359557.png?w=549",
  caption: "Starcloud-1 · deployment photo",
  source: "https://techcrunch.com/2026/03/30/starcloud-raises-170-million-series-ato-build-data-centers-in-space/",
};

export function preloadComparisonImages(provider: ProviderId) {
  for (const url of [facilityImages[provider].url, orbitImage.url]) {
    const image = new window.Image();
    image.src = url;
  }
}

const number = (n: number) =>
  n === 0
    ? "0"
    : n < 0.001
      ? n.toPrecision(2)
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

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
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function Answer({ text }: { text: string }) {
  return (
    <div className="results-reply">
      {text.trim().split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*] /.test(line)))
          return (
            <ul key={i}>
              {lines.map((line, j) => <li key={j}>{inline(line.replace(/^\s*[-*] /, ""))}</li>)}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function InferenceComparison({
  result,
  provider,
  origin,
  site,
  prompt,
  onClose,
  joules,
  snapshotAt,
}: {
  result: ChatSuccessBody | null;
  provider: ProviderId;
  origin: Location;
  site: Site;
  prompt: string;
  onClose: () => void;
  joules: number;
  snapshotAt: number;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const c = compare(
    provider,
    origin,
    site,
    result,
    Math.ceil(prompt.length / 4) + 256,
    joules,
    snapshotAt,
  );
  const name = PROVIDERS[provider].name;
  const facility = facilityImages[provider];

  return (
    <div className="results-shell" role="presentation">
      <section className="results-card" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="results-card-head">
          <div>
            <span className="results-eyebrow">Route comparison</span>
            <h2 id="results-title">Your answer, two paths</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close results" autoFocus>×</button>
        </div>
        <p className="results-question"><span>You asked</span> {prompt}</p>

        <div className="results-paths">
          {([
            {
              id: "ground",
              label: "Ground",
              title: `${name} via ${PROVIDERS[provider].company}`,
              subtitle: `Modeled site near ${site.name}`,
              image: facility,
              answer: result?.ground.text,
            },
            {
              id: "space",
              label: "Orbit",
              title: `${name} · orbital scenario`,
              subtitle: "Starcloud-inspired route · modeled",
              image: orbitImage,
              answer: result?.space.text,
            },
          ] as const).map((path) => (
            <article className="results-path" key={path.id}>
              <div className="results-path-image" style={{ backgroundImage: `linear-gradient(180deg, transparent 38%, #080a0ee8), url("${path.image.url}")`, backgroundPosition: path.id === "space" ? "center 83%" : "center" }} role="img" aria-label={path.image.caption}>
                <span className="results-path-badge">{path.label}</span>
                <div className="results-image-caption">
                  <a href={path.image.source} target="_blank" rel="noreferrer">{path.image.caption} ↗</a>
                </div>
              </div>
              <div className="results-path-content">
                <h3>{path.title}</h3>
                <p className="results-path-subtitle">{path.subtitle}</p>
                <div className="results-answer-label">Reply</div>
                {path.answer ? <Answer text={path.answer} /> : <p className="results-preview">Send a prompt to see a reply.</p>}
              </div>
            </article>
          ))}
        </div>

        <div className="results-metrics">
          <div className="results-section-heading">
            <h3>How the routes compare</h3>
            <span>Same prompt · {name}</span>
          </div>
          <table className="results-table">
            <thead><tr><th scope="col">Measure</th><th scope="col">Ground</th><th scope="col">Orbit</th></tr></thead>
            <tbody>
              {result && <tr><th scope="row">Reply time <small>Measured provider response</small></th><td>{formatTime(c.ground.timeMs)}</td><td>{formatTime(c.space.timeMs)}</td></tr>}
              <tr><th scope="row">Network round trip <small>Modeled route</small></th><td>{Math.round(c.ground.rttMs)} ms</td><td>{Math.round(c.space.rttMs)} ms</td></tr>
              <tr><th scope="row">Energy <small>Estimated for this reply</small></th><td>{number(c.ground.energyWh)} Wh</td><td>{number(c.space.energyWh)} Wh</td></tr>
              <tr><th scope="row">Cooling water <small>Estimated consumption</small></th><td>{formatWater(c.ground.waterMl)}</td><td>{formatWater(c.space.waterMl)}</td></tr>
              <tr><th scope="row">Electricity cost <small>Estimated energy only</small></th><td>{money(c.ground.powerCostUsd)}</td><td>{money(c.space.powerCostUsd)}</td></tr>
            </tbody>
          </table>
          <p className="results-footnote">Facility photos show reference infrastructure, not the exact server handling this request. The Starcloud photo shows its first spacecraft during deployment; the orbital route and environmental figures are modeled.</p>
        </div>
        <button className="primary-button results-again" onClick={onClose}>Ask another question <span aria-hidden="true">↗</span></button>
      </section>
    </div>
  );
}
