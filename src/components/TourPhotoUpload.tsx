import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

export function TourPhotoUpload({ value, onChange, max = 6 }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    const slots = Math.max(0, max - value.length);
    const toUpload = Array.from(files).slice(0, slots);
    if (toUpload.length === 0) return;
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (const f of toUpload) {
        if (!f.type.startsWith("image/")) continue;
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`${f.name} is over 5MB`);
          continue;
        }
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("tour-photos").upload(path, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type,
        });
        if (error) {
          toast.error(error.message);
          continue;
        }
        const { data } = supabase.storage.from("tour-photos").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length) onChange([...value, ...uploaded]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (url: string) => onChange(value.filter((u) => u !== url));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-20 w-20 flex-col items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <span className="mt-1">{busy ? "Uploading" : "Add"}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-[11px] text-muted-foreground">
        Up to {max} photos · max 5MB each
      </p>
    </div>
  );
}
