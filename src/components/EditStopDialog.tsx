import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TourPhotoUpload } from "@/components/TourPhotoUpload";
import {
  TRANSPORT_OPTIONS,
  type GroupJourneyStop,
  type TransportOption,
  type TransportType,
} from "@/lib/tour-stop";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stop: GroupJourneyStop | null;
  stopIndex: number;
  onSave: (patch: Partial<GroupJourneyStop>) => void | Promise<void>;
}

export function EditStopDialog({ open, onOpenChange, stop, stopIndex, onSave }: Props) {
  const [name, setName] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [stayDuration, setStayDuration] = useState("");
  const [bestTimeToVisit, setBestTimeToVisit] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [travelTips, setTravelTips] = useState("");
  const [warnings, setWarnings] = useState("");
  const [thingsToCarry, setThingsToCarry] = useState("");
  const [transportAvailability, setTransportAvailability] = useState<TransportOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !stop) return;
    setName(stop.name ?? stop.label ?? "");
    setDetailedDescription(stop.detailedDescription ?? stop.shortDescription ?? stop.description ?? "");
    setImages(Array.isArray(stop.images) ? stop.images : []);
    setStayDuration(stop.stayDuration ?? "");
    setBestTimeToVisit(stop.bestTimeToVisit ?? "");
    setEstimatedCost(stop.estimatedCost ?? "");
    setTravelTips(stop.travelTips ?? "");
    setWarnings(stop.warnings ?? "");
    setThingsToCarry(stop.thingsToCarry ?? "");
    setTransportAvailability(Array.isArray(stop.transportAvailability) ? stop.transportAvailability : []);
  }, [open, stop]);

  const submit = async () => {
    if (!stop) return;
    setBusy(true);
    try {
      const trimmedName = name.trim() || stop.label;
      const trimmedDesc = detailedDescription.trim();
      await onSave({
        name: trimmedName,
        label: trimmedName,
        detailedDescription: trimmedDesc || undefined,
        shortDescription: trimmedDesc ? trimmedDesc.slice(0, 160) : undefined,
        description: trimmedDesc ? trimmedDesc.slice(0, 160) : undefined,
        images,
        stayDuration: stayDuration.trim() || undefined,
        bestTimeToVisit: bestTimeToVisit.trim() || undefined,
        estimatedCost: estimatedCost.trim() || undefined,
        travelTips: travelTips.trim() || undefined,
        warnings: warnings.trim() || undefined,
        thingsToCarry: thingsToCarry.trim() || undefined,
        transportAvailability: transportAvailability.length ? transportAvailability : undefined,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit stop {stopIndex > 0 ? `#${stopIndex}` : ""}</DialogTitle>
          <DialogDescription>
            Update the details travellers see for this stop in the journey.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Place name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={detailedDescription}
              onChange={(e) => setDetailedDescription(e.target.value.slice(0, 500))}
              placeholder="Why is this place worth visiting? What to do here?"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Photos</Label>
            <TourPhotoUpload value={images} onChange={setImages} max={4} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Recommended stay</Label>
              <Input value={stayDuration} onChange={(e) => setStayDuration(e.target.value.slice(0, 40))} placeholder="e.g. 2 hours" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Best time to visit</Label>
              <Input value={bestTimeToVisit} onChange={(e) => setBestTimeToVisit(e.target.value.slice(0, 60))} placeholder="e.g. Winter mornings" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estimated cost</Label>
              <Input value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value.slice(0, 40))} placeholder="e.g. ₹300 / Free" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tips</Label>
              <Input value={travelTips} onChange={(e) => setTravelTips(e.target.value.slice(0, 160))} placeholder="e.g. Carry water" className="h-8" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Warnings (optional)</Label>
            <Input value={warnings} onChange={(e) => setWarnings(e.target.value.slice(0, 200))} placeholder="e.g. Avoid night driving in monsoon" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Things to carry (optional)</Label>
            <Input value={thingsToCarry} onChange={(e) => setThingsToCarry(e.target.value.slice(0, 200))} placeholder="e.g. Jacket, water bottle, ID proof" className="h-8" />
          </div>
          <TransportEditor value={transportAvailability} onChange={setTransportAvailability} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransportEditor({
  value,
  onChange,
}: {
  value: TransportOption[];
  onChange: (v: TransportOption[]) => void;
}) {
  const byType = new Map(value.map((o) => [o.type, o]));
  const toggle = (type: TransportType) => {
    if (byType.has(type)) onChange(value.filter((o) => o.type !== type));
    else onChange([...value, { type, details: "" }]);
  };
  const updateDetails = (type: TransportType, details: string) => {
    onChange(value.map((o) => (o.type === type ? { ...o, details } : o)));
  };
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <Label className="text-xs">Transport availability</Label>
      <div className="flex flex-wrap gap-1.5">
        {TRANSPORT_OPTIONS.map((opt) => {
          const on = byType.has(opt.type);
          return (
            <button key={opt.type} type="button" onClick={() => toggle(opt.type)}>
              <Badge variant={on ? "default" : "outline"} className="cursor-pointer">
                <span className="mr-1">{opt.icon}</span>
                {opt.label}
              </Badge>
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((opt) => {
            const meta = TRANSPORT_OPTIONS.find((t) => t.type === opt.type);
            return (
              <div key={opt.type} className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {meta?.icon} {meta?.label} details
                </Label>
                <Textarea
                  value={opt.details}
                  onChange={(e) => updateDetails(opt.type, e.target.value.slice(0, 400))}
                  placeholder="How to use this option to reach the place"
                  rows={2}
                  className="text-xs"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
