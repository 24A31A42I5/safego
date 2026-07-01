import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2 } from "lucide-react";
import { TRANSPORT_OPTIONS, TRANSPORT_STYLE, type RouteSegment, type TransportType } from "@/lib/tour-stop";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromLabel: string;
  toLabel: string;
  existing: RouteSegment | null;
  onSave: (patch: Omit<RouteSegment, "id" | "fromId" | "toId" | "geometry" | "distanceM" | "durationS">) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

const FIELD_MAP: Record<TransportType, { operator?: string; number?: string; vehicleName?: string; driverName?: string }> = {
  bus:    { operator: "Bus operator", number: "Bus number" },
  train:  { operator: "Train name", number: "Train number" },
  flight: { operator: "Airline", number: "Flight number" },
  car:    { vehicleName: "Vehicle (optional)", driverName: "Driver (optional)" },
  taxi:   { vehicleName: "Vehicle (optional)", driverName: "Driver (optional)" },
  bike:   { vehicleName: "Bike (optional)" },
  walk:   {},
  other:  { operator: "Provider", number: "Reference" },
};

export function RouteSegmentDialog({ open, onOpenChange, fromLabel, toLabel, existing, onSave, onDelete }: Props) {
  const [transport, setTransport] = useState<TransportType>(existing?.transport ?? "car");
  const [operator, setOperator] = useState(existing?.operator ?? "");
  const [number, setNumber] = useState(existing?.number ?? "");
  const [vehicleName, setVehicleName] = useState(existing?.vehicleName ?? "");
  const [driverName, setDriverName] = useState(existing?.driverName ?? "");
  const [departure, setDeparture] = useState(existing?.departure ?? "");
  const [arrival, setArrival] = useState(existing?.arrival ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTransport(existing?.transport ?? "car");
      setOperator(existing?.operator ?? "");
      setNumber(existing?.number ?? "");
      setVehicleName(existing?.vehicleName ?? "");
      setDriverName(existing?.driverName ?? "");
      setDeparture(existing?.departure ?? "");
      setArrival(existing?.arrival ?? "");
      setNotes(existing?.notes ?? "");
    }
  }, [open, existing]);

  const fields = FIELD_MAP[transport];

  const submit = async () => {
    setBusy(true);
    try {
      await onSave({
        transport,
        operator: operator.trim() || undefined,
        number: number.trim() || undefined,
        vehicleName: vehicleName.trim() || undefined,
        driverName: driverName.trim() || undefined,
        departure: departure.trim() || undefined,
        arrival: arrival.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Route segment</DialogTitle>
          <DialogDescription className="truncate">
            {fromLabel} → {toLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Transport mode</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {TRANSPORT_OPTIONS.map((o) => {
                const active = transport === o.type;
                const style = TRANSPORT_STYLE[o.type];
                return (
                  <button
                    key={o.type}
                    type="button"
                    onClick={() => setTransport(o.type)}
                    className={`flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs transition ${active ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
                    style={active ? { borderColor: style.color, boxShadow: `inset 0 -3px 0 ${style.color}` } : undefined}
                  >
                    <span className="text-lg leading-none">{o.icon}</span>
                    <span>{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(fields.operator || fields.vehicleName) && (
            <div className="space-y-1">
              <Label className="text-xs">{fields.operator ?? fields.vehicleName}</Label>
              <Input
                value={fields.operator ? operator : vehicleName}
                onChange={(e) => (fields.operator ? setOperator(e.target.value) : setVehicleName(e.target.value))}
                placeholder={fields.operator ? "e.g. Vande Bharat / IndiGo" : "e.g. Toyota Innova"}
              />
            </div>
          )}
          {fields.number && (
            <div className="space-y-1">
              <Label className="text-xs">{fields.number}</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 20607 / 6E-234" />
            </div>
          )}
          {fields.driverName && (
            <div className="space-y-1">
              <Label className="text-xs">{fields.driverName}</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Departure</Label>
              <Input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="06:00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Arrival</Label>
              <Input value={arrival} onChange={(e) => setArrival(e.target.value)} placeholder="12:30" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Platform, seat, booking ref…" rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {existing && onDelete ? (
            <Button variant="ghost" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save segment
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
