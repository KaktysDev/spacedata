export const PROVIDERS = {
    gemini: {
        name: "Gemini",
        company: "Google",
        model: "gemini-3.8-flash",
        input: 0.3,
        output: 2.5,
        cached: 0.03,
        key: "GEMINI_API_KEY",
        source: "https://ai.google.dev/gemini-api/docs/pricing",
    },
    openai: {
        name: "GPT",
        company: "OpenAI",
        model: "gpt-5-mini",
        input: 0.25,
        output: 2,
        cached: 0.025,
        key: "OPENAI_API_KEY",
        source: "https://developers.openai.com/api/docs/models/gpt-5-mini",
    },
    anthropic: {
        name: "Claude",
        company: "Anthropic",
        model: "claude-haiku-4-5-20251001",
        input: 1,
        output: 5,
        cached: 0.1,
        key: "ANTHROPIC_API_KEY",
        source: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
    xai: {
        name: "Grok",
        company: "xAI",
        model: "grok-4.20-0309-non-reasoning",
        input: 1.25,
        output: 2.5,
        cached: 0.2,
        key: "XAI_API_KEY",
        source: "https://docs.x.ai/developers/models/grok-4.20-non-reasoning",
    },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);
export function isProvider(value) {
    return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}
const sites = (kind, rows) => rows.map(([name, lat, lon]) => ({ name, lat, lon, kind }));
// Approximate public city/region centers, not private facility coordinates.
// A curated reference catalog, not an exhaustive list or the actual serving location.
export const SITES = {
    gemini: sites("Google datacenter", [
        ["The Dalles, Oregon", 45.6, -121.18],
        ["Council Bluffs, Iowa", 41.26, -95.86],
        ["Ashburn, Virginia", 39.04, -77.49],
        ["Berkeley County, SC", 33.2, -79.95],
        ["Quilicura, Chile", -33.36, -70.73],
        ["Dublin, Ireland", 53.35, -6.26],
        ["Eemshaven, Netherlands", 53.44, 6.84],
        ["Hamina, Finland", 60.57, 27.2],
        ["St. Ghislain, Belgium", 50.45, 3.82],
        ["Singapore", 1.35, 103.82],
        ["Changhua, Taiwan", 24.07, 120.54],
        ["Inzai, Japan", 35.83, 140.15],
    ]),
    anthropic: sites("AWS Bedrock region", [
        ["N. Virginia", 38.9, -77.4],
        ["Ohio", 40.0, -83.0],
        ["Oregon", 45.52, -122.68],
        ["Stockholm", 59.33, 18.06],
        ["Ireland", 53.35, -6.26],
        ["Tokyo", 35.68, 139.69],
        ["Melbourne", -37.81, 144.96],
    ]),
    openai: sites("Azure AI region", [
        ["East US, Virginia", 37.54, -77.43],
        ["West US, California", 37.34, -121.89],
        ["Sweden Central", 60.67, 17.14],
        ["France Central", 48.86, 2.35],
        ["UK South", 51.51, -0.13],
        ["Japan East", 35.68, 139.69],
        ["Australia East", -33.87, 151.21],
    ]),
    xai: sites("xAI endpoint region", [
        ["US East, Virginia", 38.9, -77.4],
        ["US West, California", 37.34, -121.89],
    ]),
};
export const SITE_SOURCES = {
    gemini: "https://www.datacenters.google/locations/",
    anthropic: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html",
    openai: "https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability",
    xai: "https://docs.x.ai/developers/models/grok-4.20-non-reasoning",
};
export const DEFAULT_LOCATION = { lat: 40.71, lon: -74.01 };
export const PRESETS = [
    { name: "New York", lat: 40.71, lon: -74.01 },
    { name: "London", lat: 51.51, lon: -0.13 },
    { name: "Tokyo", lat: 35.68, lon: 139.69 },
    { name: "Sydney", lat: -33.87, lon: 151.21 },
    { name: "São Paulo", lat: -23.55, lon: -46.63 },
    { name: "Cape Town", lat: -33.92, lon: 18.42 },
];
export function distanceKm(a, b) {
    const r = Math.PI / 180, dlat = (b.lat - a.lat) * r, dlon = (b.lon - a.lon) * r;
    const h = Math.sin(dlat / 2) ** 2 +
        Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function nearestSite(provider, origin) {
    return SITES[provider].reduce((best, next) => distanceKm(origin, next) < distanceKm(origin, best) ? next : best);
}
