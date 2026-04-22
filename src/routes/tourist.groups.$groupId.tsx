import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProtectedShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { supabase } from "@/integrations/supabase/client";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Copy, Users, Sparkles, AlertTriangle, MapPin } from "lucide-react";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import { haversine, pointsBounds } from "@/lib/geo";

export const Route = createFileRoute("/tourist/groups/$groupId")({
  component: () => (
    <ProtectedShell requireRole="tourist">
      <GroupDetail />
    </ProtectedShell>
  ),
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

interface SuggestedPlace {
  name: string;
  reason: string;
  distance_km?: number;
  category?: string;
}

const COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16"];

function GroupDetail() {
  const { groupId } = Route.useParams();
  const { user, profile } = useAuth();
  const { location } = useGeolocation();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [locations, setLocations] = useState<MemberLoc[]>([]);
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedPlace[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const lastAlertedRef = useRef<Map<string, "warning" | "critical">>(new Map());

  // Load group + members + initial locations
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
      const wp = Array.isArray(g.waypoints) ? (g.waypoints as [number, number][]) : [];
      setWaypoints(wp);

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

      const { data: locs } = await supabase
        .from("member_locations")
        .select("user_id, lat, lng, updated_at")
        .eq("group_id", groupId);
      setLocations(locs ?? []);
    };
    load();

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
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId]);

  // Push my location to the group every 10s
  useEffect(() => {
    if (!user || !location) return;
    const push = async () => {
      await supabase
        .from("member_locations")
        .upsert(
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
  }, [user, location, groupId]);

  // Fetch route between waypoints when set
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
        // Persist alert (other members' realtime sub will also fire)
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

  const addWaypoint = () => {
    if (!location) {
      toast.error("Location required");
      return;
    }
    setWaypoints((p) => [...p, location]);
  };

  const saveRoute = async () => {
    if (!group) return;
    const { error } = await supabase
      .from("tour_groups")
      .update({ waypoints: waypoints as unknown as never })
      .eq("id", group.id);
    if (error) toast.error(error.message);
    else toast.success("Route saved");
  };

  const clearRoute = () => {
    setWaypoints([]);
    setRoute(null);
    setSuggestions([]);
  };

  const askAI = async () => {
    if (waypoints.length < 2) {
      toast.error("Add at least 2 waypoints first");
      return;
    }
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("tour-suggest", {
        body: { waypoints },
      });
      if (error) throw error;
      const places = (data?.places ?? []) as SuggestedPlace[];
      setSuggestions(places);
      if (places.length === 0) toast.info("No suggestions found");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiBusy(false);
    }
  };

  // Build markers for each member with profile color
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

  // Waypoint markers
  const waypointMarkers: MapMarker[] = waypoints.map((p, i) => ({
    id: `wp-${i}`,
    pos: p,
    label: `Stop ${i + 1}`,
    color: "#0ea5e9",
    initials: `${i + 1}`,
  }));

  const allPoints = [...locations.map((l) => [l.lat, l.lng] as [number, number]), ...waypoints];
  const bounds = pointsBounds(allPoints);

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
            <Badge key={m.id} variant="secondary" style={{ borderLeft: `4px solid ${COLORS[i % COLORS.length]}` }}>
              {m.full_name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Group Map</CardTitle>
          <CardDescription>Real-time positions of every member.</CardDescription>
        </CardHeader>
        <CardContent>
          <SafetyMap
            userLocation={location}
            markers={[...memberMarkers, ...waypointMarkers]}
            routePolyline={route?.coordinates ?? (waypoints.length >= 2 ? waypoints : null)}
            fitBounds={bounds}
            height="420px"
          />
          {route && (
            <p className="mt-2 text-xs text-muted-foreground">
              Route: <b>{formatDistance(route.distance)}</b> ·{" "}
              <b>{formatDuration(route.duration)}</b>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tour Route</CardTitle>
          <CardDescription>
            Add waypoints to plan a round trip. Then ask AI to suggest nearby places.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={addWaypoint} disabled={!location}>
              <MapPin className="mr-1 h-4 w-4" /> Add my location as stop
            </Button>
            <Button size="sm" variant="outline" onClick={saveRoute} disabled={waypoints.length === 0}>
              Save route
            </Button>
            <Button size="sm" variant="outline" onClick={clearRoute} disabled={waypoints.length === 0}>
              Clear
            </Button>
            <Button size="sm" onClick={askAI} disabled={aiBusy || waypoints.length < 2}>
              <Sparkles className="mr-1 h-4 w-4" /> {aiBusy ? "Thinking…" : "AI suggestions"}
            </Button>
          </div>
          {waypoints.length > 0 && (
            <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
              {waypoints.map((w, i) => (
                <li key={i}>
                  Stop {i + 1}: {w[0].toFixed(4)}, {w[1].toFixed(4)}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Suggested Places
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{s.name}</div>
                  {s.category && <Badge variant="outline">{s.category}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                {typeof s.distance_km === "number" && (
                  <p className="mt-1 text-xs text-muted-foreground">~{s.distance_km} km from route</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Separation alerts
          </CardTitle>
          <CardDescription>
            Members get notified if anyone drifts &gt;5 km (warning) or &gt;10 km (critical).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
