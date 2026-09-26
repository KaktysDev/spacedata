"use client";
import {
  PROVIDERS,
  SITE_SOURCES,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import { Modal } from "./modal";
export function SourcesNote({
  onClose,
  provider,
  joules,
  onJoules,
}: {
  onClose: () => void;
  provider: ProviderId;
  joules: number;
  onJoules: (n: number) => void;
}) {
  return (
    <Modal title="Behind the comparison" onClose={onClose}>
      <div className="methodology">
        <p>
          Measured values come from one real request to the selected AI
          provider. The same workload is passed through a ground model and an
          orbital model. No production AI provider in this app is running your
          request in space.
        </p>
        <h3>Energy is a scenario, not telemetry</h3>
        <p>
          Providers do not publish per-request joules. We multiply total tokens
          by a shared IT-energy assumption, then add facility overhead: PUE 1.04
          in orbit (assumed), 1.09 for Google (2025 fleet average), or 1.10 for
          other ground providers (assumed). The range is 0.5–2× the selected
          energy, a sensitivity interval, not a statistical confidence interval.
        </p>
        <label className="assumption-control">
          IT energy per token <strong>{joules.toFixed(2)} J</strong>
          <input
            aria-label="IT joules per token"
            type="range"
            min="0.1"
            max="5"
            step="0.01"
            value={joules}
            onChange={(e) => onJoules(Number(e.target.value))}
          />
        </label>
        <p>
          The default 1.11 J/token is an illustrative setting, not a measurement
          of the chosen model. Google’s published Gemini Apps median of 0.24 Wh
          per prompt is a separate fleet benchmark; it cannot calibrate every
          API request.
        </p>
        <h3>Water & price</h3>
        <p>
          Ground on-site water intensity spans an assumed 0.2–2.0 L/kWh,
          combined with the energy range. Orbit assumes closed-loop radiator
          cooling with no routine evaporative loss. Neither includes water used
          to generate electricity, manufacturing, or launch. Electricity prices
          use the paper’s projected $0.002/kWh in orbit and historical
          $0.045/kWh US ground reference. These are not current regional
          electricity tariffs or end-user API prices.
        </p>
        <h3>Routes & timing</h3>
        <p>
          The pin picks the nearest entry in a curated public reference catalog.
          Google sites, AWS Bedrock regions, Azure AI regions and xAI endpoint
          regions are different kinds of references. Calling their direct API
          does not guarantee that region will serve your request. Ground RTT
          assumes 1.3× great-circle distance, 200,000 km/s fiber and 10 ms
          overhead. Orbit uses a Starlink Gen-1 Shell 1 geometry: 1,584
          satellites, 72 planes of 22, 550 km, 53° inclination, and a
          95.5-minute period. Planes are spaced in right ascension with a
          Walker-delta phase and a few degrees of fixed scatter so the shell is
          not a perfect grid. The uplink is the nearest satellite at least 25°
          above the horizon; above the shell’s coverage the highest satellite
          is used. A modeled gateway at that satellite’s nadir takes the
          terrestrial fiber haul, then a vertical uplink. Four line-of-sight
          laser hops — in-plane, then one adjacent-plane crosslink — reach a
          remote compute node. The return follows the reverse path. The
          estimate uses fiber at 200,000 km/s, the speed of light for the
          uplink and laser chords, and 12 ms overhead. In-plane rings are drawn;
          a request highlights only its hops. This is a transport model, not a
          Starcloud deployment specification. Weather, handover, congestion and
          bandwidth are not modeled. Altitude is exaggerated on screen;
          animation duration is not network latency.
        </p>
        <h3>Technology maturity</h3>
        <p>
          Starcloud-1 launched an H100 demonstration in 2025. The paper’s 40 MW
          design is a future architecture, not an operational fleet or a
          verified inference-speed advantage. Solar and radiator modules in the
          scene are conceptual. There is no public live Starcloud datacenter
          telemetry feed. The whitepaper describes RF/optical access,
          inter-satellite optical networking and close formation of compute
          modules. This ring illustrates communication between separate
          facilities and relays; it does not pretend that widely separated nodes
          form a low-latency training cluster.
        </p>
        <h3>Sources · checked September 24, 2026</h3>
        <ul className="source-list">
          <li>
            <a
              href="https://starcloudinc.github.io/wp.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Starcloud whitepaper · v1.03, September 2024 ↗
            </a>
          </li>
          <li>
            <a
              href="https://www.starcloud.com/starcloud-1"
              target="_blank"
              rel="noreferrer"
            >
              Starcloud-1 hardware demonstration ↗
            </a>
          </li>
          <li>
            <a
              href="https://www.datacenters.google/efficiency/"
              target="_blank"
              rel="noreferrer"
            >
              Google facility efficiency ↗
            </a>
          </li>
          <li>
            <a
              href="https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference"
              target="_blank"
              rel="noreferrer"
            >
              Google’s measured inference footprint ↗
            </a>
          </li>
          <li>
            <a href={SITE_SOURCES[provider]} target="_blank" rel="noreferrer">
              {PROVIDERS[provider].company} infrastructure references ↗
            </a>
          </li>
          <li>
            <a
              href={PROVIDERS[provider].source}
              target="_blank"
              rel="noreferrer"
            >
              {PROVIDERS[provider].name} model & API pricing ↗
            </a>
          </li>
        </ul>
        <p>
          API pricing is a dated standard-rate estimate, including reported
          cached input discounts, not your invoice. Measured response time
          covers the server’s provider call; it does not include the visual
          journey. Requests are sent to the selected provider under its data
          policy. The app retains only short-lived hashed rate-limit counters.
        </p>
      </div>
    </Modal>
  );
}
