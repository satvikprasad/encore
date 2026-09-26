"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PlanCard } from "@/components/PlanCard";
import { Avatar, AvatarStack, ErrorNote, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName, fmtShortDate, fmtTime } from "@/lib/format";
import { getAdoptedPlan, setAdoptedPlan } from "@/lib/session";
import { useUser } from "@/lib/user";
import type { Crew } from "@/types";

export default function CrewPage({ params }: { params: { id: string } }) {
  const { userId } = useUser();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getCrew(userId, params.id).then(setCrew, setError);
    setAdopted(getAdoptedPlan(params.id));
  }, [userId, params.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [crew?.messages.length, crew?.plan, planning]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      setCrew(await api.postMessage(userId, params.id, t));
      setText("");
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  async function plan() {
    setPlanning(true);
    setAdopted(false);
    try {
      setCrew(await api.makePlan(userId, params.id));
    } catch (err) {
      setError(err);
    } finally {
      setPlanning(false);
    }
  }

  function adopt() {
    setAdoptedPlan(params.id);
    setAdopted(true);
  }

  const byId = new Map(crew?.members.map((m) => [m.id, m]) ?? []);

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        back={crew ? `/events/${crew.event.id}` : "/"}
        title={
          crew ? (
            <div className="flex items-center gap-2">
              <AvatarStack users={crew.members} size={26} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px]">{crew.members.map((m) => firstName(m.name)).join(", ")}</div>
                <div className="truncate text-xs font-normal text-muted">
                  {crew.event.artist.name} · {fmtShortDate(crew.event.start_at)}
                </div>
              </div>
            </div>
          ) : (
            "Crew"
          )
        }
      />

      {error ? (
        <div className="p-4">
          <ErrorNote error={error} />
        </div>
      ) : null}
      {!crew && !error ? <Spinner /> : null}

      {crew ? (
        <>
          <div className="flex-1 space-y-3 px-4 py-4">
            {adopted && crew.plan ? (
              <div className="sticky top-[92px] z-30">
                <Link
                  href="#plan"
                  className="flex items-center gap-2 rounded-xl border border-good/40 bg-ink/95 px-3 py-2 text-xs text-good backdrop-blur"
                >
                  📌 <span className="truncate">{crew.plan.summary}</span>
                </Link>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-center gap-2 pb-2">
              {crew.members.map((m) => (
                <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-card py-1 pl-1 pr-2.5 text-xs">
                  <Avatar user={m} size={22} />
                  {firstName(m.name)}
                  {m.verified ? <span className="text-good">✓</span> : null}
                </span>
              ))}
            </div>
            <p className="text-center text-[11px] text-dim">
              Crew for {crew.event.artist.name} at {crew.event.venue.name}
            </p>

            {crew.messages.map((msg, i) => {
              const mine = msg.user_id === userId;
              const author = byId.get(msg.user_id);
              return (
                <div key={i} className={clsx("animate-pop flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine && author ? <Avatar user={author} size={28} /> : null}
                  <div className={clsx("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-card")}>
                    {!mine ? <div className="mb-0.5 text-[11px] font-semibold text-muted">{author ? firstName(author.name) : msg.user_id}</div> : null}
                    {msg.text}
                    <div className={clsx("mt-0.5 text-right text-[10px]", mine ? "text-white/60" : "text-dim")}>{fmtTime(msg.at)}</div>
                  </div>
                </div>
              );
            })}

            {planning ? <Spinner label="Reading the thread and planning…" /> : null}
            {crew.plan && !planning ? (
              <div id="plan">
                <PlanCard plan={crew.plan} members={crew.members} adopted={adopted} onAdopt={adopt} />
              </div>
            ) : null}
            <div ref={bottom} />
          </div>

          <div className="sticky bottom-0 space-y-2 border-t border-line/60 bg-ink/95 px-4 pb-6 pt-3 backdrop-blur">
            <button className="btn-ghost w-full border-accent/50 text-accent" onClick={plan} disabled={planning || crew.messages.length === 0}>
              ✨ {crew.plan ? "Re-plan" : "Make a plan"}
            </button>
            <form onSubmit={send} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message the crew"
                className="min-w-0 flex-1 rounded-full bg-card px-4 py-2.5 text-sm outline-none ring-accent focus:ring-1"
              />
              <button type="submit" className="btn-primary rounded-full px-4 py-2.5" disabled={!text.trim() || sending}>
                Send
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
