import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchPlaces, type NominatimPlace } from "@/lib/nominatim";
import { Loader2, MapPin } from "lucide-react";

interface Props {
  placeholder?: string;
  onSelect: (p: { lat: number; lon: number; label: string }) => void;
  initialValue?: string;
}

export function PlaceSearch({ placeholder, onSelect, initialValue = "" }: Props) {
  const [q, setQ] = useState(initialValue);
  const [results, setResults] = useState<NominatimPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPlaces(q, ctrl.signal, 6);
      if (!ctrl.signal.aborted) {
        setResults(r);
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const pick = (p: NominatimPlace) => {
    onSelect({ lat: parseFloat(p.lat), lon: parseFloat(p.lon), label: p.display_name });
    setQ(p.display_name.split(",").slice(0, 2).join(", "));
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          placeholder={placeholder ?? "Search a place…"}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  pick(r);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
