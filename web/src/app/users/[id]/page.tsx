"use client";

import { useEffect, useState } from "react";

import { PreferenceBars } from "@/components/charts";
import { Lightbox } from "@/components/MediaGallery";
import { IconBookmark, IconCamera, IconCheck } from "@/components/icons";
import { FollowButton } from "@/components/PersonRow";
import { RankedList } from "@/components/RankedList";
import { Avatar, ErrorNote, EventRow, Page, Ring, SectionTitle, Spinner, TopBar, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { MediaFile, UserProfile } from "@/types";

export default function UserPage({ params }: { params: { id: string } }) {
  const { userId } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [moments, setMoments] = useState<MediaFile[] | null>(null);
  const [open, setOpen] = useState<MediaFile | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setProfile(null);
    setMoments(null);
    api.userProfile(userId, params.id).then(setProfile, setError);
  }, [userId, params.id]);

  // Their photos & videos appear once you follow them (or when it's you).
  const canSee = !!profile && (profile.following || profile.user.id === userId);
  useEffect(() => {
    if (!canSee) return;
    let live = true;
    api.userMedia(userId, params.id).then((l) => live && setMoments(l), () => live && setMoments([]));
    return () => {
      live = false;
    };
  }, [canSee, userId, params.id]);

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

            <section className="animate-rise space-y-3" style={{ animationDelay: "40ms" }}>
              <SectionTitle right={moments?.length ? <span className="text-xs text-muted">{moments.length} moment{moments.length === 1 ? "" : "s"}</span> : null}>
                {u.id === userId ? "Your moments" : `${firstName(u.name)}'s moments`}
              </SectionTitle>
              {!canSee ? (
                <div className="card flex items-center gap-3 text-sm text-muted">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-fg">
                    <IconCamera size={18} />
                  </span>
                  Follow {firstName(u.name)} to see their photos and videos from shows.
                </div>
              ) : moments === null ? (
                <Spinner />
              ) : moments.length === 0 ? (
                <div className="card text-sm text-muted">No photos or videos yet.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {moments.slice(0, 9).map((m) => (
                    <button key={m.id} onClick={() => setOpen(m)} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken shadow-card transition hover:opacity-90">
                      {m.kind === "video" ? (
                        <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-left text-[10px] font-semibold text-white">
                        <span className="block truncate">{m.event.artist.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {open ? <Lightbox item={open} mine={open.user.id === userId} onClose={() => setOpen(null)} /> : null}
            </section>

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
