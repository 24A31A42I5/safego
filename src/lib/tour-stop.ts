// Rich shape for a single stop in a shared tour / group tour. All extra
// fields are optional so existing rows keep working.

export type TransportType = "bus" | "train" | "car" | "flight" | "bike" | "walk" | "other";

export interface TransportOption {
  type: TransportType;
  details: string;
}

export const TRANSPORT_OPTIONS: { type: TransportType; label: string; icon: string }[] = [
  { type: "bus", label: "Bus", icon: "🚌" },
  { type: "train", label: "Train", icon: "🚆" },
  { type: "car", label: "Car", icon: "🚗" },
  { type: "flight", label: "Flight", icon: "✈️" },
  { type: "bike", label: "Bike", icon: "🚲" },
  { type: "walk", label: "Walk", icon: "🚶" },
  { type: "other", label: "Other", icon: "📦" },
];

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
