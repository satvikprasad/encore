"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AccessPanel } from "@/components/AccessPanel";
import { IconArrowUpRight, IconCalendar, IconChat, IconCheck, IconLock, IconMusic, IconPin, IconShield, IconTicket, IconUsers } from "@/components/icons";
import { MediaGallery } from "@/components/MediaGallery";
import { StatusControl } from "@/components/StatusControl";
import { ArtistArt, Avatar, ErrorNote, Page, Ring, SectionTitle, Spinner, TopBar, VerifiedBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { firstName, fmtDate, fmtMoney, fmtTime } from "@/lib/format";
import { consumeJustVerified } from "@/lib/session";
import { useUser } from "@/lib/user";
import type { AttendanceStatus, EventDetail, MatchCandidate, RankedShow, TicketOffer } from "@/types";

type MatchState = { kind: "loading" } | { kind: "locked" } | { kind: "ok"; list: MatchCandidate[] } | { kind: "error"; error: unknown };

const STATUS_LABEL: Record<AttendanceStatus, string> = { interested: "Want to go", going: "Going", attended: "You were there" };
const OFFER_STATUS: Record<string, { label: string; cls: string }> = {
  sold_out: { label: "Sold out", cls: "bg-bad-soft text-bad" },
  cancelled: { label: "Cancelled", cls: "bg-bad-soft text-bad" },
  postponed: { label: "Postponed", cls: "bg-warn-soft text-warn" },
  coming_soon: { label: "On sale soon", cls: "bg-warn-soft text-warn" },
};

function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function offerPrice(o: TicketOffer): string | null {
  if (o.price_min == null && o.price_max == null) return null;
  if (o.price_min != null && o.price_max != null && o.price_max !== o.price_min) return `${fmtMoney(o.price_min)}–${fmtMoney(o.price_max)}`;
  return `from ${fmtMoney((o.price_min ?? o.price_max) as number)}`;
}

export default function EventPage({ params }: { params: { id: string } }) {
  const { userId, refresh } = useUser();
  const router = useRouter();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [ranked, setRanked] = useState<RankedShow | null>(null);
  const [provisional, setProvisional] = useState(false);
  const [offers, setOffers] = useState<TicketOffer[] | null>(null);
  const [matches, setMatches] = useState<MatchState>({ kind: "loading" });
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.eventDetail(userId, params.id).then((d) => {
      setDetail(d);
      setStatus((d.attendance as AttendanceStatus | null) ?? null);
      if (d.event.is_past) {
        api.rank(userId).then((r) => setRanked(r.shows.find((s) => s.event.id === params.id) ?? null), () => {});
        api.unranked(userId).then((l) => setProvisional(l.some((e) => e.id === params.id)), () => {});
      } else {
        api.tickets(userId, params.id).then(setOffers, () => setOffers([]));
      }
    }, setError);
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
  // "Get tickets" goes to the cheapest known official seller, else the venue's seller, else resale.
  const best = offers?.find((o) => o.kind === "primary" && o.price_min != null) ?? offers?.find((o) => o.kind === "primary") ?? offers?.[0] ?? null;
  const ticketUrl = best?.url ?? e?.tm_url ?? null;
  const cheapest = offers?.reduce<TicketOffer | null>((acc, o) => (o.price_min != null && (acc == null || (acc.price_min ?? Infinity) > o.price_min) ? o : acc), null) ?? null;
  const priced = offers?.filter((o) => o.price_min != null) ?? [];

  return (
    <>
      <TopBar title={e?.artist.name ?? "Show"} back="/" />
      <Page className="pt-0">
        {error ? <ErrorNote error={error} /> : null}
        {!detail && !error ? <Spinner /> : null}
        {e && detail ? (
          <>
            {/* Hero */}
            <section className="animate-rise space-y-4">
              <div className="relative">
                <ArtistArt name={e.artist.name} image={e.image_url} className="aspect-[16/10] w-full rounded-[28px] text-7xl shadow-lift" big />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-b-[28px] bg-gradient-to-t from-black/45 to-transparent" />
                {status ? (
                  <span className="animate-pop absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-fg backdrop-blur">
                    <IconCheck size={12} strokeWidth={2.6} className="text-good" />
                    {STATUS_LABEL[status]}
                  </span>
                ) : null}
                {e.is_past ? <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">Past show</span> : null}
                <div className="absolute bottom-4 left-4 right-4 text-white drop-shadow">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
                    {e.venue.name} · {new Date(e.start_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
                  </div>
                </div>
              </div>

              <div className="px-1">
                <h1 className="display text-[38px] leading-[1.02]">{e.artist.name}</h1>
                {e.support ? <p className="mt-1.5 text-sm text-muted">with {e.support}</p> : null}
                {e.artist.genres.length || e.room ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {e.room ? <span className="rounded-full bg-fg px-2.5 py-0.5 text-[11px] font-semibold text-white">{e.room} room</span> : null}
                    {e.artist.genres.map((g) => (
                      <span key={g} className="rounded-full bg-sunken px-2.5 py-0.5 text-[11px] font-medium text-muted">
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <StatusControl
                userId={userId}
                event={e}
                status={status}
                ranked={ranked}
                provisional={provisional}
                ticketUrl={ticketUrl}
                onChange={(s) => {
                  setStatus(s);
                  if (s === "attended") setProvisional(true);
                  if (s === null) {
                    setProvisional(false);
                    setRanked(null);
                  }
                }}
              />
            </section>

            {/* Details: full rows, nothing truncated */}
            <section className="card animate-rise divide-y divide-line/70 p-0" style={{ animationDelay: "60ms" }}>
              <Row icon={<IconCalendar size={18} />} label={fmtLongDate(e.start_at)} sub={`${e.doors_at ? `Doors ${fmtTime(e.doors_at)} · ` : ""}Show ${fmtTime(e.start_at)}`} />
              <Row icon={<IconPin size={18} />} label={e.venue.name} sub={`${e.room ? `${e.room} room · ` : ""}${e.venue.city ?? "Atlanta, GA"}`} />
              {!e.is_past ? (
                <Row
                  icon={<IconTicket size={18} />}
                  label={cheapest ? `From ${fmtMoney(cheapest.price_min as number)} on ${cheapest.seller}` : best ? `On sale at ${best.seller}` : "Tickets"}
                  sub={cheapest ? `${priced.length} price${priced.length === 1 ? "" : "s"} compared below` : offers && offers.length > 1 ? `${offers.length} sellers below` : "Price isn't published on the seller's listing"}
                />
              ) : null}
              {detail.friends_interested.length ? (
                <Row icon={<IconUsers size={18} />} label={`${detail.friends_interested.map((f) => firstName(f.name)).join(", ")} ${detail.friends_interested.length === 1 ? "is" : "are"} interested`} />
              ) : null}
            </section>

            {/* Tickets & price comparison */}
            {!e.is_past ? (
              <section className="animate-rise space-y-3" style={{ animationDelay: "120ms" }}>
                <SectionTitle right={offers && offers.length > 1 ? <span className="text-xs text-muted">{offers.length} sellers</span> : null}>Tickets</SectionTitle>
                {offers === null ? <Spinner /> : null}
                {offers?.length === 0 ? <div className="card text-sm text-muted">No ticket listings yet for this show.</div> : null}
                {offers?.length ? (
                  <div className="card divide-y divide-line/70 p-0">
                    {offers.map((o) => {
                      const st = o.status ? OFFER_STATUS[o.status] : undefined;
                      const price = offerPrice(o);
                      const isBest = cheapest ? o.seller === cheapest.seller : o === best;
                      return (
                        <a key={o.seller} href={o.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 transition hover:bg-sunken/60">
                          <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full", o.kind === "primary" ? "bg-accent-soft text-accent" : "bg-sunken text-muted")}>
                            <IconTicket size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-semibold tracking-tight">{o.seller}</span>
                              <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", o.kind === "primary" ? "bg-good-soft text-good" : "bg-sunken text-muted")}>
                                {o.kind === "primary" ? "Official" : "Resale"}
                              </span>
                              {st ? <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span> : null}
                              {isBest && price ? <span className="rounded-full bg-fg px-1.5 py-0.5 text-[10px] font-semibold text-white">Best price</span> : null}
                            </div>
                            <div className="text-xs text-muted">{price ?? (o.kind === "resale" ? "See listings" : "Price on seller's site")}</div>
                          </div>
                          <IconArrowUpRight size={18} className="shrink-0 text-dim" />
                        </a>
                      );
                    })}
                  </div>
                ) : null}
                {ticketUrl ? (
                  <a href={ticketUrl} target="_blank" rel="noreferrer" className="btn-primary w-full">
                    <IconTicket size={18} /> Get tickets{best ? ` on ${best.seller}` : ""} <IconArrowUpRight size={16} />
                  </a>
                ) : null}
                <p className="px-1 text-[11px] leading-relaxed text-dim">
                  Official prices come from the seller&apos;s own listing where published; resale from Gametime and SeatGeek. Every link opens the seller&apos;s page for this exact show.
                </p>
              </section>
            ) : null}

            {e.is_past ? (
              <div className="animate-rise" style={{ animationDelay: "120ms" }}>
                <MediaGallery userId={userId} eventId={e.id} />
              </div>
            ) : null}

            {detail.friends_interested.length ? (
              <section className="card animate-rise" style={{ animationDelay: "160ms" }}>
                <div className="label mb-3">Friends interested</div>
                <div className="flex flex-wrap gap-2">
                  {detail.friends_interested.map((f) => (
                    <Link key={f.id} href={`/users/${f.id}`} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm font-medium transition hover:border-fg/25">
                      <Avatar user={f} size={26} />
                      {firstName(f.name)}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="animate-rise" style={{ animationDelay: "200ms" }}>
              <AccessPanel venue={e.venue} />
            </div>

            <section className="animate-rise space-y-3" style={{ animationDelay: "240ms" }}>
              <SectionTitle
                right={
                  matches.kind === "ok" ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <IconShield size={12} /> verified only
                    </span>
                  ) : null
                }
              >
                Fans like you
              </SectionTitle>

              {matches.kind === "loading" ? <Spinner /> : null}
              {matches.kind === "error" ? <ErrorNote error={matches.error} /> : null}

              {matches.kind === "locked" ? (
                <div className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
                  <div className="pointer-events-none select-none space-y-4 p-4 blur-[7px]" aria-hidden>
                    {[84, 71].map((p) => (
                      <div key={p} className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full bg-sunken" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-24 rounded bg-sunken" />
                          <div className="h-2.5 w-44 rounded bg-line" />
                        </div>
                        <div className="display text-2xl text-accent">{p}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/60 p-5 text-center backdrop-blur-[2px]">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-fg text-white shadow-lift">
                      <IconLock size={22} />
                    </span>
                    <div className="display mt-1 text-[24px] leading-none">Verify to see who&apos;s going</div>
                    <p className="max-w-[260px] text-xs leading-relaxed text-muted">Matching connects you with people outside your friends, so it&apos;s for verified fans only.</p>
                    <Link href={`/verify?returnTo=${encodeURIComponent(`/events/${params.id}`)}`} className="btn-accent mt-1 px-6">
                      <IconShield size={16} /> Verify my ID
                    </Link>
                  </div>
                </div>
              ) : null}

              {matches.kind === "ok" ? (
                <>
                  {justUnlocked ? (
                    <div className="animate-pop flex items-center gap-2 rounded-2xl bg-good-soft px-3.5 py-2.5 text-sm font-medium text-good">
                      <IconCheck size={16} strokeWidth={2.6} /> You&apos;re verified. Matches unlocked.
                    </div>
                  ) : null}
                  {matches.list.length === 0 ? <div className="card text-sm text-muted">No verified matches going yet.</div> : null}
                  {matches.list.map((m, i) => {
                    const on = selected.includes(m.user.id);
                    return (
                      <article
                        key={m.user.id}
                        className={clsx("card space-y-3 transition", on ? "border-accent/60 ring-1 ring-accent/40" : "", justUnlocked && "animate-unlock")}
                        style={justUnlocked ? { animationDelay: `${i * 150}ms` } : undefined}
                      >
                        <Link href={`/users/${m.user.id}`} className="flex items-center gap-3">
                          <Avatar user={m.user} size={46} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold tracking-tight">{m.user.name}</span>
                              {m.user.verified ? <VerifiedBadge /> : null}
                            </div>
                            <div className="text-xs text-muted">
                              {m.shared_event_ids.length} show{m.shared_event_ids.length === 1 ? "" : "s"} in common
                            </div>
                          </div>
                          <Ring pct={m.match_pct} size={54} />
                        </Link>
                        {m.explanation ? <p className="text-sm leading-relaxed text-fg/90">{m.explanation}</p> : null}
                        {m.icebreaker ? (
                          <p className="flex items-start gap-2 rounded-2xl bg-accent-soft px-3 py-2.5 text-sm leading-relaxed text-accent-deep">
                            <IconChat size={16} className="mt-0.5 shrink-0" />
                            <span className="display text-[16px] italic">“{m.icebreaker}”</span>
                          </p>
                        ) : null}
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => setSelected((s) => (on ? s.filter((x) => x !== m.user.id) : [...s, m.user.id]))}
                          />
                          <span className={clsx("grid h-5 w-5 place-items-center rounded-md border transition", on ? "border-accent bg-accent text-white" : "border-line bg-surface text-transparent")}>
                            <IconCheck size={12} strokeWidth={3} />
                          </span>
                          Add to crew
                        </label>
                      </article>
                    );
                  })}
                  {matches.list.length ? (
                    <button className="btn-primary sticky bottom-6 w-full" disabled={!selected.length || creating} onClick={startCrew}>
                      <IconUsers size={18} />
                      {creating ? "Starting…" : `Start a crew${selected.length ? ` with ${selected.length}` : ""}`}
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>

            {e.is_past ? (
              <p className="flex items-center justify-center gap-1.5 px-1 text-[11px] text-dim">
                <IconMusic size={12} /> Past show — rank it to shape your recommendations.
              </p>
            ) : null}
          </>
        ) : null}
      </Page>
    </>
  );
}

function Row({ icon, label, sub }: { icon: ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug tracking-tight">{label}</div>
        {sub ? <div className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</div> : null}
      </div>
    </div>
  );
}
