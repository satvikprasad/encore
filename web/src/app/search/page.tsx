"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { IconBookmark, IconCheck } from "@/components/icons";
import { PersonRow } from "@/components/PersonRow";
import { ArtistArt, AvatarStack, ErrorNote, SearchField, Segmented, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName, fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { AttendanceStatus, EventWithFriends, PersonCard, UserProfile } from "@/types";

type Tab = "shows" | "people";

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const { userId } = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "people" ? "people" : "shows");
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "shows") p.set("tab", tab);
    if (q) p.set("q", q);
    const qs = p.toString();
    router.replace(`/search${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [tab, q, router]);

  return (
    <main className="space-y-4 px-4 pb-32 pt-14">
      <h1 className="display px-1 text-[34px] leading-none">Search</h1>
      <SearchField value={q} onChange={setQ} autoFocus placeholder={tab === "shows" ? "Artist, venue or genre" : "Name"} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "shows", label: "Shows" },
          { value: "people", label: "People" },
        ]}
      />
      {tab === "shows" ? <Shows userId={userId} q={q} /> : <People userId={userId} q={q} />}
    </main>
  );
}

/** The caller's marks, derived from their own profile: upcoming → interested/going, ranked → attended. */
function useMyStatuses(userId: string) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  useEffect(() => {
    api.userProfile(userId, userId).then((p: UserProfile) => {
      const map: Record<string, AttendanceStatus> = {};
      for (const s of p.shows) map[s.event.id] = "attended";
      for (const u of p.upcoming) map[u.event.id] = u.status;
      setStatuses(map);
    }, () => {});
  }, [userId]);
  return [statuses, setStatuses] as const;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Shows({ userId, q }: { userId: string; q: string }) {
  const needle = useDebounced(q.trim(), 200);
  const [results, setResults] = useState<EventWithFriends[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [statuses, setStatuses] = useMyStatuses(userId);

  useEffect(() => {
    let live = true;
    setResults(null);
    const p = needle ? api.eventsSearch(userId, needle) : api.eventsUpcoming(userId).then((l) => l.slice(0, 25));
    p.then((r) => live && setResults(r), (e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [userId, needle]);

  async function quick(e: EventWithFriends, next: AttendanceStatus | null) {
    const prev = statuses[e.id];
    setStatuses((s) => {
      const copy = { ...s };
      if (next) copy[e.id] = next;
      else delete copy[e.id];
      return copy;
    });
    try {
      await api.setAttendance(userId, e.id, next);
    } catch (err) {
      setStatuses((s) => (prev ? { ...s, [e.id]: prev } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== e.id))));
      setError(err);
    }
  }

  return (
    <section className="space-y-2">
      <div className="label px-1">{needle ? `Results for “${needle}”` : "Upcoming in Atlanta"}</div>
      {error ? <ErrorNote error={error} /> : null}
      {!results && !error ? <Spinner /> : null}
      {results?.length === 0 ? (
        <div className="card space-y-3 text-sm text-muted">
          <p>No shows match “{needle}” in the calendars we track.</p>
          <Link href={`/log?add=${encodeURIComponent(needle)}`} className="btn-primary w-full">
            Add “{needle}” as a show
          </Link>
        </div>
      ) : null}
      {results?.map((e, i) => {
        const st = statuses[e.id] ?? null;
        return (
          <div key={e.id} className="card animate-rise flex items-center gap-3 p-3" style={{ animationDelay: `${i * 30}ms` }}>
            <Link href={`/events/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <ArtistArt name={e.artist.name} image={e.image_url} className="h-[52px] w-[52px] text-lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold tracking-tight">{e.artist.name}</div>
                <div className="truncate text-xs text-muted">
                  {e.venue.name} · {fmtShortDate(e.start_at)}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  <span className={clsx("rounded-full px-1.5 py-0.5 font-semibold", e.is_past ? "bg-sunken text-muted" : "bg-accent-soft text-accent")}>
                    {e.is_past ? "Past" : "Upcoming"}
                  </span>
                  {e.friends_interested.length ? (
                    <span className="flex items-center gap-1 truncate text-muted">
                      <AvatarStack users={e.friends_interested} size={16} />
                      {e.friends_interested.map((f) => firstName(f.name)).join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
            {e.is_past ? (
              st === "attended" ? (
                <Link href={`/review/${e.id}`} className="shrink-0 rounded-full bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                  ✓ Went
                </Link>
              ) : (
                <button onClick={() => quick(e, "attended")} className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold hover:border-fg/25">
                  Went
                </button>
              )
            ) : (
              <button
                aria-label={st ? "Remove" : "Want to go"}
                onClick={() => quick(e, st ? null : "interested")}
                className={clsx(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
                  st ? "border-fg bg-fg text-white" : "border-line bg-surface text-muted hover:border-fg/25 hover:text-fg",
                )}
              >
                {st === "going" ? <IconCheck size={17} strokeWidth={2.4} /> : <IconBookmark size={17} strokeWidth={st ? 2.4 : 1.8} />}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function People({ userId, q }: { userId: string; q: string }) {
  const needle = useDebounced(q.trim(), 200);
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let live = true;
    setPeople(null);
    api.people(userId, needle).then((r) => live && setPeople(r), (e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [userId, needle]);

  const sections = useMemo(() => {
    if (!people) return [];
    if (needle) return [{ title: `Results for “${needle}”`, rows: people }];
    return [
      { title: "Following", rows: people.filter((p) => p.following) },
      { title: "Suggested for you", rows: people.filter((p) => !p.following) },
    ].filter((s) => s.rows.length);
  }, [people, needle]);

  function setFollowing(id: string, following: boolean) {
    setPeople((list) => list?.map((p) => (p.user.id === id ? { ...p, following } : p)) ?? list);
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNote error={error} /> : null}
      {!people && !error ? <Spinner /> : null}
      {people?.length === 0 ? <div className="card text-sm text-muted">Nobody named “{needle}” yet.</div> : null}
      {sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <div className="label px-1">{s.title}</div>
          {s.rows.map((p, i) => (
            <div key={p.user.id} className="animate-rise" style={{ animationDelay: `${i * 30}ms` }}>
              <PersonRow person={p} userId={userId} onFollowChange={(f) => setFollowing(p.user.id, f)} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
