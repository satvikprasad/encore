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

  return (
    <>
      <TopBar title="Review" back={step === 0 ? true : undefined} right={<span className="text-xs text-muted">{step + 1}/{STEPS}</span>} />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!event && !error ? <Spinner /> : null}
        {event ? (
          <>
            <div className="flex items-center gap-3">
              <ArtistArt name={event.artist.name} className="h-11 w-11" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{event.artist.name}</div>
                <div className="truncate text-xs text-muted">
                  {event.venue.name} · {fmtShortDate(event.start_at)}
                </div>
              </div>
            </div>

            <div className="flex gap-1">
              {Array.from({ length: STEPS }, (_, i) => (
                <div key={i} className={clsx("h-1 flex-1 rounded-full transition", i <= step ? "bg-accent" : "bg-line")} />
              ))}
            </div>

            {dim ? (
              <section key={dim} className="animate-pop space-y-6 pt-4">
                <div>
                  <div className="label text-accent">{DIM_LABELS[dim]}</div>
                  <h2 className="mt-1 text-2xl font-bold">{DIM_QUESTIONS[dim]}</h2>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setScores((s) => s.map((v, i) => (i === step ? n : v)))}
                      className={clsx(
                        "aspect-square rounded-2xl text-xl font-bold transition active:scale-95",
                        scores[step] === n ? "bg-accent text-white" : "bg-card text-muted hover:bg-raised",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-dim">
                  <span>Rough</span>
                  <span>Unforgettable</span>
                </div>
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
              </section>
            ) : (
              <section className="animate-pop space-y-6 pt-4">
                <div>
                  <div className="label text-accent">Last one</div>
                  <h2 className="mt-1 text-2xl font-bold">{DIM_QUESTIONS.would_again}</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [true, "👍 Yes"],
                    [false, "👎 No"],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      onClick={() => setAgain(v as boolean)}
                      className={clsx("rounded-2xl py-5 text-lg font-bold transition", again === v ? "bg-accent" : "bg-card text-muted hover:bg-raised")}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="label">Price paid (optional)</span>
                  <div className="mt-2 flex items-center gap-2 rounded-2xl bg-card px-4 py-3">
                    <span className="text-muted">$</span>
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0"
                      className="w-full bg-transparent text-lg outline-none"
                    />
                  </div>
                </label>
              </section>
            )}

            <div className="flex gap-3 pt-4">
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
