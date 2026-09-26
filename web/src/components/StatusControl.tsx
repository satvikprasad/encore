"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { IconBookmark, IconCheck, IconTicket, IconTrophy, IconX } from "@/components/icons";
import { api } from "@/lib/api";
import type { AttendanceStatus, Event, RankedShow } from "@/types";

function Action({ on, icon, label, onClick, href, external, disabled, tone = "default" }: {
  on?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  tone?: "default" | "accent";
}) {
  const face = clsx(
    "grid h-14 w-14 place-items-center rounded-full border transition active:scale-95",
    on
      ? "border-fg bg-fg text-white shadow-lift"
      : tone === "accent"
        ? "border-accent bg-accent text-white shadow-glow"
        : "border-line bg-surface text-fg shadow-card hover:border-fg/25",
  );
  const body = (
    <>
      <span className={face}>{icon}</span>
      <span className={clsx("text-[11px] font-semibold", on ? "text-fg" : "text-muted")}>{label}</span>
    </>
  );
  const cls = "flex flex-1 flex-col items-center gap-1.5 disabled:opacity-50";
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}

/**
 * Beli-style action row for a show. Upcoming: Want to go · Going · Tickets (tap a mark again to clear).
 * Past: Went → Rank it now → Ranked #n (Re-rank).
 */
export function StatusControl({
  userId,
  event,
  status,
  ranked,
  provisional,
  ticketUrl,
  onChange,
}: {
  userId: string;
  event: Event;
  status: AttendanceStatus | null;
  ranked: RankedShow | null;
  provisional: boolean;
  ticketUrl?: string | null;
  onChange: (s: AttendanceStatus | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function set(next: AttendanceStatus | null) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.setAttendance(userId, event.id, next);
      onChange(r.status);
    } finally {
      setBusy(false);
    }
  }

  if (!event.is_past) {
    return (
      <div className="flex items-start justify-around px-2">
        <Action on={status === "interested"} icon={<IconBookmark size={22} strokeWidth={status === "interested" ? 2.4 : 1.8} />} label={status === "interested" ? "Saved" : "Want to go"} disabled={busy} onClick={() => set(status === "interested" ? null : "interested")} />
        <Action on={status === "going"} icon={<IconCheck size={22} strokeWidth={2.4} />} label={status === "going" ? "Going" : "I'm going"} disabled={busy} onClick={() => set(status === "going" ? null : "going")} />
        {ticketUrl ? <Action icon={<IconTicket size={22} />} label="Tickets" href={ticketUrl} external tone="accent" /> : null}
      </div>
    );
  }

  const went = status === "attended";
  return (
    <div className="flex items-start justify-around px-2">
      <Action on={went} icon={went ? <IconCheck size={22} strokeWidth={2.4} /> : <IconCheck size={22} />} label={went ? "Went" : "I was there"} disabled={busy} onClick={() => set(went ? null : "attended")} />
      {went && (provisional || !ranked) ? (
        <Action icon={<IconTrophy size={22} />} label="Rank it now" href={`/review/${event.id}`} tone="accent" />
      ) : went && ranked ? (
        <Action on icon={<span className="text-[13px] font-bold tabular-nums">#{ranked.rank}</span>} label={`Ranked · ${ranked.score.toFixed(1)}`} href={`/review/${event.id}`} />
      ) : (
        <Action icon={<IconTrophy size={22} />} label="Rank it" disabled />
      )}
      {went ? <Action icon={<IconX size={20} />} label="Wasn't there" disabled={busy} onClick={() => set(null)} /> : null}
    </div>
  );
}
