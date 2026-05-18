import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "@/lib/format";

export const Route = createFileRoute("/department/zones")({
  head: () => ({
    meta: [
      { title: "Zone Entry Reports — SafeGo" },
      { name: "description", content: "Track tourist entries into caution and danger zones in real time." },
      { property: "og:title", content: "Zone Entry Reports — SafeGo" },
      { property: "og:description", content: "Track tourist entries into caution and danger zones in real time." },
      { property: "og:url", content: "/department/zones" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/department/zones" }],
  }),
  component: ZoneReports,
});

type Alert = Database["public"]["Tables"]["sos_alerts"]["Row"];

function ZoneReports() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sos_alerts")
        .select("*")
        .eq("alert_type", "zone_entry")
        .order("created_at", { ascending: false });
      if (data) setAlerts(data);
    };
    load();
    const ch = supabase
      .channel("dept-zones")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const updateStatus = async (id: string, status: Alert["status"]) => {
    await supabase.from("sos_alerts").update({ status }).eq("id", id);
  };

  const viewOnMap = (a: Alert) => {
    navigate({
      to: "/department",
      search: { focusLat: a.lat, focusLng: a.lng, focusId: a.id },
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Zone Entry Reports</h1>
      <p className="text-sm text-muted-foreground">
        {alerts.length} zone entry alert{alerts.length === 1 ? "" : "s"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {alerts.map((a) => (
          <Card
            key={a.id}
            className={`border-l-4 ${
              a.status === "critical"
                ? "border-l-destructive"
                : a.status === "warning"
                  ? "border-l-amber-500"
                  : "border-l-emerald-500"
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Zone Entry
                </CardTitle>
                <Badge
                  className="capitalize"
                  variant={
                    a.status === "critical"
                      ? "destructive"
                      : a.status === "resolved"
                        ? "secondary"
                        : "default"
                  }
                >
                  {a.status}
                </Badge>
              </div>
              <CardDescription className="font-mono text-xs">{a.id.slice(0, 8)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="font-semibold">{a.tourist_name}</div>
              {a.tourist_phone && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3 w-3" /> {a.tourist_phone}
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {a.message ?? "Location"} ({a.lat.toFixed(4)}, {a.lng.toFixed(4)})
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" /> {formatDistanceToNow(a.created_at)}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => viewOnMap(a)}>
                  <MapPin className="mr-1 h-3 w-3" /> View on Map
                </Button>
                {a.tourist_phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${a.tourist_phone}`}>
                      <Phone className="mr-1 h-3 w-3" /> Call
                    </a>
                  </Button>
                )}
                {a.status !== "resolved" && (
                  <Button size="sm" onClick={() => updateStatus(a.id, "resolved")}>
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">No zone alerts yet.</p>
        )}
      </div>
    </div>
  );
}
