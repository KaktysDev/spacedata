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
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const money = (n: number) =>
  n < 0.0001 ? `$${n.toFixed(6)}` : `$${n.toFixed(4)}`;

function formatWater(ml: number) {
  if (ml <= 0) return "0 mL";
  if (ml >= 1000) return `${number(ml / 1000)} L`;
  return `${number(ml)} mL`;
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
  const answer = result?.space.text || result?.ground.text || "";

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
        <table className="results-table">
          <thead>
            <tr>
              <th />
              <th>
                Ground
                <small>{site.name}</small>
              </th>
              <th>
                Orbit
                <small>{name} on the shell</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="metric">Water</td>
              <td>{formatWater(c.ground.waterMl)}</td>
              <td>{formatWater(c.space.waterMl)}</td>
            </tr>
            <tr>
              <td className="metric">Energy</td>
              <td>{number(c.ground.energyWh)} Wh</td>
              <td>{number(c.space.energyWh)} Wh</td>
            </tr>
            <tr>
              <td className="metric">Network</td>
              <td>{Math.round(c.ground.rttMs)} ms</td>
              <td>{Math.round(c.space.rttMs)} ms</td>
            </tr>
            <tr>
              <td className="metric">Power</td>
              <td>{money(c.ground.powerCostUsd)}</td>
              <td>{money(c.space.powerCostUsd)}</td>
            </tr>
            {result ? (
              <tr>
                <td className="metric">Reply</td>
                <td>{formatTime(c.ground.timeMs)}</td>
                <td>{formatTime(c.space.timeMs)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {answer ? (
          <div className="results-answer">
            <h3>Answer</h3>
            <p>{answer}</p>
          </div>
        ) : (
          <p className="results-preview">
            Network and power are modeled. Send a prompt for a reply.
          </p>
        )}
        <button className="primary-button results-again" onClick={onClose}>
          Ask again
        </button>
      </div>
    </div>
  );
}
