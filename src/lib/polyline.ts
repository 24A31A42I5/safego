// Google encoded polyline algorithm. Compact storage for route geometries.
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm

export function encodePolyline(points: [number, number][], precision = 5): string {
  const factor = Math.pow(10, precision);
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  const encode = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * factor);
    const ln = Math.round(lng * factor);
    out += encode(la - prevLat);
    out += encode(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = Math.pow(10, precision);
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

// Downsample a polyline to at most `n` points, preserving start/end.
export function downsamplePolyline(line: [number, number][], n = 200): [number, number][] {
  if (line.length <= n) return line;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (line.length - 1)) / (n - 1));
    out.push(line[idx]);
  }
  return out;
}
