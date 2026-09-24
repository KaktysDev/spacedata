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
