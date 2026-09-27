"use client";

import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PreferenceBars } from "@/components/charts";
import { IconCheck } from "@/components/icons";
import { ArtistArt, ErrorNote, Page, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { CompareNext, Event, Vec7 } from "@/types";

const QUESTIONS = 3;
const UNIFORM: Vec7 = [0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1426];

export default function ComparePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Compare />
    </Suspense>
  );
}

function Compare() {
  const { userId, user } = useUser();
  const router = useRouter();
  const focus = useSearchParams().get("event"); // the show just rated: it stays in every pair
  const [pair, setPair] = useState<CompareNext | null>(null);
  const [asked, setAsked] = useState(0);
  const [weights, setWeights] = useState<Vec7>(UNIFORM);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (user) setWeights(user.weights);
  }, [user]);

  useEffect(() => {
    api.compareNext(userId, focus).then((p) => (p ? setPair(p) : router.replace("/rank")), setError);
  }, [userId, router, focus]);

  async function choose(winner: Event) {
    if (!pair || picked) return;
    setPicked(winner.id);
    try {
      const ranking = await api.postCompare(userId, { event_a: pair.event_a.id, event_b: pair.event_b.id, winner: winner.id });
      setWeights(ranking.weights);
      const done = asked + 1;
      setAsked(done);
      if (done >= QUESTIONS) {
        setTimeout(() => router.push("/rank"), 1100);
        return;
      }
      const next = await api.compareNext(userId, focus);
      await new Promise((r) => setTimeout(r, 500)); // let the bars move before the next question
      if (!next) return router.push("/rank");
      setPair(next);
      setPicked(null);
    } catch (e) {
      setError(e);
      setPicked(null);
    }
  }

  const finished = asked >= QUESTIONS;

  return (
    <>
      <TopBar
        title="Compare"
        back="/"
        right={
          <span className="flex items-center gap-1.5">
            {Array.from({ length: QUESTIONS }, (_, i) => (
              <span key={i} className={clsx("h-2 rounded-full transition-all duration-300", i < asked ? "w-2 bg-accent" : i === asked ? "w-5 bg-fg" : "w-2 bg-line")} />
            ))}
          </span>
        }
      />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!pair && !error ? <Spinner /> : null}
        {pair ? (
          <>
            <div className="px-1 pt-1 text-center">
              <div className="label">{finished ? "All done" : `Question ${Math.min(asked + 1, QUESTIONS)} of ${QUESTIONS}`}</div>
              <h2 className="display mt-1.5 text-[30px] leading-[1.05]">{finished ? "Got it. Building your ranking…" : pair.question}</h2>
              {!finished ? <p className="mt-2 text-xs text-muted">Tap the better night</p> : null}
            </div>
            <div className={clsx("relative grid grid-cols-2 gap-3 transition", finished && "opacity-40")}>
              {[pair.event_a, pair.event_b].map((e, idx) => {
                const on = picked === e.id;
                const isFocus = idx === 0 && (focus ? e.id === focus : true);
                return (
                  <button
                    key={`${asked}-${e.id}`}
                    onClick={() => choose(e)}
                    disabled={!!picked}
                    className={clsx(
                      "animate-pop relative flex flex-col gap-3 overflow-hidden rounded-3xl border bg-surface p-2.5 text-left shadow-card transition duration-200 active:scale-[0.98]",
                      on ? "border-accent ring-2 ring-accent/40 shadow-lift" : picked ? "border-line opacity-50" : "border-line hover:-translate-y-0.5 hover:shadow-lift",
                    )}
                  >
                    <ArtistArt name={e.artist.name} image={e.image_url} className="aspect-[4/5] w-full rounded-2xl text-5xl" big />
                    {isFocus ? <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-fg backdrop-blur">Just rated</span> : null}
                    <div className="px-1 pb-1">
                      <div className="truncate text-[15px] font-semibold tracking-tight">{e.artist.name}</div>
                      <div className="truncate text-xs text-muted">{e.venue.name}</div>
                      <div className="mt-0.5 text-[11px] text-dim">{fmtShortDate(e.start_at)}</div>
                    </div>
                    {on ? (
                      <span className="animate-pop absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-fg text-white shadow-lift">
                        <IconCheck size={16} strokeWidth={2.6} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <span className="pointer-events-none absolute left-1/2 top-[38%] grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-line bg-canvas text-[11px] font-bold text-muted shadow-card">
                vs
              </span>
            </div>
          </>
        ) : null}

        <section className="card">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">What you care about</span>
            <span className="text-[11px] text-dim">updates as you answer</span>
          </div>
          <PreferenceBars weights={weights} />
        </section>
      </Page>
    </>
  );
}
