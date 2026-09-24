import {
  ENERGY_USD_PER_KWH,
  LAUNCH,
  ORBIT,
  PAPER,
  PUE,
  TEN_YEAR_CLUSTER_COST_USD,
  WATER_LITERS_PER_KWH,
} from "@/lib/starcloud/constants";
import { formatMillionsUsd, formatUsdPerKwh } from "@/lib/starcloud/format";

type Row = {
  label: string;
  value: string;
  water?: boolean;
};

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
    value: `~${WATER_LITERS_PER_KWH.terrestrial} L/kWh`,
    water: true,
  },
  { label: "Launch", value: "None" },
  {
    label: "Cooling",
    value: `Chillers · ${Math.round(PUE.terrestrialChillerShareOfEnergy * 100)}% of energy`,
  },
  { label: "Siting", value: "Terrestrial grid" },
];

function Panel({
  kicker,
  title,
  cost,
  rows,
}: {
  kicker: string;
  title: string;
  cost: string;
  rows: Row[];
}) {
  return (
    <article className="flex flex-col border border-white bg-black px-4 py-4 sm:px-5">
      <p className="text-[10px] tracking-[0.22em] text-white/60 uppercase">
        {kicker}
      </p>
      <h2 className="mt-1 text-lg font-medium tracking-tight">{title}</h2>
      <p className="mt-5 font-mono text-3xl tracking-tight tabular-nums">
        {cost}
      </p>
      <p className="mt-1 text-[11px] tracking-[0.14em] text-white/55 uppercase">
        10-year · 40 MW cluster
      </p>
      <dl className="mt-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-t border-white/40 py-2.5"
          >
            <dt className="text-[11px] tracking-[0.16em] text-white/60 uppercase">
              {row.label}
            </dt>
            <dd
              className={`text-right font-mono text-sm tabular-nums ${row.water ? "text-water" : "text-white"}`}
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
          rows={spaceRows}
        />
        <Panel
          kicker="Ground"
          title="Terrestrial"
          cost={formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.ground)}
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
