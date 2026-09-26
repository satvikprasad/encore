"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { IconCheck, IconPin, IconSend, IconSparkle } from "@/components/icons";
import { PlanCard } from "@/components/PlanCard";
import { ArtistArt, Avatar, AvatarStack, ErrorNote, Spinner, TopBar } from "@/components/ui";
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
            <div className="flex items-center gap-2.5">
              <AvatarStack users={crew.members} size={28} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold tracking-tight">{crew.members.map((m) => firstName(m.name)).join(", ")}</div>
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
          <div className="flex-1 space-y-3 px-4 py-3">
            {adopted && crew.plan ? (
              <div className="sticky top-[100px] z-30">
                <Link
                  href="#plan"
                  className="flex items-center gap-2 rounded-full border border-good/30 bg-surface/90 px-3.5 py-2 text-xs font-medium text-good shadow-card backdrop-blur"
                >
                  <IconPin size={14} /> <span className="truncate">{crew.plan.summary}</span>
                </Link>
              </div>
            ) : null}

            <div className="card flex items-center gap-3 p-3">
              <ArtistArt name={crew.event.artist.name} image={crew.event.image_url} className="h-12 w-12 text-lg" />
              <div className="min-w-0 flex-1">
                <div className="label">Crew for</div>
                <div className="truncate text-[15px] font-semibold tracking-tight">{crew.event.artist.name}</div>
                <div className="truncate text-xs text-muted">{crew.event.venue.name}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {crew.members.map((m) => (
                  <span key={m.id} className="flex items-center gap-1 text-[11px] text-muted">
                    {firstName(m.name)}
                    {m.verified ? <IconCheck size={11} strokeWidth={3} className="text-good" /> : null}
                  </span>
                ))}
              </div>
            </div>

            {crew.messages.map((msg, i) => {
              const mine = msg.user_id === userId;
              const author = byId.get(msg.user_id);
              return (
                <div key={i} className={clsx("animate-pop flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine && author ? <Avatar user={author} size={28} /> : null}
                  <div
                    className={clsx(
                      "max-w-[78%] rounded-3xl px-3.5 py-2.5 text-sm leading-relaxed",
                      mine ? "rounded-br-lg bg-fg text-white shadow-lift" : "rounded-bl-lg border border-line bg-surface shadow-card",
                    )}
                  >
                    {!mine ? <div className="mb-0.5 text-[11px] font-semibold text-muted">{author ? firstName(author.name) : msg.user_id}</div> : null}
                    {msg.text}
                    <div className={clsx("mt-1 text-right text-[10px] tabular-nums", mine ? "text-white/50" : "text-dim")}>{fmtTime(msg.at)}</div>
                  </div>
                </div>
              );
            })}

            {planning ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
                <IconSparkle size={16} className="animate-pulse text-accent" /> Reading the thread and planning…
              </div>
            ) : null}
            {crew.plan && !planning ? (
              <div id="plan" className="pt-1">
                <PlanCard plan={crew.plan} members={crew.members} adopted={adopted} onAdopt={adopt} />
              </div>
            ) : null}
            <div ref={bottom} />
          </div>

          <div className="sticky bottom-0 space-y-2 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-4 pb-7 pt-4">
            <button
              className={clsx("btn w-full border", crew.plan ? "border-line bg-surface text-fg" : "border-accent/30 bg-accent-soft text-accent-deep")}
              onClick={plan}
              disabled={planning || crew.messages.length === 0}
            >
              <IconSparkle size={16} /> {crew.plan ? "Re-plan" : "Make a plan"}
            </button>
            <form onSubmit={send} className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-4 shadow-card focus-within:border-accent">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message the crew"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
              />
              <button
                type="submit"
                aria-label="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg text-white transition active:scale-95 disabled:opacity-30"
                disabled={!text.trim() || sending}
              >
                <IconSend size={16} strokeWidth={2.2} />
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
