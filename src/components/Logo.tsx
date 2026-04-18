import { Shield } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-bold ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Shield className="h-4 w-4" />
      </div>
      <span className="text-lg tracking-tight">SafeGo</span>
    </div>
  );
}
