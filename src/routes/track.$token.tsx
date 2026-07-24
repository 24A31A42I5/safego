import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SafetyMap } from "@/components/SafetyMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Battery, Navigation, Clock } from "lucide-react";

export const Route = createFileRoute("/track/$token")({
  head: () => ({
    meta: [
      { title: "SafeGo Live Tracking" },
      { name: "description", content: "Live emergency location shared via SafeGo." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "SafeGo Live Tracking" },
      { property: "og:description", content: "Live emergency location shared via SafeGo." },
      { property: "og:type", content: "website" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-center text-sm text-muted-foreground">
      Couldn't load tracking session: {error.message}
    </div>
  ),
  component: TrackRoute,
});

interface Snapshot {
  id: string;
  started_at: string;
  ended_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  address: string | null;
  updated_at: string;
  full_name: string | null;
}

function TrackRoute() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: rows, error: err } = await supabase.rpc(
        "get_emergency_session_by_token",
        { _token: token }
      );
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) {
        setError("Tracking session not found.");
        return;
      }
      setData(row as Snapshot);
    };
    load();
    const t = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading tracking…
      </div>
    );
  }

  const active = !data.ended_at;
  const markers =
    data.last_lat != null && data.last_lng != null
      ? [
          {
            id: "user",
            lat: data.last_lat,
            lng: data.last_lng,
            label: data.full_name ?? "Traveler",
            color: "hsl(var(--destructive))",
          },
        ]
      : [];
  const center: [number, number] =
    data.last_lat != null && data.last_lng != null
      ? [data.last_lat, data.last_lng]
      : [20.5937, 78.9629];

  const updated = new Date(data.updated_at);
  const secondsAgo = Math.max(0, Math.round((Date.now() - updated.getTime()) / 1000));

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-sm font-semibold">SafeGo Live Tracking</div>
              <div className="text-xs text-muted-foreground">
                {data.full_name ?? "Traveler"}
              </div>
            </div>
          </div>
          <Badge variant={active ? "destructive" : "secondary"} className={active ? "animate-pulse" : ""}>
            {active ? "LIVE" : "Ended"}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="h-72 overflow-hidden rounded-md border">
          <SafetyMap center={center} zoom={16} height="18rem" markers={markers} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Latest status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Row icon={<MapPin className="h-4 w-4" />} label="Address">
              {data.address ?? "—"}
            </Row>
            <Row icon={<Navigation className="h-4 w-4" />} label="Coordinates">
              {data.last_lat != null && data.last_lng != null
                ? `${data.last_lat.toFixed(5)}, ${data.last_lng.toFixed(5)}`
                : "—"}
            </Row>
            <Row icon={<Navigation className="h-4 w-4" />} label="Accuracy">
              {data.accuracy != null ? `±${Math.round(data.accuracy)} m` : "—"}
            </Row>
            <Row icon={<Navigation className="h-4 w-4" />} label="Speed">
              {data.speed != null ? `${(data.speed * 3.6).toFixed(1)} km/h` : "—"}
            </Row>
            <Row icon={<Battery className="h-4 w-4" />} label="Battery">
              {data.battery != null ? `${data.battery}%` : "—"}
            </Row>
            <Row icon={<Clock className="h-4 w-4" />} label="Updated">
              {secondsAgo}s ago
            </Row>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          This page updates every 10 seconds while the emergency session is active.
        </div>
      </main>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{children}</div>
    </div>
  );
}
