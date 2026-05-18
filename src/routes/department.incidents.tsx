import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/department/incidents")({
  head: () => ({
    meta: [
      { title: "Incidents — SafeGo" },
      { name: "description", content: "Review and manage tourist safety incidents reported to the department." },
      { property: "og:title", content: "Incidents — SafeGo" },
      { property: "og:description", content: "Review and manage tourist safety incidents reported to the department." },
      { property: "og:url", content: "/department/incidents" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/department/incidents" }],
  }),
  component: Incidents,
});

type Alert = Database["public"]["Tables"]["sos_alerts"]["Row"];

function Incidents() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sos_alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setAlerts(data);
    };
    load();
    const ch = supabase
      .channel("dept-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Incidents</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Tourist</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.id.slice(0, 8)}</TableCell>
                <TableCell>{a.tourist_name}</TableCell>
                <TableCell className="capitalize">
                  {a.alert_type.replace("_", " ")}
                </TableCell>
                <TableCell className="text-xs">
                  {a.lat.toFixed(3)}, {a.lng.toFixed(3)}
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(a.created_at)}
                </TableCell>
              </TableRow>
            ))}
            {alerts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No incidents yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
