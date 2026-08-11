import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "@/lib/format";
import { useZoneActivity, type LiveZoneEntry } from "@/hooks/useZoneActivity";
import { Activity, MapPin, Phone, Radio, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/department/activity")({
  head: () => ({
    meta: [
      { title: "Active Zone Activity (48h) — SafeGo" },
      {
        name: "description",
        content:
          "Live-updating view of tourists who entered caution or danger zones today and yesterday.",
      },
      { property: "og:title", content: "Active Zone Activity (48h) — SafeGo" },
      {
        property: "og:description",
        content: "Live-updating zone entry activity for today and yesterday.",
      },
      { property: "og:url", content: "/department/activity" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/department/activity" }],
  }),
  component: ZoneActivity,
});

const isSameDay = (iso: string, ref: Date) => {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
};

function ZoneActivity() {
  const { zoneEntries } = useZoneActivity();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const today = zoneEntries.filter((e) => isSameDay(e.alert.created_at, now));
  const prev = zoneEntries.filter((e) => isSameDay(e.alert.created_at, yesterday));
  const liveCount = zoneEntries.filter((e) => e.insideZone && e.alert.status !== "resolved").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Activity className="h-5 w-5 text-amber-500" /> Active Zone Activity (48h)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live-updating zone entries for today and yesterday. Full history stays in Zone Entry
          Reports.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Currently in a zone" value={liveCount} accent="text-destructive" />
        <StatCard label="Today" value={today.length} accent="text-amber-500" />
        <StatCard label="Yesterday" value={prev.length} accent="text-muted-foreground" />
      </div>

      <Section title="Today" entries={today} />
      <Section title="Yesterday" entries={prev} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`text-2xl font-bold ${accent}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function Section({ title, entries }: { title: string; entries: LiveZoneEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {entries.length} zone entr{entries.length === 1 ? "y" : "ies"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No zone entries recorded.</p>
        )}
        {entries.map((e) => (
          <EntryRow key={e.alert.id} entry={e} />
        ))}
      </CardContent>
    </Card>
  );
}

function EntryRow({ entry }: { entry: LiveZoneEntry }) {
  const navigate = useNavigate();
  const a = entry.alert;
  const active = entry.insideZone && a.status !== "resolved";

  const resolve = async () => {
    await supabase.from("sos_alerts").update({ status: "resolved" }).eq("id", a.id);
  };

  return (
    <div
      className={`rounded-lg border border-l-4 bg-card p-3 ${
        active ? "border-l-destructive" : "border-l-emerald-500"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {a.tourist_name}
            {active ? (
              <Badge variant="destructive" className="gap-1">
                <Radio className="h-3 w-3 animate-pulse" /> In zone
              </Badge>
            ) : (
              <Badge variant="secondary">Exited</Badge>
            )}
            {entry.live && <Badge variant="outline">Live GPS</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {entry.currentZone ?? a.message ?? "Zone entry"} · {entry.pos[0].toFixed(4)},{" "}
            {entry.pos[1].toFixed(4)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Entered {formatDistanceToNow(a.created_at)}
            {entry.updatedAt ? ` · position updated ${formatDistanceToNow(entry.updatedAt)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/department",
                search: { focusLat: entry.pos[0], focusLng: entry.pos[1], focusId: a.id },
              })
            }
          >
            <MapPin className="mr-1 h-3 w-3" /> Map
          </Button>
          {a.tourist_phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${a.tourist_phone}`}>
                <Phone className="mr-1 h-3 w-3" /> Call
              </a>
            </Button>
          )}
          {a.status !== "resolved" && (
            <Button size="sm" onClick={resolve}>
              <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
