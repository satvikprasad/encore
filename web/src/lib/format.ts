import type { Event } from "@/types";

// Show dates in the venue's local time (all venues are Atlanta).
const TZ = "America/New_York";

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TZ });
}

export function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

export function fmtMoney(x: number): string {
  return Number.isInteger(x) ? `$${x}` : `$${x.toFixed(2)}`;
}

export function fmtPriceRange(e: Pick<Event, "price_min" | "price_max">): string | null {
  const { price_min: lo, price_max: hi } = e;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null && lo !== hi) return `${fmtMoney(lo)}–${fmtMoney(hi)}`;
  return fmtMoney((lo ?? hi) as number);
}

export function firstName(name: string): string {
  return name.split(" ")[0];
}
