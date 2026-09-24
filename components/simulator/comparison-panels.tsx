import {
  ENERGY_USD_PER_KWH,
  LAUNCH,
  ORBIT,
  PAPER,
  PUE,
  TEN_YEAR_CLUSTER_COST_USD,
  TERRESTRIAL_WATER_TEN_YEAR_TONS,
  WATER_LITERS_PER_KWH,
} from "@/lib/starcloud/constants";
import { formatMillionsUsd, formatUsdPerKwh } from "@/lib/starcloud/format";

type Row = {
  label: string;
  value: string;
  water?: boolean;
};

type Line = {
  label: string;
  value: string;
};

const terrestrialWaterMillionTons = (
  TERRESTRIAL_WATER_TEN_YEAR_TONS / 1_000_000
).toFixed(1);

const spaceLines: Line[] = [
  {
    label: "solar array",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.spaceSolarArray),
  },
  {
    label: "launch",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.spaceLaunch),
  },
  {
    label: "shielding",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.spaceShielding),
  },
];

const groundLines: Line[] = [
  {
    label: "energy",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.groundEnergy),
  },
  {
    label: "chillers",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.groundChillerEnergy),
  },
  {
    label: "backup",
    value: formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.groundBackupPower),
  },
];

const spaceRows: Row[] = [
  {
    label: "Energy",
    value: `~${formatUsdPerKwh(ENERGY_USD_PER_KWH.space)}/kWh`,
  },
  { label: "Capacity factor", value: ">95%" },
  { label: "Water", value: "0 L/kWh", water: true },
  {
    label: "Launch",
    value: `${formatMillionsUsd(LAUNCH.costUsd)} · ${LAUNCH.megawattsPerLaunch} MW`,
  },
  {
    label: "Cooling",
    value: `Radiative · ${ORBIT.radiativeSinkKelvin} K`,
  },
  { label: "Orbit", value: ORBIT.short },
];

const groundRows: Row[] = [
  {
    label: "Energy",
    value: `~${formatUsdPerKwh(ENERGY_USD_PER_KWH.terrestrialUs)}/kWh`,
  },
  { label: "Capacity factor", value: "~24%" },
  {
    label: "Water",
    value: `~${WATER_LITERS_PER_KWH.terrestrial} L/kWh · ~${terrestrialWaterMillionTons} million tons / 10 years`,
    water: true,
  },
  { label: "Launch", value: "None" },
  {
    label: "Cooling",
    value: `Chillers · ${Math.round(PUE.terrestrialChillerShareOfEnergy * 100)}% of energy`,
  },
  { label: "Siting", value: "Terrestrial grid" },
];

function LineSummary({ lines }: { lines: Line[] }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-y-0.5 font-mono text-[12px] leading-5 text-white/60 tabular-nums">
      {lines.map((line, index) => (
        <span
          key={line.label}
          className={`whitespace-nowrap ${index > 0 ? "before:mx-1.5 before:text-white/45 before:content-['·']" : ""}`}
        >
          {line.value} {line.label}
        </span>
      ))}
    </p>
  );
}

function Panel({
  kicker,
  title,
  cost,
  lines,
  rows,
}: {
  kicker: string;
  title: string;
  cost: string;
  lines: Line[];
  rows: Row[];
}) {
  return (
    <article className="flex min-w-0 flex-col border border-white bg-black px-4 py-3 sm:px-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.22em] text-white/60 uppercase">
            {kicker}
          </p>
          <h2 className="mt-1 text-lg leading-tight font-medium tracking-tight">
            {title}
          </h2>
        </div>
        <p className="shrink-0 font-mono text-3xl leading-none tracking-tight tabular-nums">
          {cost}
        </p>
      </div>
      <p className="mt-3 text-[11px] tracking-[0.14em] text-white/55 uppercase">
        10-year · 40 MW cluster
      </p>
      <LineSummary lines={lines} />
      <dl className="mt-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-white/40 py-1"
          >
            <dt className="shrink-0 text-[11px] tracking-[0.16em] text-white/60 uppercase">
              {row.label}
            </dt>
            <dd
              className={`min-w-0 text-right font-mono text-[13px] leading-5 tabular-nums sm:text-sm ${row.water ? "text-water" : "text-white"}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function ComparisonPanels() {
  return (
    <section aria-label="Space and ground comparison" className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel
          kicker="Space"
          title="Starcloud"
          cost={formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.space)}
          lines={spaceLines}
          rows={spaceRows}
        />
        <Panel
          kicker="Ground"
          title="Terrestrial"
          cost={formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.ground)}
          lines={groundLines}
          rows={groundRows}
        />
      </div>
      <p className="max-w-3xl text-[11px] leading-5 text-white/50">
        {PAPER.organization}, “{PAPER.title}”, white paper {PAPER.version},{" "}
        {PAPER.date}. Energy rates use the cited US wholesale price. Table 1
        prices the ground energy line at $0.04/kWh ($140M), plus chillers and
        backup, for a $167M balance against $8.2M in orbit.
      </p>
    </section>
  );
}
