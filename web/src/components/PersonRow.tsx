"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import { IconCheck, IconUserPlus } from "@/components/icons";
import { Avatar, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import type { PersonCard } from "@/types";

export function FollowButton({
  userId,
  targetId,
  following,
  onChange,
  size = "sm",
}: {
  userId: string;
  targetId: string;
  following: boolean;
  onChange: (following: boolean) => void;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.setFollow(userId, targetId, !following);
      onChange(r.following.includes(targetId));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition active:scale-[0.97] disabled:opacity-60",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm",
        following ? "border-line bg-surface text-fg hover:bg-sunken" : "border-fg bg-fg text-white hover:bg-black",
      )}
    >
      {following ? <IconCheck size={13} strokeWidth={2.6} /> : <IconUserPlus size={14} />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

export function PersonRow({ person, userId, onFollowChange }: { person: PersonCard; userId: string; onFollowChange: (following: boolean) => void }) {
  const u = person.user;
  return (
    <Link href={`/users/${u.id}`} className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-lift">
      <Avatar user={u} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold tracking-tight">{u.name}</span>
          {u.verified ? <VerifiedBadge /> : null}
        </div>
        <div className="truncate text-xs text-muted">
          <span className="font-semibold text-accent">{person.match_pct}% match</span> · {person.shows_count} show{person.shows_count === 1 ? "" : "s"}
          {person.follows_you ? " · follows you" : ""}
        </div>
      </div>
      <FollowButton userId={userId} targetId={u.id} following={person.following} onChange={onFollowChange} />
    </Link>
  );
}
