// Rich shape for a single stop in a shared tour / group tour. All extra
// fields are optional so existing rows keep working.

export type TransportType = "bus" | "train" | "car" | "flight" | "bike" | "walk" | "taxi" | "other";

export interface TransportOption {
  type: TransportType;
  details: string;
}

export const TRANSPORT_OPTIONS: { type: TransportType; label: string; icon: string }[] = [
  { type: "bus", label: "Bus", icon: "🚌" },
  { type: "train", label: "Train", icon: "🚆" },
  { type: "car", label: "Car", icon: "🚗" },
  { type: "taxi", label: "Taxi", icon: "🚕" },
  { type: "flight", label: "Flight", icon: "✈️" },
  { type: "bike", label: "Bike", icon: "🛵" },
  { type: "walk", label: "Walking", icon: "🚶" },
  { type: "other", label: "Other", icon: "📦" },
];

// Visual styling per transport type for map segments.
export const TRANSPORT_STYLE: Record<TransportType, { color: string; weight: number; dashArray?: string; profile: "driving" | "walking" | "cycling" | "flight" | "train" }> = {
  bus:    { color: "#2563eb", weight: 5, profile: "driving" },
  train:  { color: "#16a34a", weight: 5, profile: "train" },
  car:    { color: "#f97316", weight: 5, profile: "driving" },
  taxi:   { color: "#eab308", weight: 5, profile: "driving" },
  flight: { color: "#8b5cf6", weight: 3, dashArray: "10 8", profile: "flight" },
  bike:   { color: "#ec4899", weight: 4, profile: "cycling" },
  walk:   { color: "#6b7280", weight: 3, dashArray: "2 6", profile: "walking" },
  other:  { color: "#3b82f6", weight: 4, dashArray: "6 6", profile: "driving" },
};

// Per-segment transport metadata. All string fields are free-text so we can
// support bus/train/flight/car/etc. with a single dialog.
export interface RouteSegment {
  id: string;
  fromId: string;
  toId: string;
  transport: TransportType;
  operator?: string;      // Bus operator, airline, train name
  number?: string;        // Bus/train/flight number
  vehicleName?: string;   // Vehicle nickname, car type
  driverName?: string;    // For car/taxi
  departure?: string;     // Free-text time, e.g. "06:00"
  arrival?: string;
  notes?: string;
  geometry?: string;      // Encoded polyline (cached, so we don't refetch OSRM)
  distanceM?: number;
  durationS?: number;
}

export interface RichStop {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  shortDescription?: string;
  description?: string; // legacy short description
  detailedDescription?: string;
  images?: string[];
  stayDuration?: string;
  bestTimeToVisit?: string;
  travelTips?: string;
  warnings?: string;
  estimatedCost?: string;
  thingsToDo?: string;
  thingsToCarry?: string;
  transportAvailability?: TransportOption[];
  tags?: string[];
}

export interface StopDraft {
  name: string;
  detailedDescription: string;
  images: string[];
  stayDuration: string;
  bestTimeToVisit: string;
  travelTips: string;
  warnings: string;
  estimatedCost: string;
  thingsToCarry: string;
  transportAvailability: TransportOption[];
}

export interface GroupJourneyStop extends RichStop {
  pos: [number, number];
  label: string;
}

export const emptyStopDraft = (name = ""): StopDraft => ({
  name,
  detailedDescription: "",
  images: [],
  stayDuration: "",
  bestTimeToVisit: "",
  travelTips: "",
  warnings: "",
  estimatedCost: "",
  thingsToCarry: "",
  transportAvailability: [],
});

export function richStopToGroupStop(stop: RichStop, fallbackOrder = 0): GroupJourneyStop {
  return {
    ...stop,
    id: stop.id ?? `stop-${fallbackOrder}`,
    order: typeof stop.order === "number" ? stop.order : fallbackOrder,
    shortDescription: stop.shortDescription ?? stop.description,
    pos: [stop.lat, stop.lng],
    label: stop.name,
    images: Array.isArray(stop.images) ? stop.images : [],
    tags: Array.isArray(stop.tags) ? stop.tags : [],
    transportAvailability: Array.isArray(stop.transportAvailability) ? stop.transportAvailability : [],
  };
}

export function groupStopToRichStop(stop: GroupJourneyStop, order: number): RichStop {
  const [lat, lng] = stop.pos;
  return {
    id: stop.id,
    order,
    name: stop.name || stop.label,
    lat,
    lng,
    shortDescription: stop.shortDescription ?? stop.description,
    description: stop.shortDescription ?? stop.description,
    detailedDescription: stop.detailedDescription,
    images: stop.images ?? [],
    bestTimeToVisit: stop.bestTimeToVisit,
    stayDuration: stop.stayDuration,
    estimatedCost: stop.estimatedCost,
    thingsToDo: stop.thingsToDo,
    thingsToCarry: stop.thingsToCarry,
    travelTips: stop.travelTips,
    warnings: stop.warnings,
    tags: stop.tags ?? [],
    transportAvailability: stop.transportAvailability ?? [],
  };
}

export function parseGroupJourneyStop(raw: unknown, fallbackOrder = 0): GroupJourneyStop {
  if (Array.isArray(raw) && raw.length === 2) {
    const pos: [number, number] = [Number(raw[0]), Number(raw[1])];
    return {
      id: `legacy-${fallbackOrder}`,
      order: fallbackOrder,
      name: `Stop ${fallbackOrder + 1}`,
      label: `Stop ${fallbackOrder + 1}`,
      lat: pos[0],
      lng: pos[1],
      pos,
      images: [],
      tags: [],
      transportAvailability: [],
    };
  }

  const o = (raw ?? {}) as Partial<GroupJourneyStop> & Partial<RichStop>;
  const pos = Array.isArray(o.pos)
    ? ([Number(o.pos[0]), Number(o.pos[1])] as [number, number])
    : ([Number(o.lat ?? 0), Number(o.lng ?? 0)] as [number, number]);
  const label = o.label ?? o.name ?? `Stop ${fallbackOrder + 1}`;
  return {
    ...o,
    id: o.id ?? `stop-${fallbackOrder}`,
    order: typeof o.order === "number" ? o.order : fallbackOrder,
    name: o.name ?? label,
    label,
    lat: pos[0],
    lng: pos[1],
    pos,
    shortDescription: o.shortDescription ?? o.description,
    images: Array.isArray(o.images) ? o.images : [],
    tags: Array.isArray(o.tags) ? o.tags : [],
    transportAvailability: Array.isArray(o.transportAvailability) ? o.transportAvailability : [],
  };
}

export function parseRouteSegment(raw: unknown): RouteSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<RouteSegment>;
  if (!o.fromId || !o.toId || !o.transport) return null;
  return {
    id: o.id ?? `seg-${o.fromId}-${o.toId}`,
    fromId: o.fromId,
    toId: o.toId,
    transport: o.transport,
    operator: o.operator,
    number: o.number,
    vehicleName: o.vehicleName,
    driverName: o.driverName,
    departure: o.departure,
    arrival: o.arrival,
    notes: o.notes,
    geometry: o.geometry,
    distanceM: o.distanceM,
    durationS: o.durationS,
  };
}
