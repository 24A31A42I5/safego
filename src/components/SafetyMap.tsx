import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentProps } from "react";
import type { SafetyMap as SafetyMapImpl } from "./SafetyMap.impl";

export type { Zone, MapMarker } from "./SafetyMap.impl";

const LazySafetyMap = lazy(() =>
  import("./SafetyMap.impl").then((m) => ({ default: m.SafetyMap }))
);

type Props = ComponentProps<typeof SafetyMapImpl>;

export function SafetyMap(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fallback = (
    <div
      style={{ height: props.height ?? "400px" }}
      className="flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
    >
      Loading map…
    </div>
  );

  if (!mounted) return fallback;

  return (
    <Suspense fallback={fallback}>
      <LazySafetyMap {...props} />
    </Suspense>
  );
}
