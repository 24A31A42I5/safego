import { CircleMarker, Polygon, Polyline } from "react-leaflet";

export function MapDraftOverlay({
  deleteMode,
  drawing,
  points,
  zones,
  onDeleteZone,
}: {
  deleteMode: boolean;
  drawing: "safe" | "caution" | "danger" | null;
  points: [number, number][];
  zones: Array<{ id: string; zone_type: "safe" | "caution" | "danger"; coordinates: unknown }>;
  onDeleteZone: (id: string) => void;
}) {
  const STYLE = {
    safe: { color: "#16a34a", fillColor: "#22c55e" },
    caution: { color: "#d97706", fillColor: "#f59e0b" },
    danger: { color: "#dc2626", fillColor: "#ef4444" },
  } as const;

  return (
    <>
      {deleteMode &&
        zones.map((z) => {
          const coords = z.coordinates as [number, number][];
          if (!Array.isArray(coords) || coords.length < 3) return null;
          const style = STYLE[z.zone_type];
          return (
            <Polygon
              key={z.id}
              positions={coords}
              pathOptions={{ ...style, fillOpacity: 0.5, weight: 3 }}
              eventHandlers={{ click: () => onDeleteZone(z.id) }}
            />
          );
        })}
      {drawing && points.length > 0 && (
        <>
          {points.length >= 3 ? (
            <Polygon
              positions={points}
              pathOptions={{ ...STYLE[drawing], fillOpacity: 0.35, weight: 2, dashArray: "6,4" }}
            />
          ) : (
            <Polyline
              positions={points}
              pathOptions={{ color: STYLE[drawing].color, weight: 3, dashArray: "6,4" }}
            />
          )}
          {points.map((p, i) => (
            <CircleMarker
              key={i}
              center={p}
              radius={6}
              pathOptions={{
                color: STYLE[drawing].color,
                fillColor: "#fff",
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      )}
    </>
  );
}