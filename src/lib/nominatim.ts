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
  category: "tourist" | "food" | "landmark" | "nature";
  near: [number, number];
}

// Sample N points along the waypoint polyline and query Nominatim for POIs near each.
export async function suggestAlongRoute(
  waypoints: [number, number][],
  signal?: AbortSignal
): Promise<SuggestedPOI[]> {
  if (waypoints.length < 2) return [];
  // Sample up to 4 points along the route (start, ~1/3, ~2/3, end).
  const samples: [number, number][] = [];
  const idxs = [0, Math.floor(waypoints.length / 3), Math.floor((2 * waypoints.length) / 3), waypoints.length - 1];
  const seen = new Set<number>();
  for (const i of idxs) {
    if (!seen.has(i) && waypoints[i]) {
      seen.add(i);
      samples.push(waypoints[i]);
    }
  }

  const queries: { q: string; cat: SuggestedPOI["category"] }[] = [
    { q: "tourist attraction", cat: "tourist" },
    { q: "restaurant", cat: "food" },
    { q: "landmark", cat: "landmark" },
  ];

  const results: SuggestedPOI[] = [];
  const dedupe = new Set<string>();

  for (const [lat, lon] of samples) {
    for (const { q, cat } of queries) {
      const places = await nearbyPlaces(lat, lon, q, 8, signal, 3);
      for (const p of places) {
        const key = `${p.lat.slice(0, 7)}|${p.lon.slice(0, 7)}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        results.push({
          name: p.display_name.split(",")[0] || p.display_name,
          lat: parseFloat(p.lat),
          lon: parseFloat(p.lon),
          category: cat,
          near: [lat, lon],
        });
      }
      // small delay to be polite to public Nominatim
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return results.slice(0, 12);
}
