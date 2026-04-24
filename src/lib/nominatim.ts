// Nominatim (OpenStreetMap) geocoding client. Free, no API key.
// Usage policy: max ~1 req/sec, include a descriptive User-Agent / Referer.
// https://nominatim.org/release-docs/latest/api/Search/

export interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
}

const BASE = "https://nominatim.openstreetmap.org";

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  limit = 6
): Promise<NominatimPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${BASE}/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&addressdetails=0`;
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as NominatimPlace[];
  } catch {
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string | null> {
  const url = `${BASE}/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { display_name?: string };
    return j.display_name ?? null;
  } catch {
    return null;
  }
}

// Find nearby places of interest around a point using a free-form query.
// Uses viewbox + bounded=1 to constrain results to the area around (lat, lon).
export async function nearbyPlaces(
  lat: number,
  lon: number,
  query: string,
  radiusKm = 5,
  signal?: AbortSignal,
  limit = 5
): Promise<NominatimPlace[]> {
  // ~1deg lat ~ 111km. Build a small bbox around the point.
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const left = lon - dLon;
  const right = lon + dLon;
  const top = lat + dLat;
  const bottom = lat - dLat;
  const url =
    `${BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}` +
    `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as NominatimPlace[];
  } catch {
    return [];
  }
}

export interface SuggestedPOI {
  name: string;
  lat: number;
  lon: number;
  category: "tourist" | "landmark" | "nature" | "heritage";
  near: [number, number];
  distanceKm?: number;
  reason?: string;
}

const ALLOWED_KEYWORDS = [
  "temple", "fort", "museum", "beach", "park", "hill", "viewpoint",
  "lake", "monument", "palace", "garden", "waterfall", "heritage",
  "shrine", "church", "cathedral", "mosque", "stupa", "tomb",
  "tower", "ruins", "archaeological", "national park", "wildlife",
  "viewpoint", "scenic", "lookout", "trail",
];

const REJECTED_KEYWORDS = [
  "restaurant", "cafe", "hotel", "bar", "shop", "store", "mall",
  "pub", "bakery", "fast food", "supermarket", "pharmacy", "atm",
  "bank", "office", "clinic", "hospital", "school", "gas station",
  "fuel", "parking",
];

function isTouristRelevant(name: string): boolean {
  const n = name.toLowerCase();
  if (REJECTED_KEYWORDS.some((k) => n.includes(k))) return false;
  return ALLOWED_KEYWORDS.some((k) => n.includes(k));
}

function categorize(name: string): SuggestedPOI["category"] {
  const n = name.toLowerCase();
  if (/(park|hill|lake|waterfall|beach|garden|viewpoint|scenic|trail|wildlife|national park)/.test(n))
    return "nature";
  if (/(temple|shrine|church|cathedral|mosque|stupa|monastery)/.test(n)) return "heritage";
  if (/(fort|palace|monument|tomb|tower|ruins|archaeological|heritage)/.test(n)) return "landmark";
  return "tourist";
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Tourist-only suggestions, prioritised near destination then along route corridor.
export async function suggestTouristPlaces(
  destination: [number, number],
  routeSamples: [number, number][] = [],
  signal?: AbortSignal
): Promise<SuggestedPOI[]> {
  const queries = [
    "tourist attraction",
    "viewpoint",
    "monument",
    "temple",
    "fort",
    "museum",
    "park",
  ];

  const results: SuggestedPOI[] = [];
  const dedupe = new Set<string>();

  const pushPlaces = async (
    center: [number, number],
    radiusKm: number,
    perQuery: number,
    isDestination: boolean
  ) => {
    for (const q of queries) {
      const places = await nearbyPlaces(center[0], center[1], q, radiusKm, signal, perQuery);
      for (const p of places) {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        const key = `${lat.toFixed(4)}|${lon.toFixed(4)}`;
        if (dedupe.has(key)) continue;
        const name = p.display_name.split(",")[0] || p.display_name;
        if (!isTouristRelevant(name) && !isTouristRelevant(p.display_name)) continue;
        dedupe.add(key);
        results.push({
          name,
          lat,
          lon,
          category: categorize(name),
          near: center,
          distanceKm: haversineKm(destination, [lat, lon]),
        });
      }
      await new Promise((r) => setTimeout(r, 200));
      if (isDestination && results.length > 20) return;
    }
  };

  // 1) Highest priority: near destination (tight radius, more results)
  await pushPlaces(destination, 10, 4, true);

  // 2) Along route corridor: sampled mid-points (excluding destination itself)
  for (const s of routeSamples) {
    if (haversineKm(s, destination) < 1) continue;
    await pushPlaces(s, 6, 2, false);
    if (results.length > 25) break;
  }

  // Sort by distance from destination (closest first)
  results.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return results.slice(0, 15);
}

// (Legacy suggestAlongRoute removed — use suggestTouristPlaces.)
