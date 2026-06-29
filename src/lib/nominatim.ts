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

// In-memory cache for search queries. Drastically reduces perceived latency
// and avoids hammering the free Nominatim endpoint while users type.
interface CacheEntry { ts: number; results: NominatimPlace[] }
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX = 200;
const inflight = new Map<string, Promise<NominatimPlace[]>>();

function cacheGet(key: string): NominatimPlace[] | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return hit.results;
}

function cacheSet(key: string, results: NominatimPlace[]) {
  if (searchCache.size >= CACHE_MAX) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
  searchCache.set(key, { ts: Date.now(), results });
}

// If a longer query for the same prefix is already cached, we can synthesise
// a shorter-query result by filtering — typically while the user is still
// typing. This is best-effort and only used as instant UI; a real fetch may
// still refresh the list moments later.
function prefixCacheLookup(q: string, limit: number): NominatimPlace[] | null {
  const lower = q.toLowerCase();
  for (const [key, entry] of searchCache) {
    if (Date.now() - entry.ts > CACHE_TTL_MS) continue;
    if (key.startsWith(lower) && key !== lower) {
      const filtered = entry.results.filter((r) => r.display_name.toLowerCase().includes(lower));
      if (filtered.length > 0) return filtered.slice(0, limit);
    }
  }
  return null;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  limit = 6
): Promise<NominatimPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();

  const cached = cacheGet(key);
  if (cached) return cached.slice(0, limit);

  // Reuse an in-flight request for the same key — avoids duplicate work when
  // the same query is issued by multiple PlaceSearch instances simultaneously.
  const existing = inflight.get(key);
  if (existing) {
    try { return (await existing).slice(0, limit); } catch { return []; }
  }

  const url = `${BASE}/search?q=${encodeURIComponent(q)}&format=json&limit=${Math.max(limit, 8)}&addressdetails=0`;
  const promise = (async (): Promise<NominatimPlace[]> => {
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as NominatimPlace[];
      cacheSet(key, data);
      return data;
    } catch {
      // If we got aborted but have a usable prefix cache, fall back to that
      // so the UI never feels empty while typing.
      const fb = prefixCacheLookup(key, limit);
      return fb ?? [];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  const out = await promise;
  return out.slice(0, limit);
}

// Synchronous lookup used by UI to render instantly while debouncing.
export function peekCachedPlaces(query: string, limit = 6): NominatimPlace[] | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  const exact = cacheGet(q);
  if (exact) return exact.slice(0, limit);
  return prefixCacheLookup(q, limit);
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
