import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

const ALL_TAGS = ["nature", "heritage", "adventure", "religious", "family", "scenic", "city", "weekend"];

export interface EditableTour {
  id: string;
  title: string;
  description: string | null;
  tips: string | null;
  tags: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tour: EditableTour | null;
  onSaved?: (patch: { title: string; description: string | null; tips: string | null; tags: string[] }) => void;
}

export function EditTourPlanDialog({ open, onOpenChange, tour, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tips, setTips] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tour && open) {
      setTitle(tour.title);
      setDescription(tour.description ?? "");
      setTips(tour.tips ?? "");
      setTags(tour.tags ?? []);
    }
  }, [tour, open]);

  const toggleTag = (t: string) =>
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const save = async () => {
    if (!tour) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const patch = {
        title: title.trim(),
        description: description.trim() || null,
        tips: tips.trim() || null,
        tags,
      };
      const { error } = await supabase.from("shared_tours").update(patch).eq("id", tour.id);
      if (error) throw error;
      toast.success("Plan updated");
      onSaved?.(patch);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit your plan</DialogTitle>
          <DialogDescription>Update the title, description, tips and tags.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Travel tips</Label>
            <Textarea value={tips} onChange={(e) => setTips(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggleTag(t)}>
                    <Badge variant={on ? "default" : "outline"} className="cursor-pointer capitalize">
                      {t}
                      {on && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
