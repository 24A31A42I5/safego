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
