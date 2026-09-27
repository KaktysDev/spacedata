"use client";
import { compare } from "@/lib/starcloud/comparison";
import {
  PROVIDERS,
  type ProviderId,
  type Location,
  type Site,
} from "@/lib/starcloud/catalog";
import type { ChatSuccessBody } from "@/lib/starcloud/chat-types";

const number = (n: number) =>
  n === 0
    ? "0"
    : n < 0.001
      ? n.toPrecision(2)
      : n.toLocaleString(undefined, { maximumFractionDigits: 3 });

const money = (n: number) =>
  n < 0.0001 ? `$${n.toFixed(8)}` : `$${n.toFixed(6)}`;

function formatWater(ml: number) {
  if (ml <= 0) return { label: "0 mL", fill: 0, bucket: false };
  if (ml >= 1000)
    return {
      label: `${number(ml / 1000)} L`,
      fill: Math.min(1, ml / 5000),
      bucket: true,
    };
  return {
    label: `${number(ml)} mL`,
    fill: Math.min(1, Math.max(0.08, ml / 80)),
    bucket: false,
  };
}

function WaterGraphic({ ml }: { ml: number }) {
  const { label, fill, bucket } = formatWater(ml);
  return (
    <div className={`water-meter ${bucket ? "bucket" : "cup"}`}>
      <span
        aria-hidden="true"
        className={`water-vessel ${bucket ? "bucket" : "cup"} ${fill <= 0 ? "dry" : ""}`}
      >
        <span style={{ height: `${fill * 100}%` }} />
      </span>
      <strong>{label}</strong>
    </div>
  );
}

function formatTime(ms: number) {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
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
  const groundTitle = `${name} · ground`;
  const spaceTitle = `${name} · space`;

  return (
    <div className="results-shell" role="dialog" aria-label="Route comparison">
      <div className="results-card">
        <div className="results-card-head">
          <h2>Results</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close results"
          >
            ×
          </button>
        </div>

        <div className="results-sides" role="table" aria-label="Metrics">
          <div className="results-col" role="columnheader">
            <span className="results-side-label">{groundTitle}</span>
            <small>{site.name}</small>
          </div>
          <div className="results-col" role="columnheader">
            <span className="results-side-label">{spaceTitle}</span>
            <small>LEO compute</small>
          </div>

          <div className="results-metric-label">water</div>
          <div className="results-col">
            <WaterGraphic ml={c.ground.waterMl} />
          </div>
          <div className="results-col">
            <WaterGraphic ml={c.space.waterMl} />
          </div>

          <div className="results-metric-label">energy</div>
          <div className="results-col">
            <strong>
              {number(c.ground.energyWh)}
              <small>Wh</small>
            </strong>
          </div>
          <div className="results-col">
            <strong>
              {number(c.space.energyWh)}
              <small>Wh</small>
            </strong>
          </div>

          <div className="results-metric-label">tokens</div>
          <div className="results-col">
            <strong>{c.ground.tokens.toLocaleString()}</strong>
          </div>
          <div className="results-col">
            <strong>{c.space.tokens.toLocaleString()}</strong>
          </div>

          <div className="results-metric-label">time</div>
          <div className="results-col">
            <strong>
              {result ? formatTime(c.ground.timeMs) : `${c.ground.rttMs.toFixed(0)} ms`}
            </strong>
          </div>
          <div className="results-col">
            <strong>
              {result ? formatTime(c.space.timeMs) : `${c.space.rttMs.toFixed(0)} ms`}
            </strong>
          </div>

          <div className="results-metric-label">cost</div>
          <div className="results-col">
            <strong>
              {c.ground.costUsd !== null ? money(c.ground.costUsd) : "—"}
            </strong>
          </div>
          <div className="results-col">
            <strong>
              {c.space.costUsd !== null ? money(c.space.costUsd) : "—"}
            </strong>
          </div>
        </div>

        {result ? (
          <div className="results-answers">
            <article>
              <h3>{groundTitle}</h3>
              <p>{result.ground.text}</p>
            </article>
            <article>
              <h3>{spaceTitle}</h3>
              <p>{result.space.text}</p>
            </article>
          </div>
        ) : (
          <p className="results-preview">Preview · no API answers</p>
        )}

        <button className="primary-button results-again" onClick={onClose}>
          Ask again
        </button>
      </div>
    </div>
  );
}
