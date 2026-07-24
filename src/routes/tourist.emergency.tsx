import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useBattery, useOnline } from "@/lib/device";
import { reverseGeocode } from "@/lib/nominatim";
import { HoldToSOSButton } from "@/components/HoldToSOSButton";
import { SafetyMap } from "@/components/SafetyMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Phone,
  Share2,
  Copy,
  MapPin,
  Battery,
  Wifi,
  WifiOff,
  Navigation,
  X,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tourist/emergency")({
  head: () => ({
    meta: [
      { title: "Emergency Center — SafeGo" },
      {
        name: "description",
        content:
          "SafeGo Emergency Center: hold-to-activate SOS, live location tracking, and one-tap emergency services.",
      },
      { property: "og:title", content: "Emergency Center — SafeGo" },
      {
        property: "og:description",
        content: "Hold-to-activate SOS with live tracking and one-tap emergency services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-center">
      <h1 className="text-lg font-semibold">Couldn't load Emergency Center</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-4" onClick={reset}>Retry</Button>
    </div>
  ),
  component: EmergencyRoute,
});

interface EmergencySession {
  id: string;
  share_token: string;
  started_at: string;
  ended_at: string | null;
}

const QUICK_DIALS = [
  { label: "Police", number: "100", color: "bg-blue-600" },
  { label: "Ambulance", number: "108", color: "bg-red-600" },
  { label: "Fire", number: "101", color: "bg-orange-600" },
];

function EmergencyRoute() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const { location, error: geoErr } = useGeolocation(true);
  const { level: battery, charging } = useBattery();
  const online = useOnline();

  const [session, setSession] = useState<EmergencySession | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);

  // Watch raw position for full accuracy/speed/heading data.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracy(pos.coords.accuracy);
        setSpeed(pos.coords.speed);
        setHeading(pos.coords.heading);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Reverse-geocode roughly every 60s or on ~200m moves.
  const lastGeocodedRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!location) return;
    const last = lastGeocodedRef.current;
    const shouldFetch =
      !last ||
      Math.hypot(last[0] - location[0], last[1] - location[1]) > 0.002;
    if (!shouldFetch) return;
    lastGeocodedRef.current = location;
    reverseGeocode(location[0], location[1]).then((a) => a && setAddress(a));
  }, [location]);

  const activateSOS = async () => {
    if (!user || !profile) {
      toast.error("Sign in required");
      return;
    }
    if (!location) {
      toast.error("Waiting for GPS…");
      return;
    }
    // 1. Fire the actual SOS alert for department dashboard.
    const { error: sosErr } = await supabase.from("sos_alerts").insert({
      tourist_id: user.id,
      tourist_name: profile.full_name,
      tourist_phone: profile.phone,
      alert_type: "sos",
      status: "critical",
      lat: location[0],
      lng: location[1],
      message: "Emergency Center SOS",
    });
    if (sosErr) {
      toast.error(sosErr.message);
      return;
    }
    // 2. Start an emergency session for the share link.
    const { data, error } = await supabase
      .from("emergency_sessions")
      .insert({
        user_id: user.id,
        last_lat: location[0],
        last_lng: location[1],
        accuracy,
        speed,
        heading,
        battery,
        address,
      })
      .select("id, share_token, started_at, ended_at")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSession(data as EmergencySession);
    toast.success("🚨 SOS active — authorities alerted");
  };

  // Live push updates to the active session every 10s.
  useEffect(() => {
    if (!session || session.ended_at) return;
    const push = async () => {
      if (!location) return;
      await supabase
        .from("emergency_sessions")
        .update({
          last_lat: location[0],
          last_lng: location[1],
          accuracy,
          speed,
          heading,
          battery,
          address,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
    };
    push();
    const t = setInterval(push, 10000);
    return () => clearInterval(t);
  }, [session, location, accuracy, speed, heading, battery, address]);

  const endSession = async () => {
    if (!session) return;
    await supabase
      .from("emergency_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session.id);
    setSession(null);
    toast.success("Emergency session ended");
  };

  const shareUrl = useMemo(() => {
    if (!session) return null;
    return `${window.location.origin}/track/${session.share_token}`;
  }, [session]);

  const shareLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SafeGo Emergency", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* user cancelled share */
    }
  };

  const markers = location
    ? [{ id: "me", pos: location, label: "You", color: "hsl(var(--destructive))" }]
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Badge
          variant={session ? "destructive" : "secondary"}
          className={session ? "animate-pulse text-sm" : ""}
        >
          {session ? "🚨 SOS ACTIVE" : "Standby"}
        </Badge>
      </div>

      <Card className={session ? "border-destructive" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Emergency Center
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <HoldToSOSButton
              onTrigger={activateSOS}
              disabled={!location}
              className="h-24 w-full text-base"
              label={location ? "Hold 3s to activate SOS" : "Waiting for GPS…"}
            />
          ) : (
            <Button
              variant="outline"
              size="lg"
              onClick={endSession}
              className="h-16 w-full border-destructive text-destructive hover:bg-destructive/10"
            >
              <X className="mr-2 h-5 w-5" /> End Emergency Session
            </Button>
          )}

          {session && shareUrl && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Share live tracking link
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 truncate rounded border bg-background px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={shareLink}>
                    <Share2 className="mr-1 h-4 w-4" /> Share
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareUrl);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {geoErr && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              GPS error: {geoErr}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {QUICK_DIALS.map((q) => (
          <a
            key={q.number}
            href={`tel:${q.number}`}
            className={`flex flex-col items-center justify-center rounded-lg ${q.color} p-3 text-white shadow transition-transform active:scale-95`}
          >
            <Phone className="mb-1 h-5 w-5" />
            <div className="text-xs font-medium">{q.label}</div>
            <div className="text-lg font-bold tabular-nums">{q.number}</div>
          </a>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Your live status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-56 overflow-hidden rounded-md">
            <SafetyMap
              center={location ?? [20.5937, 78.9629]}
              zoom={location ? 16 : 5}
              height="14rem"
              markers={markers}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat icon={<MapPin className="h-4 w-4" />} label="Address">
              {address ?? "Locating…"}
            </Stat>
            <Stat icon={<Navigation className="h-4 w-4" />} label="Coordinates">
              {location
                ? `${location[0].toFixed(5)}, ${location[1].toFixed(5)}`
                : "—"}
            </Stat>
            <Stat icon={<Navigation className="h-4 w-4" />} label="Accuracy">
              {accuracy != null ? `±${Math.round(accuracy)} m` : "—"}
            </Stat>
            <Stat icon={<Navigation className="h-4 w-4" />} label="Speed">
              {speed != null ? `${(speed * 3.6).toFixed(1)} km/h` : "—"}
            </Stat>
            <Stat icon={<Battery className="h-4 w-4" />} label="Battery">
              {battery != null ? `${battery}%${charging ? " ⚡" : ""}` : "—"}
            </Stat>
            <Stat
              icon={online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              label="Network"
            >
              {online ? "Online" : "Offline"}
            </Stat>
          </div>

          <div className="pt-2 text-xs text-muted-foreground">
            Emergency contact:{" "}
            {profile?.emergency_contact ? (
              <a href={`tel:${profile.emergency_contact}`} className="font-medium text-foreground">
                {profile.emergency_contact}
              </a>
            ) : (
              <span className="italic">not set — add in profile</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
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
