import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PlaceSearch } from "@/components/PlaceSearch";
import { SafetyMap, type MapMarker } from "@/components/SafetyMap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Search, Compass, MapPin, Heart, MessageCircle, Bookmark, Share2,
  Clock, Route as RouteIcon, Users, Sparkles, Filter, X, Loader2,
  ChevronLeft, ChevronRight, Plus, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { decodePolyline } from "@/lib/polyline";
import { haversine, pointsBounds } from "@/lib/geo";
import { formatDistance, formatDuration } from "@/lib/routing";
import { TourCommentsPanel } from "@/components/TourCommentsPanel";
import { CreateTourPlanDialog } from "@/components/CreateTourPlanDialog";

export const Route = createFileRoute("/tourist/discover")({
  component: DiscoverPage,
  head: () => ({
    meta: [
      { title: "Discover Tour Plans — Tourist" },
      {
        name: "description",
        content: "Browse community travel plans with photos, likes, comments, and ratings. Reuse any plan in your own trip.",
      },
    ],
  }),
});

interface Stop {
  name: string;
  lat: number;
  lng: number;
  order: number;
  description?: string;
  detailedDescription?: string;
  images?: string[];
  stayDuration?: string;
  bestTimeToVisit?: string;
  travelTips?: string;
  warnings?: string;
  estimatedCost?: string;
}
interface SharedTourRow {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string | null;
  title: string;
  description: string | null;
  start_label: string;
  start_lat: number;
  start_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  stops: Stop[];
  route_polyline: string | null;
  route_distance_m: number;
  route_duration_s: number;
  tags: string[];
  images: string[];
  tips: string | null;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  rating_sum: number;
  rating_count: number;
  created_at: string;
}

interface ScoredTour extends SharedTourRow {
  startDistKm: number;
  destDistKm: number;
  score: number;
  exactMatch: boolean;
  avgRating: number;
}

const ALL_TAGS = ["nature", "heritage", "adventure", "religious", "family", "scenic", "city", "weekend"];
type FeedTab = "for-you" | "trending" | "liked" | "recent";

function normalizeRow(r: Record<string, unknown>): SharedTourRow {
  const stopsRaw = r.stops;
  const stops: Stop[] = Array.isArray(stopsRaw)
    ? (stopsRaw as Stop[]).map((s, i) => ({ ...s, order: typeof s.order === "number" ? s.order : i }))
    : [];
  return {
    ...(r as unknown as SharedTourRow),
    stops,
    images: Array.isArray(r.images) ? (r.images as string[]) : [],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    creator_avatar: (r.creator_avatar as string | null) ?? null,
    tips: (r.tips as string | null) ?? null,
    likes_count: (r.likes_count as number) ?? 0,
    comments_count: (r.comments_count as number) ?? 0,
    saves_count: (r.saves_count as number) ?? 0,
  };
}

function DiscoverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [start, setStart] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [radius, setRadius] = useState(30);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | "">("");
  const [maxDurationMin, setMaxDurationMin] = useState<number | "">("");
  const [minRating, setMinRating] = useState(0);
  const [tab, setTab] = useState<FeedTab>("for-you");
  const [results, setResults] = useState<ScoredTour[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ScoredTour | null>(null);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [mySaves, setMySaves] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [useBusy, setUseBusy] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSearch = !!(start || dest);

  useEffect(() => {
    // no-op; group is auto-created on "Use this plan"
  }, [user]);

  // load my likes/saves once
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [{ data: likes }, { data: saves }] = await Promise.all([
        supabase.from("shared_tour_likes").select("tour_id").eq("user_id", user.id),
        supabase.from("shared_tour_saves").select("tour_id").eq("user_id", user.id),
      ]);
      setMyLikes(new Set((likes ?? []).map((x) => x.tour_id)));
      setMySaves(new Set((saves ?? []).map((x) => x.tour_id)));
    })();
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, dest, radius, filterTags, maxDistanceKm, maxDurationMin, minRating, tab]);

  const runSearch = async () => {
    setLoading(true);
    try {
      let query = supabase.from("shared_tours").select("*").limit(200);

      if (start && dest) {
        const cosLatStart = Math.cos((start.lat * Math.PI) / 180) || 1;
        const cosLatDest = Math.cos((dest.lat * Math.PI) / 180) || 1;
        const dLatS = radius / 111;
        const dLngS = radius / (111 * cosLatStart);
        const dLatD = radius / 111;
        const dLngD = radius / (111 * cosLatDest);
        query = query
          .gte("start_lat", start.lat - dLatS).lte("start_lat", start.lat + dLatS)
          .gte("start_lng", start.lon - dLngS).lte("start_lng", start.lon + dLngS)
          .gte("dest_lat", dest.lat - dLatD).lte("dest_lat", dest.lat + dLatD)
          .gte("dest_lng", dest.lon - dLngD).lte("dest_lng", dest.lon + dLngD);
      } else if (start) {
        const cosLat = Math.cos((start.lat * Math.PI) / 180) || 1;
        const dLat = radius / 111;
        const dLng = radius / (111 * cosLat);
        query = query
          .gte("start_lat", start.lat - dLat).lte("start_lat", start.lat + dLat)
          .gte("start_lng", start.lon - dLng).lte("start_lng", start.lon + dLng);
      } else if (dest) {
        const cosLat = Math.cos((dest.lat * Math.PI) / 180) || 1;
        const dLat = radius / 111;
        const dLng = radius / (111 * cosLat);
        query = query
          .gte("dest_lat", dest.lat - dLat).lte("dest_lat", dest.lat + dLat)
          .gte("dest_lng", dest.lon - dLng).lte("dest_lng", dest.lon + dLng);
      }

      if (filterTags.length) query = query.overlaps("tags", filterTags);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map((r) => normalizeRow(r as Record<string, unknown>));

      const scored: ScoredTour[] = rows
        .map((r) => {
          const sd = start ? haversine([start.lat, start.lon], [r.start_lat, r.start_lng]) / 1000 : 0;
          const dd = dest ? haversine([dest.lat, dest.lon], [r.dest_lat, r.dest_lng]) / 1000 : 0;
          const avg = r.rating_count > 0 ? r.rating_sum / r.rating_count : 0;
          const exact = (start ? sd < 2 : true) && (dest ? dd < 2 : false);
          return {
            ...r,
            startDistKm: sd,
            destDistKm: dd,
            score: sd + dd,
            exactMatch: exact,
            avgRating: avg,
          };
        })
        .filter((t) => {
          if (start && t.startDistKm > radius) return false;
          if (dest && t.destDistKm > radius) return false;
          if (typeof maxDistanceKm === "number" && t.route_distance_m / 1000 > maxDistanceKm) return false;
          if (typeof maxDurationMin === "number" && t.route_duration_s / 60 > maxDurationMin) return false;
          if (minRating > 0 && t.avgRating < minRating) return false;
          return true;
        });

      if (hasSearch) {
        scored.sort((a, b) => {
          if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
          return a.score - b.score;
        });
      } else if (tab === "trending") {
        const now = Date.now();
        scored.sort((a, b) => {
          const ageA = Math.max(1, (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24));
          const ageB = Math.max(1, (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24));
          const sA = (a.likes_count + 2 * a.saves_count + a.comments_count) / Math.log2(ageA + 2);
          const sB = (b.likes_count + 2 * b.saves_count + b.comments_count) / Math.log2(ageB + 2);
          return sB - sA;
        });
      } else if (tab === "liked") {
        scored.sort((a, b) => b.likes_count - a.likes_count);
      } else if (tab === "recent") {
        scored.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      } else {
        scored.sort((a, b) =>
          (b.likes_count + b.saves_count + b.comments_count) -
          (a.likes_count + a.saves_count + a.comments_count)
        );
      }

      setResults(scored.slice(0, 40));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleLike = async (tour: ScoredTour) => {
    if (!user) { toast.info("Sign in to like plans"); return; }
    const liked = myLikes.has(tour.id);
    const next = new Set(myLikes);
    if (liked) next.delete(tour.id); else next.add(tour.id);
    setMyLikes(next);
    setResults((p) => p.map((t) => t.id === tour.id ? { ...t, likes_count: Math.max(0, t.likes_count + (liked ? -1 : 1)) } : t));
    setSelected((s) => s && s.id === tour.id ? { ...s, likes_count: Math.max(0, s.likes_count + (liked ? -1 : 1)) } : s);
    if (liked) {
      await supabase.from("shared_tour_likes").delete().eq("tour_id", tour.id).eq("user_id", user.id);
    } else {
      await supabase.from("shared_tour_likes").insert({ tour_id: tour.id, user_id: user.id });
    }
  };

  const toggleSave = async (tour: ScoredTour) => {
    if (!user) { toast.info("Sign in to save plans"); return; }
    const saved = mySaves.has(tour.id);
    const next = new Set(mySaves);
    if (saved) next.delete(tour.id); else next.add(tour.id);
    setMySaves(next);
    setResults((p) => p.map((t) => t.id === tour.id ? { ...t, saves_count: Math.max(0, t.saves_count + (saved ? -1 : 1)) } : t));
    setSelected((s) => s && s.id === tour.id ? { ...s, saves_count: Math.max(0, s.saves_count + (saved ? -1 : 1)) } : s);
    if (saved) {
      await supabase.from("shared_tour_saves").delete().eq("tour_id", tour.id).eq("user_id", user.id);
    } else {
      await supabase.from("shared_tour_saves").insert({ tour_id: tour.id, user_id: user.id });
    }
    toast.success(saved ? "Removed from saved" : "Saved for later");
  };

  const sharePlan = async (tour: ScoredTour) => {
    const url = `${window.location.origin}/tourist/discover?tour=${tour.id}`;
    const data = { title: tour.title, text: `Check out this travel plan: ${tour.title}`, url };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      // user cancelled
    }
  };

  const useThisPlan = async (tour: ScoredTour) => {
    if (!user) {
      toast.info("Sign in to use this plan");
      return;
    }
    if (useBusy) return;
    setUseBusy(tour.id);
    try {
      const groupName = tour.title.slice(0, 60) || "Community trip";
      const { data: g, error } = await supabase
        .from("tour_groups")
        .insert({ name: groupName, creator_id: user.id })
        .select("id")
        .single();
      if (error || !g) throw error ?? new Error("Failed to create group");
      await supabase
        .from("tour_group_members")
        .insert({ group_id: g.id, user_id: user.id });
      toast.success("New group created — loading plan");
      navigate({
        to: "/tourist/groups/$groupId",
        params: { groupId: g.id },
        search: { applyTour: tour.id },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setUseBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Compass className="h-6 w-6 text-primary" /> Discover tour plans
          </h1>
          <p className="text-sm text-muted-foreground">
            A community feed of real travel routes — photos, tips, and itineraries you can reuse.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="hidden sm:inline-flex">
          <Upload className="mr-1 h-4 w-4" /> Upload your plan
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start location</label>
              <PlaceSearch placeholder="From…" onSelect={setStart} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Destination</label>
              <PlaceSearch placeholder="To…" onSelect={setDest} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Match radius</span>
                <span className="font-mono text-foreground">{radius} km</span>
              </div>
              <Slider min={10} max={100} step={5} value={[radius]} onValueChange={(v) => setRadius(v[0])} />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="self-end">
                  <Filter className="mr-1 h-4 w-4" /> Filters
                  {(filterTags.length > 0 || maxDistanceKm !== "" || maxDurationMin !== "" || minRating > 0) && (
                    <Badge variant="secondary" className="ml-1">
                      {filterTags.length + (maxDistanceKm !== "" ? 1 : 0) + (maxDurationMin !== "" ? 1 : 0) + (minRating > 0 ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-sm">
                <div className="mt-6 space-y-5">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TAGS.map((t) => {
                        const on = filterTags.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => setFilterTags((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}>
                            <Badge variant={on ? "default" : "outline"} className="cursor-pointer capitalize">{t}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Max trip distance (km)</label>
                    <Input type="number" min={1} placeholder="any" value={maxDistanceKm}
                      onChange={(e) => setMaxDistanceKm(e.target.value === "" ? "" : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Max duration (min)</label>
                    <Input type="number" min={1} placeholder="any" value={maxDurationMin}
                      onChange={(e) => setMaxDurationMin(e.target.value === "" ? "" : Number(e.target.value))} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold">Minimum rating</span>
                      <span className="font-mono">{minRating}★</span>
                    </div>
                    <Slider min={0} max={5} step={1} value={[minRating]} onValueChange={(v) => setMinRating(v[0])} />
                  </div>
                  <Button variant="ghost" size="sm" className="w-full"
                    onClick={() => { setFilterTags([]); setMaxDistanceKm(""); setMaxDurationMin(""); setMinRating(0); }}>
                    <X className="mr-1 h-4 w-4" /> Clear filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardContent>
      </Card>

      {!hasSearch && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as FeedTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="for-you">For you</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="liked">Most liked</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span>
          ) : (
            <>{results.length} plan{results.length === 1 ? "" : "s"}</>
          )}
        </span>
      </div>

      {!loading && results.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-center text-sm text-muted-foreground">
            <Search className="mx-auto h-8 w-8 opacity-40" />
            <p>No plans match yet.</p>
            <p className="text-xs">Try increasing the radius, removing filters, or be the first to share a route!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {results.map((t) => (
            <TourPostCard
              key={t.id}
              tour={t}
              liked={myLikes.has(t.id)}
              saved={mySaves.has(t.id)}
              onOpen={() => setSelected(t)}
              onLike={() => toggleLike(t)}
              onSave={() => toggleSave(t)}
              onShare={() => sharePlan(t)}
              onUse={() => useThisPlan(t)}
            />
          ))}
        </div>
      )}

      <TourDetailDialog
        tour={selected}
        onClose={() => setSelected(null)}
        onUse={(t) => { setSelected(null); useThisPlan(t); }}
        onLike={(t) => toggleLike(t)}
        onSave={(t) => toggleSave(t)}
        onShare={(t) => sharePlan(t)}
        liked={selected ? myLikes.has(selected.id) : false}
        saved={selected ? mySaves.has(selected.id) : false}
      />

      <CreateTourPlanDialog open={uploadOpen} onOpenChange={setUploadOpen} onPublished={() => { setUploadOpen(false); void runSearch(); }} />

      {/* Floating action button (mobile) */}
      <Button
        onClick={() => setUploadOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg sm:hidden"
        size="icon"
        aria-label="Upload your plan"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}

function PhotoCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (images.length === 0) return null;
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setI((p) => (p - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setI((p) => (p + 1) % images.length); };
  return (
    <div className="relative h-48 w-full overflow-hidden bg-muted">
      <img src={images[i]} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      {images.length > 1 && (
        <>
          <button type="button" onClick={prev}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
            aria-label="Previous photo">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={next}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
            aria-label="Next photo">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, idx) => (
              <span key={idx} className={`h-1.5 w-1.5 rounded-full ${idx === i ? "bg-white" : "bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TourPostCard({
  tour, liked, saved, onOpen, onLike, onSave, onShare, onUse,
}: {
  tour: ScoredTour; liked: boolean; saved: boolean;
  onOpen: () => void; onLike: () => void; onSave: () => void; onShare: () => void; onUse: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-2 p-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {tour.creator_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{tour.creator_name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              <MapPin className="mr-0.5 inline h-3 w-3" />{tour.start_label.split(",")[0]} → {tour.dest_label.split(",")[0]}
            </div>
          </div>
          {tour.exactMatch && (
            <Badge className="gap-1 shrink-0"><Sparkles className="h-3 w-3" />Exact</Badge>
          )}
        </div>
        {tour.images.length > 0 ? (
          <PhotoCarousel images={tour.images} alt={tour.title} />
        ) : (
          <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20 text-xs text-muted-foreground">
            <RouteIcon className="mr-1 h-4 w-4" /> Route preview
          </div>
        )}
        <CardContent className="space-y-2 p-3">
          <h3 className="font-semibold leading-tight">{tour.title}</h3>
          {tour.description && <p className="line-clamp-2 text-xs text-muted-foreground">{tour.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><RouteIcon className="h-3 w-3" />{formatDistance(tour.route_distance_m)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(tour.route_duration_s)}</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{tour.stops.length} stops</span>
            {tour.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] capitalize">{tag}</Badge>
            ))}
          </div>
        </CardContent>
      </button>
      <div className="flex items-center justify-between border-t px-2 py-1.5">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={onLike} className="gap-1 px-2">
            <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
            <span className="text-xs">{tour.likes_count}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpen} className="gap-1 px-2">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs">{tour.comments_count}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave} className="gap-1 px-2">
            <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
            <span className="text-xs">{tour.saves_count}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onShare} className="px-2" aria-label="Share">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" onClick={onUse} className="h-7 gap-1">
          <Sparkles className="h-3 w-3" /> Use
        </Button>
      </div>
    </Card>
  );
}

function TourDetailDialog({
  tour, onClose, onUse, onLike, onSave, onShare, liked, saved,
}: {
  tour: ScoredTour | null;
  onClose: () => void;
  onUse: (t: ScoredTour) => void;
  onLike: (t: ScoredTour) => void;
  onSave: (t: ScoredTour) => void;
  onShare: (t: ScoredTour) => void;
  liked: boolean;
  saved: boolean;
}) {
  const markers: MapMarker[] = useMemo(() => {
    if (!tour) return [];
    const stops = [...tour.stops].sort((a, b) => a.order - b.order);
    return [
      { id: "s", pos: [tour.start_lat, tour.start_lng], label: tour.start_label, color: "#16a34a", initials: "A" },
      ...stops.map((s, i) => ({
        id: `m-${i}`, pos: [s.lat, s.lng] as [number, number], label: s.name, color: "#0ea5e9", initials: `${i + 1}`,
      })),
      { id: "d", pos: [tour.dest_lat, tour.dest_lng], label: tour.dest_label, color: "#dc2626", initials: "B" },
    ];
  }, [tour]);

  const polyline = useMemo(
    () => (tour?.route_polyline ? decodePolyline(tour.route_polyline) : null),
    [tour]
  );

  if (!tour) return null;
  const stops = [...tour.stops].sort((a, b) => a.order - b.order);
  const route = polyline ?? markers.map((m) => m.pos);

  return (
    <Dialog open={!!tour} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {tour.title}
            {tour.exactMatch && <Badge className="gap-1"><Sparkles className="h-3 w-3" /> Exact match</Badge>}
          </DialogTitle>
          <DialogDescription>by {tour.creator_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {tour.images.length > 0 && (
            <div className="-mx-4 overflow-x-auto">
              <div className="flex gap-2 px-4">
                {tour.images.map((src, i) => (
                  <img key={i} src={src} alt={`${tour.title} photo ${i + 1}`} loading="lazy"
                    className="h-44 w-64 shrink-0 rounded-md object-cover" />
                ))}
              </div>
            </div>
          )}

          <SafetyMap markers={markers} routePolyline={route} fitBounds={pointsBounds(route)} fitBoundsEnabled height="280px" />

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><RouteIcon className="mr-1 inline h-3 w-3" />{formatDistance(tour.route_distance_m)}</span>
            <span><Clock className="mr-1 inline h-3 w-3" />{formatDuration(tour.route_duration_s)}</span>
            <span><Users className="mr-1 inline h-3 w-3" />{stops.length} stops</span>
          </div>

          {tour.description && <p className="text-sm">{tour.description}</p>}

          {tour.tips && (
            <div className="rounded-md border bg-accent/30 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Travel tips</div>
              <p className="whitespace-pre-wrap">{tour.tips}</p>
            </div>
          )}

          {tour.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tour.tags.map((t) => (
                <Badge key={t} variant="secondary" className="capitalize">{t}</Badge>
              ))}
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Itinerary</h4>
            <ol className="space-y-2">
              <li className="flex gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">A</span>
                <span className="truncate">{tour.start_label}</span>
              </li>
              {stops.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                  </div>
                </li>
              ))}
              <li className="flex gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">B</span>
                <span className="truncate">{tour.dest_label}</span>
              </li>
            </ol>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">
              Comments <span className="text-xs font-normal text-muted-foreground">({tour.comments_count})</span>
            </h4>
            <TourCommentsPanel tourId={tour.id} />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center gap-1 border-t bg-background/95 p-2 backdrop-blur">
          <Button variant="ghost" size="sm" onClick={() => onLike(tour)} className="gap-1">
            <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
            <span className="text-xs">{tour.likes_count}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSave(tour)} className="gap-1">
            <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
            <span className="text-xs">{tour.saves_count}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onShare(tour)} aria-label="Share">
            <Share2 className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => onUse(tour)}>
            <Sparkles className="mr-1 h-4 w-4" /> Use this plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
