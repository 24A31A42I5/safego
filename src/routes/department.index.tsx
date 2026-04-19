import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SafetyMap, type Zone } from "@/components/SafetyMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "@/lib/format";
import { Phone, MapPin, Siren, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/department/")({
  component: DeptHome,
});

type Alert = Database["public"]["Tables"]["sos_alerts"]["Row"];

function DeptHome() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [panTo, setPanTo] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: a }, { data: z }] = await Promise.all([
        supabase
          .from("sos_alerts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("zones").select("*"),
      ]);
      if (a) setAlerts(a);
      if (z) setZones(z);
    };
    load();
    const ch = supabase
      .channel("dept-home")
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

  const sosAlerts = alerts.filter((a) => a.alert_type === "sos");
  const zoneAlerts = alerts.filter((a) => a.alert_type === "zone_entry");

  const markers = alerts
    .filter((a) => a.status !== "resolved")
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      pos: [a.lat, a.lng] as [number, number],
      label: `${a.tourist_name} - ${a.alert_type}`,
    }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Live Monitoring Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Live Tourist Map</CardTitle>
          <CardDescription>Real-time location of all active alerts.</CardDescription>
        </CardHeader>
        <CardContent>
          <SafetyMap zones={zones} markers={markers} panTo={panTo} height="380px" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Siren className="h-4 w-4 text-destructive" /> SOS Alerts
            </CardTitle>
            <CardDescription>Emergency calls from tourists.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sosAlerts.length === 0 && (
              <p className="text-sm text-muted-foreground">No SOS alerts.</p>
            )}
            {sosAlerts.slice(0, 6).map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onView={() => {
                  setPanTo([a.lat, a.lng]);
                  setSelected(a);
                }}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Zone Entry Alerts
            </CardTitle>
            <CardDescription>Tourists entering danger zones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {zoneAlerts.length === 0 && (
              <p className="text-sm text-muted-foreground">No zone alerts.</p>
            )}
            {zoneAlerts.slice(0, 6).map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onView={() => {
                  setPanTo([a.lat, a.lng]);
                  setSelected(a);
                }}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Incident Reports</CardTitle>
          <CardDescription>A summary of the latest filed incidents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Tourist</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.slice(0, 6).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.id.slice(0, 8)}</TableCell>
                  <TableCell>{a.tourist_name}</TableCell>
                  <TableCell className="capitalize">{a.alert_type.replace("_", " ")}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPanTo([a.lat, a.lng]);
                        setSelected(a);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog alert={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AlertRow({ alert, onView }: { alert: Alert; onView: () => void }) {
  const colorByStatus = {
    critical: "border-l-destructive",
    warning: "border-l-amber-500",
    resolved: "border-l-emerald-500",
  } as const;
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border border-l-4 bg-card p-3 ${colorByStatus[alert.status]}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="capitalize">{alert.alert_type.replace("_", " ")}:</span>
          <StatusBadge status={alert.status} />
        </div>
        <div className="text-xs text-muted-foreground">
          {alert.tourist_name} · {alert.message}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(alert.created_at)}
        </div>
      </div>
      <Button size="sm" onClick={onView}>
        View
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: Alert["status"] }) {
  const map = {
    critical: "bg-destructive text-destructive-foreground",
    warning: "bg-amber-500 text-white",
    resolved: "bg-emerald-500 text-white",
  } as const;
  return (
    <Badge className={`${map[status]} capitalize`} variant="secondary">
      {status}
    </Badge>
  );
}

function AlertDialog({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const updateStatus = async (status: Alert["status"]) => {
    if (!alert) return;
    await supabase.from("sos_alerts").update({ status }).eq("id", alert.id);
    onClose();
  };
  return (
    <Dialog open={!!alert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {alert && (
          <>
            <DialogHeader>
              <DialogTitle className="capitalize">
                {alert.alert_type.replace("_", " ")} – {alert.tourist_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div>
                <MapPin className="mr-1 inline h-3 w-3" />
                {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
              </div>
              {alert.tourist_phone && (
                <div>
                  <Phone className="mr-1 inline h-3 w-3" /> {alert.tourist_phone}
                </div>
              )}
              <div className="text-muted-foreground">{alert.message}</div>
              <div className="flex items-center gap-2">
                Status: <StatusBadge status={alert.status} />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {alert.tourist_phone && (
                  <Button asChild size="sm">
                    <a href={`tel:${alert.tourist_phone}`}>
                      <Phone className="mr-1 h-3 w-3" /> Call Tourist
                    </a>
                  </Button>
                )}
                {alert.status !== "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus("resolved")}
                  >
                    Mark Resolved
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
