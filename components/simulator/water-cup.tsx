"use client";

import { useId } from "react";

import { SIMULATION } from "@/lib/starcloud/constants";

type WaterCupProps = {
  liters: number;
  label: string;
};

/**
 * One cup holds SIMULATION.waterCupLiters. Space stays at 0 liters, so the
 * fill never rises. Ground wraps into the next cup and keeps a count.
 */
export function WaterCup({ liters, label }: WaterCupProps) {
  const clipId = useId().replace(/:/g, "");
  const capacity = SIMULATION.waterCupLiters;
  const safe = Number.isFinite(liters) && liters > 0 ? liters : 0;
  const poured = Math.floor(safe / capacity);
  const fraction = safe === 0 ? 0 : (safe % capacity) / capacity;
  const innerTop = 12;
  const innerHeight = 30;

  return (
    <span className="inline-flex items-end gap-1.5" aria-hidden="true">
      <svg viewBox="0 0 36 48" className="h-9 w-7 shrink-0">
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
            y={innerTop}
            width="20"
            height={innerHeight}
            fill="#9bbbd4"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center bottom",
              transform: `scaleY(${fraction})`,
              transition: "transform 200ms linear",
            }}
          />
        </g>
      </svg>
      {poured > 0 ? (
        <span className="font-mono text-[10px] text-water tabular-nums">
          ×{poured}
        </span>
      ) : null}
    </span>
  );
}
