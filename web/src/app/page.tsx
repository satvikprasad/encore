"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconCamera, IconChevron, IconSearch, IconSparkle, IconTrophy } from "@/components/icons";
import { RankPrompt } from "@/components/RankPrompt";
import { ArtistArt, Avatar, AvatarStack, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName, fmtPriceRange, fmtShortDate, sellerName } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { RecommendedEvent } from "@/types";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { user, userId } = useUser();
  const [feed, setFeed] = useState<RecommendedEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setFeed(null);
    api.eventsRecommended(userId).then(setFeed, setError);
  }, [userId]);

  return (
    <main className="space-y-5 px-4 pb-32 pt-14">
      <header className="flex items-center justify-between">
        <div>
          <div className="display text-[34px] leading-none">
            encore<span className="text-accent">.</span>
          </div>
          <div className="mt-1.5 text-sm text-muted">
            {greeting()}
            {user ? `, ${firstName(user.name)}` : ""}
          </div>
        </div>
        <Link href="/profile" aria-label="Your profile" className="rounded-full ring-2 ring-surface shadow-card transition hover:scale-105">
          {user ? <Avatar user={user} size={44} /> : <span className="block h-11 w-11 rounded-full bg-sunken" />}
        </Link>
      </header>

      <Link
        href="/search"
        className="flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-[15px] text-dim shadow-card transition hover:border-fg/20"
      >
        <IconSearch size={18} className="text-muted" />
        Search artists, venues, people
      </Link>

      <RankPrompt userId={userId} />

      <section className="animate-rise relative overflow-hidden rounded-3xl bg-fg p-4 text-white shadow-lift">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-accent opacity-80 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-coral opacity-60 blur-2xl" />
        <div className="relative">
          <div className="display text-[26px] leading-none">Been to a show?</div>
          <p className="mt-1.5 text-xs text-white/70">Log it, rate it, and it lands in your ranking.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/log" className="flex items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-fg transition hover:bg-white/90">
              <IconTrophy size={17} /> Log a show
            </Link>
            <Link href="/import" className="flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/15">
              <IconCamera size={17} /> Camera roll
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          right={
            <Link href="/search" className="flex items-center gap-0.5 text-xs font-semibold text-accent">
              All upcoming <IconChevron size={14} />
            </Link>
          }
        >
          For you
        </SectionTitle>
        <p className="-mt-2 px-1 text-xs text-muted">Top picks from who&apos;s going, fans with your taste, and where you&apos;ve been.</p>
        {error ? <ErrorNote error={error} /> : null}
        {!feed && !error ? <Spinner /> : null}
        {feed?.length === 0 ? <div className="card text-sm text-muted">Nothing upcoming yet — follow a few people to fill this up.</div> : null}
        {feed?.map((e, i) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className="card animate-rise flex items-center gap-3.5 p-3 transition hover:-translate-y-0.5 hover:shadow-lift"
            style={{ animationDelay: `${120 + i * 50}ms` }}
          >
            <ArtistArt name={e.artist.name} image={e.image_url} className="h-16 w-16 text-2xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold tracking-tight">{e.artist.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{fmtPriceRange(e) ?? sellerName(e.tm_url) ?? ""}</span>
              </div>
              <div className="truncate text-xs text-muted">
                {e.venue.name} · {fmtShortDate(e.start_at)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                {e.friends_interested.length ? <AvatarStack users={e.friends_interested} size={18} /> : <IconSparkle size={14} className="shrink-0 text-accent" />}
                <span className="line-clamp-2 font-medium leading-snug text-accent-deep">{e.reason}</span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
