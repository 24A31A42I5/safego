// Rich shape for a single stop in a shared tour. All extra fields are optional
// so existing rows (which only have name/lat/lng/order/description) keep working.
export interface RichStop {
  name: string;
  lat: number;
  lng: number;
  order: number;
  description?: string;          // short description (legacy)
  detailedDescription?: string;  // long-form notes
  images?: string[];             // per-stop photos
  stayDuration?: string;         // e.g. "2 hours", "half day"
  bestTimeToVisit?: string;      // e.g. "Winter mornings"
  travelTips?: string;
  warnings?: string;
  estimatedCost?: string;        // free-form so users can write "₹500" or "Free"
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
});
