import { Link, useLocation } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating SOS button visible across authenticated tourist routes.
 * Tapping opens the full Emergency Center (hold-to-activate lives there).
 */
export function SOSFab() {
  const location = useLocation();
  if (location.pathname.startsWith("/tourist/emergency")) return null;

  return (
    <Link
      to="/tourist/emergency"
      aria-label="Open emergency center"
      className={cn(
        "fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full",
        "bg-destructive text-destructive-foreground shadow-lg ring-4 ring-destructive/25",
        "transition-transform hover:scale-105 active:scale-95",
        "sm:bottom-6 sm:right-6"
      )}
    >
      <AlertTriangle className="h-6 w-6" />
      <span className="sr-only">SOS</span>
      <span className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full bg-destructive/40" />
    </Link>
  );
}
