"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { IconCamera, IconLock, IconTrophy } from "@/components/icons";
import { ArtistArt, ErrorNote, SearchField, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { Event, EventWithFriends } from "@/types";

/** Log a show: find a past show (or import from photos), mark it "went", rate it. */
export default function LogPage() {
  const { userId } = useUser();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<EventWithFriends[] | null>(null);
  const [pending, setPending] = useState<Event[] | null>(null);
  const [recent, setRecent] = useState<Event[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.unranked(userId).then(setPending, () => setPending([]));
    api.eventsPast(userId, 12).then(setRecent, () => setRecent([]));
  }, [userId]);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api.eventsSearch(userId, needle, 60).then(
        (r) => live && setResults(r.filter((e) => e.is_past)),
        (e) => live && setError(e),
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [userId, q]);

  async function pick(e: Event) {
    setPicking(e.id);
    try {
      await api.setAttendance(userId, e.id, "attended");
      router.push(`/review/${e.id}`);
    } catch (err) {
      setError(err);
      setPicking(null);
    }
  }

  const searching = q.trim().length > 0;
  const pendingIds = new Set(pending?.map((e) => e.id) ?? []);

  return (
    <>
      <TopBar title="Log a show" back="/" />
      <main className="space-y-5 px-4 pb-32 pt-2">
        <div className="px-1">
          <h1 className="display text-[32px] leading-none">Which show?</h1>
          <p className="mt-1.5 text-sm text-muted">Search a past show in Atlanta, or let your photos find them.</p>
        </div>
        <SearchField value={q} onChange={setQ} autoFocus placeholder="Artist or venue" />

        {!searching ? (
          <>
            <Link
              href="/import"
              className="animate-rise relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-[28px] bg-fg p-5 text-white shadow-lift transition hover:-translate-y-0.5"
            >
              <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-accent opacity-80 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-coral opacity-60 blur-3xl" />
              <div className="pointer-events-none absolute right-5 top-5 flex -space-x-3">
                {[-14, 0, 14].map((rot, i) => (
                  <span
                    key={rot}
                    className="block h-16 w-12 rounded-lg border-2 border-white/90 shadow-lift"
                    style={{ transform: `rotate(${rot}deg) translateY(${i === 1 ? -6 : 0}px)`, background: `linear-gradient(160deg, hsl(${262 + i * 60} 80% 70%), hsl(${300 + i * 60} 70% 45%))` }}
                  />
                ))}
              </div>
              <span className="relative grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur">
                <IconCamera size={22} />
              </span>
              <div className="relative">
                <div className="display text-[28px] leading-none">Import from camera roll</div>
                <p className="mt-2 max-w-[260px] text-xs leading-relaxed text-white/70">
                  Pick your concert photos and we match when and where each was taken to a show. Two photos are usually enough.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/60">
                  <IconLock size={12} /> Photos never leave your device.
                </p>
              </div>
            </Link>

            {pending?.length ? (
              <section className="animate-rise space-y-2" style={{ animationDelay: "60ms" }}>
                <div className="label px-1">Went, not ranked yet</div>
                {pending.map((e) => (
                  <Link key={e.id} href={`/review/${e.id}`} className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <ArtistArt name={e.artist.name} image={e.image_url} className="h-12 w-12 text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold tracking-tight">{e.artist.name}</div>
                      <div className="truncate text-xs text-muted">
                        {e.venue.name} · {fmtShortDate(e.start_at)}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                      <IconTrophy size={13} /> Rank
                    </span>
                  </Link>
                ))}
              </section>
            ) : null}

            <section className="animate-rise space-y-2" style={{ animationDelay: "120ms" }}>
              <div className="flex items-baseline justify-between px-1">
                <span className="label">Recently in Atlanta</span>
                <span className="text-[11px] text-dim">tap one you were at</span>
              </div>
              {recent === null ? <Spinner /> : null}
              {recent?.filter((e) => !pendingIds.has(e.id)).map((e, i) => (
                <ShowPick key={e.id} event={e} busy={picking === e.id} disabled={!!picking} onPick={() => pick(e)} delay={i * 30} />
              ))}
            </section>
          </>
        ) : null}

        {error ? <ErrorNote error={error} /> : null}
        {searching && !results && !error ? <Spinner /> : null}
        {results?.length === 0 ? <div className="card text-sm text-muted">No past shows match “{q.trim()}”.</div> : null}
        {results?.length ? (
          <section className="space-y-2">
            <div className="label px-1">Past shows</div>
            {results.map((e, i) => (
              <ShowPick key={e.id} event={e} busy={picking === e.id} disabled={!!picking} onPick={() => pick(e)} delay={i * 30} />
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}

function ShowPick({ event: e, busy, disabled, onPick, delay }: { event: Event; busy: boolean; disabled: boolean; onPick: () => void; delay: number }) {
  return (
    <button
      disabled={disabled}
      onClick={onPick}
      className="card animate-rise flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60"
      style={{ animationDelay: `${delay}ms` }}
    >
      <ArtistArt name={e.artist.name} image={e.image_url} className="h-12 w-12 text-lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-tight">{e.artist.name}</div>
        <div className="truncate text-xs text-muted">
          {e.venue.name} · {fmtShortDate(e.start_at)}
        </div>
      </div>
      <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold">{busy ? "Saving…" : "I went"}</span>
    </button>
  );
}
