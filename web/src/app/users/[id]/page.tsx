"use client";

import { useEffect, useState } from "react";

import { PreferenceBars } from "@/components/charts";
import { IconBookmark, IconCheck } from "@/components/icons";
import { FollowButton } from "@/components/PersonRow";
import { RankedList } from "@/components/RankedList";
import { Avatar, ErrorNote, EventRow, Page, Ring, SectionTitle, Spinner, TopBar, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { UserProfile } from "@/types";

export default function UserPage({ params }: { params: { id: string } }) {
  const { userId } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setProfile(null);
    api.userProfile(userId, params.id).then(setProfile, setError);
  }, [userId, params.id]);

  const u = profile?.user;

  return (
    <>
      <TopBar title={u?.name ?? "Member"} back={true} />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!profile && !error ? <Spinner /> : null}
        {profile && u ? (
          <>
            <header className="card animate-rise space-y-4">
              <div className="flex items-center gap-4">
                <Avatar user={u} size={64} />
                <div className="min-w-0 flex-1">
                  <h1 className="display truncate text-[28px] leading-none">{u.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {u.verified ? <VerifiedBadge /> : null}
                    {profile.follows_you ? <span className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold">Follows you</span> : null}
                  </div>
                </div>
                {profile.match_pct != null ? <Ring pct={profile.match_pct} size={60} /> : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 gap-4 text-xs text-muted">
                  <span>
                    <b className="text-fg">{profile.shows.length}</b> ranked
                  </span>
                  <span>
                    <b className="text-fg">{profile.followers}</b> followers
                  </span>
                  <span>
                    <b className="text-fg">{profile.following_count}</b> following
                  </span>
                </div>
                {u.id !== userId ? (
                  <FollowButton
                    userId={userId}
                    targetId={u.id}
                    following={profile.following}
                    size="md"
                    onChange={(following) => setProfile((p) => (p ? { ...p, following, followers: p.followers + (following ? 1 : -1) } : p))}
                  />
                ) : null}
              </div>
              {profile.match_pct != null ? (
                <p className="rounded-2xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent-deep">
                  <b>{profile.match_pct}% taste match</b> — based on shows you&apos;ve both ranked and what you each care about.
                </p>
              ) : null}
            </header>

            <section className="card animate-rise" style={{ animationDelay: "60ms" }}>
              <div className="label mb-1">What {firstName(u.name)} cares about</div>
              <PreferenceBars weights={u.weights} height={170} />
            </section>

            {profile.upcoming.length ? (
              <section className="animate-rise space-y-2" style={{ animationDelay: "120ms" }}>
                <SectionTitle>Going to</SectionTitle>
                {profile.upcoming.map((x) => (
                  <EventRow
                    key={x.event.id}
                    event={x.event}
                    href={`/events/${x.event.id}`}
                    right={
                      <span className="flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">
                        {x.status === "going" ? <IconCheck size={12} strokeWidth={2.6} /> : <IconBookmark size={12} />}
                        {x.status === "going" ? "Going" : "Wants to go"}
                      </span>
                    }
                  />
                ))}
              </section>
            ) : null}

            <section className="animate-rise space-y-3" style={{ animationDelay: "180ms" }}>
              <SectionTitle right={<span className="text-xs text-muted">{profile.shows.length} shows</span>}>{firstName(u.name)}&apos;s ranking</SectionTitle>
              {profile.shows.length === 0 ? <div className="card text-sm text-muted">No ranked shows yet.</div> : null}
              <RankedList shows={profile.shows} mine={false} />
            </section>
          </>
        ) : null}
      </Page>
    </>
  );
}
