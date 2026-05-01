import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PlaceSearch } from "@/components/PlaceSearch";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Search, Compass, MapPin, Star, Clock, Route as RouteIcon, Users, Sparkles, Filter, X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { decodePolyline } from "@/lib/polyline";
import { haversine, pointsBounds } from "@/lib/geo";
import { formatDistance, formatDuration } from "@/lib/routing";

export const Route = createFileRoute("/tourist/discover")({
  component: DiscoverPage,
  head: () => ({
    meta: [
      { title: "Discover Tour Plans — Tourist" },
      {
        name: "description",
        content: "Find real travel routes shared by other tourists. Search by start and destination, preview the map, and reuse plans.",
      },
    ],
  }),
});

interface SharedTourRow {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  description: string | null;
  start_label: string;
  start_lat: number;
  start_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  stops: { name: string; lat: number; lng: number; order: number }[];
  route_polyline: string | null;
  route_distance_m: number;
  route_duration_s: number;
  tags: string[];
  rating_sum: number;
  rating_count: number;
  created_at: string;
}

interface ScoredTour extends SharedTourRow {
  startDistKm: number;
  destDistKm: number;
  score: number;
  exactMatch: boolean;
  avgRating: number;
}

const ALL_TAGS = ["nature", "heritage", "adventure", "religious", "family", "scenic", "city", "weekend"];

function DiscoverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [start, setStart] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [radius, setRadius] = useState(30);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | "">("");
  const [maxDurationMin, setMaxDurationMin] = useState<number | "">("");
  const [minRating, setMinRating] = useState(0);
  const [results, setResults] = useState<ScoredTour[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ScoredTour | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [pickGroupOpen, setPickGroupOpen] = useState(false);
  const [pendingTour, setPendingTour] = useState<ScoredTour | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("tour_groups")
      .select("id, name")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setGroups(data ?? []));
  }, [user]);

  // Run search (debounced) when inputs change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, dest, radius, filterTags, maxDistanceKm, maxDurationMin, minRating]);

  const runSearch = async () => {
    setLoading(true);
    try {
      let query = supabase.from("shared_tours").select("*").limit(200);

      // Bounding box prefilter when both endpoints provided.
      if (start && dest) {
        const cosLatStart = Math.cos((start.lat * Math.PI) / 180) || 1;
        const cosLatDest = Math.cos((dest.lat * Math.PI) / 180) || 1;
        const dLatS = radius / 111;
        const dLngS = radius / (111 * cosLatStart);
        const dLatD = radius / 111;
        const dLngD = radius / (111 * cosLatDest);
        query = query
          .gte("start_lat", start.lat - dLatS).lte("start_lat", start.lat + dLatS)
          .gte("start_lng", start.lon - dLngS).lte("start_lng", start.lon + dLngS)
          .gte("dest_lat", dest.lat - dLatD).lte("dest_lat", dest.lat + dLatD)
          .gte("dest_lng", dest.lon - dLngD).lte("dest_lng", dest.lon + dLngD);
      } else if (start) {
        const cosLat = Math.cos((start.lat * Math.PI) / 180) || 1;
        const dLat = radius / 111;
        const dLng = radius / (111 * cosLat);
        query = query
          .gte("start_lat", start.lat - dLat).lte("start_lat", start.lat + dLat)
          .gte("start_lng", start.lon - dLng).lte("start_lng", start.lon + dLng);
      } else if (dest) {
        const cosLat = Math.cos((dest.lat * Math.PI) / 180) || 1;
        const dLat = radius / 111;
        const dLng = radius / (111 * cosLat);
        query = query
          .gte("dest_lat", dest.lat - dLat).lte("dest_lat", dest.lat + dLat)
          .gte("dest_lng", dest.lon - dLng).lte("dest_lng", dest.lon + dLng);
      }

      if (filterTags.length) query = query.overlaps("tags", filterTags);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as SharedTourRow[];

      const scored: ScoredTour[] = rows
        .map((r) => {
          const sd = start ? haversine([start.lat, start.lon], [r.start_lat, r.start_lng]) / 1000 : 0;
          const dd = dest ? haversine([dest.lat, dest.lon], [r.dest_lat, r.dest_lng]) / 1000 : 0;
          const avg = r.rating_count > 0 ? r.rating_sum / r.rating_count : 0;
          const exact = (start ? sd < 2 : true) && (dest ? dd < 2 : false);
          return {
            ...r,
            startDistKm: sd,
            destDistKm: dd,
            score: sd + dd,
            exactMatch: exact,
            avgRating: avg,
          };
        })
        .filter((t) => {
          if (start && t.startDistKm > radius) return false;
          if (dest && t.destDistKm > radius) return false;
          if (typeof maxDistanceKm === "number" && t.route_distance_m / 1000 > maxDistanceKm) return false;
          if (typeof maxDurationMin === "number" && t.route_duration_s / 60 > maxDurationMin) return false;
          if (minRating > 0 && t.avgRating < minRating) return false;
          return true;
        })
        .sort((a, b) => {
          if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
          return a.score - b.score;
        })
        .slice(0, 30);
      setResults(scored);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const useThisPlan = (tour: ScoredTour) => {
    setPendingTour(tour);
    if (groups.length === 0) {
      toast.info("Create a tour group first to load this plan");
      return;
    }
    setPickGroupOpen(true);
  };

  const applyToGroup = (groupId: string) => {
    if (!pendingTour) return;
    setPickGroupOpen(false);
    navigate({
      to: "/tourist/groups/$groupId",
      params: { groupId },
      search: { applyTour: pendingTour.id },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Compass className="h-6 w-6 text-primary" /> Discover tour plans
        </h1>
        <p className="text-sm text-muted-foreground">
          Real routes shared by other tourists — search by start &amp; destination, preview, then reuse.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start location</label>
              <PlaceSearch placeholder="From…" onSelect={setStart} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Destination</label>
              <PlaceSearch placeholder="To…" onSelect={setDest} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Match radius</span>
                <span className="font-mono text-foreground">{radius} km</span>
              </div>
              <Slider min={10} max={100} step={5} value={[radius]} onValueChange={(v) => setRadius(v[0])} />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="self-end">
                  <Filter className="mr-1 h-4 w-4" /> Filters
                  {(filterTags.length > 0 || maxDistanceKm !== "" || maxDurationMin !== "" || minRating > 0) && (
                    <Badge variant="secondary" className="ml-1">
                      {filterTags.length + (maxDistanceKm !== "" ? 1 : 0) + (maxDurationMin !== "" ? 1 : 0) + (minRating > 0 ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-sm">
                <div className="mt-6 space-y-5">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TAGS.map((t) => {
                        const on = filterTags.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              setFilterTags((p) => (on ? p.filter((x) => x !== t) : [...p, t]))
                            }
                          >
                            <Badge variant={on ? "default" : "outline"} className="cursor-pointer capitalize">
                              {t}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Max trip distance (km)</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="any"
                      value={maxDistanceKm}
                      onChange={(e) => setMaxDistanceKm(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Max duration (min)</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="any"
                      value={maxDurationMin}
                      onChange={(e) => setMaxDurationMin(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold">Minimum rating</span>
                      <span className="font-mono">{minRating}★</span>
                    </div>
                    <Slider min={0} max={5} step={1} value={[minRating]} onValueChange={(v) => setMinRating(v[0])} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setFilterTags([]);
                      setMaxDistanceKm("");
                      setMaxDurationMin("");
                      setMinRating(0);
                    }}
                  >
                    <X className="mr-1 h-4 w-4" /> Clear filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Result list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {loading ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</span>
              ) : (
                <>{results.length} plan{results.length === 1 ? "" : "s"} found</>
              )}
            </span>
          </div>

          {!loading && results.length === 0 && (
            <Card>
              <CardContent className="space-y-2 p-6 text-center text-sm text-muted-foreground">
                <Search className="mx-auto h-8 w-8 opacity-40" />
                <p>No plans match yet.</p>
                <p className="text-xs">
                  Try increasing the radius, removing filters, or searching nearby cities.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className={`w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40 ${
                  selected?.id === t.id ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate font-semibold">{t.title}</h3>
                      {t.exactMatch && (
                        <Badge variant="default" className="gap-1">
                          <Sparkles className="h-3 w-3" /> Exact match
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      by {t.creator_name}
                    </div>
                  </div>
                  {t.rating_count > 0 && (
                    <div className="flex shrink-0 items-center gap-0.5 text-xs">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold">{t.avgRating.toFixed(1)}</span>
                      <span className="text-muted-foreground">({t.rating_count})</span>
                    </div>
                  )}
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  <MapPin className="mr-0.5 inline h-3 w-3" /> {t.start_label} → {t.dest_label}
                </div>
                {t.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><RouteIcon className="h-3 w-3" />{formatDistance(t.route_distance_m)}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(t.route_duration_s)}</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{t.stops.length} stops</span>
                  {t.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] capitalize">{tag}</Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Map preview */}
        <div className="hidden lg:block">
          <DiscoverMap selected={selected} results={results} />
        </div>
      </div>

      <TourDetailDialog
        tour={selected}
        onClose={() => setSelected(null)}
        onUse={(t) => {
          setSelected(null);
          useThisPlan(t);
        }}
        currentUserId={user?.id ?? null}
      />

      <Dialog open={pickGroupOpen} onOpenChange={setPickGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply plan to a group</DialogTitle>
            <DialogDescription>
              Choose one of your tour groups. The current route will be replaced (you can edit afterwards).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] space-y-1 overflow-y-auto">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => applyToGroup(g.id)}
                className="flex w-full items-center justify-between rounded-md border p-2 text-left text-sm hover:bg-accent/50"
              >
                <span className="truncate">{g.name}</span>
                <Badge variant="outline">Use here</Badge>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickGroupOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiscoverMap({ selected, results }: { selected: ScoredTour | null; results: ScoredTour[] }) {
  const polyline = useMemo(() => {
    if (!selected) return null;
    if (selected.route_polyline) return decodePolyline(selected.route_polyline);
    const pts: [number, number][] = [
      [selected.start_lat, selected.start_lng],
      ...selected.stops.sort((a, b) => a.order - b.order).map((s) => [s.lat, s.lng] as [number, number]),
      [selected.dest_lat, selected.dest_lng],
    ];
    return pts;
  }, [selected]);

  const markers: MapMarker[] = useMemo(() => {
    if (selected) {
      const stops = selected.stops.sort((a, b) => a.order - b.order);
      return [
        { id: "start", pos: [selected.start_lat, selected.start_lng], label: selected.start_label, color: "#16a34a", initials: "A" },
        ...stops.map((s, i) => ({
          id: `s-${i}`,
          pos: [s.lat, s.lng] as [number, number],
          label: s.name,
          color: "#0ea5e9",
          initials: `${i + 1}`,
        })),
        { id: "dest", pos: [selected.dest_lat, selected.dest_lng], label: selected.dest_label, color: "#dc2626", initials: "B" },
      ];
    }
    return results.slice(0, 12).map((t) => ({
      id: t.id,
      pos: [t.dest_lat, t.dest_lng],
      label: t.title,
      color: "#a855f7",
      initials: "★",
    }));
  }, [selected, results]);

  const bounds = useMemo(() => {
    if (polyline && polyline.length) return pointsBounds(polyline);
    const pts = markers.map((m) => m.pos);
    return pointsBounds(pts);
  }, [polyline, markers]);

  return (
    <div className="sticky top-20">
      <SafetyMap
        markers={markers}
        routePolyline={polyline}
        fitBounds={bounds}
        fitBoundsEnabled
        height="600px"
      />
    </div>
  );
}

function TourDetailDialog({
  tour,
  onClose,
  onUse,
  currentUserId,
}: {
  tour: ScoredTour | null;
  onClose: () => void;
  onUse: (t: ScoredTour) => void;
  currentUserId: string | null;
}) {
  const [myRating, setMyRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tour || !currentUserId) {
      setMyRating(0);
      return;
    }
    supabase
      .from("shared_tour_ratings")
      .select("rating")
      .eq("tour_id", tour.id)
      .eq("user_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setMyRating(data?.rating ?? 0));
  }, [tour, currentUserId]);

  const submitRating = async (val: number) => {
    if (!tour || !currentUserId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("shared_tour_ratings")
        .upsert(
          { tour_id: tour.id, user_id: currentUserId, rating: val },
          { onConflict: "tour_id,user_id" }
        );
      if (error) throw error;
      setMyRating(val);
      toast.success("Thanks for rating!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rating");
    } finally {
      setSubmitting(false);
    }
  };

  if (!tour) return null;
  const stops = [...tour.stops].sort((a, b) => a.order - b.order);
  const polyline = tour.route_polyline ? decodePolyline(tour.route_polyline) : null;
  const markers: MapMarker[] = [
    { id: "s", pos: [tour.start_lat, tour.start_lng], label: tour.start_label, color: "#16a34a", initials: "A" },
    ...stops.map((s, i) => ({
      id: `m-${i}`,
      pos: [s.lat, s.lng] as [number, number],
      label: s.name,
      color: "#0ea5e9",
      initials: `${i + 1}`,
    })),
    { id: "d", pos: [tour.dest_lat, tour.dest_lng], label: tour.dest_label, color: "#dc2626", initials: "B" },
  ];

  return (
    <Dialog open={!!tour} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {tour.title}
            {tour.exactMatch && (
              <Badge className="gap-1"><Sparkles className="h-3 w-3" /> Exact match</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            by {tour.creator_name} · {tour.rating_count > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {tour.avgRating.toFixed(1)} ({tour.rating_count})
              </span>
            ) : "no ratings yet"}
          </DialogDescription>
        </DialogHeader>

        <SafetyMap
          markers={markers}
          routePolyline={polyline ?? markers.map((m) => m.pos)}
          fitBounds={pointsBounds(polyline ?? markers.map((m) => m.pos))}
          fitBoundsEnabled
          height="280px"
        />

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span><RouteIcon className="mr-1 inline h-3 w-3" />{formatDistance(tour.route_distance_m)}</span>
          <span><Clock className="mr-1 inline h-3 w-3" />{formatDuration(tour.route_duration_s)}</span>
          <span><Users className="mr-1 inline h-3 w-3" />{stops.length} stops</span>
        </div>

        {tour.description && <p className="text-sm">{tour.description}</p>}

        {tour.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tour.tags.map((t) => (
              <Badge key={t} variant="secondary" className="capitalize">{t}</Badge>
            ))}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold">Itinerary</h4>
          <ol className="space-y-1.5">
            <li className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">A</span>
              <span className="truncate">{tour.start_label}</span>
            </li>
            {stops.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">{i + 1}</span>
                <span className="truncate">{s.name}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">B</span>
              <span className="truncate">{tour.dest_label}</span>
            </li>
          </ol>
        </div>

        {currentUserId && currentUserId !== tour.creator_id && (
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Your rating</div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => submitRating(n)}
                  disabled={submitting}
                  aria-label={`Rate ${n} stars`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      n <= myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onUse(tour)}>
            <Sparkles className="mr-1 h-4 w-4" /> Use this plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
