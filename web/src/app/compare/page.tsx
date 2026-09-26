"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PreferenceBars } from "@/components/charts";
import { ArtistArt, ErrorNote, Page, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { CompareNext, Event, Vec7 } from "@/types";

const QUESTIONS = 3;
const UNIFORM: Vec7 = [0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1426];

export default function ComparePage() {
  const { userId, user } = useUser();
  const router = useRouter();
  const [pair, setPair] = useState<CompareNext | null>(null);
  const [asked, setAsked] = useState(0);
  const [weights, setWeights] = useState<Vec7>(UNIFORM);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (user) setWeights(user.weights);
  }, [user]);

  useEffect(() => {
    api.compareNext(userId).then((p) => (p ? setPair(p) : router.replace("/rank")), setError);
  }, [userId, router]);

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
      const next = await api.compareNext(userId);
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
      <TopBar title="Compare" back="/" right={<span className="text-xs text-muted">{Math.min(asked + 1, QUESTIONS)}/{QUESTIONS}</span>} />
      <Page>
        {error ? <ErrorNote error={error} /> : null}
        {!pair && !error ? <Spinner /> : null}
        {pair ? (
          <>
            <h2 className="pt-2 text-center text-xl font-bold leading-snug">
              {finished ? "Got it. Building your ranking…" : pair.question}
            </h2>
            <p className="-mt-2 text-center text-xs text-muted">Tap the better night</p>
            <div className={clsx("grid grid-cols-2 gap-3 transition", finished && "opacity-40")}>
              {[pair.event_a, pair.event_b].map((e) => (
                <button
                  key={`${asked}-${e.id}`}
                  onClick={() => choose(e)}
                  disabled={!!picked}
                  className={clsx(
                    "animate-pop flex flex-col items-center gap-2 rounded-2xl border-2 bg-card p-3 text-center transition active:scale-[0.98]",
                    picked === e.id ? "border-accent bg-accent/15" : picked ? "border-transparent opacity-50" : "border-transparent hover:border-line",
                  )}
                >
                  <ArtistArt name={e.artist.name} className="h-24 w-full text-3xl" />
                  <div className="w-full truncate font-semibold">{e.artist.name}</div>
                  <div className="w-full truncate text-xs text-muted">{e.venue.name}</div>
                  <div className="text-[11px] text-dim">{fmtShortDate(e.start_at)}</div>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <section className="card">
          <div className="label mb-1">What you care about</div>
          <PreferenceBars weights={weights} />
        </section>
      </Page>
    </>
  );
}
