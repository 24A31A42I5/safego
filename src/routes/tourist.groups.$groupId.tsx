import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { supabase } from "@/integrations/supabase/client";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Users,
  Sparkles,
  AlertTriangle,
  MapPin,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Crosshair,
  Lock,
  Navigation,
  RouteIcon,
} from "lucide-react";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import type { SuggestedPOI } from "@/lib/nominatim";
import { haversine, pointsBounds } from "@/lib/geo";

export const Route = createFileRoute("/tourist/groups/$groupId")({
  component: GroupDetail,
});

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  creator_id: string;
  waypoints: unknown;
}

interface MemberLoc {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

interface MemberProfile {
  id: string;
  full_name: string;
}

interface Stop {
  pos: [number, number];
  label: string;
}

const COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16"];

function GroupDetail() {
  const { groupId } = Route.useParams();
  const { user, profile } = useAuth();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [locations, setLocations] = useState<MemberLoc[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedPOI[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [clickToAdd, setClickToAdd] = useState(false);
  const [isTourStarted, setIsTourStarted] = useState(false);
  const { location } = useGeolocation(isTourStarted);
  const [panToStop, setPanToStop] = useState<[number, number] | null>(null);
  const lastAlertedRef = useRef<Map<string, "warning" | "critical">>(new Map());

  const waypoints = useMemo(() => stops.map((s) => s.pos), [stops]);

  // Load group + members once. Planning mode must not subscribe to live location changes.
  useEffect(() => {
    const load = async () => {
      const { data: g } = await supabase
        .from("tour_groups")
        .select("*")
        .eq("id", groupId)
        .maybeSingle();
      if (!g) {
        toast.error("Group not found");
        return;
      }
      setGroup(g);
      const wp = Array.isArray(g.waypoints) ? (g.waypoints as unknown[]) : [];
      // Support both legacy [lat,lng] and new {pos,label}
      const parsed: Stop[] = wp.map((w, i) => {
        if (Array.isArray(w) && w.length === 2) {
          return { pos: [w[0] as number, w[1] as number], label: `Stop ${i + 1}` };
        }
        const o = w as { pos?: [number, number]; label?: string };
        return { pos: o.pos ?? [0, 0], label: o.label ?? `Stop ${i + 1}` };
      });
      setStops(parsed);

      const { data: ms } = await supabase
        .from("tour_group_members")
        .select("user_id")
        .eq("group_id", groupId);
      const userIds = ms?.map((m) => m.user_id) ?? [];
      if (userIds.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        setMembers(ps ?? []);
      }
    };
    load();
  }, [groupId]);

  // Realtime subscription only when tour is live — keeps planning mode static.
  useEffect(() => {
    if (!isTourStarted) return;
    const loadLiveLocations = async () => {
      const { data: locs } = await supabase
        .from("member_locations")
        .select("user_id, lat, lng, updated_at")
        .eq("group_id", groupId);
      setLocations(locs ?? []);
    };
    loadLiveLocations();

    const ch = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_locations", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as MemberLoc | undefined;
          if (!row) return;
          setLocations((prev) => {
            const without = prev.filter((p) => p.user_id !== row.user_id);
            return [...without, row];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tour_group_members", filter: `group_id=eq.${groupId}` },
        () => loadLiveLocations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, isTourStarted]);

  // Push my location every 10s — ONLY in Live Mode (after Start Tour)
  useEffect(() => {
    if (!isTourStarted) return;
    if (!user || !location) return;
    const push = async () => {
      await supabase.from("member_locations").upsert(
        {
          group_id: groupId,
          user_id: user.id,
          lat: location[0],
          lng: location[1],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "group_id,user_id" }
      );
    };
    push();
    const t = setInterval(push, 10000);
    return () => clearInterval(t);
  }, [user, location, groupId, isTourStarted]);

  // Re-fetch OSRM route whenever stops change
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

  // Distance-based separation alerts
  useEffect(() => {
    if (!user || !profile || locations.length < 2) return;
    const me = locations.find((l) => l.user_id === user.id);
    if (!me) return;
    locations.forEach((other) => {
      if (other.user_id === user.id) return;
      const dKm = haversine([me.lat, me.lng], [other.lat, other.lng]) / 1000;
      const otherName = members.find((m) => m.id === other.user_id)?.full_name ?? "Member";
      const prev = lastAlertedRef.current.get(other.user_id);
      let level: "warning" | "critical" | null = null;
      if (dKm > 10) level = "critical";
      else if (dKm > 5) level = "warning";
      if (level && prev !== level) {
        lastAlertedRef.current.set(other.user_id, level);
        const msg =
          level === "critical"
            ? `🚨 ${otherName} is ${dKm.toFixed(1)} km away — critical separation!`
            : `⚠ ${otherName} is ${dKm.toFixed(1)} km away from the group`;
        toast(msg, { duration: 6000 });
        supabase.from("separation_alerts").insert({
          group_id: groupId,
          user_id: other.user_id,
          user_name: otherName,
          severity: level,
          distance_km: dKm,
          lat: other.lat,
          lng: other.lng,
        });
      } else if (dKm <= 5 && prev) {
        lastAlertedRef.current.delete(other.user_id);
      }
    });
  }, [locations, members, user, profile, groupId]);

  const copyInvite = () => {
    if (!group) return;
    const link = `${window.location.origin}/tourist/groups?join=${group.invite_code}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied!");
  };

  // ---- Stop management ----
  const addStop = (pos: [number, number], label: string) => {
    if (isTourStarted) return toast.error("End the live tour before editing the route");
    setStops((prev) => [...prev, { pos, label }]);
    setPanToStop(pos);
  };
  const removeStop = (idx: number) => {
    if (isTourStarted) return toast.error("Route editing is locked in Live Mode");
    setStops((prev) => prev.filter((_, i) => i !== idx));
  };
  const moveStop = (idx: number, dir: -1 | 1) =>
    setStops((prev) => {
      if (isTourStarted) return prev;
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const addMyLocation = () => {
    if (!location) return toast.error("Location not available");
    addStop(location, "My location");
  };

  const onMapClick = (latlng: [number, number]) => {
    if (!clickToAdd || isTourStarted) return;
    addStop(latlng, `Stop @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}`);
  };

  const addSuggestionToRoute = (place: SuggestedPOI) => {
    if (isTourStarted) return toast.error("End the live tour before editing the route");
    const stop = { pos: [place.lat, place.lon] as [number, number], label: place.name };
    setStops((prev) => (prev.length >= 2 ? [...prev.slice(0, -1), stop, prev[prev.length - 1]] : [...prev, stop]));
    setPanToStop(stop.pos);
    toast.success(`${place.name} added to route`);
  };

  const autoOrderStops = () => {
    if (isTourStarted) return toast.error("Route editing is locked in Live Mode");
    if (stops.length < 4) return toast.info("Add at least two stops between start and destination");
    const start = stops[0];
    const destination = stops[stops.length - 1];
    const remaining = stops.slice(1, -1);
    const ordered: Stop[] = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      remaining.forEach((candidate, idx) => {
        const score = haversine(current.pos, candidate.pos) + haversine(candidate.pos, destination.pos) * 0.35;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      const [next] = remaining.splice(bestIdx, 1);
      ordered.push(next);
      current = next;
    }
    setStops([start, ...ordered, destination]);
    toast.success("Stops auto-ordered for a smoother visit flow");
  };

  const saveRoute = async () => {
    if (!group) return;
    const { error } = await supabase
      .from("tour_groups")
      .update({ waypoints: stops as unknown as never })
      .eq("id", group.id);
    if (error) toast.error(error.message);
    else toast.success("Route saved");
  };

  const clearRoute = () => {
    if (isTourStarted) return toast.error("End the live tour before clearing the route");
    setStops([]);
    setRoute(null);
    setSuggestions([]);
  };

  const askAI = async () => {
    if (waypoints.length < 2) {
      toast.error("Add a start and destination first");
      return;
    }
    setAiBusy(true);
    try {
      const samples =
        route?.coordinates && route.coordinates.length > 0
          ? sampleAlong(route.coordinates, 6)
          : waypoints;
      const { data, error } = await supabase.functions.invoke("tour-suggest", {
        body: { waypoints: samples },
      });
      if (error) throw error;
      const destination = waypoints[waypoints.length - 1];
      const rejected = ["restaurant", "cafe", "coffee", "hotel", "resort", "bar", "shop", "mall", "market", "bakery"];
      const rawPlaces = (data?.places ?? []) as Array<{
        name: string;
        lat: number;
        lon: number;
        category: string;
        reason?: string;
        distance_km?: number;
      }>;
      const places: SuggestedPOI[] = rawPlaces
        .map((p: {
          name: string;
          lat: number;
          lon: number;
          category: string;
          reason?: string;
          distance_km?: number;
        }) => {
          const computedDistance = haversine(destination, [p.lat, p.lon]) / 1000;
          return {
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            category: (["landmark", "nature", "heritage"].includes(p.category)
              ? p.category
              : "tourist") as SuggestedPOI["category"],
            reason: p.reason,
            near: destination,
            distanceKm: Number.isFinite(p.distance_km) ? p.distance_km : computedDistance,
          };
        })
        .filter((p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon) &&
          !rejected.some((word) => `${p.name} ${p.reason ?? ""}`.toLowerCase().includes(word)) &&
          (p.distanceKm ?? 999) <= 35
        )
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        .slice(0, 10);
      setSuggestions(places);
      if (places.length === 0) toast.info("No tourist places found near your route");
      else toast.success(`Gemini found ${places.length} tourist places near your route`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setAiBusy(false);
    }
  };

  // Markers
  const memberMarkers: MapMarker[] = locations.map((loc, idx) => {
    const m = members.find((mm) => mm.id === loc.user_id);
    const name = m?.full_name ?? "Member";
    const initials = name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return {
      id: loc.user_id,
      pos: [loc.lat, loc.lng],
      label: `${name}${loc.user_id === user?.id ? " (you)" : ""}`,
      color: COLORS[idx % COLORS.length],
      initials,
    };
  });

  const stopMarkers: MapMarker[] = stops.map((s, i) => ({
    id: `wp-${i}`,
    pos: s.pos,
    label: `${i === 0 ? "Start" : i === stops.length - 1 ? "Destination" : `Stop ${i}`}: ${s.label}`,
    color: i === 0 ? "#16a34a" : i === stops.length - 1 ? "#dc2626" : "#0ea5e9",
    initials: i === 0 ? "A" : i === stops.length - 1 ? "B" : `${i}`,
  }));

  const suggestionMarkers: MapMarker[] = suggestions.map((s, i) => ({
    id: `sug-${i}`,
    pos: [s.lat, s.lon],
    label: `${s.name} (${s.category})`,
    color: "#a855f7",
    initials: "★",
  }));

  // In planning mode, only fit to the planned route (static map).
  // In live mode, fit to route + member positions so everyone stays visible.
  const bounds = useMemo(() => {
    const allPoints: [number, number][] = isTourStarted
      ? [...locations.map((l) => [l.lat, l.lng] as [number, number]), ...waypoints]
      : [...waypoints];
    return pointsBounds(allPoints);
  }, [isTourStarted, locations, waypoints]);

  const startTour = () => {
    if (waypoints.length < 2) {
      toast.error("Plan a route (start + destination) before starting the tour");
      return;
    }
    const confirmed = window.confirm(
      "Start Tour will enter Live Mode, lock route planning controls, and begin live location tracking. Continue?"
    );
    if (!confirmed) return;
    setClickToAdd(false);
    setIsTourStarted(true);
    toast.success("Live Mode started — route planning is locked");
  };

  const endTour = () => {
    setLocations([]);
    setIsTourStarted(false);
    toast.success("Tour ended — planning controls unlocked");
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/tourist/groups">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to groups
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {group?.name ?? "Loading…"}
          </CardTitle>
          <CardDescription>
            Code: <span className="font-mono">{group?.invite_code}</span> · {members.length}{" "}
            member{members.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyInvite}>
            <Copy className="mr-1 h-4 w-4" /> Copy invite link
          </Button>
          {members.map((m, i) => (
            <Badge
              key={m.id}
              variant="secondary"
              style={{ borderLeft: `4px solid ${COLORS[i % COLORS.length]}` }}
            >
              {m.full_name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Group Map
                <Badge variant={isTourStarted ? "default" : "secondary"} className="gap-1">
                  {isTourStarted ? <Navigation className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {isTourStarted ? "LIVE MODE" : "PLANNING MODE"}
                </Badge>
              </CardTitle>
              <CardDescription>
                {clickToAdd
                  ? "Click anywhere on the map to add a stop."
                  : isTourStarted
                    ? "Live tracking on — members and your position update in real time."
                    : "Map is static while you plan. Press Start Tour to begin live tracking."}
              </CardDescription>
            </div>
            <Button size="sm" variant={isTourStarted ? "outline" : "default"} onClick={isTourStarted ? endTour : startTour}>
              {isTourStarted ? "End Live Mode" : "Start Tour"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <SafetyMap
            userLocation={isTourStarted ? location : undefined}
            markers={[
              ...(isTourStarted ? memberMarkers : []),
              ...stopMarkers,
              ...suggestionMarkers,
            ]}
            routePolyline={route?.coordinates ?? (waypoints.length >= 2 ? waypoints : null)}
            fitBounds={bounds}
            fitBoundsEnabled={isTourStarted || Boolean(panToStop) || waypoints.length > 1}
            panTo={panToStop}
            onMapClick={onMapClick}
            cursor={clickToAdd && !isTourStarted ? "crosshair" : undefined}
            height="420px"
          />
          {route && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                Distance: <b className="text-foreground">{formatDistance(route.distance)}</b>
              </span>
              <span>
                Duration: <b className="text-foreground">{formatDuration(route.duration)}</b>
              </span>
              <span>
                Stops: <b className="text-foreground">{stops.length}</b>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan your route</CardTitle>
          <CardDescription>
            Search places, add stops, reorder them — route updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isTourStarted && (
            <div className="flex items-center gap-2 rounded-md border bg-primary/10 p-3 text-sm text-primary">
              <Lock className="h-4 w-4" /> Live Mode is active. End Live Mode to edit this route.
            </div>
          )}
          <PlaceSearch
            placeholder={stops.length === 0 ? "Start location" : stops.length === 1 ? "Destination" : "Add a stop"}
            onSelect={(p) => addStop([p.lat, p.lon], p.label.split(",").slice(0, 2).join(", "))}
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addMyLocation} disabled={isTourStarted || !location}>
              <Crosshair className="mr-1 h-4 w-4" /> Use my location
            </Button>
            <Button
              size="sm"
              variant={clickToAdd ? "default" : "outline"}
              onClick={() => setClickToAdd((v) => !v)}
              disabled={isTourStarted}
            >
              <Plus className="mr-1 h-4 w-4" /> {clickToAdd ? "Click map to add (on)" : "Click map to add"}
            </Button>
            <Button size="sm" variant="outline" onClick={autoOrderStops} disabled={isTourStarted || stops.length < 4}>
              <RouteIcon className="mr-1 h-4 w-4" /> Auto-order stops
            </Button>
            <Button size="sm" variant="outline" onClick={saveRoute} disabled={isTourStarted || stops.length === 0}>
              Save route
            </Button>
            <Button size="sm" variant="outline" onClick={clearRoute} disabled={isTourStarted || stops.length === 0}>
              Clear
            </Button>
            <Button size="sm" onClick={askAI} disabled={aiBusy || waypoints.length < 2}>
              <Sparkles className="mr-1 h-4 w-4" /> {aiBusy ? "Searching…" : "Suggestions"}
            </Button>
          </div>

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
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
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
              Search a start location above to begin planning.
            </p>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI suggestions near your route
            </CardTitle>
            <CardDescription>
              Tourist-only picks (temples, forts, museums, parks, viewpoints) — sorted by distance
              from your destination.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="capitalize">
                        {s.category}
                      </Badge>
                      {typeof s.distanceKm === "number" && (
                        <Badge variant="secondary">{s.distanceKm.toFixed(1)} km away</Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="default" onClick={() => addSuggestionToRoute(s)} disabled={isTourStarted}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                {s.reason && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.reason}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-caution" /> Separation alerts
          </CardTitle>
          <CardDescription>
            Members get notified if anyone drifts &gt;5 km (warning) or &gt;10 km (critical).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// Sample N evenly spaced points along a polyline
function sampleAlong(line: [number, number][], n: number): [number, number][] {
  if (line.length <= n) return line;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (line.length - 1)) / (n - 1));
    out.push(line[idx]);
  }
  return out;
}
