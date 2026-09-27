import { NextResponse } from "next/server";

export const runtime = "nodejs";

type NominatimHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
};

function label(hit: NominatimHit) {
  const a = hit.address ?? {};
  const city = a.city || a.town || a.village || hit.name;
  const parts = [city, a.state, a.country].filter(Boolean);
  if (parts.length) return parts.slice(0, 2).join(", ");
  const raw = hit.display_name ?? "";
  return raw.split(",").slice(0, 2).join(",").trim() || raw;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80)
    return NextResponse.json({ results: [] });
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Spacedata/1.0 (https://spacedata.vercel.app)",
    },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return NextResponse.json({ results: [] }, { status: 502 });
  const data = (await response.json()) as NominatimHit[];
  const results = (Array.isArray(data) ? data : [])
    .map((hit) => {
      const lat = Number(hit.lat),
        lon = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { name: label(hit), lat, lon };
    })
    .filter(Boolean);
  return NextResponse.json({ results });
}
