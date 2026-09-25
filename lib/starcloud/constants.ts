/**
 * Quantitative model for the Starcloud datacenter simulator.
 *
 * Source: Ezra Feilden, Adi Oltean, and Philip Johnston, "Why we should
 * train AI in space", Lumen Orbit (now Starcloud), white paper v1.03,
 * September 2024. Tildes follow the paper's own approximations.
 *
 * Every number below is stated in that paper or is a direct arithmetic
 * consequence of stated figures (marked "Arithmetic"). Two shell stand-ins
 * are not paper measurements and are labeled as such: PUE, and the absolute
 * latency milliseconds. The capacity-factor display point inside the >95%
 * band is also a shell choice.
 */

export const PAPER = {
  title: "Why we should train AI in space",
  authors: ["Ezra Feilden PhD", "Adi Oltean", "Philip Johnston"],
  organization: "Lumen Orbit (now Starcloud)",
  /** Footnote: Lumen Orbit was renamed Starcloud in 2025. */
  renamedToStarcloudYear: 2025,
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

/**
 * How many times the orbital energy price the paper's terrestrial prices are.
 * The prose states 22× against "today's energy prices". The quotients are
 * arithmetic on the quoted rates.
 */
export const ENERGY_COST_MULTIPLE = {
  /** Paper: orbital energy is "22 times lower cost than today's energy prices." */
  statedVersusToday: 22,
  /** Arithmetic: 0.045 / 0.002 = 22.5. The paper rounds that to 22. */
  usWholesaleOverSpace:
    ENERGY_USD_PER_KWH.terrestrialUs / ENERGY_USD_PER_KWH.space,
  /** Arithmetic: 0.06 / 0.002 = 30. */
  ukWholesaleOverSpace:
    ENERGY_USD_PER_KWH.terrestrialUk / ENERGY_USD_PER_KWH.space,
  /** Arithmetic: 0.17 / 0.002 = 85. */
  japanWholesaleOverSpace:
    ENERGY_USD_PER_KWH.terrestrialJp / ENERGY_USD_PER_KWH.space,
  /** Arithmetic: Table 1's 0.04 / 0.002 = 20. */
  table1OverSpace:
    ENERGY_USD_PER_KWH.table1Terrestrial / ENERGY_USD_PER_KWH.space,
} as const;

/** Solar-cell material cost used in the ~$0.002/kWh derivation. */
export const SOLAR_CELL_USD_PER_WATT = 0.03;

/** Capacity factor of the solar plant feeding the cluster. */
export const CAPACITY_FACTOR = {
  /** Proposed orbital array is greater than 95%: no night, weather, or seasons. */
  spaceMinimum: 0.95,
  /**
   * Point inside the paper's >95% band. Not itself a paper measurement.
   * The live card wanders around this and is clamped so it never prints a
   * value at or below 95%.
   */
  spaceDisplay: 0.964,
  /** Median US terrestrial solar farm, ~24%. */
  terrestrialSolarUs: 0.24,
  /**
   * Temperate regions such as northern Europe typically achieve capacity
   * factors under 10%. This is that stated ceiling, not a measured median.
   */
  northernEuropeUnder: 0.1,
  /** Above 50% is impossible on Earth from the day/night cycle alone. */
  terrestrialCeiling: 0.5,
} as const;

/**
 * Solar generation advantage of an orbital array over the same array on Earth.
 * Peak uplift and the "over 5 times" yield are both stated. The lower bound
 * multiplies those stated inputs; it is not a separate measurement.
 */
export const SOLAR_ARRAY = {
  /** Peak power in space is ~40% higher. The atmosphere attenuates even a clear day. */
  peakHigherBy: 0.4,
  /** Arithmetic: 1 + 0.40. */
  peakRatioVersusTerrestrial: 1 + 0.4,
  /** Paper: a given array in space generates over 5 times the energy of the same array on Earth. */
  sameArrayEnergyMultipleStatedOver: 5,
  /**
   * Arithmetic at the stated floor: 1.40 × 0.95 / 0.24.
   * Capacity factor is greater than 95%, so yield sits above this product.
   * The paper summarizes that comparison as "over 5 times".
   */
  sameArrayEnergyMultipleLowerBound:
    ((1 + 0.4) * CAPACITY_FACTOR.spaceMinimum) /
    CAPACITY_FACTOR.terrestrialSolarUs,
  /** With cell selection and array design, degradation of just 0.15% per year has been demonstrated. */
  degradationPerYear: 0.0015,
  /** A 5 GW center needs a solar array of approximately 4 km by 4 km. */
  fiveGigawattSideKm: 4,
  /** Cell fill factor assumed for that 4 km array. */
  fillFactor: 0.9,
  /** Beginning-of-life efficiency, silicon cells. */
  beginningOfLifeEfficiency: 0.22,
  /** More than 300 GW of modules, the vast majority silicon, deployed in 2023. */
  siliconDeployedGw2023Over: 300,
  /** Thin-film silicon wafers under 25 μm, so the array can be folded for launch. */
  thinFilmThicknessMicrometersUnder: 25,
  /** Those thin-film cells achieve power densities greater than 1000 W/kg. */
  thinFilmWattsPerKilogramOver: 1000,
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
  /** Arithmetic: 1 + 0.35. */
  speedRatio: 1 + 0.35,
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
  /**
   * ~40 MW of compute per heavy-lift flight. The paper reaches this from
   * ~300 racks at ~120 kW (GB200-class): 300 × 120 kW = 36 MW, then
   * rack-level mass savings, and calls ~40 MW conservative.
   */
  megawattsPerLaunch: 40,
  /** Long-term reusable heavy-lift price, about $5 million per launch. */
  costUsd: 5_000_000,
  /** About 100 tons to LEO sun-synchronous orbit. */
  payloadTonsToSso: 100,
  /**
   * The paper says 100 tons at ~$5M "translates to approximately $30 per
   * kilogram." Table 1 also prices shielding at $30/kg. That stated price
   * is not the $5M / 100 t quotient; see arithmeticUsdPerKg.
   */
  statedUsdPerKg: 30,
  /** Arithmetic: $5,000,000 / (100 t × 1,000 kg/t) = $50/kg. */
  arithmeticUsdPerKg: 5_000_000 / (100 * 1_000),
  /** The paper notes a suggested future floor of $10/kg. */
  suggestedFloorUsdPerKg: 10,
  /** Payload bay holds ~300 racks at 50% of its volume; the rest is support systems. */
  racksPerLaunch: 300,
  /** Share of the payload bay occupied by those ~300 racks. */
  rackBayFill: 0.5,
  /** Power density assumed per rack, Nvidia GB200 NVL72 class. */
  kilowattsPerRack: 120,
  /** Arithmetic: 300 racks × 120 kW = 36 MW, before the paper's ~40 MW rounding. */
  rackProductMegawatts: (300 * 120) / 1_000,
  /** One compute container is capped at ~100 tons by the vehicle's payload. */
  containerTons: 100,
  /** Next-generation heavy-lift vehicles are being designed to fly up to three times per day. */
  launchesPerDay: 3,
  /**
   * Paper: 5 GW of compute could fly in fewer than 100 launches, because
   * ~40 MW per flight is called conservative. A similar number of flights
   * covers the solar and radiator modules.
   */
  fiveGigawattComputeLaunchesUnder: 100,
  /** Arithmetic at the stated ~40 MW/launch: 5 GW / 40 MW = 125. Not the paper's "<100" claim. */
  fiveGigawattLaunchesAtFortyMegawatts: 5_000 / 40,
  /** At three flights a day, one launcher could loft the 5 GW center in 2–3 months. */
  fiveGigawattBuildMonthsMin: 2,
  fiveGigawattBuildMonthsMax: 3,
} as const;

/**
 * Cell-material product behind the ~$0.002/kWh narrative.
 * Arithmetic: 40 MW × $0.03/W = $1.2M.
 * Table 1 lists the solar array at $2M, a different line than this product.
 */
export const SOLAR_CELL_MATERIAL_FORTY_MW_USD =
  LAUNCH.megawattsPerLaunch * 1_000_000 * SOLAR_CELL_USD_PER_WATT;

/**
 * Table 1 shielding: ~1 kg per kW of compute, launched at the paper's
 * stated ~$30/kg. Arithmetic for 40 MW: 40,000 kW × 1 kg/kW × $30/kg = $1.2M.
 */
export const SHIELDING = {
  kilogramsPerKilowatt: 1,
  usdPerKilogram: LAUNCH.statedUsdPerKg,
  fortyMegawattUsd:
    LAUNCH.megawattsPerLaunch * 1_000 * 1 * LAUNCH.statedUsdPerKg,
} as const;

/**
 * Table 1 cost balance for one 40 MW cluster operated for 10 years.
 * Space is $2M solar array + $5M launch + $1.2M shielding = $8.2M.
 * Ground is $140M energy + $7M chiller energy + $20M backup = $167M.
 * Space cooling is described as a more efficient architecture and is not
 * given its own dollar line. Ground launch is "None".
 */
export const TEN_YEAR_CLUSTER_COST_USD = {
  space: 8_200_000,
  ground: 167_000_000,
  spaceSolarArray: 2_000_000,
  spaceLaunch: 5_000_000,
  /** ~1 kg of shielding per kW of compute at ~$30/kg launch cost. */
  spaceShielding: 1_200_000,
  /** Table 1: backup power is not required in space, so it is outside the $8.2M sum. */
  spaceBackupPower: 0,
  groundEnergy: 140_000_000,
  /** Chiller energy, $7M at 5% of the $140M energy line. */
  groundChillerEnergy: 7_000_000,
  groundBackupPower: 20_000_000,
  /** Table 1 launch row for the terrestrial column is "None". */
  groundLaunch: 0,
} as const;

/**
 * Arithmetic: $167M / $8.2M. The paper prints both balances and does not
 * print this quotient.
 */
export const TEN_YEAR_COST_MULTIPLE_GROUND_OVER_SPACE =
  TEN_YEAR_CLUSTER_COST_USD.ground / TEN_YEAR_CLUSTER_COST_USD.space;

export const ORBIT = {
  /** Low-Earth dawn-dusk sun-synchronous orbit, following Earth's terminator. */
  name: "Dawn-dusk sun-synchronous orbit",
  short: "Dawn-dusk SSO",
  /**
   * Radiative cooling sink: deep space at the cosmic microwave background,
   * about 2.7 K (−270°C). The paper states both figures.
   */
  radiativeSinkKelvin: 2.7,
  radiativeSinkCelsius: -270,
  /** The orbit plane precesses once per year, staying roughly perpendicular to the Sun. */
  precessionRotationsPerYear: 1,
  /**
   * Continuous illumination "nearly doubles" average power versus orbits
   * that see a day/night cycle. The paper does not give a sharper factor.
   */
  illuminationVersusDayNight: "nearly doubles",
  /**
   * In the chosen orbits, solar irradiance varies by no more than about 0.2%.
   * There is no day/night swing to size cooling around.
   */
  solarIrradianceVariation: 0.002,
} as const;

/**
 * Worked radiator example in the thermal section. Figures are the paper's
 * own rounded Stefan–Boltzmann results at a 20°C plate, not a recomputation.
 * A 1 m × 1 m black plate at 20°C is quoted separately at about 838 W
 * (both sides), roughly three times the electricity a square meter of
 * solar panel generates, so the radiators can be under half the array area.
 */
export const RADIATOR = {
  /** Inlet and outlet used to justify a 20°C average radiator temperature. */
  inletCelsius: 35,
  outletCelsius: 5,
  averageCelsius: 20,
  /** Paper writes 293.15 K for that 20°C plate. */
  averageKelvin: 293.15,
  emissivity: 0.92,
  /** Stefan–Boltzmann constant as written in the paper, W/m²/K⁴. */
  stefanBoltzmannSigma: 5.67e-8,
  /** ε · σ · T⁴, one side, as printed: 385.24 W/m². */
  emittedOneSideWPerM2: 385.24,
  /** Both sides: 2 × 385.24 = 770.48 W/m². */
  emittedBothSidesWPerM2: 770.48,
  absorptivity: 0.09,
  /** View factor toward Earth in the worked example. */
  earthViewFactor: 0.25,
  earthAlbedo: 0.3,
  /** Solar irradiance used in the radiator balance, W/m². */
  solarIrradianceWPerM2: 1366,
  /** Earth's blackbody temperature in the worked example. */
  earthBlackbodyCelsius: -20,
  /** Absorbed from Earth albedo plus Earth blackbody: 14.46 W/m². */
  absorbedFromEarthWPerM2: 14.46,
  /** Absorbed from direct sun on one side: 0.09 × 1366 = 122.94 W/m². */
  absorbedFromSunWPerM2: 122.94,
  /**
   * Net to deep space at 20°C: 770.48 − 122.94 − 14.46 = 633.08 W/m².
   * Stored as printed so the float difference of that subtraction is not
   * substituted for the paper's rounding.
   */
  netWPerM2: 633.08,
  /** Earlier narrative figure: a 1 m × 1 m black plate at 20°C radiates about 838 W, both sides. */
  blackPlateBothSidesWatts: 838,
  /** Paper: that ~838 W is roughly three times the electricity generated per square meter of panel. */
  blackPlateVersusPanelGenerationStated: 3,
  /** Paper: the radiators need to be less than half the size of the solar arrays. */
  areaVersusSolarArrayUnder: 0.5,
} as const;

/**
 * Terrestrial cooling must be designed for the hottest days, sometimes
 * exceeding 45°C. The paper gives no single design-day setpoint, only this floor.
 */
export const TERRESTRIAL_HOT_DAY_EXCEEDS_CELSIUS = 45;

/**
 * Horizons stated for cost and hardware life. The 10-year amortization is
 * the window on the $0.002/kWh offer and on Table 1. The design principles
 * say the center should not need retiring for at least 10 years. ISS power
 * and cooling subsystems are cited at a 15-year design life, which the paper
 * expects to be similar on orbit.
 */
export const SERVICE_LIFE_YEARS = {
  amortization: 10,
  minimumBeforeRetirement: 10,
  issPowerAndCoolingDesign: 15,
} as const;

/**
 * Cluster sizes used as scale context. Today's hyperscale sites reach
 * 100 MW, with plans approaching 1 GW. The paper's worked next-generation
 * training cluster (Llama 5 / GPT-6 class) is 5 GW, and it says multi-GW
 * clusters will be required from 2027 if current trends continue.
 */
export const CLUSTER_POWER = {
  hyperscaleTodayMw: 100,
  approachingMw: 1_000,
  nextGenerationExampleMw: 5_000,
  multiGigawattFromYear: 2027,
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
  /** Shell stand-in: 1 + the 5% chiller share. Not a published PUE. */
  ground: 1.05,
  terrestrialChillerShareOfEnergy: 0.05,
} as const;

/**
 * Inference throughput where the white paper is silent.
 *
 * SemiAnalysis, "InferenceMAX" (9 Oct 2025), reports an HGX H100 at about
 * 900,000 tokens per second per all-in provisioned utility megawatt for
 * gpt-oss 120B at FP4, in a reasoning-length workload. The same note says
 * that megawatt is utility power, not critical IT power.
 *
 * The live engines map that rate onto the paper's compute megawatts. That
 * boundary is wider than IT power, so tokens per IT-kilowatt-hour here are
 * a high stand-in, not a Starcloud or GB200 measurement. Both venues share
 * it. The comparison is the paper's price, water, and the latency stub.
 *
 * Arithmetic: 1e6 W / 900,000 tokens/s = 10/9 joules per token.
 * Tokens per IT-kWh = 3.6e6 / (10/9) = 3.24e6.
 */
export const INFERENCE_GROUND_BASELINE = {
  sourceName: "SemiAnalysis InferenceMAX",
  hardware: "HGX H100",
  workload: "gpt-oss 120B FP4",
  tokensPerSecondPerProvisionedMegawatt: 900_000,
} as const;

export const JOULES_PER_TOKEN =
  1_000_000 / INFERENCE_GROUND_BASELINE.tokensPerSecondPerProvisionedMegawatt;

export const TOKENS_PER_IT_KWH = 3_600_000 / JOULES_PER_TOKEN;

/**
 * Live-session duty cycle. Not a white-paper measurement.
 * Idle is low enough that a 2 L ground cup fills in several seconds.
 * Inference is the duty cycle while a prompt is in flight on both venues.
 * Capacity factor is not applied: 24% is the paper's terrestrial solar
 * figure, and the ground cluster is priced on the grid.
 */
export const SIMULATION = {
  clusterMegawatts: LAUNCH.megawattsPerLaunch,
  idleUtilization: 0.06,
  inferenceUtilization: 0.22,
  /**
   * Added to the shell millisecond stub as a fraction of full utilization.
   * Shared by both venues, so the paper's 1.35 vacuum/fiber ratio holds.
   */
  queueingAtFullUtilization: 0.25,
  /** Visual size of one ground water cup. Space never fills. */
  waterCupLiters: 2,
} as const;

/** Shared with the chat route. Server enforces this again. */
export const CHAT_MAX_CHARS = 2_000;
