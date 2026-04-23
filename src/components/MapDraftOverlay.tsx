import { lazy, Suspense, useEffect, useState } from "react";

const LazyOverlay = lazy(() =>
  import("./MapDraftOverlay.impl").then((m) => ({ default: m.MapDraftOverlay }))
);

export function MapDraftOverlay(props: {
  deleteMode: boolean;
  drawing: "safe" | "caution" | "danger" | null;
  points: [number, number][];
  zones: Array<{ id: string; zone_type: "safe" | "caution" | "danger"; coordinates: unknown }>;
  onDeleteZone: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyOverlay {...props} />
    </Suspense>
  );
}