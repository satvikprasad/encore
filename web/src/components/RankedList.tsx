"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import { ReviewRadar } from "@/components/charts";
import { IconCamera, IconChevron } from "@/components/icons";
import { ArtistArt } from "@/components/ui";
import { fmtShortDate } from "@/lib/format";
import type { RankedShow } from "@/types";

const TIER: Record<RankedShow["tier"], { badge: string; name: string }> = {
  S: { badge: "bg-gradient-to-br from-amber-300 to-orange-500 text-white", name: "All-timers" },
  A: { badge: "bg-accent text-white", name: "Great nights" },
  B: { badge: "bg-sky-500 text-white", name: "Solid" },
  C: { badge: "bg-sunken text-muted", name: "The rest" },
};

/**
 * A user's ranked shows grouped into tiers; tap a row for its radar. Shows in `unrankedIds`
 * only have a provisional review (imported, never rated) and get a "Rank it" action instead.
 */
export function RankedList({ shows, unrankedIds, mediaCounts, mine = true }: { shows: RankedShow[]; unrankedIds?: Set<string>; mediaCounts?: Record<string, number>; mine?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const tiers = (["S", "A", "B", "C"] as const)
    .map((t) => ({ tier: t, shows: shows.filter((s) => s.tier === t) }))
    .filter((t) => t.shows.length);

  return (
    <>
      {tiers.map(({ tier, shows: rows }, ti) => (
        <section key={tier} className="animate-rise space-y-2" style={{ animationDelay: `${80 + ti * 60}ms` }}>
          <div className="flex items-center gap-2.5 px-1">
            <span className={clsx("grid h-7 w-7 place-items-center rounded-lg text-sm font-black shadow-card", TIER[tier].badge)}>{tier}</span>
            <span className="text-xs font-semibold text-muted">{TIER[tier].name}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {rows.map((s) => {
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
                        {s.event.venue.name} · {fmtShortDate(s.event.start_at)}
                      </span>
                      {mediaCounts?.[s.event.id] ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          <IconCamera size={11} /> {mediaCounts[s.event.id]}
                        </span>
                      ) : null}
                    </div>
                  </div>
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
                      <p className="px-1 pb-3 pt-3 text-sm text-muted">We know you went, but you haven&apos;t rated it yet — it sits at your average until you do.</p>
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
