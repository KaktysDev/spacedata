"use client";

import { useId } from "react";

import { SIMULATION } from "@/lib/starcloud/constants";

type WaterCupProps = {
  liters: number;
  label: string;
};

/**
 * Visual fill only. It eases toward full and stays there, so the cup does
 * not empty and restart while the liter count keeps climbing.
 */
export function WaterCup({ liters, label }: WaterCupProps) {
  const clipId = useId().replace(/:/g, "");
  const safe = Number.isFinite(liters) && liters > 0 ? liters : 0;
  const fraction = 1 - Math.exp(-safe / SIMULATION.waterCupLiters);

  return (
    <span className="inline-flex" aria-hidden="true">
      <svg viewBox="0 0 36 48" className="h-8 w-6 shrink-0">
        <title>{label}</title>
        <defs>
          <clipPath id={clipId}>
            <path d="M9 12h18l-2.2 30H11.2z" />
          </clipPath>
        </defs>
        <path
          d="M9 12h18l-2.2 30H11.2z"
          fill="none"
          stroke="#9bbbd4"
          strokeWidth="1.25"
        />
        <g clipPath={`url(#${clipId})`}>
          <rect
            x="8"
            y="12"
            width="20"
            height="30"
            fill="#9bbbd4"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center bottom",
              transform: `scaleY(${fraction})`,
              transition: "transform 180ms linear",
            }}
          />
        </g>
      </svg>
    </span>
  );
}
