import Image from "next/image";
import {
  PROVIDERS,
  SITE_SOURCES,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import { Modal } from "./modal";
const paper = "https://starcloudinc.github.io/wp.pdf";
export function SourcesNote({
  provider,
  joules,
  onJoules,
  onClose,
}: {
  provider: ProviderId;
  joules: number;
  onJoules: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="One request. Two possibilities." wide onClose={onClose}>
      <div className="methodology">
        <p className="method-lead">
          Today’s networks. Tomorrow’s infrastructure.
        </p>
        <p>
          The selected provider answers the same prompt twice. We compare a
          modeled ground path with a hypothetical orbital path; neither API
          request runs in space.
        </p>
        <figure className="paper-hero">
          <Image
            src="/research/solar-radiator.webp"
            alt="Starcloud concept rendering of a large solar array and radiators above Earth"
            width={1047}
            height={583}
            sizes="(max-width: 700px) 90vw, 800px"
          />
          <figcaption>
            Solar power. Radiative cooling.{" "}
            <a href={`${paper}#page=8`} target="_blank" rel="noreferrer">
              Starcloud concept · p. 8 ↗
            </a>
          </figcaption>
        </figure>
        <section className="method-section">
          <span className="section-number">01 / THE JOURNEY</span>
          <h3>Follow the connections.</h3>
          <div className="route-diagrams">
            <div>
              <strong>On Earth</strong>
              <ol>
                <li>You</li>
                <li>ISP & peering</li>
                <li>Provider</li>
                <li>You</li>
              </ol>
              <p>
                Packets follow terrestrial and subsea fiber through routers. The
                return is shown along the same path.
              </p>
            </div>
            <div>
              <strong>In orbit</strong>
              <ol>
                <li>You</li>
                <li>RF uplink, or a land gateway first</li>
                <li>Optical links across the relay shell</li>
                <li>Starcloud-2</li>
                <li>Back to you</li>
              </ol>
              <p>
                The request leaves with the ground route. A relay at least 25°
                up takes the RF uplink. If none is visible, a land gateway
                provides it. Optical links then cross the relay shell to a craft
                standing in for Starcloud-2. The reply returns across that shell
                and stops at you.
              </p>
            </div>
          </div>
          <p className="fine-print">
            Both routes start together. They are modeled, not traceroutes. City connections
            approximate fiber corridors; real ISP policies and return paths
            vary. Provider markers are public infrastructure references, not a
            promise about where an API call runs. Gateway coverage, weather,
            carrier capacity and available laser terminals are not simulated.
          </p>
        </section>
        <section className="method-section">
          <span className="section-number">02 / THE ARCHITECTURE</span>
          <h3>Built around power, cooling, and compute.</h3>
          <p>
            Starcloud’s paper describes modular compute containers, solar
            arrays, radiators, and RF or optical terminals on a shared spine.
            The highlighted spacecraft carries that hardware. Links between
            spacecraft are optical hops along the shell, not the in-facility
            spine.
          </p>
          <figure className="paper-diagram">
            <Image
              src="/research/network-architecture.webp"
              alt="Starcloud network architecture diagram showing RF and optical terminals connected to a spine with solar power, radiators, network switches and compute containers"
              width={1284}
              height={849}
              sizes="(max-width: 700px) 90vw, 760px"
            />
            <figcaption>Network architecture · whitepaper p. 7</figcaption>
          </figure>
          <div className="paper-pair">
            <figure>
              <Image
                src="/research/compute-container.webp"
                alt="Starcloud compute container schematic with internal racks"
                width={1146}
                height={617}
                sizes="(max-width: 700px) 85vw, 370px"
              />
              <figcaption>Compute container · p. 6</figcaption>
            </figure>
            <figure>
              <Image
                src="/research/modular-design.webp"
                alt="Starcloud modular stem and leaf architecture concept"
                width={702}
                height={606}
                sizes="(max-width: 700px) 85vw, 370px"
              />
              <figcaption>Modular assembly · p. 12</figcaption>
            </figure>
          </div>
          <p className="fine-print">
            The picture shows 8,800 illustrative spacecraft in one ring, held
            off the globe for clarity. Routing altitudes run from 600 km to
            850 km around a 725 km reference plane. Inclination
            and the ascending node each wander about a dozen degrees around the
            sun-synchronous dawn-dusk plane, so the ring has thickness without
            becoming a shell. Craft are spaced all the way around that ring.
            The 2026 FCC filing asks for narrow 600–850 km shells; this is one
            illustrative ring with exaggerated visual distance from Earth. A fixed
            sun over 20°E still defines the reference dawn-dusk plane, matching
            the paper’s figure. That sun direction is not a live ephemeris.
            The paper’s data center is a set of containers on one spine, with
            laser links onward. The highlighted craft stands in for Starcloud-2,
            one commercial GPU smallsat planned for sun-synchronous orbit in
            2027. The ring is a modeled relay shell, not that satellite.
            Starcloud-1 is a demonstration spacecraft, not this path.
            The FCC filing requests up to 88,000 spacecraft; 8,800 is not that
            fleet and not an operating constellation. Hardware size and the
            drawn orbital radius are enlarged; routing distances use physical
            kilometers.
          </p>
        </section>
        <section className="method-section">
          <span className="section-number">03 / THE NUMBERS</span>
          <h3>Adjust the assumption.</h3>
          <p>
            Tokens and provider response time come from the API when available.
            Energy and water are estimates; providers do not expose per-request
            telemetry.
          </p>
          <label className="assumption-control">
            <span>IT energy / token</span>
            <strong>{joules.toFixed(2)} J</strong>
            <input
              aria-label="IT energy per token"
              type="range"
              min="0.1"
              max="5"
              step="0.01"
              value={joules}
              onChange={(e) => onJoules(Number(e.target.value))}
            />
          </label>
          <details className="method-details">
            <summary>
              Energy, water & cost <span>+</span>
            </summary>
            <p>
              Energy = total tokens × selected J/token ÷ 3,600 × PUE. PUE is
              1.04 in orbit (assumed), 1.09 for Google (2025 fleet average), and
              1.10 otherwise (assumed). The 0.5–2× range is sensitivity, not
              confidence. The default 1.11 J/token is illustrative.
            </p>
            <p>
              Ground cooling uses an assumed 0.2–2.0 L/kWh, combined with the
              energy range. Orbit assumes no routine evaporative cooling loss.
              Power costs use the paper’s projected $0.002/kWh in orbit and
              historical $0.045/kWh ground reference. These exclude
              electricity-generation water, manufacturing, launch, hardware and
              API fees.
            </p>
          </details>
          <details className="method-details">
            <summary>
              Distance, timing & limitations <span>+</span>
            </summary>
            <p>
              Fiber distance follows the city graph plus a 1.15× allowance for
              local cable routing, at 200,000 km/s. The orbital request starts
              with the ground request. It uplinks directly when a shell
              spacecraft is at least 25° above the horizon; otherwise it uses
              a feeder to a land gateway first. Optical links run along the
              same shell at 299,792 km/s, must clear Earth, and stay within
              4,000 km. Round trips add 10 ms on the ground path, or 8 ms plus
              1.5 ms per optical hop in orbit. The animation stretches network
              propagation equally on both paths so the modeled finish order is
              preserved; its seconds are not actual network delay. It waits
              for both terrestrial API replies before showing either return.
              Positions freeze at send so the picture matches the reported distances.
            </p>
            <p>
              No production AI request from this app runs in space.
              Starcloud-2 is the commercial mission those routes stand in for.
              Starcloud-1 is a separate demonstration spacecraft. API cost uses stored standard
              rates and reported cache discounts; it is not an invoice. The
              answering API's data policy applies to the prompt. This app
              retains only short-lived hashed rate-limit counters.
            </p>
          </details>
        </section>
        <footer className="source-credits">
          <h3>Sources & image credits</h3>
          <p>
            Figures and concept renderings © Lumen Orbit / Starcloud,{" "}
            <em>Why we should train AI in Space</em>, v1.03, September 2024, pp.
            6–8 & 12. Extracted from the original PDF; these are design
            illustrations, not spacecraft photographs. Independent project; no
            affiliation.
          </p>
          <ul className="source-list">
            {[
              ["Starcloud whitepaper", paper],
              [
                "Starcloud orbital proposal · FCC, February 2026",
                "https://api-prod.fcc.gov/icfs-attachment/exp/api/v1/5c6840321b3e365068b6a64ce54bcb49",
              ],
              [
                "Starcloud optical connectivity · May 2026",
                "https://www.businesswire.com/news/home/20260526670395/en/Starcloud-to-Integrate-SpaceXs-Starlink-Mini-Lasers-Into-Its-Orbital-Data-Center-Constellation",
              ],
              [
                "Starcloud-1 hardware demonstration",
                "https://www.starcloud.com/starcloud-1",
              ],
              [
                "Starcloud-2 commercial mission",
                "https://www.starcloud.com/starcloud-2",
              ],
              [
                "Internet routing · Cloudflare",
                "https://www.cloudflare.com/learning/network-layer/what-is-routing/",
              ],
              [
                "Google facility efficiency",
                "https://www.datacenters.google/efficiency/",
              ],
              [
                `${PROVIDERS[provider].company} infrastructure references`,
                SITE_SOURCES[provider],
              ],
              [
                `${PROVIDERS[provider].name} API pricing`,
                PROVIDERS[provider].source,
              ],
            ].map(([name, url]) => (
              <li key={name}>
                <a href={url} target="_blank" rel="noreferrer">
                  {name}
                  <span>↗</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="fine-print">
            Provider marks via Lobe Icons (MIT). Marks belong to their
            respective owners. Research reviewed September 25, 2026.
          </p>
        </footer>
      </div>
    </Modal>
  );
}
