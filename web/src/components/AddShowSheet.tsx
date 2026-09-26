"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconCheck, IconMusic } from "@/components/icons";
import { Avatar, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import type { ArtistHit, Venue } from "@/types";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

/**
 * "Can't find it? Add the show." — for anything the calendars didn't have: a past show to rank,
 * or an upcoming one to save. Artist names autocomplete from Deezer (with pictures); a venue we
 * don't know is geocoded and added.
 */
export function AddShowSheet({ userId, open, onClose, initialArtist = "" }: { userId: string; open: boolean; onClose: () => void; initialArtist?: string }) {
  const router = useRouter();
  const [artist, setArtist] = useState(initialArtist);
  const [hits, setHits] = useState<ArtistHit[]>([]);
  const [picked, setPicked] = useState<ArtistHit | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("20:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const artistInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setArtist(initialArtist);
      setPicked(null);
      setError(null);
      // Focus without letting the browser scroll the page behind the phone frame.
      const t = setTimeout(() => artistInput.current?.focus({ preventScroll: true }), 50);
      return () => clearTimeout(t);
    }
  }, [open, initialArtist]);

  // The venues we know, from the calendar (the seven demo venues plus anything users added).
  useEffect(() => {
    if (!open || venues.length) return;
    api.eventsUpcoming(userId).then((list) => {
      const byId = new Map<string, Venue>();
      for (const e of list) byId.set(e.venue.id, e.venue);
      setVenues(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }, () => {});
  }, [open, userId, venues.length]);

  // Artist autocomplete, debounced.
  useEffect(() => {
    if (picked && picked.name === artist) return;
    const q = artist.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => api.searchArtists(q).then((h) => live && setHits(h), () => {}), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [artist, picked]);

  const isPast = useMemo(() => date < today(), [date]);
  const canSubmit = artist.trim().length > 0 && (venueId || venueName.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(date) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const event = await api.createEvent(userId, { artist: picked?.name ?? artist.trim(), venue: venueId || venueName.trim(), date, time });
      if (event.is_past) {
        await api.setAttendance(userId, event.id, "attended");
        router.push(`/review/${event.id}`);
      } else {
        router.push(`/events/${event.id}`);
      }
      onClose();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "venue_not_found" ? "We couldn't find that venue on the map — try adding the city or a nearby landmark." : "Couldn't add the show. Check the details and try again.");
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-dim focus:border-accent";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex items-center gap-2 text-accent">
        <IconMusic size={18} />
        <span className="label text-accent">Add a show</span>
      </div>
      <h2 className="display mt-2 text-[28px] leading-[1.05]">Who did you see, and where?</h2>
      <p className="mt-1 text-sm text-muted">Anything the calendars missed. Past shows go straight to ranking.</p>

      <div className="mt-4 space-y-3">
        <div className="relative">
          <input
            ref={artistInput}
            value={artist}
            onChange={(e) => {
              setArtist(e.target.value);
              setPicked(null);
            }}
            placeholder="Artist"
            className={field}
          />
          {picked ? (
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {picked.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked.picture} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : null}
              <IconCheck size={16} className="text-good" strokeWidth={2.6} />
            </span>
          ) : null}
          {hits.length && !picked ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-lift">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(h);
                      setArtist(h.name);
                      setHits([]);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-sunken"
                  >
                    {h.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.picture} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <Avatar user={{ name: h.name, avatar: "" }} size={32} />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                    {h.fans ? <span className="shrink-0 text-[11px] text-dim">{Intl.NumberFormat("en", { notation: "compact" }).format(h.fans)} fans</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={clsx(field, "appearance-none")}>
          <option value="">Somewhere else… (type it below)</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {!venueId ? <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Venue name (we'll find it on the map)" className={field} /> : null}

        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} max="2030-12-31" onChange={(e) => setDate(e.target.value)} className={field} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </div>

        {error ? <p className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</p> : null}

        <button onClick={submit} disabled={!canSubmit} className="btn-primary w-full">
          {busy ? "Adding…" : isPast ? "Add & rank it" : "Add show"}
        </button>
      </div>
    </Sheet>
  );
}
