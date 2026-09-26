"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AvatarStack, ErrorNote, EventRow, Spinner, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName, fmtPriceRange } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { EventWithFriends } from "@/types";

export default function Home() {
  const { users, user, userId, setUserId } = useUser();
  const [feed, setFeed] = useState<EventWithFriends[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setFeed(null);
    api.eventsUpcoming(userId).then(setFeed, setError);
  }, [userId]);

  return (
    <main className="space-y-5 px-4 pb-10 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-black tracking-tight">
            encore<span className="text-accent">.</span>
          </div>
          <div className="text-xs text-muted">Who are you going with?</div>
        </div>
        <label className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-3 text-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-raised text-base">{user?.avatar ?? "🙂"}</span>
          <select
            aria-label="Switch user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="max-w-[110px] cursor-pointer bg-transparent font-medium outline-none"
          >
            {(users.length ? users : [{ id: userId, name: userId }]).map((u) => (
              <option key={u.id} value={u.id} className="bg-card">
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {user ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          Hey {firstName(user.name)} {user.verified ? <VerifiedBadge /> : <span className="text-xs text-dim">· not verified</span>}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/import" className="card group flex flex-col gap-3 bg-gradient-to-br from-accent/40 to-card transition hover:from-accent/50">
          <span className="text-2xl">📸</span>
          <span className="font-semibold leading-tight">Import from camera roll</span>
          <span className="text-xs text-muted">Find the shows you&apos;ve been to</span>
        </Link>
        <Link href="/rank" className="card flex flex-col gap-3 transition hover:bg-raised">
          <span className="text-2xl">🎟️</span>
          <span className="font-semibold leading-tight">Log a show</span>
          <span className="text-xs text-muted">Review &amp; rank your shows</span>
        </Link>
      </div>

      <section className="space-y-3">
        <div className="label">Friends are going</div>
        {error ? <ErrorNote error={error} /> : null}
        {!feed && !error ? <Spinner /> : null}
        {feed?.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            href={`/events/${e.id}`}
            sub={
              e.friends_interested.length ? (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  <AvatarStack users={e.friends_interested} size={20} />
                  {e.friends_interested.map((f) => firstName(f.name)).join(", ")} interested
                </div>
              ) : null
            }
            right={<span className="text-xs font-medium text-muted">{fmtPriceRange(e)}</span>}
          />
        ))}
      </section>
    </main>
  );
}
