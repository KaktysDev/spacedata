"use client";

import { memo } from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import type { RoutePhase } from "@/lib/starcloud/route-timeline";

const world = atlas as unknown as Topology<{
  countries: GeometryCollection;
  land: GeometryCollection;
}>;
const projection = geoOrthographic()
  .translate([600, 773])
  .scale(490)
  .rotate([104, -9, -17])
  .precision(0.3);
const path = geoPath(projection);
const landPath = path(feature(world, world.objects.land)) ?? "";
const borderPath =
  path(mesh(world, world.objects.countries, (a, b) => a !== b)) ?? "";
const gridPath = path(geoGraticule10()) ?? "";
const origin = projection([-74.006, 40.7128])!;
const ground = projection([-119.8, 39.5])!;
const satellites = [
  [137, 340, -43],
  [216, 248, -33],
  [316, 180, -24],
  [427, 136, -13],
  [544, 116, -3],
  [663, 121, 8],
  [778, 148, 20],
  [887, 199, 30],
  [980, 270, 40],
  [1056, 360, 49],
];
const routes = {
  uplink: `M${origin} Q${origin[0] - 40},290 427,136`,
  relay: "M427,136 Q601,86 778,148",
  downlink: `M778,148 Q${origin[0] + 72},320 ${origin}`,
  ground: `M${origin} Q${(origin[0] + ground[0]) / 2},${Math.min(origin[1], ground[1]) - 65} ${ground}`,
};
const labels: [string, [number, number]][] = [
  ["CANADA", [-108, 57]],
  ["UNITED STATES", [-99, 37]],
  ["GREENLAND", [-42, 69]],
  ["MEXICO", [-103, 23]],
];

export const OrbitalScene = memo(function OrbitalScene({
  phase = "idle",
  reducedMotion = false,
  focus = "both",
}: {
  phase?: RoutePhase;
  reducedMotion?: boolean;
  focus?: "both" | "space" | "ground";
}) {
  const flying = phase !== "idle" && phase !== "compare";
  const activePath =
    phase === "uplink" ? "uplink" : phase === "split" ? "relay" : "downlink";
  return (
    <svg
      className={`globe-scene phase-${phase} focus-${focus} ${reducedMotion ? "reduce-motion" : ""}`}
      viewBox="0 0 1200 650"
      role="img"
      aria-label="Earth with Canada, the United States and Greenland. A prompt travels from New York to an arc of satellites, across an orbital link, and back to Earth. A second route connects to a Nevada datacenter."
    >
      <defs>
        <radialGradient id="ocean" cx="44%" cy="5%" r="80%">
          <stop stopColor="#172b33" />
          <stop offset=".55" stopColor="#0d1d27" />
          <stop offset="1" stopColor="#090f18" />
        </radialGradient>
        <linearGradient id="land" x2=".4" y2="1">
          <stop stopColor="#455d55" />
          <stop offset=".65" stopColor="#243f3d" />
          <stop offset="1" stopColor="#132b2f" />
        </linearGradient>
        <radialGradient id="shade" cx="46%" cy="0%" r="84%">
          <stop offset=".2" stopColor="#050b13" stopOpacity="0" />
          <stop offset="1" stopColor="#050b13" stopOpacity=".88" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".65" fill="#adc9ad" opacity=".27" />
        </pattern>
        <clipPath id="earth-clip">
          <circle cx="600" cy="773" r="490" />
        </clipPath>
        {Object.entries(routes).map(([id, d]) => (
          <path key={id} id={`path-${id}`} d={d} />
        ))}
      </defs>
      <g>
        {Array.from({ length: 90 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 137.51 + 29) % 1200}
            cy={(i * 81.17 + 71) % 620}
            r={i % 6 === 0 ? 1.1 : 0.6}
            opacity={0.1 + (i % 4) * 0.1}
            fill="#bacfda"
          />
        ))}
      </g>
      <circle
        cx="600"
        cy="773"
        r="492"
        fill="none"
        stroke="#8bd4c5"
        strokeWidth="8"
        opacity=".15"
        filter="url(#glow)"
      />
      <circle
        cx="600"
        cy="773"
        r="490"
        fill="url(#ocean)"
        stroke="#8eb7ac"
        strokeWidth="1.3"
      />
      <g clipPath="url(#earth-clip)">
        <path
          d={landPath}
          fill="url(#land)"
          stroke="#91a995"
          strokeWidth=".65"
        />
        <path d={landPath} fill="url(#dots)" />
        <path
          d={borderPath}
          fill="none"
          stroke="#89a193"
          strokeWidth=".65"
          opacity=".5"
        />
        <path
          d={gridPath}
          fill="none"
          stroke="#9ebfbe"
          strokeWidth=".5"
          opacity=".12"
        />
        <circle cx="600" cy="773" r="490" fill="url(#shade)" />
      </g>
      {labels.map(([name, coordinates]) => {
        const point = projection(coordinates)!;
        return (
          <text
            key={name}
            x={point[0]}
            y={point[1]}
            textAnchor="middle"
            className="country-label"
          >
            {name}
          </text>
        );
      })}
      <path
        d="M92 398 Q590 -188 1100 416"
        fill="none"
        stroke="#a0b5bf"
        strokeWidth=".7"
        strokeDasharray="3 7"
        opacity=".22"
      />
      <text x="598" y="66" textAnchor="middle" className="orbit-caption">
        THE ORBITAL COMPUTE LAYER
      </text>
      <g className="space-paths">
        {(["uplink", "relay", "downlink"] as const).map((id) => (
          <path
            key={id}
            d={routes[id]}
            pathLength="1"
            className={`route-line ${flying && activePath === id ? "route-active" : ""}`}
          />
        ))}
        {phase === "split" && (
          <circle
            cx="778"
            cy="148"
            r="29"
            className="compute-pulse"
            fill="none"
            stroke="#c4efb1"
          />
        )}
      </g>
      {satellites.map(([x, y, angle], i) => (
        <g
          key={i}
          transform={`translate(${x} ${y}) rotate(${angle})`}
          className={`satellite ${i === 3 || i === 6 ? "selected-satellite" : ""}`}
        >
          <g
            className="satellite-body"
            style={{ animationDelay: `${i * -0.7}s` }}
          >
            <rect
              x="-27"
              y="-10"
              width="18"
              height="20"
              rx="1"
              fill="#1e303c"
              stroke="#6c8492"
              strokeWidth=".9"
            />
            <rect
              x="9"
              y="-10"
              width="18"
              height="20"
              rx="1"
              fill="#1e303c"
              stroke="#6c8492"
              strokeWidth=".9"
            />
            <path
              d="M-21 -10v20m6-20v20m30-20v20m6-20v20M-27 0h18m18 0h18"
              stroke="#708996"
              strokeWidth=".55"
            />
            <path d="M-9 0H9M0 -8v-8" stroke="#b3c5ca" strokeWidth="1.2" />
            <rect
              x="-5"
              y="-8"
              width="10"
              height="16"
              rx="2"
              fill="#aebeaf"
              stroke="#e2e9d3"
              strokeWidth=".6"
            />
            <circle cy="-17" r="1.5" fill="#c7efb3" />
          </g>
        </g>
      ))}
      <g className="ground-paths">
        <path
          d={routes.ground}
          className={`ground-route ${flying ? "route-active" : ""}`}
        />
        <g transform={`translate(${ground})`}>
          <circle r="18" fill="#bcb1e5" opacity=".07" />
          <rect
            x="-7"
            y="-9"
            width="14"
            height="17"
            rx="2"
            fill="#17232e"
            stroke="#c0b9df"
          />
          <path d="M-4 -5h8m-8 5h8m-8 5h8" stroke="#b6b2e3" />
          <text x="-19" y="28" textAnchor="end" className="map-label">
            NEVADA
          </text>
          <text x="-19" y="44" textAnchor="end" className="map-sublabel">
            GROUND DATACENTER
          </text>
        </g>
      </g>
      <g transform={`translate(${origin})`}>
        <circle r="23" fill="#c5f4b2" opacity=".06" />
        <circle
          className={flying ? "origin-ring pulse" : "origin-ring"}
          r="13"
          fill="none"
          stroke="#c5f4b2"
          opacity=".4"
        />
        <circle r="5" fill="#c5f4b2" />
        <circle r="2" fill="#fff" />
        <path d="M-14 2h-10l-8 14" fill="none" stroke="#c5f4b2" opacity=".55" />
        <text x="-38" y="29" textAnchor="end" className="map-label">
          NEW YORK
        </text>
        <text x="-38" y="46" textAnchor="end" className="map-sublabel">
          YOUR PROMPT STARTS HERE
        </text>
      </g>
      {!reducedMotion && flying && (
        <g key={phase}>
          <circle r="4" fill="#e7ffd4" className="space-packet">
            <animateMotion
              dur={
                phase === "uplink"
                  ? "1.6s"
                  : phase === "split"
                    ? "2.4s"
                    : "2.1s"
              }
              repeatCount="indefinite"
            >
              <mpath href={`#path-${activePath}`} />
            </animateMotion>
          </circle>
          <circle r="3" fill="#d2c6f1" className="ground-packet">
            <animateMotion
              dur="2.1s"
              repeatCount="indefinite"
              keyPoints={phase === "pullback" ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href="#path-ground" />
            </animateMotion>
          </circle>
        </g>
      )}
    </svg>
  );
});
