import { useEffect, useState } from "react";

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

/** Battery percentage 0-100 or null if the API is unavailable. */
export function useBattery(): { level: number | null; charging: boolean | null } {
  const [state, setState] = useState<{ level: number | null; charging: boolean | null }>({
    level: null,
    charging: null,
  });

  useEffect(() => {
    let bat: BatteryLike | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    const update = () => {
      if (!bat || cancelled) return;
      setState({ level: Math.round(bat.level * 100), charging: bat.charging });
    };
    nav.getBattery().then((b) => {
      if (cancelled) return;
      bat = b;
      update();
      b.addEventListener?.("levelchange", update);
      b.addEventListener?.("chargingchange", update);
    });
    return () => {
      cancelled = true;
      bat?.removeEventListener?.("levelchange", update);
      bat?.removeEventListener?.("chargingchange", update);
    };
  }, []);

  return state;
}

/** navigator.onLine with reactive updates. */
export function useOnline() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
