"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PreferenceBars, ReviewRadar } from "@/components/charts";
import { ArtistArt, ErrorNote, Page, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { RankedShow, Ranking } from "@/types";

const TIER_STYLE: Record<RankedShow["tier"], string> = {
  S: "bg-gradient-to-br from-amber-300 to-orange-500 text-black",
  A: "bg-accent text-white",
  B: "bg-sky-500/80 text-white",
  C: "bg-raised text-muted",
};

export default function RankPage() {
  const { userId } = useUser();
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.rank(userId).then(setRanking, setError);
  }, [userId]);

  const tiers = (["S", "A", "B", "C"] as const)
    .map((t) => ({ tier: t, shows: ranking?.shows.filter((s) => s.tier === t) ?? [] }))
    .filter((t) => t.shows.length);

  return (
    <>
      <TopBar title="Your shows" back="/" />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!ranking && !error ? <Spinner /> : null}
        {ranking ? (
          <>
            <section className="card">
              <div className="mb-1 flex items-center justify-between">
                <span className="label">What you care about</span>
                <span className="text-[11px] text-dim">{ranking.comparisons_done} comparisons</span>
              </div>
              <PreferenceBars weights={ranking.weights} />
            </section>

            {ranking.shows.length === 0 ? (
              <div className="card text-center text-sm text-muted">
                No reviewed shows yet.{" "}
                <Link href="/import" className="text-accent">
                  Import from your camera roll
                </Link>
              </div>
            ) : null}

            {tiers.map(({ tier, shows }) => (
              <section key={tier} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={clsx("grid h-7 w-7 place-items-center rounded-lg text-sm font-black", TIER_STYLE[tier])}>{tier}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                {shows.map((s) => (
                  <div key={s.event.id} className="card p-0">
                    <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(open === s.event.id ? null : s.event.id)}>
                      <span className="w-5 text-center text-sm font-bold text-dim">{s.rank}</span>
                      <ArtistArt name={s.event.artist.name} className="h-11 w-11 text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{s.event.artist.name}</div>
                        <div className="truncate text-xs text-muted">
                          {s.event.venue.name} · {fmtShortDate(s.event.start_at)}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{s.score.toFixed(1)}</span>
                    </button>
                    {open === s.event.id ? (
                      <div className="animate-pop border-t border-line/60 px-3 pb-3">
                        <ReviewRadar theta={s.theta} />
                        <Link href={`/review/${s.event.id}`} className="btn-ghost w-full">
                          Re-review
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
            ))}
          </>
        ) : null}
      </Page>
    </>
  );
}
