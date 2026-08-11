import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { pointInPolygon } from "@/lib/geo";

export type SosAlert = Database["public"]["Tables"]["sos_alerts"]["Row"];
export type ZoneRow = Database["public"]["Tables"]["zones"]["Row"];

export const WINDOW_HOURS = 48;

/** Zone entry alert enriched with the tourist's live position. */
export interface LiveZoneEntry {
  alert: SosAlert;
  /** Live coordinate if the tourist is sharing location, else the entry coordinate. */
  pos: [number, number];
  live: boolean;
  /** Name of the caution/danger zone the tourist is currently inside, if any. */
  currentZone: string | null;
  /** True while the tourist is still inside a caution/danger zone. */
  insideZone: boolean;
  updatedAt: string | null;
}

function windowStart() {
  return new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * Live 48h zone-entry activity: alerts, zones, and each tourist's live position
 * streamed from member_locations. Entries whose tourist has left every
 * caution/danger zone are marked as exited so callers can drop their pin.
 */
export function useZoneActivity() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [live, setLive] = useState<Record<string, { pos: [number, number]; updatedAt: string }>>({});

  useEffect(() => {
    let cancelled = false;

    const loadAlerts = async () => {
      const { data } = await supabase
        .from("sos_alerts")
        .select("*")
        .gte("created_at", windowStart())
        .order("created_at", { ascending: false });
      if (data && !cancelled) setAlerts(data);
    };

    const loadZones = async () => {
      const { data } = await supabase.from("zones").select("*");
      if (data && !cancelled) setZones(data);
    };

    const loadLocations = async () => {
      const { data } = await supabase
        .from("member_locations")
        .select("user_id, lat, lng, updated_at")
        .order("updated_at", { ascending: false });
      if (!data || cancelled) return;
      const map: Record<string, { pos: [number, number]; updatedAt: string }> = {};
      for (const row of data) {
        if (!map[row.user_id]) {
          map[row.user_id] = { pos: [row.lat, row.lng], updatedAt: row.updated_at };
        }
      }
      setLive(map);
    };

    loadAlerts();
    loadZones();
    loadLocations();

    const ch = supabase
      .channel("dept-zone-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "zones" }, loadZones)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_locations" },
        (payload) => {
          const row = payload.new as
            | { user_id?: string; lat?: number; lng?: number; updated_at?: string }
            | null;
          if (!row?.user_id || row.lat == null || row.lng == null) return;
          setLive((prev) => ({
            ...prev,
            [row.user_id!]: {
              pos: [row.lat!, row.lng!],
              updatedAt: row.updated_at ?? new Date().toISOString(),
            },
          }));
        }
      )
      .subscribe();

    // Safety net in case a realtime frame is missed.
    const poll = setInterval(loadLocations, 20000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, []);

  const riskZones = useMemo(
    () =>
      zones
        .filter((z) => z.zone_type === "danger" || z.zone_type === "caution")
        .map((z) => ({
          name: z.name,
          coords: z.coordinates as unknown as [number, number][],
        }))
        .filter((z) => Array.isArray(z.coords) && z.coords.length >= 3),
    [zones]
  );

  const zoneEntries = useMemo<LiveZoneEntry[]>(() => {
    return alerts
      .filter((a) => a.alert_type === "zone_entry")
      .map((a) => {
        const tracked = live[a.tourist_id];
        const pos: [number, number] = tracked?.pos ?? [a.lat, a.lng];
        const hit = riskZones.find((z) => pointInPolygon(pos, z.coords));
        return {
          alert: a,
          pos,
          live: !!tracked,
          currentZone: hit?.name ?? null,
          insideZone: !!hit,
          updatedAt: tracked?.updatedAt ?? null,
        };
      });
  }, [alerts, live, riskZones]);

  const sosAlerts = useMemo(() => alerts.filter((a) => a.alert_type === "sos"), [alerts]);

  /** Zone entries that should show on the live map: unresolved and still inside a zone. */
  const activeZoneEntries = useMemo(
    () => zoneEntries.filter((e) => e.alert.status !== "resolved" && e.insideZone),
    [zoneEntries]
  );

  return { alerts, zones, zoneEntries, activeZoneEntries, sosAlerts };
}
