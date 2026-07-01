import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Lock,
  Navigation,
  RouteIcon,
  Clock,
} from "lucide-react";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import type { SuggestedPOI } from "@/lib/nominatim";
import { haversine, pointsBounds } from "@/lib/geo";
import { decodePolyline, downsamplePolyline, encodePolyline } from "@/lib/polyline";
import { TRANSPORT_OPTIONS, TRANSPORT_STYLE, parseGroupJourneyStop, parseRouteSegment, richStopToGroupStop, type GroupJourneyStop, type RichStop, type RouteSegment } from "@/lib/tour-stop";
import { buildRenderableSegments, computeSegmentGeometry, encodeSegmentGeometry } from "@/lib/segments";
import { RouteSegmentDialog } from "@/components/RouteSegmentDialog";

import { ShareTourDialog, type ShareTourPayload } from "@/components/ShareTourDialog";
import { EditStopDialog } from "@/components/EditStopDialog";
import { GroupJoinRequestsPanel } from "@/components/GroupJoinRequestsPanel";
import { Share2, Pencil, Link2, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/tourist/groups/$groupId")({
  head: () => ({
    meta: [
      { title: "Group Tour Planner — SafeGo" },
      { name: "description", content: "Plan stops, preview the route, and start a live group tour with real-time tracking." },
      { property: "og:title", content: "Group Tour Planner — SafeGo" },
      { property: "og:description", content: "Plan stops, preview the route, and start a live group tour with real-time tracking." },
      { property: "og:url", content: "/tourist/groups" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/tourist/groups" }],
  }),
  component: GroupDetail,
  validateSearch: (search: Record<string, unknown>) => ({
    applyTour: typeof search.applyTour === "string" ? search.applyTour : undefined,
  }),
});

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  group_code: string;
  creator_id: string;
  waypoints: unknown;
  description: string | null;
  cover_image: string | null;
  images: string[];
  route_polyline: string | null;
  route_distance_m: number;
  route_duration_s: number;
  route_segments: unknown;
  tips: string | null;
  tags: string[];
  source_shared_tour_id: string | null;
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

type Stop = GroupJourneyStop;

const COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16"];

const makeStop = (pos: [number, number], label: string, order: number): Stop => ({
  id: `stop-${order}-${pos[0].toFixed(5)}-${pos[1].toFixed(5)}`,
  order,
  name: label,
  label,
  lat: pos[0],
  lng: pos[1],
  pos,
  images: [],
  tags: [],
  transportAvailability: [],
});

function GroupDetail() {
  const { groupId } = Route.useParams();
  const { user, profile } = useAuth();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [locations, setLocations] = useState<MemberLoc[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [segmentDialogFor, setSegmentDialogFor] = useState<{ fromIdx: number } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLockedToStored, setRouteLockedToStored] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedPOI[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [clickToAdd, setClickToAdd] = useState(false);
  const [isTourStarted, setIsTourStarted] = useState(false);
  const { location } = useGeolocation(isTourStarted);
  const [panToStop, setPanToStop] = useState<[number, number] | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editStopIndex, setEditStopIndex] = useState<number | null>(null);
  const lastAlertedRef = useRef<Map<string, "warning" | "critical">>(new Map());
  const { applyTour } = Route.useSearch();
  const navigate = Route.useNavigate();
  const appliedRef = useRef<string | null>(null);

  const waypoints = useMemo(() => stops.map((s) => s.pos), [stops]);

  // Load group + members. Subscribe to membership and group changes so
  // approvals and live-mode toggles refresh the UI immediately.
  useEffect(() => {
    const loadGroup = async () => {
      const { data: g } = await supabase
        .from("tour_groups")
        .select("*")
        .eq("id", groupId)
        .maybeSingle();
      if (!g) {
        toast.error("Group not found");
        return;
      }
      setGroup(g as GroupRow);
      const wp = Array.isArray(g.waypoints) ? (g.waypoints as unknown[]) : [];
      const parsed: Stop[] = wp.map((w, i) => parseGroupJourneyStop(w, i));
      setStops(parsed);
      if (g.route_polyline) {
        const coordinates = decodePolyline(g.route_polyline);
        setRoute({ coordinates, distance: g.route_distance_m ?? 0, duration: g.route_duration_s ?? 0 });
        setRouteLockedToStored(coordinates.length > 1);
      } else {
        setRoute(null);
        setRouteLockedToStored(false);
      }
      if ((g as { is_live?: boolean }).is_live) {
        setIsTourStarted(true);
      }
    };

    const loadMembers = async () => {
      const { data: ms } = await supabase
        .from("tour_group_members")
        .select("user_id")
        .eq("group_id", groupId);
      const userIds = ms?.map((m) => m.user_id) ?? [];
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      setMembers(ps ?? []);
    };

    loadGroup();
    loadMembers();

    const ch = supabase
      .channel(`group-meta-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tour_group_members", filter: `group_id=eq.${groupId}` },
        () => loadMembers(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tour_groups", filter: `id=eq.${groupId}` },
        () => loadGroup(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId]);

  // Apply a shared community tour when navigated with ?applyTour=<id>.
  useEffect(() => {
    if (!applyTour || appliedRef.current === applyTour) return;
    if (isTourStarted) return;
    appliedRef.current = applyTour;
    (async () => {
      const { data, error } = await supabase
        .from("shared_tours")
        .select("*")
        .eq("id", applyTour)
        .maybeSingle();
      if (error || !data) {
        toast.error("Could not load that plan");
        navigate({ search: { applyTour: undefined }, replace: true });
        return;
      }
      const isEmpty = stops.length === 0;
      const ok = isEmpty || window.confirm(`Replace current route with "${data.title}"?`);
      if (!ok) {
        navigate({ search: { applyTour: undefined }, replace: true });
        return;
      }
      const sortedStops = [...(data.stops as unknown as RichStop[])].sort((a, b) => a.order - b.order);
      const next: Stop[] = [
        makeStop([data.start_lat, data.start_lng], data.start_label, 0),
        ...sortedStops.map((s, i) => richStopToGroupStop(s, i + 1)),
        makeStop([data.dest_lat, data.dest_lng], data.dest_label, sortedStops.length + 1),
      ];
      const routeCoordinates = data.route_polyline ? decodePolyline(data.route_polyline) : [];
      setStops(next);
      setRoute(
        routeCoordinates.length > 1
          ? { coordinates: routeCoordinates, distance: data.route_distance_m ?? 0, duration: data.route_duration_s ?? 0 }
          : null,
      );
      setRouteLockedToStored(routeCoordinates.length > 1);
      // Persist immediately so the rich plan survives a refresh.
      void supabase
        .from("tour_groups")
        .update({
          name: data.title ?? undefined,
          description: data.description,
          cover_image: Array.isArray(data.images) && data.images.length > 0 ? data.images[0] : null,
          images: data.images ?? [],
          route_polyline: data.route_polyline,
          route_distance_m: data.route_distance_m ?? 0,
          route_duration_s: data.route_duration_s ?? 0,
          tips: data.tips,
          tags: data.tags ?? [],
          source_shared_tour_id: data.id,
          waypoints: next as unknown as never,
        })
        .eq("id", groupId);
      toast.success(`Loaded "${data.title}" with ${sortedStops.length} stop${sortedStops.length === 1 ? "" : "s"}`);
      navigate({ search: { applyTour: undefined }, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTour, isTourStarted, navigate, groupId]);

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
      setRouteLockedToStored(false);
      return;
    }
    if (routeLockedToStored) return;
    setRoute(null);
    const ctrl = new AbortController();
    fetchRoute(waypoints, "driving", ctrl.signal).then((r) => {
      if (r) setRoute(r);
      else setRoute(null);
    });
    return () => ctrl.abort();
  }, [routeLockedToStored, waypoints]);

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
        // Vibration alert (mobile devices)
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(level === "critical" ? [300, 100, 300, 100, 300] : [200, 100, 200]);
          } catch { /* noop */ }
        }
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
    const link = `${window.location.origin}/tourist/groups/join/${group.id}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied!");
  };
  const copyCode = () => {
    if (!group) return;
    navigator.clipboard.writeText(group.group_code);
    toast.success(`Code ${group.group_code} copied!`);
  };

  // ---- Stop management ----
  const addStop = (pos: [number, number], label: string) => {
    if (isTourStarted) return toast.error("End the live tour before editing the route");
    setRouteLockedToStored(false);
    setStops((prev) => [...prev, makeStop(pos, label, prev.length)]);
    setPanToStop(pos);
  };
  const removeStop = (idx: number) => {
    if (isTourStarted) return toast.error("Route editing is locked in Live Mode");
    setRouteLockedToStored(false);
    setStops((prev) => prev.filter((_, i) => i !== idx));
  };
  const moveStop = (idx: number, dir: -1 | 1) =>
    setStops((prev) => {
      if (isTourStarted) return prev;
      setRouteLockedToStored(false);
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const onMapClick = useCallback((latlng: [number, number]) => {
    if (!clickToAdd || isTourStarted) return;
    addStop(latlng, `Stop @ ${latlng[0].toFixed(3)}, ${latlng[1].toFixed(3)}`);
  }, [clickToAdd, isTourStarted]);

  const addSuggestionToRoute = (place: SuggestedPOI) => {
    if (isTourStarted) return toast.error("End the live tour before editing the route");
    const stop = makeStop([place.lat, place.lon], place.name, stops.length);
    setRouteLockedToStored(false);
    setStops((prev) => (prev.length >= 2 ? [...prev.slice(0, -1), stop, prev[prev.length - 1]] : [...prev, stop]));
    setPanToStop(stop.pos);
    toast.success(`${place.name} added to route`);
  };

  const autoOrderStops = () => {
    if (isTourStarted) return toast.error("Route editing is locked in Live Mode");
    if (stops.length < 4) return toast.info("Add at least two stops between start and destination");
    setRouteLockedToStored(false);
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
        .update({
          waypoints: stops as unknown as never,
          route_polyline: route?.coordinates ? encodePolyline(downsamplePolyline(route.coordinates, 200)) : null,
          route_distance_m: route?.distance ?? 0,
          route_duration_s: route?.duration ?? 0,
        })
      .eq("id", group.id);
    if (error) toast.error(error.message);
    else toast.success("Route saved");
  };

  const saveStopDetails = async (index: number, patch: Partial<Stop>) => {
    if (!group) return;
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setStops(next);
    const { error } = await supabase
      .from("tour_groups")
      .update({ waypoints: next as unknown as never })
      .eq("id", group.id);
    if (error) toast.error(error.message);
    else toast.success("Stop updated");
  };

  const clearRoute = () => {
    if (isTourStarted) return toast.error("End the live tour before clearing the route");
    setStops([]);
    setRoute(null);
    setRouteLockedToStored(false);
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
  const memberMarkers: MapMarker[] = useMemo(() => locations.map((loc, idx) => {
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
  }), [locations, members, user?.id]);

  const stopMarkers: MapMarker[] = useMemo(() => stops.map((s, i) => ({
    id: `wp-${i}`,
    pos: s.pos,
    label: `${i === 0 ? "Start" : i === stops.length - 1 ? "Destination" : `Stop ${i}`}: ${s.label}`,
    color: i === 0 ? "#16a34a" : i === stops.length - 1 ? "#dc2626" : "#0ea5e9",
    initials: i === 0 ? "A" : i === stops.length - 1 ? "B" : `${i}`,
  })), [stops]);

  const suggestionMarkers: MapMarker[] = useMemo(() => suggestions.map((s, i) => ({
    id: `sug-${i}`,
    pos: [s.lat, s.lon],
    label: `${s.name} (${s.category})`,
    color: "#a855f7",
    initials: "★",
  })), [suggestions]);

  const mapMarkers = useMemo(
    () => [...(isTourStarted ? memberMarkers : []), ...stopMarkers, ...suggestionMarkers],
    [isTourStarted, memberMarkers, stopMarkers, suggestionMarkers]
  );

  // In planning mode, only fit to the planned route (static map).
  // In live mode, fit to route + member positions so everyone stays visible.
  const bounds = useMemo(() => {
    const allPoints: [number, number][] = isTourStarted
      ? [...locations.map((l) => [l.lat, l.lng] as [number, number]), ...(route?.coordinates ?? waypoints)]
      : [...(route?.coordinates ?? waypoints)];
    return pointsBounds(allPoints.length ? allPoints : waypoints);
  }, [isTourStarted, locations, route?.coordinates, waypoints]);

  const startTour = async () => {
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
    if (group && user && group.creator_id === user.id) {
      await supabase
        .from("tour_groups")
        .update({ is_live: true, live_started_at: new Date().toISOString() })
        .eq("id", group.id);
    }
    toast.success("Live Mode started — route planning is locked");
  };

  const [deleting, setDeleting] = useState(false);
  const deleteGroup = async () => {
    if (!group || !user || group.creator_id !== user.id) return;
    setDeleting(true);
    try {
      // Best-effort cascade clean-up. Order matters only if FKs are RESTRICT.
      await Promise.all([
        supabase.from("member_locations").delete().eq("group_id", group.id),
        supabase.from("separation_alerts").delete().eq("group_id", group.id),
        supabase.from("group_join_requests").delete().eq("group_id", group.id),
        supabase.from("tour_group_members").delete().eq("group_id", group.id),
      ]);
      const { error } = await supabase.from("tour_groups").delete().eq("id", group.id);
      if (error) throw error;
      toast.success("Group tour deleted");
      navigate({ to: "/tourist/groups" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete group");
    } finally {
      setDeleting(false);
    }
  };



  const endTour = async () => {
    setLocations([]);
    setIsTourStarted(false);
    if (group && user && group.creator_id === user.id) {
      await supabase
        .from("tour_groups")
        .update({ is_live: false })
        .eq("id", group.id);
    }
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
            {members.length} member{members.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 font-mono text-xs hover:bg-muted"
              title="Copy code"
            >
              <Copy className="h-3 w-3" /> {group?.group_code ?? "…"}
            </button>
            <Button variant="outline" size="sm" onClick={copyInvite}>
              <Link2 className="mr-1 h-4 w-4" /> Copy invite link
            </Button>
            {group && user && group.creator_id === user.id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isTourStarted}
                    title={isTourStarted ? "End live mode to delete" : "Delete group tour"}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this group tour?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes “{group.name}” along with all members, invitations,
                      live locations and route data. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); void deleteGroup(); }}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                      Delete tour
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) => (
              <Badge
                key={m.id}
                variant="secondary"
                style={{ borderLeft: `4px solid ${COLORS[i % COLORS.length]}` }}
              >
                {m.full_name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {group && user && group.creator_id === user.id && (
        <GroupJoinRequestsPanel groupId={group.id} isAdmin />
      )}

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
            markers={mapMarkers}
            routePolyline={route?.coordinates ?? null}
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
          {waypoints.length >= 2 && !route && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              Road route unavailable. No straight-line route is shown.
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
          <div className={isTourStarted ? "pointer-events-none opacity-60" : undefined}>
            <PlaceSearch
              placeholder={stops.length === 0 ? "Start location" : stops.length === 1 ? "Destination" : "Add a stop"}
              onSelect={(p) => addStop([p.lat, p.lon], p.label.split(",").slice(0, 2).join(", "))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShareOpen(true)}
              disabled={isTourStarted || stops.length < 2}
            >
              <Share2 className="mr-1 h-4 w-4" /> Share plan
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
                    disabled={isTourStarted || i === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => moveStop(i, 1)}
                    disabled={isTourStarted || i === stops.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeStop(i)}
                    disabled={isTourStarted}
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

      {stops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-5 w-5 text-primary" /> Journey timeline
            </CardTitle>
            <CardDescription>
              {stops.some(stopHasRichDetails) || group?.description || group?.tips
                ? "Detailed stop-by-stop itinerary for this journey."
                : user?.id === group?.creator_id
                  ? "Tap Edit on any stop to add photos, descriptions, transport, tips and more."
                  : "Stop-by-stop overview of this journey."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group?.images && group.images.length > 0 && (
              <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1">
                {group.images.map((src, idx) => (
                  <img key={idx} src={src} alt={`${group.name} photo ${idx + 1}`} loading="lazy" className="h-28 w-44 shrink-0 rounded-md object-cover" />
                ))}
              </div>
            )}
            {group?.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
            {group?.tips && (
              <div className="rounded-md border bg-accent/30 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Travel tips</div>
                <p className="whitespace-pre-wrap">{group.tips}</p>
              </div>
            )}
            <ol className="relative space-y-3 border-l-2 border-dashed border-muted pl-5">
              {stops.map((s, i) => {
                const isStart = i === 0;
                const isEnd = i === stops.length - 1;
                const badge = isStart ? "A" : isEnd ? "B" : `${i}`;
                const badgeColor = isStart
                  ? "bg-emerald-600"
                  : isEnd
                    ? "bg-red-600"
                    : "bg-sky-500";
                return (
                  <li key={i} className="relative">
                    <span
                      className={`absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${badgeColor}`}
                    >
                      {badge}
                    </span>
                    <div className="rounded-md border bg-card p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">
                          {isStart ? "Start · " : isEnd ? "Destination · " : ""}
                          {s.label}
                        </div>
                        {user?.id === group?.creator_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-[11px]"
                            onClick={() => setEditStopIndex(i)}
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        )}
                      </div>
                      {(s.detailedDescription || s.shortDescription || s.description) && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                          {s.detailedDescription || s.shortDescription || s.description}
                        </p>
                      )}
                      {Array.isArray(s.images) && s.images.length > 0 && (
                        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                          {s.images.map((src, idx) => (
                            <img
                              key={idx}
                              src={src}
                              alt={`${s.label} ${idx + 1}`}
                              loading="lazy"
                              className="h-20 w-28 shrink-0 rounded object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {(s.stayDuration || s.bestTimeToVisit || s.estimatedCost) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.stayDuration && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Clock className="h-3 w-3" />
                              {s.stayDuration}
                            </Badge>
                          )}
                          {s.bestTimeToVisit && (
                            <Badge variant="secondary" className="text-[10px]">
                              🗓 {s.bestTimeToVisit}
                            </Badge>
                          )}
                          {s.estimatedCost && (
                            <Badge variant="secondary" className="text-[10px]">
                              💰 {s.estimatedCost}
                            </Badge>
                          )}
                        </div>
                      )}
                      {s.travelTips && (
                        <div className="mt-2 rounded border-l-2 border-primary/60 bg-primary/5 px-2 py-1 text-[11px]">
                          💡 {s.travelTips}
                        </div>
                      )}
                      {s.warnings && (
                        <div className="mt-1.5 rounded border-l-2 border-amber-500 bg-amber-500/10 px-2 py-1 text-[11px]">
                          ⚠️ {s.warnings}
                        </div>
                      )}
                      {s.thingsToCarry && (
                        <div className="mt-1.5 rounded border-l-2 border-emerald-500 bg-emerald-500/10 px-2 py-1 text-[11px]">
                          🎒 {s.thingsToCarry}
                        </div>
                      )}
                      {s.thingsToDo && (
                        <div className="mt-1.5 rounded border-l-2 border-sky-500 bg-sky-500/10 px-2 py-1 text-[11px]">
                          ✨ {s.thingsToDo}
                        </div>
                      )}
                      {Array.isArray(s.tags) && s.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.tags.map((tag) => <Badge key={tag} variant="outline" className="text-[10px] capitalize">{tag}</Badge>)}
                        </div>
                      )}
                      {Array.isArray(s.transportAvailability) && s.transportAvailability.length > 0 && (
                        <div className="mt-2 space-y-1.5 rounded-md border bg-muted/40 p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Transport availability
                          </div>
                          {s.transportAvailability.map((t) => {
                            const meta = TRANSPORT_OPTIONS.find((o) => o.type === t.type);
                            return (
                              <div key={t.type} className="text-[11px]">
                                <div className="font-medium">
                                  {meta?.icon} {meta?.label}
                                </div>
                                {t.details && (
                                  <p className="whitespace-pre-wrap text-muted-foreground">
                                    {t.details}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}



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

      <ShareTourDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={
          stops.length >= 2
            ? ({
                start: stops[0],
                destination: stops[stops.length - 1],
                intermediateStops: stops.slice(1, -1),
                routeCoordinates: route?.coordinates ?? null,
                routeDistanceM: route?.distance ?? 0,
                routeDurationS: route?.duration ?? 0,
              } satisfies ShareTourPayload)
            : null
        }
      />

      <EditStopDialog
        open={editStopIndex !== null}
        onOpenChange={(v) => { if (!v) setEditStopIndex(null); }}
        stop={editStopIndex !== null ? stops[editStopIndex] ?? null : null}
        stopIndex={editStopIndex ?? 0}
        onSave={async (patch) => {
          if (editStopIndex !== null) await saveStopDetails(editStopIndex, patch);
        }}
      />
    </div>
  );
}

function stopHasRichDetails(s: Stop): boolean {
  return Boolean(
    s.detailedDescription ||
      (s.images && s.images.length) ||
      s.stayDuration ||
      s.bestTimeToVisit ||
      s.travelTips ||
      s.warnings ||
      s.estimatedCost ||
      s.thingsToCarry ||
      (s.transportAvailability && s.transportAvailability.length)
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
