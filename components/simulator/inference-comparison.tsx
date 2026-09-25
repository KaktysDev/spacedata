"use client";
import { useSimulator } from "./simulator-provider";
import { Icon } from "./icon";
import { priceTokens } from "@/lib/starcloud/engine";

export function InferenceComparison() {
  const { prompt, result, error, mode, showBaseline } = useSimulator();
  const space = priceTokens("space", 1_000_000_000, false);
  const ground = priceTokens("ground", 1_000_000_000, false);
  return (
    <section className="comparison" aria-label="Prompt comparison">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">
            {mode === "simulation"
              ? "SIMULATED JOURNEY COMPLETE"
              : "YOUR RESULTS"}
          </p>
          <h2>One question. Two footprints.</h2>
        </div>
        <button className="text-button" onClick={showBaseline}>
          <Icon name="reset" size={14} /> New journey
        </button>
      </div>
      <p className="quoted-prompt">“{prompt}”</p>
      {error ? (
        <div role="alert" className="error-message">
          <Icon name="info" />
          <div>
            <h3>We couldn’t get the live answers.</h3>
            <p>{error}</p>
            <p>
              Your prompt is still in the composer. Send it again, or switch to
              Simulation.
            </p>
          </div>
        </div>
      ) : result ? (
        <>
          <p className="answer-caption">
            Two independent answers from {result.model}. Infrastructure metrics
            are simulated.
          </p>
          <div className="answer-grid">
            {(["space", "ground"] as const).map((venue) => (
              <article key={venue}>
                <h3>
                  <Icon
                    name={venue === "space" ? "satellite" : "globe"}
                    size={18}
                  />
                  {venue === "space" ? "Space" : "Ground"}
                  <span>
                    {result[venue].totalTokens.toLocaleString()} tokens
                    {result[venue].usageEstimated ? " · estimated" : ""}
                  </span>
                </h3>
                <p>{result[venue].text}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="simulation-complete">
          <Icon name="check" size={17} /> Your prompt completed both simulated
          routes. Switch to Live AI for generated answers when a server
          connection is available.
        </p>
      )}
      <div className="comparison-stats">
        <div>
          <span>ENERGY COST / 1B TOKENS</span>
          <strong>
            ${space.energyCostUsd.toFixed(2)} <small>space</small>
            <i> / </i>${ground.energyCostUsd.toFixed(2)} <small>ground</small>
          </strong>
        </div>
        <div>
          <span>COOLING WATER / 1B TOKENS</span>
          <strong>
            0 L <small>space</small>
            <i> / </i>
            {ground.waterLiters.toFixed(1)} L <small>ground</small>
          </strong>
        </div>
        <p>
          Same workload, modeled at scale.
          <br />
          Energy cost excludes hardware and API fees.
        </p>
      </div>
    </section>
  );
}
