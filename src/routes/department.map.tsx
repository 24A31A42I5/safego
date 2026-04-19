import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { SafetyMap, type Zone } from "@/components/SafetyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Polygon, Polyline, CircleMarker } from "react-leaflet";
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Trash2,
  Save,
  MapPin,
  Crosshair,
} from "lucide-react";

export const Route = createFileRoute("/department/map")({
  component: MapManagement,
});

type DrawType = "safe" | "caution" | "danger";

const STYLE = {
  safe: { color: "#16a34a", fillColor: "#22c55e" },
  caution: { color: "#d97706", fillColor: "#f59e0b" },
  danger: { color: "#dc2626", fillColor: "#ef4444" },
};

function MapManagement() {
  const { user } = useAuth();
  const { location } = useGeolocation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [drawing, setDrawing] = useState<DrawType | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [zoneName, setZoneName] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);

  const load = async () => {
    const { data } = await supabase.from("zones").select("*");
    if (data) setZones(data);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dept-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "zones" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const handleMapClick = (latlng: [number, number]) => {
    if (drawing) {
      setPoints((p) => [...p, latlng]);
    }
  };

  const saveZone = async () => {
    if (!user || !drawing || points.length < 3) {
      toast.error("Need at least 3 points");
      return;
    }
    const name = zoneName.trim() || `${drawing} zone ${new Date().toLocaleString()}`;
    const { error } = await supabase.from("zones").insert([
      {
        name,
        zone_type: drawing,
        coordinates: points as unknown as import("@/integrations/supabase/types").Json,
        created_by: user.id,
      },
    ]);
    if (error) toast.error(error.message);
    else {
      toast.success("Zone saved");
      setPoints([]);
      setDrawing(null);
      setZoneName("");
    }
  };

  const dangerAroundMe = async () => {
    if (!user || !location) {
      toast.error("Location required");
      return;
    }
    // 25m radius circle approximated as 12-sided polygon
    const r = 25 / 111320; // rough deg per meter
    const poly: [number, number][] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return [location[0] + Math.sin(a) * r, location[1] + Math.cos(a) * r];
    });
    const { error } = await supabase.from("zones").insert([
      {
        name: `Danger zone @ ${new Date().toLocaleTimeString()}`,
        zone_type: "danger",
        coordinates: poly as unknown as import("@/integrations/supabase/types").Json,
        created_by: user.id,
      },
    ]);
    if (error) toast.error(error.message);
    else toast.success("Danger zone created around your location");
  };

  const deleteZone = async (id: string) => {
    const { error } = await supabase.from("zones").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Zone deleted");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Safety Zone Map</CardTitle>
          <CardDescription>View and draw safety zones on the map.</CardDescription>
        </CardHeader>
        <CardContent>
          <SafetyMap
            zones={deleteMode ? [] : zones}
            userLocation={location}
            height="420px"
            panTo={panTo}
            onMapClick={handleMapClick}
            cursor={drawing ? "crosshair" : deleteMode ? "not-allowed" : undefined}
          >
            {deleteMode &&
              zones.map((z) => {
                const coords = z.coordinates as unknown as [number, number][];
                if (!Array.isArray(coords) || coords.length < 3) return null;
                const style = STYLE[z.zone_type as DrawType];
                return (
                  <Polygon
                    key={z.id}
                    positions={coords}
                    pathOptions={{ ...style, fillOpacity: 0.5, weight: 3 }}
                    eventHandlers={{
                      click: () => deleteZone(z.id),
                    }}
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
          </SafetyMap>
          {drawing && (
            <p className="mt-2 text-xs text-muted-foreground">
              Click on the map to add points. {points.length} added. Need at least 3.
            </p>
          )}
          {deleteMode && (
            <p className="mt-2 text-xs text-destructive">
              Delete mode on — click any zone to remove it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editing Tools</CardTitle>
          <CardDescription>Use these tools to manage map zones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Add New Zone
            </Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Button
                variant={drawing === "safe" ? "default" : "outline"}
                onClick={() => {
                  setDrawing("safe");
                  setPoints([]);
                  setDeleteMode(false);
                }}
              >
                <ShieldCheck className="mr-1 h-4 w-4" /> Add Safe Zone
              </Button>
              <Button
                variant={drawing === "caution" ? "default" : "outline"}
                onClick={() => {
                  setDrawing("caution");
                  setPoints([]);
                  setDeleteMode(false);
                }}
              >
                <AlertCircle className="mr-1 h-4 w-4" /> Add Caution Zone
              </Button>
              <Button
                variant={drawing === "danger" ? "default" : "outline"}
                onClick={() => {
                  setDrawing("danger");
                  setPoints([]);
                  setDeleteMode(false);
                }}
              >
                <AlertTriangle className="mr-1 h-4 w-4" /> Add Danger Zone
              </Button>
            </div>
          </div>

          {drawing && (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Zone name</Label>
              <Input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder={`e.g. Beach ${drawing} zone`}
              />
              <div className="flex gap-2">
                <Button onClick={saveZone}>
                  <Save className="mr-1 h-4 w-4" /> Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDrawing(null);
                    setPoints([]);
                    setZoneName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Modify &amp; Save
            </Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Button
                variant={deleteMode ? "destructive" : "outline"}
                onClick={() => {
                  setDeleteMode((d) => !d);
                  setDrawing(null);
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> {deleteMode ? "Stop Deleting" : "Delete a Zone"}
              </Button>
              <Button
                onClick={dangerAroundMe}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <AlertTriangle className="mr-1 h-4 w-4" /> Danger Zone Around Me
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={() => location && setPanTo(location)}
            disabled={!location}
            className="w-full"
          >
            <Crosshair className="mr-1 h-4 w-4" /> Center on Me
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
