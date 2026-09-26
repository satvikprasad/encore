"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AccessPanel } from "@/components/AccessPanel";
import { ArtistArt, Avatar, ErrorNote, Page, Spinner, TopBar, VerifiedBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { firstName, fmtDate, fmtPriceRange, fmtTime } from "@/lib/format";
import { consumeJustVerified } from "@/lib/session";
import { useUser } from "@/lib/user";
import type { EventDetail, MatchCandidate } from "@/types";

type MatchState = { kind: "loading" } | { kind: "locked" } | { kind: "ok"; list: MatchCandidate[] } | { kind: "error"; error: unknown };

export default function EventPage({ params }: { params: { id: string } }) {
  const { userId, refresh } = useUser();
  const router = useRouter();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [matches, setMatches] = useState<MatchState>({ kind: "loading" });
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.eventDetail(userId, params.id).then(setDetail, setError);
    const unlocked = consumeJustVerified();
    setJustUnlocked(unlocked);
    if (unlocked) refresh();
    setMatches({ kind: "loading" });
    api.matches(userId, params.id).then(
      (list) => setMatches({ kind: "ok", list }),
      (e) => setMatches(e instanceof ApiError && e.status === 403 ? { kind: "locked" } : { kind: "error", error: e }),
    );
  }, [userId, params.id, refresh]);

  async function startCrew() {
    setCreating(true);
    try {
      const crew = await api.createCrew(userId, params.id, selected);
      router.push(`/crews/${crew.id}`);
    } catch (e) {
      setError(e);
      setCreating(false);
    }
  }

  const e = detail?.event;
  const price = e ? fmtPriceRange(e) : null;

  return (
    <>
      <TopBar title={e?.artist.name ?? "Event"} back="/" />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!detail && !error ? <Spinner /> : null}
        {e && detail ? (
          <>
            <section className="space-y-3">
              <ArtistArt name={e.artist.name} className="h-40 w-full text-5xl" />
              <div>
                <h1 className="text-2xl font-black leading-tight">{e.artist.name}</h1>
                <div className="text-sm text-muted">{e.artist.genres.join(" · ")}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Fact label="When" value={`${fmtDate(e.start_at)}`} sub={`${e.doors_at ? `Doors ${fmtTime(e.doors_at)} · ` : ""}Show ${fmtTime(e.start_at)}`} />
                <Fact label="Where" value={e.venue.name} sub="Atlanta" />
                <Fact label="Tickets" value={price ?? "TBA"} sub={e.tm_url ? "via Ticketmaster" : undefined} />
                <Fact
                  label="You"
                  value={detail.attendance ? detail.attendance[0].toUpperCase() + detail.attendance.slice(1) : "Not going yet"}
                />
              </div>
              {e.tm_url && !e.is_past ? (
                <a href={e.tm_url} target="_blank" rel="noreferrer" className="btn-ghost w-full">
                  Get tickets ↗
                </a>
              ) : null}
            </section>

            {detail.friends_interested.length ? (
              <section className="card">
                <div className="label mb-2">Friends interested</div>
                <div className="flex flex-wrap gap-3">
                  {detail.friends_interested.map((f) => (
                    <span key={f.id} className="flex items-center gap-2 text-sm">
                      <Avatar user={f} size={28} />
                      {firstName(f.name)}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <AccessPanel venue={e.venue} />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="label">Fans like you who are going</div>
                {matches.kind === "ok" ? <span className="text-[11px] text-dim">verified only</span> : null}
              </div>

              {matches.kind === "loading" ? <Spinner /> : null}
              {matches.kind === "error" ? <ErrorNote error={matches.error} /> : null}

              {matches.kind === "locked" ? (
                <div className="relative overflow-hidden rounded-2xl bg-card">
                  <div className="pointer-events-none select-none space-y-3 p-4 blur-[6px]" aria-hidden>
                    {[84, 71].map((p) => (
                      <div key={p} className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-raised" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-24 rounded bg-raised" />
                          <div className="h-2.5 w-44 rounded bg-line" />
                        </div>
                        <div className="text-lg font-bold text-accent">{p}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/40 p-4 text-center">
                    <span className="text-2xl">🔒</span>
                    <div className="font-semibold">Verify to see who&apos;s going</div>
                    <p className="text-xs text-muted">Matching connects you with people outside your friends, so it&apos;s for verified fans only.</p>
                    <Link href={`/verify?returnTo=${encodeURIComponent(`/events/${params.id}`)}`} className="btn-primary mt-1 px-6 py-2.5">
                      Verify my ID
                    </Link>
                  </div>
                </div>
              ) : null}

              {matches.kind === "ok" ? (
                <>
                  {justUnlocked ? (
                    <div className="animate-pop flex items-center gap-2 rounded-xl bg-good/10 px-3 py-2 text-sm text-good">✓ You&apos;re verified. Matches unlocked.</div>
                  ) : null}
                  {matches.list.length === 0 ? <div className="card text-sm text-muted">No verified matches going yet.</div> : null}
                  {matches.list.map((m, i) => {
                    const on = selected.includes(m.user.id);
                    return (
                      <article
                        key={m.user.id}
                        className={clsx("card space-y-3 border transition", on ? "border-accent/70" : "border-transparent", justUnlocked && "animate-unlock")}
                        style={justUnlocked ? { animationDelay: `${i * 150}ms` } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar user={m.user} size={44} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-semibold">{m.user.name}</span>
                              {m.user.verified ? <VerifiedBadge /> : null}
                            </div>
                            <div className="text-xs text-muted">
                              {m.shared_event_ids.length} show{m.shared_event_ids.length === 1 ? "" : "s"} in common
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-black text-accent">{Math.round(m.match_pct)}%</div>
                            <div className="text-[10px] uppercase tracking-wider text-dim">match</div>
                          </div>
                        </div>
                        {m.explanation ? <p className="text-sm leading-relaxed">{m.explanation}</p> : null}
                        {m.icebreaker ? (
                          <p className="rounded-xl bg-raised px-3 py-2 text-sm text-muted">
                            <span className="mr-1">💬</span>
                            {m.icebreaker}
                          </p>
                        ) : null}
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-violet-500"
                            checked={on}
                            onChange={() => setSelected((s) => (on ? s.filter((x) => x !== m.user.id) : [...s, m.user.id]))}
                          />
                          Add to crew
                        </label>
                      </article>
                    );
                  })}
                  {matches.list.length ? (
                    <button className="btn-primary sticky bottom-4 w-full shadow-lg" disabled={!selected.length || creating} onClick={startCrew}>
                      {creating ? "Starting…" : `Start a crew${selected.length ? ` with ${selected.length}` : ""}`}
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </Page>
    </>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="label">{label}</div>
      <div className="mt-0.5 font-semibold leading-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
