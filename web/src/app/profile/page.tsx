"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { PreferenceBars } from "@/components/charts";
import { IconBookmark, IconCheck, IconChevron, IconShield } from "@/components/icons";
import { PersonRow } from "@/components/PersonRow";
import { RankedList } from "@/components/RankedList";
import { Avatar, ErrorNote, EventRow, Spinner, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user";
import type { Event, PersonCard, UserProfile } from "@/types";

type Tab = "ranked" | "want" | "going" | "following";

export default function ProfilePage() {
  const { users, user, userId, setUserId } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [unranked, setUnranked] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<PersonCard[] | null>(null);
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>("ranked");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setProfile(null);
    setFollowing(null);
    api.userProfile(userId, userId).then(setProfile, setError);
    api.unranked(userId).then((l: Event[]) => setUnranked(new Set(l.map((e) => e.id))), () => {});
    api.people(userId).then((p) => setFollowing(p.filter((x) => x.following)), () => setFollowing([]));
    api.userMedia(userId, userId).then((list) => {
      const counts: Record<string, number> = {};
      for (const m of list) counts[m.event.id] = (counts[m.event.id] ?? 0) + 1;
      setMediaCounts(counts);
    }, () => {});
  }, [userId]);

  const u = profile?.user ?? user;
  const want = profile?.upcoming.filter((x) => x.status === "interested") ?? [];
  const going = profile?.upcoming.filter((x) => x.status === "going") ?? [];
  const ranked = profile?.shows.filter((s) => !unranked.has(s.event.id)).length ?? 0;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "ranked", label: "Ranked", count: ranked },
    { value: "want", label: "Want to go", count: want.length },
    { value: "going", label: "Going", count: going.length },
    { value: "following", label: "Following", count: following?.length ?? profile?.following_count ?? 0 },
  ];

  function unfollow(id: string) {
    setFollowing((list) => list?.filter((p) => p.user.id !== id) ?? list);
    setProfile((p) => (p ? { ...p, following_count: Math.max(0, p.following_count - 1) } : p));
  }

  return (
    <main className="space-y-5 px-4 pb-32 pt-14">
      {u ? (
        <header className="flex items-center gap-4 px-1">
          <Avatar user={u} size={68} className="shadow-card" />
          <div className="min-w-0 flex-1">
            <h1 className="display truncate text-[30px] leading-none">{u.name}</h1>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              {u.verified ? (
                <VerifiedBadge />
              ) : (
                <Link href="/verify?returnTo=%2Fprofile" className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  <IconShield size={11} /> Verify ID
                </Link>
              )}
              {profile ? (
                <span>
                  {profile.followers} follower{profile.followers === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      {/* Stat tiles double as the tab switcher, Beli-style. */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {tabs.map((t) => {
          const on = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={clsx(
                "rounded-3xl border px-1 py-3 transition active:scale-[0.97]",
                on ? "border-fg bg-fg text-white shadow-lift" : "border-line/70 bg-surface shadow-card hover:border-fg/20",
              )}
            >
              <div className="display text-[24px] leading-none">{profile ? t.count : "–"}</div>
              <div className={clsx("mt-1 text-[10px] font-semibold uppercase tracking-wider", on ? "text-white/70" : "text-dim")}>{t.label}</div>
            </button>
          );
        })}
      </div>

      {error ? <ErrorNote error={error} /> : null}
      {!profile && !error ? <Spinner /> : null}

      {profile && tab === "ranked" ? (
        <>
          <section className="card animate-rise">
            <div className="mb-1 flex items-center justify-between">
              <span className="label">What you care about</span>
              <span className="text-[11px] text-dim">from your comparisons</span>
            </div>
            <PreferenceBars weights={profile.user.weights} />
          </section>
          {profile.shows.length === 0 ? (
            <div className="card text-sm text-muted">
              No shows yet.{" "}
              <Link href="/log" className="font-semibold text-accent">
                Log your first one
              </Link>
            </div>
          ) : null}
          {unranked.size ? (
            <Link href={`/review/${Array.from(unranked)[0]}`} className="flex items-center gap-2 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-sm font-medium text-warn">
              {unranked.size} show{unranked.size === 1 ? "" : "s"} you went to {unranked.size === 1 ? "isn't" : "aren't"} ranked yet
              <IconChevron size={16} className="ml-auto" />
            </Link>
          ) : null}
          <RankedList shows={profile.shows} unrankedIds={unranked} mediaCounts={mediaCounts} />
        </>
      ) : null}

      {profile && tab === "want" ? (
        <UpcomingList rows={want.map((x) => x.event)} empty="Nothing saved yet. Bookmark a show from Search or its page." icon={<IconBookmark size={14} />} />
      ) : null}
      {profile && tab === "going" ? (
        <UpcomingList rows={going.map((x) => x.event)} empty="Not going to anything yet. Mark a show “I'm going” and it shows up here." icon={<IconCheck size={14} />} />
      ) : null}

      {profile && tab === "following" ? (
        <section className="space-y-2">
          {following === null ? <Spinner /> : null}
          {following?.length === 0 ? (
            <div className="card text-sm text-muted">
              You&apos;re not following anyone yet.{" "}
              <Link href="/search?tab=people" className="font-semibold text-accent">
                Find people with your taste
              </Link>
            </div>
          ) : null}
          {following?.map((p, i) => (
            <div key={p.user.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <PersonRow person={p} userId={userId} onFollowChange={(f) => !f && unfollow(p.user.id)} />
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed border-line px-4 py-3">
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Demo · switch user</span>
          <select
            aria-label="Switch user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="max-w-[160px] cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg outline-none"
          >
            {(users.length ? users : [{ id: userId, name: userId }]).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </section>
    </main>
  );
}

function UpcomingList({ rows, empty, icon }: { rows: Event[]; empty: string; icon: ReactNode }) {
  if (!rows.length) return <div className="card text-sm text-muted">{empty}</div>;
  return (
    <section className="space-y-2">
      {rows.map((e, i) => (
        <div key={e.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
          <EventRow event={e} href={`/events/${e.id}`} right={<span className="grid h-9 w-9 place-items-center rounded-full bg-fg text-white">{icon}</span>} />
        </div>
      ))}
    </section>
  );
}
