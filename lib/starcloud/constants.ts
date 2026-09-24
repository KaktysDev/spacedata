/**
 * Paper-backed figures for the Starcloud datacenter simulator.
 *
 * Source: Ezra Feilden, Adi Oltean, and Philip Johnston, "Why we should
 * train AI in space", Lumen Orbit (now Starcloud), white paper v1.03,
 * September 2024. Tildes follow the paper's own approximations.
 */

export const PAPER = {
  title: "Why we should train AI in space",
  organization: "Lumen Orbit (now Starcloud)",
  version: "v1.03",
  date: "September 2024",
} as const;

/** Equivalent energy cost, US dollars per kilowatt-hour. */
export const ENERGY_USD_PER_KWH = {
  /**
   * ~$0.002/kWh. Assumes 40 MW of compute per $5M launch and solar cells
   * at $0.03/W, amortized over 10 years.
   */
  space: 0.002,
  /** US average wholesale electricity, ~$0.045/kWh. */
  terrestrialUs: 0.045,
  /** UK average wholesale, ~$0.06/kWh. Cited for context, not the shell default. */
  terrestrialUk: 0.06,
  /** Japan average wholesale, ~$0.17/kWh. Cited for context, not the shell default. */
  terrestrialJp: 0.17,
  /**
   * Table 1 prices the terrestrial energy line at $0.04/kWh ($140M over
   * 10 years), a round figure beside the $0.045/kWh US wholesale quote.
   */
  table1Terrestrial: 0.04,
} as const;

/** Solar-cell material cost used in the ~$0.002/kWh derivation. */
export const SOLAR_CELL_USD_PER_WATT = 0.03;

/** Capacity factor of the solar plant feeding the cluster. */
export const CAPACITY_FACTOR = {
  /** Proposed orbital array is greater than 95%: no night, weather, or seasons. */
  spaceMinimum: 0.95,
  /**
   * Point inside the paper's >95% band. The live card wanders around this
   * and is clamped so it never prints a value at or below 95%.
   */
  spaceDisplay: 0.964,
  /** Median US terrestrial solar farm, ~24%. Northern Europe is often under 10%. */
  terrestrialSolarUs: 0.24,
  /** Above 50% is impossible on Earth from the day/night cycle alone. */
  terrestrialCeiling: 0.5,
} as const;

/** Cooling water, liters per kilowatt-hour. Orbital radiators use none. */
export const WATER_LITERS_PER_KWH = {
  /** Not required. */
  space: 0,
  /** Terrestrial cooling, ~0.5 L/kWh. */
  terrestrial: 0.5,
} as const;

/** Table 1: a 40 MW terrestrial cluster uses ~1.7 million tons of water over 10 years. */
export const TERRESTRIAL_WATER_TEN_YEAR_TONS = 1_700_000;

/**
 * The speed of light in vacuum is ~35% faster than in a typical glass fiber.
 * A fiber delay therefore scales by 1 / 1.35 in vacuum.
 */
export const VACUUM_VS_FIBER = {
  fasterBy: 0.35,
  speedRatio: 1.35,
} as const;

/**
 * Latency card baselines, milliseconds.
 * The paper gives the vacuum-vs-fiber ratio, not an absolute round trip.
 * Ground is a shell stub; space is that stub divided by the 1.35 speed ratio.
 */
export const LATENCY_STUB_MS = {
  ground: 48,
  space: 48 / VACUUM_VS_FIBER.speedRatio,
} as const;

export const LAUNCH = {
  /** ~40 MW of compute per heavy-lift flight (~300 racks at ~120 kW, GB200-class). */
  megawattsPerLaunch: 40,
  /** Long-term reusable heavy-lift price, about $5 million per launch. */
  costUsd: 5_000_000,
  /** About 100 tons to LEO sun-synchronous orbit, roughly $30/kg at $5M. */
  payloadTonsToSso: 100,
} as const;

/**
 * Table 1 cost balance for one 40 MW cluster operated for 10 years.
 * Space is $2M solar array + $5M launch + $1.2M shielding = $8.2M.
 * Ground is $140M energy + $7M chiller energy + $20M backup = $167M.
 */
export const TEN_YEAR_CLUSTER_COST_USD = {
  space: 8_200_000,
  ground: 167_000_000,
  spaceSolarArray: 2_000_000,
  spaceLaunch: 5_000_000,
  /** ~1 kg of shielding per kW of compute at ~$30/kg launch cost. */
  spaceShielding: 1_200_000,
  groundEnergy: 140_000_000,
  /** Chiller energy, 5% of the $140M energy line. */
  groundChillerEnergy: 7_000_000,
  groundBackupPower: 20_000_000,
} as const;

export const ORBIT = {
  /** Low-Earth dawn-dusk sun-synchronous orbit, following Earth's terminator. */
  name: "Dawn-dusk sun-synchronous orbit",
  short: "Dawn-dusk SSO",
  /**
   * Radiative cooling sink: deep space at the cosmic microwave background,
   * about 2.7 K (−270°C).
   */
  radiativeSinkKelvin: 2.7,
} as const;

/**
 * PUE baselines for the live card. The paper does not quote a PUE.
 * It says orbital cooling can match state-of-the-art hyperscale PUE, and
 * it prices terrestrial chillers at 5% of the energy line ($7M / $140M),
 * which is a 1.05 facility overhead if that line is the IT load.
 * Space is set a notch under that, a shell stand-in for the paper's
 * "more efficient cooling architecture", not a measured PUE.
 */
export const PUE = {
  space: 1.04,
  ground: 1.05,
  terrestrialChillerShareOfEnergy: 0.05,
} as const;
