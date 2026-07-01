import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchPlaces, peekCachedPlaces, type NominatimPlace } from "@/lib/nominatim";
import { Loader2, MapPin, Clock } from "lucide-react";

interface Props {
  placeholder?: string;
  onSelect: (p: { lat: number; lon: number; label: string }) => void;
  initialValue?: string;
}

interface PickedPlace {
  lat: number;
  lon: number;
  label: string;
  display: string;
  ts: number;
}

const RECENTS_KEY = "safego.placeSearch.recents.v1";
const MAX_RECENTS = 8;

function readRecents(): PickedPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PickedPlace[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: PickedPlace[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    /* noop */
  }
}

export function PlaceSearch({ placeholder, onSelect, initialValue = "" }: Props) {
  const [q, setQ] = useState(initialValue);
  const [results, setResults] = useState<NominatimPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<PickedPlace[]>(() => readRecents());
  const ctrlRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = q.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      ctrlRef.current?.abort();
      return;
    }
    // Show cached results instantly (no spinner, no flicker) while we
    // optionally refresh in the background.
    const cached = peekCachedPlaces(trimmed, 6);
    if (cached && cached.length > 0) {
      setResults(cached);
      setLoading(false);
    }
    // Tight debounce — 180ms feels near-instant while still coalescing keystrokes.
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    if (!cached) setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPlaces(trimmed, ctrl.signal, 6);
      if (!ctrl.signal.aborted) {
        if (r.length > 0 || !cached) setResults(r);
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed]);

  const pick = (p: NominatimPlace) => {
    const lat = parseFloat(p.lat);
    const lon = parseFloat(p.lon);
    const shortLabel = p.display_name.split(",").slice(0, 2).join(", ");
    onSelect({ lat, lon, label: p.display_name });
    // Auto-clear the input after selection so the user can immediately search
    // the next place without manually clearing.
    setQ("");
    setResults([]);
    setOpen(false);
    const entry: PickedPlace = {
      lat,
      lon,
      label: p.display_name,
      display: shortLabel,
      ts: Date.now(),
    };
    const next = [entry, ...recents.filter((r) => r.label !== entry.label)].slice(0, MAX_RECENTS);
    setRecents(next);
    writeRecents(next);
  };

  const pickRecent = (r: PickedPlace) => {
    onSelect({ lat: r.lat, lon: r.lon, label: r.label });
    setQ("");
    setResults([]);
    setOpen(false);
  };

  const showRecents = useMemo(
    () => open && trimmed.length < 2 && recents.length > 0,
    [open, trimmed, recents],
  );

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
          autoComplete="off"
          spellCheck={false}
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
      {showRecents && (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          <li className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </li>
          {recents.map((r) => (
            <li key={`${r.lat},${r.lon},${r.ts}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  pickRecent(r);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
