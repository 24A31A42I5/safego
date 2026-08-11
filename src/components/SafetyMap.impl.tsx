import { memo, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { Database } from "@/integrations/supabase/types";

// Fix Leaflet default icon paths (Vite bundling issue)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type Zone = Database["public"]["Tables"]["zones"]["Row"];

const ZONE_STYLES: Record<string, { color: string; fillColor: string }> = {
  safe: { color: "#16a34a", fillColor: "#22c55e" },
  caution: { color: "#d97706", fillColor: "#f59e0b" },
  danger: { color: "#dc2626", fillColor: "#ef4444" },
};

export interface MapMarker {
  id: string;
  pos: [number, number];
  label?: string;
  color?: string;
  avatarUrl?: string | null;
  initials?: string;
  /** "sos" = pulsing red pin, "zone" = amber warning pin */
  variant?: "sos" | "zone";
}

export interface RouteSegmentLine {
  id: string;
  coords: [number, number][];
  color: string;
  weight?: number;
  dashArray?: string;
}

interface SafetyMapProps {
  center?: [number, number];
  zoom?: number;
  zones?: Zone[];
  userLocation?: [number, number] | null;
  markers?: MapMarker[];
  height?: string;
  panTo?: [number, number] | null;
  onMapClick?: (latlng: [number, number]) => void;
  cursor?: string;
  routePolyline?: [number, number][] | null;
  routeSegments?: RouteSegmentLine[] | null;
  fitBounds?: [[number, number], [number, number]] | null;
  fitBoundsEnabled?: boolean;
  children?: React.ReactNode;
}

function PanController({ panTo }: { panTo?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (panTo) map.flyTo(panTo, Math.max(map.getZoom(), 15), { duration: 1.0 });
  }, [panTo, map]);
  return null;
}

function FitBoundsController({
  bounds,
  enabled = true,
}: {
  bounds?: [[number, number], [number, number]] | null;
  enabled?: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !bounds) return;
    map.flyToBounds(bounds, { padding: [40, 40], duration: 1.0, maxZoom: 16 });
  }, [bounds, enabled, map]);
  return null;
}

function AutoCenter({ location }: { location?: [number, number] | null }) {
  const map = useMap();
  const didCenter = useRef(false);
  useEffect(() => {
    if (location && !didCenter.current) {
      didCenter.current = true;
      map.flyTo(location, 15, { duration: 1.2 });
    }
  }, [location, map]);
  return null;
}

function ClickHandler({
  onMapClick,
}: {
  onMapClick?: (latlng: [number, number]) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick([e.latlng.lat, e.latlng.lng]);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);
  return null;
}

// Build a circular avatar divIcon
function avatarIcon(opts: { avatarUrl?: string | null; initials?: string; color?: string }): L.DivIcon {
  const bg = opts.color ?? "#3b82f6";
  const inner = opts.avatarUrl
    ? `<img src="${opts.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;font-weight:600;font-size:13px;font-family:system-ui">${opts.initials ?? "•"}</div>`;
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:50%;border:3px solid ${bg};background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.25);overflow:hidden">${inner}</div>`,
  });
}

const ALERT_MARKER_COLORS = {
  sos: "#EF4444",
  zone: "#F59E0B",
} as const;

/** Teardrop alert pin. SOS pins pulse to signal an active emergency. */
function alertPinIcon(variant: "sos" | "zone"): L.DivIcon {
  const color = ALERT_MARKER_COLORS[variant];
  const pulse =
    variant === "sos"
      ? `<span class="safego-pin-pulse" style="border-color:${color};background:${color}33"></span>`
      : "";
  return L.divIcon({
    className: "",
    iconSize: [30, 42],
    iconAnchor: [15, 40],
    popupAnchor: [0, -34],
    html: `<div class="safego-pin">${pulse}
      <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">
        <path d="M15 1C7.8 1 2 6.8 2 14c0 9.2 13 27 13 27s13-17.8 13-27C28 6.8 22.2 1 15 1Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="15" cy="14" r="5" fill="#ffffff"/>
      </svg></div>`,
  });
}



export const SafetyMap = memo(function SafetyMap({
  center = [13.0827, 80.2707], // Chennai default
  zoom = 13,
  zones = [],
  userLocation,
  markers = [],
  height = "400px",
  panTo,
  onMapClick,
  cursor,
  routePolyline,
  routeSegments,
  fitBounds,
  fitBoundsEnabled = true,
  children,
}: SafetyMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
      >
        Loading map…
      </div>
    );
  }

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border">
      <MapContainer
        center={userLocation ?? center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", cursor: cursor ?? "grab" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PanController panTo={panTo} />
        <FitBoundsController bounds={fitBounds} enabled={fitBoundsEnabled} />
        <AutoCenter location={userLocation} />
        <ClickHandler onMapClick={onMapClick} />
        {zones.map((z) => {
          const coords = z.coordinates as unknown as [number, number][];
          if (!Array.isArray(coords) || coords.length < 3) return null;
          const style = ZONE_STYLES[z.zone_type] ?? ZONE_STYLES.safe;
          return (
            <Polygon
              key={z.id}
              positions={coords}
              pathOptions={{ ...style, fillOpacity: 0.3, weight: 2 }}
            >
              <Popup>
                <strong className="capitalize">{z.zone_type} zone</strong>
                <br />
                {z.name}
              </Popup>
            </Polygon>
          );
        })}
        {routeSegments && routeSegments.length > 0
          ? routeSegments.map((seg) => (
              seg.coords.length > 1 ? (
                <Polyline
                  key={seg.id}
                  positions={seg.coords}
                  pathOptions={{
                    color: seg.color,
                    weight: seg.weight ?? 5,
                    opacity: 0.85,
                    dashArray: seg.dashArray,
                  }}
                />
              ) : null
            ))
          : routePolyline && routePolyline.length > 1 && (
              <Polyline
                positions={routePolyline}
                pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.8 }}
              />
            )}
        {userLocation && (
          <Marker position={userLocation}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {markers.map((m) => {
          const useCustom = m.avatarUrl || m.initials || m.color;
          const iconProp = useCustom
            ? { icon: avatarIcon({ avatarUrl: m.avatarUrl, initials: m.initials, color: m.color }) }
            : {};
          return (
            <Marker key={m.id} position={m.pos} {...iconProp}>
              {m.label && <Popup>{m.label}</Popup>}
            </Marker>
          );
        })}
        {children}
      </MapContainer>
    </div>
  );
});
