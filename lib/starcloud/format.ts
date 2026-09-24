export function formatUsdPerKwh(value: number): string {
  const digits = value < 0.01 ? 4 : 3;
  return `$${value.toFixed(digits)}`;
}

export function formatMillionsUsd(value: number): string {
  const millions = value / 1_000_000;
  const text = Number.isInteger(millions)
    ? millions.toFixed(0)
    : millions.toFixed(1);
  return `$${text}M`;
}

export function formatPue(value: number): string {
  return value.toFixed(3);
}

export function formatLitersPerKwh(value: number): string {
  return value.toFixed(2);
}

export function formatLatencyMs(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatCompactCount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  if (abs >= 1_000) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(abs >= 100 ? 0 : 1)}`;
}

export function formatKwh(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatWattHours(kwh: number): string {
  const wh = kwh * 1_000;
  const abs = Math.abs(wh);
  if (abs >= 100) return `${wh.toFixed(0)} Wh`;
  if (abs >= 10) return `${wh.toFixed(1)} Wh`;
  if (abs >= 1) return `${wh.toFixed(2)} Wh`;
  return `${wh.toFixed(3)} Wh`;
}

export function formatLiters(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatMilliliters(liters: number): string {
  const ml = liters * 1_000;
  const abs = Math.abs(ml);
  if (abs >= 100) return `${ml.toFixed(0)} mL`;
  if (abs >= 10) return `${ml.toFixed(1)} mL`;
  return `${ml.toFixed(2)} mL`;
}

/** Session dollars, including values under one cent. */
export function formatSessionUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 100) return `$${value.toFixed(0)}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

/** Reply-scale dollars. Switches to a per-billion-token style only at the call site. */
export function formatReplyUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 0.01) return `$${value.toFixed(3)}`;
  if (abs >= 0.0001) return `$${value.toFixed(5)}`;
  return `$${value.toExponential(2)}`;
}
