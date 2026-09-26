"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconTrophy } from "@/components/icons";
import { ArtistArt, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { dismissPrompt, isPromptDismissed } from "@/lib/session";
import type { Event } from "@/types";

/**
 * Beli-style nudge on open: "It looks like you went to X. Rank it now!" for shows the user
 * attended (photo import or "I was there") but never rated. Dismissing hides them for the session.
 */
export function RankPrompt({ userId }: { userId: string }) {
  const [pending, setPending] = useState<Event[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.unranked(userId).then((list) => {
      if (!live) return;
      const fresh = list.filter((e) => !isPromptDismissed(userId, e.id));
      setPending(fresh);
      setOpen(fresh.length > 0);
    }, () => {});
    return () => {
      live = false;
    };
  }, [userId]);

  function dismiss() {
    dismissPrompt(userId, pending.map((e) => e.id));
    setOpen(false);
  }

  const first = pending[0];
  if (!first) return null;
  const more = pending.length - 1;

  return (
    <Sheet open={open} onClose={dismiss}>
      <div className="flex items-center gap-2 text-accent">
        <IconTrophy size={18} />
        <span className="label text-accent">Rank it now</span>
      </div>
      <h2 className="display mt-2 text-[30px] leading-[1.05]">
        It looks like you went to <em className="text-accent">{first.artist.name}</em>.
      </h2>
      <p className="mt-1.5 text-sm text-muted">
        {first.venue.name} · {fmtDate(first.start_at)}
        {more > 0 ? ` · and ${more} more show${more === 1 ? "" : "s"}` : ""}
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sunken p-3">
        <ArtistArt name={first.artist.name} image={first.image_url} className="h-14 w-14 text-2xl" />
        <div className="min-w-0 flex-1 text-sm text-muted">Rate it in 60 seconds and it lands in your ranking.</div>
      </div>

      {more > 0 ? (
        <div className="mt-3 flex -space-x-2 px-1">
          {pending.slice(1, 6).map((e) => (
            <ArtistArt key={e.id} name={e.artist.name} image={e.image_url} className="h-8 w-8 rounded-full text-[11px] ring-2 ring-surface" />
          ))}
          <Link href="/profile" onClick={() => setOpen(false)} className="ml-4 self-center text-xs font-semibold text-accent">
            See all
          </Link>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2">
        <button className="btn-ghost flex-1" onClick={dismiss}>
          Not now
        </button>
        <Link href={`/review/${first.id}`} className="btn-primary flex-[2]" onClick={() => setOpen(false)}>
          Rank it
        </Link>
      </div>
    </Sheet>
  );
}
