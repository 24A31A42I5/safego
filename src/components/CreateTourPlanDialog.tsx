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
import { RouteSegmentDialog } from "@/components/RouteSegmentDialog";
import {
  TRANSPORT_OPTIONS,
  TRANSPORT_STYLE,
  type RouteSegment,
} from "@/lib/tour-stop";
import {
  buildRenderableSegments,
  computeSegmentGeometry,
  encodeSegmentGeometry,
} from "@/lib/segments";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished?: () => void;
}

interface Stop {
  id: string;
  pos: [number, number];
  label: string;
}

const makeId = (pos: [number, number], order: number) =>
  `s-${order}-${pos[0].toFixed(5)}-${pos[1].toFixed(5)}-${Math.random().toString(36).slice(2, 6)}`;

export function CreateTourPlanDialog({ open, onOpenChange, onPublished }: Props) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [segmentDialogFor, setSegmentDialogFor] = useState<{ fromIdx: number } | null>(null);
  const [clickToAdd, setClickToAdd] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!open) {
      setStops([]);
      setSegments([]);
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

  // Prune segments referencing removed/reordered stops.
  useEffect(() => {
    if (segments.length === 0) return;
    const valid = new Set<string>();
    for (let i = 0; i < stops.length - 1; i++) valid.add(`${stops[i].id}::${stops[i + 1].id}`);
    const kept = segments.filter((s) => valid.has(`${s.fromId}::${s.toId}`));
    if (kept.length !== segments.length) setSegments(kept);
  }, [stops, segments]);

  const renderableSegments = useMemo(
    () =>
      buildRenderableSegments(
        stops.map((s) => ({ id: s.id, pos: s.pos })),
        segments,
        segments.length > 0 ? null : route?.coordinates ?? null,
      ),
    [stops, segments, route?.coordinates],
  );

  const addStop = (pos: [number, number], label: string) => {
    setStops((p) => {
      const next = [...p, { id: makeId(pos, p.length), pos, label }];
      return next;
    });
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
    setSegments([]);
    setRoute(null);
  };

  const saveSegment = async (
    fromIdx: number,
    patch: Omit<RouteSegment, "id" | "fromId" | "toId" | "geometry" | "distanceM" | "durationS">,
  ) => {
    const from = stops[fromIdx];
    const to = stops[fromIdx + 1];
    if (!from || !to) return;
    const geo = await computeSegmentGeometry(from.pos, to.pos, patch.transport);
    const seg: RouteSegment = {
      id: `seg-${from.id}-${to.id}-${Date.now()}`,
      fromId: from.id,
      toId: to.id,
      ...patch,
      geometry: encodeSegmentGeometry(geo.coords),
      distanceM: geo.distanceM,
      durationS: geo.durationS,
    };
    setSegments((prev) => [
      ...prev.filter((s) => !(s.fromId === from.id && s.toId === to.id)),
      seg,
    ]);
    toast.success("Segment saved");
  };

  const deleteSegment = (fromIdx: number) => {
    const from = stops[fromIdx];
    const to = stops[fromIdx + 1];
    if (!from || !to) return;
    setSegments((prev) => prev.filter((s) => !(s.fromId === from.id && s.toId === to.id)));
    toast.success("Segment removed");
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
      segments,
    };
  }, [stops, route, segments]);

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
              Build a complete multi-stop journey — search places, tap the map, reorder, choose transport per leg, and publish.
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
                <ul className="space-y-1.5">
                  {stops.map((s, i) => {
                    const seg =
                      i < stops.length - 1
                        ? segments.find((sg) => sg.fromId === s.id && sg.toId === stops[i + 1].id) ?? null
                        : null;
                    const segMeta = seg ? TRANSPORT_OPTIONS.find((t) => t.type === seg.transport) : null;
                    const segStyle = seg ? TRANSPORT_STYLE[seg.transport] : null;
                    return (
                      <div key={s.id}>
                        <li className="flex items-center gap-2 rounded-md border p-2 text-sm">
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
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveStop(i, -1)} disabled={i === 0} aria-label="Move up">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} aria-label="Move down">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeStop(i)} aria-label="Remove stop">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                        {i < stops.length - 1 && (
                          <div className="flex items-center gap-2 pl-3 py-1">
                            <div className="h-4 w-px" style={{ background: segStyle?.color ?? "#cbd5e1" }} />
                            {seg ? (
                              <button
                                type="button"
                                onClick={() => setSegmentDialogFor({ fromIdx: i })}
                                className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent"
                                style={{ borderColor: segStyle?.color }}
                              >
                                <span>{segMeta?.icon}</span>
                                <span className="font-medium" style={{ color: segStyle?.color }}>
                                  {segMeta?.label}
                                </span>
                                {seg.number && <span className="text-muted-foreground">· {seg.number}</span>}
                                {seg.departure && <span className="text-muted-foreground">· {seg.departure}</span>}
                              </button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 rounded-full px-2 text-[11px]"
                                onClick={() => setSegmentDialogFor({ fromIdx: i })}
                              >
                                <Plus className="mr-0.5 h-3 w-3" /> Route
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                routeSegments={renderableSegments.length ? renderableSegments : null}
                routePolyline={renderableSegments.length ? null : route?.coordinates ?? null}
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

      {segmentDialogFor !== null && stops[segmentDialogFor.fromIdx] && stops[segmentDialogFor.fromIdx + 1] && (
        <RouteSegmentDialog
          open={segmentDialogFor !== null}
          onOpenChange={(v) => { if (!v) setSegmentDialogFor(null); }}
          fromLabel={stops[segmentDialogFor.fromIdx].label}
          toLabel={stops[segmentDialogFor.fromIdx + 1].label}
          existing={
            segments.find(
              (s) => s.fromId === stops[segmentDialogFor.fromIdx].id && s.toId === stops[segmentDialogFor.fromIdx + 1].id,
            ) ?? null
          }
          onSave={async (patch) => {
            await saveSegment(segmentDialogFor.fromIdx, patch);
            setSegmentDialogFor(null);
          }}
          onDelete={async () => {
            deleteSegment(segmentDialogFor.fromIdx);
            setSegmentDialogFor(null);
          }}
        />
      )}

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
