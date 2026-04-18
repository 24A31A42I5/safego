import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, User, Calendar, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/department/lost")({
  component: LostFound,
});

type Report = Database["public"]["Tables"]["lost_reports"]["Row"];

function LostFound() {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("lost_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setReports(data);
    };
    load();
    const ch = supabase
      .channel("dept-lost")
      .on("postgres_changes", { event: "*", schema: "public", table: "lost_reports" }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const markFound = async (id: string) => {
    await supabase.from("lost_reports").update({ status: "found" }).eq("id", id);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lost &amp; Found Reports</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{r.missing_name}</h3>
                <Badge
                  variant={r.status === "found" ? "secondary" : "destructive"}
                  className="capitalize"
                >
                  {r.status === "active" ? "Active Search" : "Found"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.photo_url && (
                <div className="overflow-hidden rounded-md border bg-muted">
                  <img
                    src={r.photo_url}
                    alt={r.missing_name}
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
              {r.description && <p className="text-muted-foreground">{r.description}</p>}
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" /> By {r.reporter_name}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {formatDistanceToNow(r.created_at)}
                </div>
                {r.reporter_phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {r.reporter_phone}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                {r.reporter_phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${r.reporter_phone}`}>
                      <Phone className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={r.status === "found"}
                  onClick={() => markFound(r.id)}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Mark as Found
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {reports.length === 0 && (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        )}
      </div>
    </div>
  );
}
