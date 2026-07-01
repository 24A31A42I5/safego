// Per-segment geometry builder. Given a pair of stops and a transport type,
// returns a polyline suitable for Leaflet plus display style.
import { fetchRoute } from "@/lib/routing";
import { decodePolyline, encodePolyline } from "@/lib/polyline";
import { TRANSPORT_STYLE, type RouteSegment, type TransportType } from "@/lib/tour-stop";

export interface RenderableSegment {
  id: string;
  coords: [number, number][];
  color: string;
  weight: number;
  dashArray?: string;
  transport: TransportType;
}

// Great-circle arc via slerp. Good for flights.
function greatCircle(a: [number, number], b: [number, number], steps = 48): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a[0]);
  const lon1 = toRad(a[1]);
  const lat2 = toRad(b[0]);
  const lon2 = toRad(b[1]);
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
    ),
  );
  if (d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([toDeg(lat), toDeg(lon)]);
  }
  return out;
}

// Smooth curved line (quadratic bezier) between two points — used for train
// (no free rail routing data available). Approximates a natural rail curve.
function curvedLine(a: [number, number], b: [number, number], steps = 40): [number, number][] {
  const midLat = (a[0] + b[0]) / 2;
  const midLng = (a[1] + b[1]) / 2;
  // Perpendicular offset ~10% of segment length
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  const bow = len * 0.08;
  const ctrl: [number, number] = [midLat + nx * bow, midLng + ny * bow];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const lat = u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0];
    const lng = u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1];
    out.push([lat, lng]);
  }
  return out;
}

/**
 * Compute the geometry for a segment between two stops. Uses OSRM for
 * driving/walking/cycling, great-circle for flight, curved line for train.
 * Falls back to a straight line if OSRM is unreachable.
 */
export async function computeSegmentGeometry(
  from: [number, number],
  to: [number, number],
  transport: TransportType,
  signal?: AbortSignal,
): Promise<{ coords: [number, number][]; distanceM?: number; durationS?: number }> {
  const style = TRANSPORT_STYLE[transport];
  if (style.profile === "flight") {
    const coords = greatCircle(from, to);
    return { coords };
  }
  if (style.profile === "train") {
    const coords = curvedLine(from, to);
    return { coords };
  }
  const r = await fetchRoute([from, to], style.profile, signal);
  if (r && r.coordinates.length > 1) {
    return { coords: r.coordinates, distanceM: r.distance, durationS: r.duration };
  }
  return { coords: [from, to] };
}

/**
 * For a stop list + user-defined segments, return a Renderable[] covering
 * every consecutive pair. Undefined pairs default to a driving segment.
 * Cached geometries in `RouteSegment.geometry` are decoded and reused.
 */
export function buildRenderableSegments(
  stops: { id: string; pos: [number, number] }[],
  segments: RouteSegment[],
  fallbackFullRoute: [number, number][] | null,
): RenderableSegment[] {
  if (stops.length < 2) return [];
  const byPair = new Map<string, RouteSegment>();
  segments.forEach((s) => byPair.set(`${s.fromId}::${s.toId}`, s));

  const anyDefined = segments.length > 0;
  const out: RenderableSegment[] = [];

  // If NO user-defined segments and we have a full precomputed OSRM route,
  // render it as one blue line (legacy behavior).
  if (!anyDefined && fallbackFullRoute && fallbackFullRoute.length > 1) {
    out.push({
      id: "full",
      coords: fallbackFullRoute,
      color: "#2563eb",
      weight: 5,
      transport: "car",
    });
    return out;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const seg = byPair.get(`${a.id}::${b.id}`);
    if (seg && seg.geometry) {
      const style = TRANSPORT_STYLE[seg.transport];
      out.push({
        id: seg.id,
        coords: decodePolyline(seg.geometry),
        color: style.color,
        weight: style.weight,
        dashArray: style.dashArray,
        transport: seg.transport,
      });
    } else {
      const t: TransportType = seg?.transport ?? "car";
      const style = TRANSPORT_STYLE[t];
      // Placeholder straight line; caller will refresh via computeSegmentGeometry
      out.push({
        id: seg?.id ?? `pending-${i}`,
        coords: [a.pos, b.pos],
        color: style.color,
        weight: style.weight,
        dashArray: style.dashArray ?? "4 6",
        transport: t,
      });
    }
  }
  return out;
}

export function encodeSegmentGeometry(coords: [number, number][]): string {
  return encodePolyline(coords);
}
