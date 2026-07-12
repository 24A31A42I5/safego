// Shared, chronological Journey Timeline.
// Renders each stop as a numbered milestone with a colored transport leg
// (icon + color from TRANSPORT_STYLE) between consecutive stops so the
// visual matches what the user picked in the route planner.

import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatDistance, formatDuration } from "@/lib/routing";
import {
  TRANSPORT_OPTIONS,
  TRANSPORT_STYLE,
  type RichStop,
  type RouteSegment,
  type TransportType,
} from "@/lib/tour-stop";

export interface TimelineStop {
  id?: string;
  name: string;
  pos: [number, number];
  isStart?: boolean;
  isEnd?: boolean;
  /** Optional rich detail — description/photos/tips shown under the stop card. */
  rich?: Partial<RichStop>;
}

interface Props {
  stops: TimelineStop[];
  segments?: RouteSegment[];
  /** Show the rich per-stop detail card. Default: true. */
  showDetails?: boolean;
  /** Optional per-stop action rendered top-right of the card. */
  renderAction?: (index: number, stop: TimelineStop) => React.ReactNode;
  className?: string;
}

function segmentBetween(segments: RouteSegment[] | undefined, aId?: string, bId?: string) {
  if (!segments || !aId || !bId) return null;
  return segments.find((s) => s.fromId === aId && s.toId === bId) ?? null;
}

function TransportLeg({ seg }: { seg: RouteSegment | null }) {
  const type: TransportType = seg?.transport ?? "car";
  const style = TRANSPORT_STYLE[type];
  const meta = TRANSPORT_OPTIONS.find((o) => o.type === type);
  const defined = Boolean(seg);
  return (
    <li className="relative -my-1 pl-5">
      {/* Colored connector matching transport color (dashed if not user-defined) */}
      <span
        className="absolute left-[-1px] top-0 h-full w-[3px] rounded"
        style={{
          background: defined ? style.color : "transparent",
          borderLeft: defined ? undefined : `2px dashed ${style.color}80`,
        }}
        aria-hidden
      />
      <div
        className="ml-1 inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
        style={{ borderColor: `${style.color}80`, background: `${style.color}12`, color: style.color }}
      >
        <span className="text-sm leading-none">{meta?.icon}</span>
        <span className="font-medium">{meta?.label}</span>
        {seg?.operator && <span className="opacity-80">· {seg.operator}</span>}
        {seg?.number && <span className="opacity-80">· {seg.number}</span>}
        {(seg?.departure || seg?.arrival) && (
          <span className="opacity-80">
            · {seg?.departure ?? "?"} → {seg?.arrival ?? "?"}
          </span>
        )}
        {seg?.distanceM != null && (
          <span className="opacity-80">· {formatDistance(seg.distanceM)}</span>
        )}
        {seg?.durationS != null && (
          <span className="opacity-80">· {formatDuration(seg.durationS)}</span>
        )}
        {!defined && <span className="opacity-70">· no transport chosen</span>}
      </div>
      {seg?.notes && (
        <p className="ml-1 mt-1 text-[11px] text-muted-foreground">{seg.notes}</p>
      )}
    </li>
  );
}

export function JourneyTimeline({ stops, segments, showDetails = true, renderAction, className }: Props) {
  if (stops.length === 0) return null;
  return (
    <ol className={`relative space-y-2 border-l-2 border-dashed border-muted pl-5 ${className ?? ""}`}>
      {stops.map((s, i) => {
        const isStart = s.isStart ?? i === 0;
        const isEnd = s.isEnd ?? i === stops.length - 1;
        const badge = isStart ? "A" : isEnd ? "B" : `${i}`;
        const badgeColor = isStart ? "bg-emerald-600" : isEnd ? "bg-red-600" : "bg-sky-500";
        const next = stops[i + 1];
        const seg = next ? segmentBetween(segments, s.id, next.id) : null;
        const r = s.rich ?? {};
        return (
          <div key={s.id ?? i}>
            <li className="relative">
              <span
                className={`absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${badgeColor}`}
              >
                {badge}
              </span>
              <div className="rounded-md border bg-card p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">
                    {isStart ? "Start · " : isEnd ? "Destination · " : ""}
                    {s.name}
                  </div>
                  {renderAction?.(i, s)}
                </div>
                {showDetails && (r.detailedDescription || r.shortDescription || r.description) && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {r.detailedDescription || r.shortDescription || r.description}
                  </p>
                )}
                {showDetails && Array.isArray(r.images) && r.images.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {r.images.map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt={`${s.name} ${idx + 1}`}
                        loading="lazy"
                        className="h-20 w-28 shrink-0 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
                {showDetails && (r.stayDuration || r.bestTimeToVisit || r.estimatedCost) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.stayDuration && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Clock className="h-3 w-3" />
                        {r.stayDuration}
                      </Badge>
                    )}
                    {r.bestTimeToVisit && (
                      <Badge variant="secondary" className="text-[10px]">🗓 {r.bestTimeToVisit}</Badge>
                    )}
                    {r.estimatedCost && (
                      <Badge variant="secondary" className="text-[10px]">💰 {r.estimatedCost}</Badge>
                    )}
                  </div>
                )}
                {showDetails && r.travelTips && (
                  <div className="mt-2 rounded border-l-2 border-primary/60 bg-primary/5 px-2 py-1 text-[11px]">
                    💡 {r.travelTips}
                  </div>
                )}
                {showDetails && r.warnings && (
                  <div className="mt-1.5 rounded border-l-2 border-amber-500 bg-amber-500/10 px-2 py-1 text-[11px]">
                    ⚠️ {r.warnings}
                  </div>
                )}
                {showDetails && r.thingsToCarry && (
                  <div className="mt-1.5 rounded border-l-2 border-emerald-500 bg-emerald-500/10 px-2 py-1 text-[11px]">
                    🎒 {r.thingsToCarry}
                  </div>
                )}
              </div>
            </li>
            {next && <TransportLeg seg={seg} />}
          </div>
        );
      })}
    </ol>
  );
}
