// exifr wrapper (AGENTS.md §8). Runs entirely in the browser: only {lat, lng, captured_at}
// ever leave the device.
import exifr from "exifr";

import type { MediaItem } from "@/types";

const PICK = [
  "DateTimeOriginal",
  "OffsetTimeOriginal",
  "GPSLatitude",
  "GPSLongitude",
  "GPSLatitudeRef",
  "GPSLongitudeRef",
];

type Raw = Record<string, unknown> & { latitude?: number; longitude?: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC offset like "-04:00" that America/New_York had at the given wall-clock time. */
function newYorkOffset(y: number, mo: number, d: number, h: number, mi: number): string {
  const approx = new Date(Date.UTC(y, mo - 1, d, h + 5, mi)); // within an hour of the real instant
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
    .formatToParts(approx)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = tz?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-05:00";
}

/** Wall-clock parts from exifr's revived Date (built in local time) or a raw "YYYY:MM:DD HH:MM:SS". */
function wallClock(v: unknown): [number, number, number, number, number, number] | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return [v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()];
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
    if (m) return [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  }
  return null;
}

function toDegrees(v: unknown, ref: unknown, negativeRef: string): number | null {
  let deg: number | null = null;
  if (typeof v === "number") deg = v;
  else if (Array.isArray(v) && v.length >= 1) deg = Number(v[0]) + Number(v[1] ?? 0) / 60 + Number(v[2] ?? 0) / 3600;
  if (deg === null || !isFinite(deg)) return null;
  return typeof ref === "string" && ref.toUpperCase().startsWith(negativeRef) ? -Math.abs(deg) : deg;
}

export async function readPhoto(file: File): Promise<MediaItem | null> {
  let raw: Raw | undefined;
  try {
    raw = await exifr.parse(file, { gps: true, pick: PICK });
  } catch {
    return null;
  }
  if (!raw) return null;

  const lat = typeof raw.latitude === "number" ? raw.latitude : toDegrees(raw.GPSLatitude, raw.GPSLatitudeRef, "S");
  const lng = typeof raw.longitude === "number" ? raw.longitude : toDegrees(raw.GPSLongitude, raw.GPSLongitudeRef, "W");
  const wc = wallClock(raw.DateTimeOriginal);
  if (lat === null || lng === null || !wc) return null;

  const [y, mo, d, h, mi, s] = wc;
  const offset =
    typeof raw.OffsetTimeOriginal === "string" && /^[+-]\d{2}:\d{2}$/.test(raw.OffsetTimeOriginal)
      ? raw.OffsetTimeOriginal
      : newYorkOffset(y, mo, d, h, mi);
  return { lat, lng, captured_at: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${offset}` };
}
