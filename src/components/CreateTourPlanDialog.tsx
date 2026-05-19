import { useEffect, useMemo, useState } from "react";
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
import { PlaceSearch } from "@/components/PlaceSearch";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import { pointsBounds } from "@/lib/geo";
import { ArrowRight, MapPin, MousePointerClick, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ShareTourDialog, type ShareTourPayload } from "@/components/ShareTourDialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished?: () => void;
}

interface PointLabel { pos: [number, number]; label: string }

export function CreateTourPlanDialog({ open, onOpenChange, onPublished }: Props) {
  const [start, setStart] = useState<PointLabel | null>(null);
  const [dest, setDest] = useState<PointLabel | null>(null);
  const [stops, setStops] = useState<PointLabel[]>([]);
  const [clickToAdd, setClickToAdd] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setStart(null);
      setDest(null);
      setStops([]);
      setClickToAdd(false);
      setRoute(null);
    }
  }, [open]);

  const waypoints = useMemo<[number, number][]>(() => {
    const list: [number, number][] = [];
    if (start) list.push(start.pos);
    stops.forEach((s) => list.push(s.pos));
    if (dest) list.push(dest.pos);
    return list;
  }, [start, dest, stops]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetchRoute(waypoints, "driving", ctrl.signal).then((r) => {
      if (r) setRoute(r);
    });
    return () => ctrl.abort();
  }, [waypoints]);

  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = [];
    if (start) m.push({ id: "start", pos: start.pos, label: `Start: ${start.label}`, color: "#16a34a", initials: "A" });
    stops.forEach((s, i) =>
      m.push({ id: `s-${i}`, pos: s.pos, label: s.label, color: "#0ea5e9", initials: `${i + 1}` }),
    );
    if (dest) m.push({ id: "dest", pos: dest.pos, label: `Destination: ${dest.label}`, color: "#dc2626", initials: "B" });
    return m;
  }, [start, dest, stops]);

  const bounds = useMemo(() => (waypoints.length ? pointsBounds(waypoints) : undefined), [waypoints]);

  const handleMapClick = (latlng: [number, number]) => {
    if (!clickToAdd) return;
    if (!start) {
      setStart({ pos: latlng, label: `Start @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}` });
      toast.success("Start set — click again for destination");
      return;
    }
    if (!dest) {
      setDest({ pos: latlng, label: `Destination @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}` });
      toast.success("Destination set — keep clicking to add stops");
      return;
    }
    setStops((p) => [...p, { pos: latlng, label: `Stop @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}` }]);
  };

  const removeStop = (i: number) => setStops((p) => p.filter((_, idx) => idx !== i));

  const payload: ShareTourPayload | null = useMemo(() => {
    if (!start || !dest || !route) return null;
    return {
      start,
      destination: dest,
      intermediateStops: stops,
      routeCoordinates: route.coordinates,
      routeDistanceM: route.distance,
      routeDurationS: route.duration,
    };
  }, [start, dest, stops, route]);

  const onContinue = () => {
    if (!start || !dest) {
      toast.error("Please set a start and destination");
      return;
    }
    if (!route) {
      toast.error("Calculating route — try again in a moment");
      return;
    }
    setShareOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto p-0">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload your tour plan
            </DialogTitle>
            <DialogDescription>
              Set a start &amp; destination, add stops on the map, then publish to the community.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Start location</Label>
                <PlaceSearch
                  placeholder="From…"
                  onSelect={(p) => setStart({ pos: [p.lat, p.lon], label: p.label })}
                  initialValue={start?.label.split(",").slice(0, 2).join(", ") ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Destination</Label>
                <PlaceSearch
                  placeholder="To…"
                  onSelect={(p) => setDest({ pos: [p.lat, p.lon], label: p.label })}
                  initialValue={dest?.label.split(",").slice(0, 2).join(", ") ?? ""}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" />
                <span>Tap on map to add {!start ? "start" : !dest ? "destination" : "stops"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={clickToAdd} onCheckedChange={setClickToAdd} id="click-add" />
                <Label htmlFor="click-add" className="text-xs">Click to add</Label>
              </div>
            </div>

            <SafetyMap
              markers={markers}
              routePolyline={route?.coordinates ?? (waypoints.length >= 2 ? waypoints : null)}
              fitBounds={bounds}
              fitBoundsEnabled
              height="320px"
              onMapClick={handleMapClick}
            />

            {(start || dest || stops.length > 0) && (
              <div className="space-y-1">
                <Label className="text-xs">Itinerary</Label>
                <ol className="space-y-1 rounded-md border p-2">
                  {start && (
                    <li className="flex items-center gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">A</span>
                      <span className="min-w-0 flex-1 truncate">{start.label}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setStart(null)} aria-label="Remove start">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  )}
                  {stops.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeStop(i)} aria-label="Remove stop">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                  {dest && (
                    <li className="flex items-center gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">B</span>
                      <span className="min-w-0 flex-1 truncate">{dest.label}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDest(null)} aria-label="Remove destination">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  )}
                </ol>
              </div>
            )}

            {route && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{formatDistance(route.distance)}</Badge>
                <Badge variant="secondary">{formatDuration(route.duration)}</Badge>
                <Badge variant="secondary">{stops.length} stop{stops.length === 1 ? "" : "s"}</Badge>
              </div>
            )}
          </div>

          <DialogFooter className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onContinue} disabled={!start || !dest || !route}>
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareTourDialog
        open={shareOpen}
        onOpenChange={(v) => {
          setShareOpen(v);
          if (!v) {
            // If user successfully published, ShareTourDialog already toasts.
            // Close the planner too when share dialog closes after publish.
            onPublished?.();
          }
        }}
        payload={payload}
      />
    </>
  );
}
