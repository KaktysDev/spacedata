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
                <li>Surface path</li>
                <li>Public site reference</li>
                <li>You</li>
              </ol>
              <p>
                The length is the great-circle surface distance to that public
                reference, at the whitepaper’s fiber speed. It is not a trace
                of ISP hops. The return uses the same length.
              </p>
            </div>
            <div>
              <strong>In orbit</strong>
              <ol>
                <li>You</li>
                <li>Backhaul satellite · RF</li>
                <li>Optical link to Starcloud-2</li>
                <li>Back to you</li>
              </ol>
              <p>
                The compute craft is the Starcloud-2 stand-in. The RF craft is
                the other satellite in this one dawn-dusk plane that is above
                the horizon and has a straight optical path to it. The highest
                such elevation is used. A later send, or a moved pin, can
                select a different RF craft because the shell has moved. If
                none qualify, there is no uplink. The third-party backhaul
                orbit is not in the model, so this plane is the stand-in.
              </p>
            </div>
          </div>
          <p className="fine-print">
            Both routes start together. They are modeled, not traceroutes.
            Provider markers are public infrastructure references, not a
            promise about where an API call runs. Weather, carrier capacity,
            and which backhaul satellite is actually in view are not simulated.
          </p>
        </section>
        <section className="method-section">
          <span className="section-number">02 / THE ARCHITECTURE</span>
          <h3>Built around power, cooling, and compute.</h3>
          <p>
            The figures are the whitepaper’s later data-center concept:
            modular containers, solar arrays, radiators, and terminals on a
            shared spine. They are not a claim that the Starcloud-2 smallsat
            is that 4 km array. The optical leg in this route is the link from
            the RF craft to the Starcloud-2 stand-in.
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
            The highlighted craft stands in for Starcloud-2, which Starcloud
            describes as its first commercial GPU smallsat, planned for
            sun-synchronous orbit in 2027. Starcloud-1 flew in November 2025
            with one H100; the results photo is that demonstration, and
            Starcloud’s page does not publish its mass or size. The February
            2026 FCC notice requests up to 88,000 satellites. The 2024
            whitepaper’s 5 GW concept is one solar array about 4 km by 4 km.
            Those are different documents. This route does not mix them into
            one spacecraft.
          </p>
          <p className="fine-print">
            The other marks are 8,800 craft in one dawn-dusk plane, a picture
            of spacing rather than the 88,000 filing and not extra Starcloud-2
            satellites. Distances use 600–850 km on that plane. The cloud’s
            radius and scatter on screen are not those kilometres. A fixed sun
            over 20°E sets the plane, matching the paper’s dawn-dusk figure.
            That sun direction is not a live ephemeris. Starcloud does not
            publish a length for these craft, so each mark is a speck rather
            than a measured scale model. The 4 km array would be about 1/3,200
            of Earth’s 12,742 km width, still under a pixel here, and it is one
            station in the whitepaper, not each of these marks.
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
              Energy = total tokens × selected J/token ÷ 3,600 × PUE. Both
              paths use PUE 1.09, Google’s published 2025 fleet average. The
              whitepaper says orbital PUE is comparable and does not give a
              number, so orbit is not given a lower PUE. Other providers are
              not given a different number: this model does not have their
              fleet measurement. The 0.5–2× range is sensitivity, not
              confidence. The default 1.11 J/token is illustrative.
            </p>
            <p>
              Ground water uses the whitepaper’s terrestrial table, 0.5 L/kWh.
              That is the paper’s assumption, not a meter at the marked site.
              Orbit uses the paper’s “not required” column. Power uses the
              paper’s projected $0.002/kWh in orbit and its US wholesale
              reference of $0.045/kWh on every ground site, including sites
              outside the US. These exclude manufacturing, launch, hardware
              and API fees.
            </p>
          </details>
          <details className="method-details">
            <summary>
              Distance, timing & limitations <span>+</span>
            </summary>
            <p>
              Ground distance is the great-circle surface path from you to the
              public reference. The whitepaper says vacuum is 35% faster than
              typical glass fiber, so that path uses c/1.35. There is no ISP
              hop list. RF, when a satellite is above the horizon, runs to that
              craft at c, then the straight optical leg runs at c. If no craft
              is in view with a clear optical path, the network time is “No
              line of sight” rather than a path through the Earth. The
              animation multiplies those light-times by the same factor. It
              waits for both terrestrial API replies before showing either
              return. Positions freeze at send so the picture matches the
              reported choice.
            </p>
            <p>
              No production AI request from this app runs in space.
              Starcloud-2 is the commercial mission the compute craft stands
              in for. Starcloud-1 is the flown demonstration. API cost uses
              stored standard rates and reported cache discounts; it is not an
              invoice.
              The answering API’s data policy applies to the prompt. This app
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
