"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ReviewRadar } from "@/components/charts";
import { IconCamera, IconChevron } from "@/components/icons";
import { ArtistArt, Segmented } from "@/components/ui";
import { fmtShortDate } from "@/lib/format";
import type { RankedShow } from "@/types";

const TIER: Record<RankedShow["tier"], { badge: string; name: string }> = {
  S: { badge: "bg-gradient-to-br from-amber-300 to-orange-500 text-white", name: "All-timers" },
  A: { badge: "bg-accent text-white", name: "Great nights" },
  B: { badge: "bg-sky-500 text-white", name: "Solid" },
  C: { badge: "bg-sunken text-muted", name: "The rest" },
};

type Sort = "rank" | "venue" | "artist" | "date";

interface Group {
  key: string;
  title: string;
  badge?: RankedShow["tier"];
  shows: RankedShow[];
}

function groupShows(shows: RankedShow[], sort: Sort): Group[] {
  if (sort === "rank") {
    return (["S", "A", "B", "C"] as const)
      .map((t) => ({ key: t, title: TIER[t].name, badge: t, shows: shows.filter((s) => s.tier === t) }))
      .filter((g) => g.shows.length);
  }
  if (sort === "venue") {
    const byVenue = new Map<string, RankedShow[]>();
    for (const s of shows) byVenue.set(s.event.venue.name, [...(byVenue.get(s.event.venue.name) ?? []), s]);
    return Array.from(byVenue.entries())
      .map(([name, list]) => ({ key: name, title: name, shows: list.sort((a, b) => a.rank - b.rank) }))
      .sort((a, b) => a.shows[0].rank - b.shows[0].rank); // the venue with your best night first
  }
  if (sort === "artist") {
    return [{ key: "artist", title: "A → Z", shows: [...shows].sort((a, b) => a.event.artist.name.localeCompare(b.event.artist.name) || a.rank - b.rank) }];
  }
  return [{ key: "date", title: "Most recent first", shows: [...shows].sort((a, b) => b.event.start_at.localeCompare(a.event.start_at)) }];
}

/**
 * A user's ranked shows, sortable by rank (tiers), venue, artist, or date; tap a row for its radar.
 * Shows in `unrankedIds` only have a provisional review (logged, never rated) and get "Rank it" instead.
 */
export function RankedList({
  shows,
  unrankedIds,
  mediaCounts,
  mine = true,
}: {
  shows: RankedShow[];
  unrankedIds?: Set<string>;
  mediaCounts?: Record<string, number>;
  mine?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("rank");
  const groups = useMemo(() => groupShows(shows, sort), [shows, sort]);
  if (!shows.length) return null;

  return (
    <>
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: "rank", label: "Rank" },
          { value: "venue", label: "Venue" },
          { value: "artist", label: "Artist" },
          { value: "date", label: "Date" },
        ]}
      />
      {groups.map((g, gi) => (
        <section key={g.key} className="animate-rise space-y-2" style={{ animationDelay: `${60 + gi * 50}ms` }}>
          <div className="flex items-center gap-2.5 px-1">
            {g.badge ? (
              <span className={clsx("grid h-7 w-7 place-items-center rounded-lg text-sm font-black shadow-card", TIER[g.badge].badge)}>{g.badge}</span>
            ) : null}
            <span className="text-xs font-semibold text-muted">{g.title}</span>
            {sort === "venue" ? <span className="text-[11px] text-dim">· {g.shows.length}</span> : null}
            <span className="h-px flex-1 bg-line" />
          </div>
          {g.shows.map((s) => {
            const isOpen = open === s.event.id;
            const provisional = unrankedIds?.has(s.event.id) ?? false;
            return (
              <div key={s.event.id} className={clsx("card p-0 transition", isOpen && "shadow-lift")}>
                <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(isOpen ? null : s.event.id)}>
                  <span className="w-6 text-center text-sm font-bold tabular-nums text-dim">{s.rank}</span>
                  <ArtistArt name={s.event.artist.name} image={s.event.image_url} className="h-12 w-12 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold tracking-tight">{s.event.artist.name}</div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                      <span className="truncate">
                        {sort === "venue" ? fmtShortDate(s.event.start_at) : `${s.event.venue.name} · ${fmtShortDate(s.event.start_at)}`}
                      </span>
                      {mediaCounts?.[s.event.id] ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          <IconCamera size={11} /> {mediaCounts[s.event.id]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {sort !== "rank" ? <span className={clsx("grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black", TIER[s.tier].badge)}>{s.tier}</span> : null}
                  {provisional ? (
                    <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">Not ranked</span>
                  ) : (
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-sm font-semibold tabular-nums">{s.score.toFixed(1)}</span>
                  )}
                  <IconChevron size={16} className={clsx("text-dim transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen ? (
                  <div className="animate-pop border-t border-line/70 px-3 pb-3">
                    {provisional ? (
                      <p className="px-1 pb-3 pt-3 text-sm text-muted">You logged this one but haven&apos;t rated it yet — it sits at your average until you do.</p>
                    ) : (
                      <ReviewRadar theta={s.theta} />
                    )}
                    <div className="flex gap-2">
                      <Link href={`/events/${s.event.id}`} className="btn-ghost flex-1">
                        Show page
                      </Link>
                      {mine ? (
                        <Link href={`/review/${s.event.id}`} className={clsx("flex-1", provisional ? "btn-accent" : "btn-ghost")}>
                          {provisional ? "Rank it" : "Re-rank"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
