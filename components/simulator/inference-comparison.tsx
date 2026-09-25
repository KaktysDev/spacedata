"use client";
import { compare } from "@/lib/starcloud/comparison";
import {
  PROVIDERS,
  type ProviderId,
  type Location,
  type Site,
} from "@/lib/starcloud/catalog";
import type { ChatSuccessBody } from "@/lib/starcloud/chat-types";
import { Modal } from "./modal";
const number = (n: number) =>
  n === 0
    ? "0"
    : n < 0.001
      ? n.toPrecision(2)
      : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const money = (n: number) => `$${n < 0.0001 ? n.toFixed(8) : n.toFixed(6)}`;
function Cup({ dry = false }: { dry?: boolean }) {
  return (
    <span aria-hidden="true" className={`water-cup ${dry ? "dry" : ""}`}>
      <span />
    </span>
  );
}
export function InferenceComparison({
  result,
  provider,
  origin,
  site,
  prompt,
  onClose,
  onSources,
  joules,
  snapshotAt,
}: {
  result: ChatSuccessBody | null;
  provider: ProviderId;
  origin: Location;
  site: Site;
  prompt: string;
  onClose: () => void;
  onSources: () => void;
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
  const energy = (s: typeof c.ground) =>
    `${number(s.energyRange[0])}–${number(s.energyRange[1])}`;
  return (
    <Modal title="One question. Two paths." wide onClose={onClose}>
      <p className="result-intro">
        {result
          ? "One real AI answer, compared across two infrastructure scenarios."
          : "Route preview · no API call was made and no AI answer was generated."}
      </p>
      <div
        className="comparison-table"
        role="table"
        aria-label="Modeled infrastructure comparison"
      >
        <div className="compare-row compare-head" role="row">
          <span role="columnheader">PER REQUEST</span>
          <div role="columnheader">
            <i className="route-key ground" />
            On Earth<small>{site.name}</small>
          </div>
          <div role="columnheader">
            <i className="route-key" />
            In orbit<small>Starcloud concept</small>
          </div>
        </div>
        <div className="compare-row" role="row">
          <div role="rowheader">
            Electricity cost<small>Modeled · excludes hardware & API fee</small>
          </div>
          <strong role="cell">{money(c.ground.powerCostUsd)}</strong>
          <strong role="cell">{money(c.space.powerCostUsd)}</strong>
        </div>
        <div className="compare-row water-row" role="row">
          <div role="rowheader">
            Cooling water<small>On-site consumption · sensitivity range</small>
          </div>
          <div role="cell" className="water-value">
            <Cup />
            <strong>
              {number(c.ground.waterMl[0])}–{number(c.ground.waterMl[1])}
              <small>mL</small>
            </strong>
          </div>
          <div role="cell" className="water-value">
            <Cup dry />
            <strong>
              0<small>mL · closed-loop assumption</small>
            </strong>
          </div>
        </div>
        <div className="compare-row" role="row">
          <div role="rowheader">
            Network round trip<small>Modeled · excludes AI processing</small>
          </div>
          <strong role="cell">
            {c.ground.rttMs.toFixed(1)}
            <small>ms</small>
          </strong>
          <strong role="cell">
            {c.space.rttMs.toFixed(1)}
            <small>ms</small>
          </strong>
        </div>
        <div className="compare-row" role="row">
          <div role="rowheader">
            Facility energy<small>Modeled · sensitivity range</small>
          </div>
          <strong role="cell">
            {energy(c.ground)}
            <small>Wh</small>
          </strong>
          <strong role="cell">
            {energy(c.space)}
            <small>Wh</small>
          </strong>
        </div>
      </div>
      <div className="measured-strip">
        <div>
          <span>{result ? "API response time" : "AI response time"}</span>
          <strong>
            {result
              ? `${(result.latencyMs / 1000).toFixed(2)} s`
              : "Not measured"}
          </strong>
        </div>
        <div>
          <span>
            {c.estimated ? "Illustrative tokens" : "Provider-reported tokens"}
          </span>
          <strong>{c.tokens.toLocaleString()}</strong>
        </div>
        <div>
          <span>Shared API fee estimate</span>
          <strong>
            {c.apiCostUsd !== null ? money(c.apiCostUsd) : "No charge"}
          </strong>
        </div>
      </div>
      {result && (
        <details className="answer" open>
          <summary>
            {PROVIDERS[provider].name}’s answer <span>↗</span>
          </summary>
          <p>{result.answer.text}</p>
          <small>
            {result.answer.promptTokens} input ·{" "}
            {result.answer.completionTokens} output · {result.model}
            <br />
            Measured at {new Date(result.completedAt).toLocaleTimeString()}. No
            prompt history is stored by this app.
          </small>
        </details>
      )}
      {!result && (
        <p className="preview-explanation">
          The preview assumes your input plus 256 output tokens. Connect{" "}
          {PROVIDERS[provider].company} to compare a real workload.
        </p>
      )}
      <p className="result-note">
        This is a counterfactual comparison, not two live datacenter runs. The
        actual serving location, energy, water and orbital response time are not
        observable. Orbital price is a 2024 projection; total ownership cost and
        launch impacts are excluded.
      </p>
      <div className="dialog-actions">
        <button className="text-button" onClick={onSources}>
          Sources & assumptions ↗
        </button>
        <button className="primary-button" onClick={onClose}>
          Try another question <span>↗</span>
        </button>
      </div>
    </Modal>
  );
}
