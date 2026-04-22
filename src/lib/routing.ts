// OSRM public demo routing client. Free, no key, rate-limited (suitable for demos).
// https://project-osrm.org/docs/v5.24.0/api/#route-service

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] pairs (Leaflet-friendly)
  distance: number; // meters
  duration: number; // seconds
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1";

/**
 * Fetch a driving/walking route between waypoints.
 * @param waypoints array of [lat, lng] in order (start, ...via, end)
 * @param profile osrm profile: "driving" | "walking" | "cycling"
 */
export async function fetchRoute(
  waypoints: [number, number][],
  profile: "driving" | "walking" | "cycling" = "walking",
  signal?: AbortSignal
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;
  const coordsStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/${profile}/${coordsStr}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const geo: [number, number][] = (route.geometry?.coordinates ?? []).map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
    );
    return {
      coordinates: geo,
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
