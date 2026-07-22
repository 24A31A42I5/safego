import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SafetyMap, type Zone } from "@/components/SafetyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { supabase } from "@/integrations/supabase/client";
import { pointInPolygon, polygonCentroid, haversine } from "@/lib/geo";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";
import { toast } from "sonner";
import { HoldToSOSButton } from "@/components/HoldToSOSButton";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import {
  Siren,
  UserSearch,
  Phone,
  Headphones,
  Stethoscope,
  Cloud,
  AlertTriangle,
  Navigation,
  MapPin,
  Users,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/tourist/")({
  head: () => ({
    meta: [
      { title: "Tourist Dashboard — SafeGo" },
      { name: "description", content: "Your SafeGo dashboard: live safety map, SOS, alerts, and recommended places nearby." },
      { property: "og:title", content: "Tourist Dashboard — SafeGo" },
      { property: "og:description", content: "Your SafeGo dashboard: live safety map, SOS, alerts, and recommended places nearby." },
      { property: "og:url", content: "/tourist" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/tourist" }],
  }),
  component: TouristDashboard,
});

function TouristDashboard() {
  const { profile, user } = useAuth();
  const { location, error: geoError } = useGeolocation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [insideDanger, setInsideDanger] = useState<Zone | null>(null);
  const [routeTo, setRouteTo] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);
  const [weather, setWeather] = useState<{ temp: number; desc: string; tip: string } | null>(null);
  const lastAlertedZone = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("zones").select("*");
      if (data) setZones(data);
    };
    load();
    const channel = supabase
      .channel("zones-tourist")
      .on("postgres_changes", { event: "*", schema: "public", table: "zones" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!location) return;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location[0]}&longitude=${location[1]}&current=temperature_2m,weather_code,wind_speed_10m`
    )
      .then((r) => r.json())
      .then((d) => {
        const t = d?.current?.temperature_2m;
        const code = d?.current?.weather_code;
        if (t == null) return;
        const desc = weatherDesc(code);
        let tip = "Stay hydrated and aware of surroundings.";
        if (code >= 95) tip = "Thunderstorm risk — seek shelter immediately.";
        else if (code >= 61) tip = "Rain expected — watch slippery paths and traffic.";
        else if (t > 35) tip = "Very hot — drink water often, avoid midday sun.";
        else if (t < 5) tip = "Cold weather — dress in layers.";
        setWeather({ temp: t, desc, tip });
      })
      .catch(() => {});
  }, [location]);

  useEffect(() => {
    if (!location || !profile || !user) return;
    const danger = zones.find((z) => {
      if (z.zone_type !== "danger") return false;
      const coords = z.coordinates as unknown as [number, number][];
      return Array.isArray(coords) && pointInPolygon(location, coords);
    });

    if (danger && lastAlertedZone.current !== danger.id) {
      lastAlertedZone.current = danger.id;
      setInsideDanger(danger);
      toast.warning("⚠ You entered a danger zone — calculating route to safety");

      const safeZones = zones.filter((z) => z.zone_type === "safe");
      let nearest: [number, number] | null = null;
      let bestDist = Infinity;
      safeZones.forEach((z) => {
        const c = polygonCentroid(z.coordinates as unknown as [number, number][]);
        const d = haversine(location, c);
        if (d < bestDist) {
          bestDist = d;
          nearest = c;
        }
      });
      setRouteTo(nearest);

      supabase
        .from("sos_alerts")
        .insert({
          tourist_id: user.id,
          tourist_name: profile.full_name,
          tourist_phone: profile.phone,
          alert_type: "zone_entry",
          status: "warning",
          lat: location[0],
          lng: location[1],
          message: `Entered danger zone: ${danger.name}`,
        })
        .then(({ error }) => {
          if (error) console.error(error);
        });
    } else if (!danger && insideDanger) {
      setInsideDanger(null);
      setRouteTo(null);
      setRoute(null);
      lastAlertedZone.current = null;
      toast.success("✅ You left the danger zone");
    }
  }, [location, zones, user, profile, insideDanger]);

  useEffect(() => {
    if (!location || !routeTo) {
      setRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetchRoute([location, routeTo], "walking", ctrl.signal)
      .then((r) => {
        if (r) setRoute(r);
        else {
          setRoute(null);
          toast.error("Could not calculate road route. No route will be drawn.", { id: "route-fallback" });
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [location, routeTo]);

  const handleSOS = async () => {
    if (!user || !profile) {
      toast.error("Sign in required for SOS");
      return;
    }
    if (!location) {
      toast.error("Location required for SOS — enable GPS and try again");
      return;
    }
    const { error } = await supabase.from("sos_alerts").insert({
      tourist_id: user.id,
      tourist_name: profile.full_name,
      tourist_phone: profile.phone,
      alert_type: "sos",
      status: "critical",
      lat: location[0],
      lng: location[1],
      message: "SOS triggered",
    });
    if (error) toast.error(error.message);
    else toast.success("🚨 SOS sent to authorities");
  };

  const distanceToSafety = location && routeTo ? Math.round(haversine(location, routeTo)) : null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-destructive" /> Emergency Center
          </CardTitle>
          <CardDescription>
            Hold the SOS button for 3 seconds to alert authorities. Accidental taps are ignored.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <HoldToSOSButton
            onTrigger={handleSOS}
            disabled={!location}
            label={location ? "Hold to send SOS" : "Waiting for GPS…"}
          />
          <LostReportDialog />
          <Button variant="outline" className="h-20 flex-col gap-1" asChild>
            <a href={`tel:${profile?.emergency_contact ?? ""}`}>
              <Phone className="h-5 w-5" />
              <span className="text-xs sm:text-sm">Notify Contacts</span>
            </a>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-1" asChild>
            <a href="tel:100">
              <Phone className="h-5 w-5" />
              <span className="text-xs sm:text-sm">Local Police</span>
            </a>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-1" asChild>
            <a href="tel:108">
              <Stethoscope className="h-5 w-5" />
              <span className="text-xs sm:text-sm">Ambulance</span>
            </a>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-1" asChild>
            <a href="tel:1363">
              <Headphones className="h-5 w-5" />
              <span className="text-xs sm:text-sm">Helpline</span>
            </a>
          </Button>
        </CardContent>
      </Card>

      <ActiveTourCard />
      <SeparationAlertsCard />

      <Card>
        <CardHeader>
          <CardTitle>Live Safety Map</CardTitle>
          <CardDescription>Your real-time guide to navigating safely.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {insideDanger && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> DANGER: Follow the blue route to safety
              </div>
              {route ? (
                <div className="mt-1 text-muted-foreground">
                  Nearest safe zone: <b>{formatDistance(route.distance)}</b> · ETA <b>{formatDuration(route.duration)}</b> walking
                </div>
              ) : (
                distanceToSafety && (
                  <div className="mt-1 text-muted-foreground">
                    Nearest safe zone: <b>{distanceToSafety} m</b> · calculating route…
                  </div>
                )
              )}
            </div>
          )}
          <SafetyMap
            zones={zones}
            userLocation={location}
            height="400px"
            panTo={panTo}
            routePolyline={route?.coordinates ?? null}
            markers={
              routeTo ? [{ id: "safety", pos: routeTo, label: "Nearest safe zone", color: "#16a34a" }] : []
            }
          />
          {geoError && (
            <p className="text-xs text-muted-foreground">Location access denied. Enable in browser to use the map fully.</p>
          )}
          {location && (
            <p className="text-xs text-muted-foreground">
              <MapPin className="mr-1 inline h-3 w-3" />
              {location[0].toFixed(4)}, {location[1].toFixed(4)}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!location}
            onClick={() => location && setPanTo([...location] as [number, number])}
          >
            <Navigation className="mr-2 h-4 w-4" /> Locate Me
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" /> Live Weather Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weather ? (
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {Math.round(weather.temp)}°C · <span className="text-base font-normal text-muted-foreground">{weather.desc}</span>
              </div>
              <div className="rounded-md bg-accent p-3 text-sm">
                <b>Safety tip:</b> {weather.tip}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {geoError
                ? "Location access was denied. Please enable location services in your browser settings."
                : "Loading weather…"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function weatherDesc(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed";
}

function LostReportDialog() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user || !profile) return;
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setLoading(true);
    let photoUrl: string | null = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("lost-photos").upload(path, file);
      if (upErr) {
        toast.error("Photo upload failed");
        setLoading(false);
        return;
      }
      const { data } = await supabase.storage.from("lost-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      photoUrl = data?.signedUrl ?? null;
    }
    const { error } = await supabase.from("lost_reports").insert({
      reporter_id: user.id,
      reporter_name: profile.full_name,
      reporter_phone: profile.phone,
      missing_name: name.trim(),
      description: desc.trim() || null,
      photo_url: photoUrl,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Report submitted");
      setOpen(false);
      setName("");
      setDesc("");
      setFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-20 flex-col gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
          <UserSearch className="h-5 w-5" />
          <span className="text-xs sm:text-sm">Report Lost</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a Lost Tourist</DialogTitle>
          <DialogDescription>Provide details so authorities can begin a search.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name of missing person</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Last seen wearing… physical description… last known location…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Photo (optional)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Submitting…" : "Submit Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ActiveTour {
  id: string;
  name: string;
  group_code: string;
  cover_image: string | null;
  member_count: number;
  is_live: boolean;
}

function ActiveTourCard() {
  const { user } = useAuth();
  const [tour, setTour] = useState<ActiveTour | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const pick = async () => {
      const { data: mems } = await supabase
        .from("tour_group_members")
        .select("group_id, joined_at")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      const ids = (mems ?? []).map((m) => m.group_id);
      if (ids.length === 0) {
        setTour(null);
        setLoading(false);
        return;
      }
      const { data: gs } = await supabase
        .from("tour_groups")
        .select("id, name, group_code, cover_image, is_live, live_started_at")
        .in("id", ids);
      const groups = gs ?? [];
      // Prefer a live tour; fall back to the most recently joined.
      const live = groups.find((g) => (g as { is_live?: boolean }).is_live);
      const chosen = live ?? groups.find((g) => g.id === ids[0]) ?? groups[0];
      if (!chosen) {
        setTour(null);
        setLoading(false);
        return;
      }
      const { count } = await supabase
        .from("tour_group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", chosen.id);
      setTour({
        id: chosen.id,
        name: chosen.name,
        group_code: chosen.group_code,
        cover_image: chosen.cover_image,
        member_count: count ?? 0,
        is_live: Boolean((chosen as { is_live?: boolean }).is_live),
      });
      setLoading(false);
    };

    pick();
    const ch = supabase
      .channel("dashboard-active-tour")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tour_groups" }, () => pick())
      .on("postgres_changes", { event: "*", schema: "public", table: "tour_group_members", filter: `user_id=eq.${user.id}` }, () => pick())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Only show the Current Tour card when a tour is actively live.
  if (loading || !tour || !tour.is_live) return null;

  return (
    <Card className={tour.is_live ? "border-primary/60 ring-1 ring-primary/30" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          {tour.is_live ? "Live tour" : "Current tour"}
          {tour.is_live && (
            <Badge variant="default" className="ml-1 gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> LIVE
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          to="/tourist/groups/$groupId"
          params={{ groupId: tour.id }}
          className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 hover:bg-muted/60"
        >
          {tour.cover_image ? (
            <img src={tour.cover_image} alt="" className="h-14 w-14 rounded-md object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{tour.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono">{tour.group_code}</Badge>
              <span>{tour.member_count} members</span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
}

interface SepAlert {
  id: string;
  user_name: string;
  severity: string;
  distance_km: number;
  group_id: string;
  created_at: string;
}

function SeparationAlertsCard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<SepAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("separation_alerts")
        .select("id, user_name, severity, distance_km, group_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setAlerts((data as SepAlert[]) ?? []);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("dashboard-sep-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "separation_alerts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Separation alerts
        </CardTitle>
        <CardDescription>Recent group separation warnings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => (
          <Link
            key={a.id}
            to="/tourist/groups/$groupId"
            params={{ groupId: a.group_id }}
            className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5 hover:bg-muted/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {a.severity === "critical" ? "🚨" : "⚠"} {a.user_name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {a.distance_km.toFixed(1)} km away · {new Date(a.created_at).toLocaleTimeString()}
              </p>
            </div>
            <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="shrink-0 capitalize">
              {a.severity}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}