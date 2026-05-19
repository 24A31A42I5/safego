import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { encodePolyline, downsamplePolyline } from "@/lib/polyline";
import { Share2, MapPin } from "lucide-react";
import { TourPhotoUpload } from "@/components/TourPhotoUpload";
import { type RichStop, type StopDraft, emptyStopDraft } from "@/lib/tour-stop";

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
  const [tips, setTips] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [stopDrafts, setStopDrafts] = useState<StopDraft[]>([]);
  const [busy, setBusy] = useState(false);

  // (Re)sync drafts whenever payload stops change or dialog opens
  useEffect(() => {
    if (!open || !payload) return;
    setStopDrafts((prev) => {
      const next = payload.intermediateStops.map((s, i) => {
        const existing = prev[i];
        const guessName = s.label.startsWith("Stop @") ? "" : s.label.split(",")[0];
        return existing && existing.name !== "" ? existing : emptyStopDraft(guessName);
      });
      return next;
    });
  }, [open, payload]);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const updateDraft = (i: number, patch: Partial<StopDraft>) =>
    setStopDrafts((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

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
      const stops: RichStop[] = payload.intermediateStops.map((s, i) => {
        const d = stopDrafts[i] ?? emptyStopDraft();
        const cleanedName = d.name.trim() || s.label;
        return {
          name: cleanedName,
          lat: s.pos[0],
          lng: s.pos[1],
          order: i,
          description: d.detailedDescription.trim().slice(0, 160) || undefined,
          detailedDescription: d.detailedDescription.trim() || undefined,
          images: d.images.length ? d.images : undefined,
          stayDuration: d.stayDuration.trim() || undefined,
          bestTimeToVisit: d.bestTimeToVisit.trim() || undefined,
          travelTips: d.travelTips.trim() || undefined,
          warnings: d.warnings.trim() || undefined,
          estimatedCost: d.estimatedCost.trim() || undefined,
        };
      });
      const { error } = await supabase.from("shared_tours").insert({
        creator_id: user.id,
        creator_name: profile.full_name,
        title: title.trim(),
        description: description.trim() || null,
        tips: tips.trim() || null,
        images,
        start_label: payload.start.label,
        start_lat: payload.start.pos[0],
        start_lng: payload.start.pos[1],
        dest_label: payload.destination.label,
        dest_lat: payload.destination.pos[0],
        dest_lng: payload.destination.pos[1],
        stops: stops as unknown as never,
        route_polyline: polyline,
        route_distance_m: payload.routeDistanceM,
        route_duration_s: payload.routeDurationS,
        tags,
      });
      if (error) throw error;
      toast.success("Plan shared with the community 🎉");
      setTitle("");
      setDescription("");
      setTips("");
      setTags([]);
      setImages([]);
      setStopDrafts([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Share this journey
          </DialogTitle>
          <DialogDescription>
            Add rich details for each stop so other travellers know what to expect.
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
            <Label htmlFor="tour-title">Journey title</Label>
            <Input
              id="tour-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="e.g. Hill stations & coffee plantations around Araku"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tour-desc">Overall description</Label>
            <Textarea
              id="tour-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="What makes this journey special?"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tour-tips">Overall travel tips (optional)</Label>
            <Textarea
              id="tour-tips"
              value={tips}
              onChange={(e) => setTips(e.target.value.slice(0, 800))}
              placeholder="Best time to visit, what to pack, must-try food…"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label>Cover photos</Label>
            <TourPhotoUpload value={images} onChange={setImages} max={6} />
          </div>

          {payload && payload.intermediateStops.length > 0 && (
            <div className="space-y-1">
              <Label>Stop details</Label>
              <p className="text-[11px] text-muted-foreground">
                Tap a stop to add description, photos, best time, tips and more.
              </p>
              <Accordion type="multiple" className="rounded-md border">
                {payload.intermediateStops.map((s, i) => {
                  const draft = stopDrafts[i] ?? emptyStopDraft();
                  return (
                    <AccordionItem key={i} value={`stop-${i}`} className="border-b last:border-b-0">
                      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                        <span className="flex min-w-0 items-center gap-2 text-left">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="min-w-0 truncate">
                            {draft.name || s.label || `Stop ${i + 1}`}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 px-3 pb-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Place name</Label>
                          <Input
                            value={draft.name}
                            onChange={(e) => updateDraft(i, { name: e.target.value.slice(0, 80) })}
                            placeholder="e.g. Araku Valley"
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            value={draft.detailedDescription}
                            onChange={(e) => updateDraft(i, { detailedDescription: e.target.value.slice(0, 500) })}
                            placeholder="Why is this place worth visiting? What to do here?"
                            rows={2}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Photos</Label>
                          <TourPhotoUpload
                            value={draft.images}
                            onChange={(urls) => updateDraft(i, { images: urls })}
                            max={4}
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Recommended stay</Label>
                            <Input
                              value={draft.stayDuration}
                              onChange={(e) => updateDraft(i, { stayDuration: e.target.value.slice(0, 40) })}
                              placeholder="e.g. 2 hours"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Best time to visit</Label>
                            <Input
                              value={draft.bestTimeToVisit}
                              onChange={(e) => updateDraft(i, { bestTimeToVisit: e.target.value.slice(0, 60) })}
                              placeholder="e.g. Winter mornings"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Estimated cost</Label>
                            <Input
                              value={draft.estimatedCost}
                              onChange={(e) => updateDraft(i, { estimatedCost: e.target.value.slice(0, 40) })}
                              placeholder="e.g. ₹300 / Free"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Tips</Label>
                            <Input
                              value={draft.travelTips}
                              onChange={(e) => updateDraft(i, { travelTips: e.target.value.slice(0, 160) })}
                              placeholder="e.g. Carry water"
                              className="h-8"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Warnings (optional)</Label>
                          <Input
                            value={draft.warnings}
                            onChange={(e) => updateDraft(i, { warnings: e.target.value.slice(0, 200) })}
                            placeholder="e.g. Avoid night driving in monsoon"
                            className="h-8"
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {s.pos[0].toFixed(4)}, {s.pos[1].toFixed(4)}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}

          <div className="space-y-1">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((t) => (
                <button key={t} type="button" onClick={() => toggleTag(t)} className="rounded-full">
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
            {busy ? "Publishing…" : "Publish journey"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
