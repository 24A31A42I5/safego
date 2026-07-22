import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HoldToSOSButtonProps {
  onTrigger: () => void | Promise<void>;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}

/**
 * Press-and-hold safety button. Prevents accidental SOS triggering.
 * - Requires `holdMs` (default 3s) of continuous press.
 * - Haptic vibration on start, tick, and confirm (where supported).
 * - Countdown overlay + progress ring so the user sees intent.
 * - Releasing early aborts cleanly.
 */
export function HoldToSOSButton({
  onTrigger,
  holdMs = 3000,
  disabled = false,
  className,
  label = "Hold to send SOS",
}: HoldToSOSButtonProps) {
  const [progress, setProgress] = useState(0); // 0..1
  const [firing, setFiring] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    if (!firedRef.current) setProgress(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const tick = useCallback(
    (t: number) => {
      if (startRef.current == null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / holdMs);
      setProgress(p);
      if (p >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          setFiring(true);
          try {
            navigator.vibrate?.([120, 60, 200]);
          } catch {
            // no-op
          }
          Promise.resolve(onTrigger()).finally(() => {
            firedRef.current = false;
            setFiring(false);
            setProgress(0);
          });
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [holdMs, onTrigger]
  );

  const begin = () => {
    if (disabled || firedRef.current) return;
    try {
      navigator.vibrate?.(30);
    } catch {
      // no-op
    }
    startRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
  };

  const end = () => {
    if (firedRef.current) return;
    stop();
  };

  const seconds = Math.max(0, Math.ceil(((1 - progress) * holdMs) / 1000));
  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          end();
        }
      }}
      className={cn(
        "relative h-20 select-none overflow-hidden rounded-md bg-destructive text-destructive-foreground shadow transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to right, hsl(var(--destructive) / 0.6) ${pct}%, hsl(var(--destructive)) ${pct}%)`,
      }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <AlertTriangle className="h-5 w-5" />
        {progress > 0 && !firing ? (
          <span className="text-xs font-semibold tabular-nums">
            Keep holding… {seconds}s
          </span>
        ) : firing ? (
          <span className="text-xs font-semibold">Sending SOS…</span>
        ) : (
          <span className="text-xs sm:text-sm font-medium">{label}</span>
        )}
      </div>
    </button>
  );
}
