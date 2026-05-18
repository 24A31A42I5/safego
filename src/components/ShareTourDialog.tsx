import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { encodePolyline, downsamplePolyline } from "@/lib/polyline";
import { Share2 } from "lucide-react";
import { TourPhotoUpload } from "@/components/TourPhotoUpload";

export interface ShareTourPayload {
  start: { pos: [number, number]; label: string };
  destination: { pos: [number, number]; label: string };
  intermediateStops: { pos: [number, number]; label: string }[];
  routeCoordinates: [number, number][] | null;
  routeDistanceM: number;
  routeDurationS: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: ShareTourPayload | null;
}

const SUGGESTED_TAGS = ["nature", "heritage", "adventure", "religious", "family", "scenic", "city", "weekend"];

export function ShareTourDialog({ open, onOpenChange, payload }: Props) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = async () => {
    if (!user || !profile || !payload) return;
    if (!title.trim()) {
      toast.error("Add a title for your plan");
      return;
    }
    setBusy(true);
    try {
      const polyline = payload.routeCoordinates
        ? encodePolyline(downsamplePolyline(payload.routeCoordinates, 200))
        : null;
      const stops = payload.intermediateStops.map((s, i) => ({
        name: s.label,
        lat: s.pos[0],
        lng: s.pos[1],
        order: i,
      }));
      const { error } = await supabase.from("shared_tours").insert({
        creator_id: user.id,
        creator_name: profile.full_name,
        title: title.trim(),
        description: description.trim() || null,
        start_label: payload.start.label,
        start_lat: payload.start.pos[0],
        start_lng: payload.start.pos[1],
        dest_label: payload.destination.label,
        dest_lat: payload.destination.pos[0],
        dest_lng: payload.destination.pos[1],
        stops,
        route_polyline: polyline,
        route_distance_m: payload.routeDistanceM,
        route_duration_s: payload.routeDurationS,
        tags,
      });
      if (error) throw error;
      toast.success("Plan shared with the community 🎉");
      setTitle("");
      setDescription("");
      setTags([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Share this plan
          </DialogTitle>
          <DialogDescription>
            Help other travellers — publish this route so they can reuse it.
          </DialogDescription>
        </DialogHeader>

        {payload && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="truncate"><b className="text-foreground">From:</b> {payload.start.label}</div>
            <div className="truncate"><b className="text-foreground">To:</b> {payload.destination.label}</div>
            <div className="mt-1">
              {payload.intermediateStops.length} stop{payload.intermediateStops.length === 1 ? "" : "s"} ·{" "}
              {(payload.routeDistanceM / 1000).toFixed(1)} km ·{" "}
              {Math.round(payload.routeDurationS / 60)} min
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tour-title">Title</Label>
            <Input
              id="tour-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="e.g. Weekend temples around Madurai"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tour-desc">Description</Label>
            <Textarea
              id="tour-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Share tips, best time to go, anything other travellers should know"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className="rounded-full"
                >
                  <Badge variant={tags.includes(t) ? "default" : "outline"} className="cursor-pointer capitalize">
                    {t}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Publishing…" : "Publish plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
