import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap } from "react-leaflet";
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

interface SafetyMapProps {
  center?: [number, number];
  zoom?: number;
  zones?: Zone[];
  userLocation?: [number, number] | null;
  markers?: { id: string; pos: [number, number]; label?: string; color?: string }[];
  height?: string;
  panTo?: [number, number] | null;
  onMapClick?: (latlng: [number, number]) => void;
  cursor?: string;
  children?: React.ReactNode;
}

function PanController({ panTo }: { panTo?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (panTo) map.flyTo(panTo, Math.max(map.getZoom(), 15));
  }, [panTo, map]);
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

export function SafetyMap({
  center = [13.0827, 80.2707], // Chennai default
  zoom = 13,
  zones = [],
  userLocation,
  markers = [],
  height = "400px",
  panTo,
  onMapClick,
  cursor,
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
        {userLocation && (
          <Marker position={userLocation}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {markers.map((m) => (
          <Marker key={m.id} position={m.pos}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
        {children}
      </MapContainer>
    </div>
  );
}
