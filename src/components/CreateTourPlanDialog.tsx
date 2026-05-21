import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PlaceSearch } from "@/components/PlaceSearch";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import { haversine, pointsBounds } from "@/lib/geo";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  MapPin,
  MousePointerClick,
  Plus,
  RouteIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ShareTourDialog, type ShareTourPayload } from "@/components/ShareTourDialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished?: () => void;
}

interface Stop {
  pos: [number, number];
  label: string;
}

export function CreateTourPlanDialog({ open, onOpenChange, onPublished }: Props) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [clickToAdd, setClickToAdd] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!open) {
      setStops([]);
      setClickToAdd(false);
      setRoute(null);
      setPanTo(null);
    }
  }, [open]);

  const waypoints = useMemo(() => stops.map((s) => s.pos), [stops]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null);
      return;
    }
    setRoute(null);
    const ctrl = new AbortController();
    fetchRoute(waypoints, "driving", ctrl.signal).then((r) => {
      if (r) setRoute(r);
    });
    return () => ctrl.abort();
  }, [waypoints]);

  const addStop = (pos: [number, number], label: string) => {
    setStops((p) => [...p, { pos, label }]);
    setPanTo(pos);
  };
  const removeStop = (i: number) => setStops((p) => p.filter((_, idx) => idx !== i));
  const moveStop = (i: number, dir: -1 | 1) =>
    setStops((p) => {
      const next = [...p];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const onMapClick = useCallback(
    (latlng: [number, number]) => {
      if (!clickToAdd) return;
      addStop(latlng, `Stop @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}`);
    },
    [clickToAdd],
  );

  const autoOrderStops = () => {
    if (stops.length < 4) {
      toast.info("Add at least two stops between start and destination");
      return;
    }
    const start = stops[0];
    const dest = stops[stops.length - 1];
    const remaining = stops.slice(1, -1);
    const ordered: Stop[] = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      remaining.forEach((c, idx) => {
        const s = haversine(current.pos, c.pos) + haversine(c.pos, dest.pos) * 0.35;
        if (s < bestScore) {
          bestScore = s;
          bestIdx = idx;
        }
      });
      const [next] = remaining.splice(bestIdx, 1);
      ordered.push(next);
      current = next;
    }
    setStops([start, ...ordered, dest]);
    toast.success("Stops auto-ordered");
  };

  const clearAll = () => {
    setStops([]);
    setRoute(null);
  };

  const stopMarkers: MapMarker[] = useMemo(
    () =>
      stops.map((s, i) => ({
        id: `wp-${i}`,
        pos: s.pos,
        label: `${i === 0 ? "Start" : i === stops.length - 1 ? "Destination" : `Stop ${i}`}: ${s.label}`,
        color: i === 0 ? "#16a34a" : i === stops.length - 1 ? "#dc2626" : "#0ea5e9",
        initials: i === 0 ? "A" : i === stops.length - 1 ? "B" : `${i}`,
      })),
    [stops],
  );

  const bounds = useMemo(() => (waypoints.length ? pointsBounds(waypoints) : undefined), [waypoints]);

  const payload: ShareTourPayload | null = useMemo(() => {
    if (stops.length < 2 || !route) return null;
    return {
      start: stops[0],
      destination: stops[stops.length - 1],
      intermediateStops: stops.slice(1, -1),
      routeCoordinates: route.coordinates,
      routeDistanceM: route.distance,
      routeDurationS: route.duration,
    };
  }, [stops, route]);

  const onContinue = () => {
    if (stops.length < 2) {
      toast.error("Add a start and destination");
      return;
    }
    if (!route) {
      toast.error("Calculating route — try again in a moment");
      return;
    }
    setShareOpen(true);
  };

  const searchPlaceholder =
    stops.length === 0 ? "Start location" : stops.length === 1 ? "Destination" : "Add a stop";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Plan your journey
            </DialogTitle>
            <DialogDescription>
              Build a complete multi-stop journey — search places, tap the map, reorder, and publish.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* LEFT — planner controls */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">
                  {stops.length === 0
                    ? "Search start location"
                    : stops.length === 1
                      ? "Search destination"
                      : "Add another stop"}
                </Label>
                <PlaceSearch
                  placeholder={searchPlaceholder}
                  onSelect={(p) => addStop([p.lat, p.lon], p.label.split(",").slice(0, 2).join(", "))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={clickToAdd ? "default" : "outline"}
                  onClick={() => setClickToAdd((v) => !v)}
                >
                  <MousePointerClick className="mr-1 h-4 w-4" />
                  {clickToAdd ? "Click map (on)" : "Click map to add"}
                </Button>
                <Button size="sm" variant="outline" onClick={autoOrderStops} disabled={stops.length < 4}>
                  <RouteIcon className="mr-1 h-4 w-4" /> Auto-order
                </Button>
                <Button size="sm" variant="outline" onClick={clearAll} disabled={stops.length === 0}>
                  <Trash2 className="mr-1 h-4 w-4" /> Clear
                </Button>
              </div>

              {route && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{formatDistance(route.distance)}</Badge>
                  <Badge variant="secondary">{formatDuration(route.duration)}</Badge>
                  <Badge variant="secondary">
                    {Math.max(0, stops.length - 2)} stop{stops.length - 2 === 1 ? "" : "s"}
                  </Badge>
                </div>
              )}

              {stops.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {stops.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 p-2 text-sm">
                      <span
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{
                          background:
                            i === 0 ? "#16a34a" : i === stops.length - 1 ? "#dc2626" : "#0ea5e9",
                        }}
                      >
                        {i === 0 ? "A" : i === stops.length - 1 ? "B" : i}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPanTo(s.pos)}
                        className="min-w-0 flex-1 truncate text-left hover:underline"
                      >
                        {s.label}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveStop(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveStop(i, 1)}
                        disabled={i === stops.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeStop(i)}
                        aria-label="Remove stop"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  <MapPin className="mr-1 inline h-3.5 w-3.5" />
                  Search above or tap the map to add your start.
                </p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Add per-stop details (photos, tips, cost, warnings) on the next step.
              </p>
            </div>

            {/* RIGHT — map */}
            <div className="space-y-2">
              <SafetyMap
                markers={stopMarkers}
                routePolyline={route?.coordinates ?? null}
                fitBounds={bounds}
                fitBoundsEnabled={waypoints.length > 1 || Boolean(panTo)}
                panTo={panTo}
                onMapClick={onMapClick}
                cursor={clickToAdd ? "crosshair" : undefined}
                height="420px"
              />
              <p className="text-[11px] text-muted-foreground">
                {clickToAdd
                  ? "Click anywhere on the map to drop a stop."
                  : "Enable “Click map to add” to drop stops directly on the map."}
              </p>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onContinue} disabled={stops.length < 2 || !route}>
              Add details & publish <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareTourDialog
        open={shareOpen}
        onOpenChange={(v) => {
          setShareOpen(v);
          if (!v) onPublished?.();
        }}
        payload={payload}
      />
    </>
  );
}
