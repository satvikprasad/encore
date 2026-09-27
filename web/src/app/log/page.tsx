"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AddShowSheet } from "@/components/AddShowSheet";
import { IconChevron, IconPlus, IconTrophy } from "@/components/icons";
import { ArtistArt, ErrorNote, SearchField, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { Event, EventWithFriends } from "@/types";

/** Log a show: find a past show (or import from photos), mark it "went", rate it. */
export default function LogPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Log />
    </Suspense>
  );
}

function Log() {
  const { userId } = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("add") ?? "");
  const [adding, setAdding] = useState(params.has("add"));
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
  const addButton = (
    <button onClick={() => setAdding(true)} className="card flex w-full items-center gap-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-fg text-white">
        <IconPlus size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-tight">Can&apos;t find it? Add the show</span>
        <span className="block text-xs text-muted">Any artist, any venue, any date — past shows go straight to ranking.</span>
      </span>
      <IconChevron size={18} className="text-dim" />
    </button>
  );

  return (
    <>
      <TopBar title="Log a show" back="/" />
      <main className="space-y-5 px-4 pb-32 pt-2">
        <div className="px-1">
          <h1 className="display text-[32px] leading-none">Which show?</h1>
          <p className="mt-1.5 text-sm text-muted">Search a past show in Atlanta — or add one the calendars missed.</p>
        </div>
        <SearchField value={q} onChange={setQ} autoFocus placeholder="Artist or venue" />

        {!searching ? (
          <>
            <div className="animate-rise">{addButton}</div>

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
        {results?.length === 0 ? (
          <>
            <div className="card text-sm text-muted">No past shows match “{q.trim()}” in the calendars we track.</div>
            {addButton}
          </>
        ) : null}
        {results?.length ? (
          <section className="space-y-2">
            <div className="label px-1">Past shows</div>
            {results.map((e, i) => (
              <ShowPick key={e.id} event={e} busy={picking === e.id} disabled={!!picking} onPick={() => pick(e)} delay={i * 30} />
            ))}
            {addButton}
          </section>
        ) : null}
        <AddShowSheet userId={userId} open={adding} onClose={() => setAdding(false)} initialArtist={q.trim()} />
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
