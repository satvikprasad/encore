"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ArtistArt, ErrorNote, Page, Spinner, TopBar } from "@/components/ui";
import { DIMS, TAGS } from "@/constants";
import { api } from "@/lib/api";
import { DIM_LABELS, DIM_QUESTIONS } from "@/lib/dims";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { Event, Vec7 } from "@/types";

const RATED = DIMS.slice(0, 6) as Exclude<(typeof DIMS)[number], "would_again">[];
const STEPS = RATED.length + 1; // six dimensions, then would-attend-again + price
const SCALE_WORDS = ["Rough", "Meh", "Solid", "Great", "Unforgettable"];

export default function ReviewPage({ params }: { params: { eventId: string } }) {
  const { userId } = useUser();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<(number | null)[]>(Array(6).fill(null));
  const [tags, setTags] = useState<string[]>([]);
  const [again, setAgain] = useState<boolean | null>(null);
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.eventDetail(userId, params.eventId).then((d) => setEvent(d.event), setError);
  }, [userId, params.eventId]);

  async function submit() {
    if (again === null || scores.some((s) => s === null)) return;
    setSubmitting(true);
    try {
      const vec = [...(scores as number[]), again ? 5 : 1] as Vec7;
      const parsed = parseFloat(price);
      await api.postReview(userId, { event_id: params.eventId, scores: vec, tags, price_paid: isFinite(parsed) ? parsed : null });
      router.push(`/compare?event=${encodeURIComponent(params.eventId)}`);
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  }

  const dim = step < RATED.length ? RATED[step] : null;
  const canNext = dim ? scores[step] !== null : again !== null;
  const current = dim ? scores[step] : null;

  return (
    <>
      <TopBar
        title="Review"
        back={step === 0 ? true : undefined}
        right={
          <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold tabular-nums text-muted">
            {step + 1}/{STEPS}
          </span>
        }
      />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!event && !error ? <Spinner /> : null}
        {event ? (
          <>
            <div className="flex items-center gap-3 px-1">
              <ArtistArt name={event.artist.name} image={event.image_url} className="h-12 w-12 text-xl" />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-tight">{event.artist.name}</div>
                <div className="truncate text-xs text-muted">
                  {event.venue.name} · {fmtShortDate(event.start_at)}
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 px-1">
              {Array.from({ length: STEPS }, (_, i) => (
                <div key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-accent" : "bg-line")} />
              ))}
            </div>

            {dim ? (
              <section key={dim} className="animate-pop space-y-6 pt-3">
                <div className="px-1">
                  <div className="label text-accent">{DIM_LABELS[dim]}</div>
                  <h2 className="display mt-1.5 text-[34px] leading-[1.05]">{DIM_QUESTIONS[dim]}</h2>
                </div>
                <div className="card p-3">
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setScores((s) => s.map((v, i) => (i === step ? n : v)))}
                        className={clsx(
                          "aspect-square rounded-2xl text-xl font-semibold tabular-nums transition duration-150 active:scale-95",
                          current === n
                            ? "bg-fg text-white shadow-lift"
                            : current !== null && n < current
                              ? "bg-accent-soft text-accent"
                              : "bg-sunken text-muted hover:bg-line",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex h-4 items-center justify-between px-1 text-[11px] text-dim">
                    <span>Rough</span>
                    <span className={clsx("font-semibold text-fg transition-opacity", current ? "opacity-100" : "opacity-0")}>
                      {current ? SCALE_WORDS[current - 1] : ""}
                    </span>
                    <span>Unforgettable</span>
                  </div>
                </div>
                <div className="px-1">
                  <div className="label mb-2">Add a detail</div>
                  <div className="flex flex-wrap gap-2">
                    {TAGS[dim].map((t) => {
                      const on = tags.includes(t);
                      return (
                        <button key={t} onClick={() => setTags((ts) => (on ? ts.filter((x) => x !== t) : [...ts, t]))} className={clsx("chip", on && "chip-on")}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : (
              <section className="animate-pop space-y-6 pt-3">
                <div className="px-1">
                  <div className="label text-accent">Last one</div>
                  <h2 className="display mt-1.5 text-[34px] leading-[1.05]">{DIM_QUESTIONS.would_again}</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [true, "Yes", "In a heartbeat"],
                    [false, "No", "Once was enough"],
                  ].map(([v, label, sub]) => (
                    <button
                      key={String(v)}
                      onClick={() => setAgain(v as boolean)}
                      className={clsx(
                        "rounded-3xl border py-5 text-center transition active:scale-[0.98]",
                        again === v ? "border-fg bg-fg text-white shadow-lift" : "border-line bg-surface text-fg hover:border-fg/20",
                      )}
                    >
                      <div className="display text-[26px] leading-none">{label as string}</div>
                      <div className={clsx("mt-1.5 text-xs", again === v ? "text-white/70" : "text-muted")}>{sub as string}</div>
                    </button>
                  ))}
                </div>
                <label className="block px-1">
                  <span className="label">Price paid (optional)</span>
                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card focus-within:border-accent">
                    <span className="text-lg text-muted">$</span>
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0"
                      className="w-full bg-transparent text-lg tabular-nums outline-none placeholder:text-dim"
                    />
                  </div>
                </label>
              </section>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 ? (
                <button className="btn-ghost flex-1" onClick={() => setStep((s) => s - 1)}>
                  Back
                </button>
              ) : null}
              {step < STEPS - 1 ? (
                <button className="btn-primary flex-[2]" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                  Next
                </button>
              ) : (
                <button className="btn-primary flex-[2]" disabled={!canNext || submitting} onClick={submit}>
                  {submitting ? "Saving…" : "Save & compare"}
                </button>
              )}
            </div>
          </>
        ) : null}
      </Page>
    </>
  );
}
