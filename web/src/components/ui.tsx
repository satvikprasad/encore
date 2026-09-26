"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { fmtShortDate } from "@/lib/format";
import type { Event, User } from "@/types";

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string | true; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 flex h-[84px] items-end gap-2 border-b border-line/60 bg-ink/90 px-4 pb-3 backdrop-blur">
      {back ? (
        <button
          aria-label="Back"
          className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-xl text-muted hover:bg-card hover:text-white"
          onClick={() => (back === true ? router.back() : router.push(back))}
        >
          ‹
        </button>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</div>
      {right}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={clsx("space-y-4 px-4 pb-10 pt-4", className)}>{children}</main>;
}

export function Avatar({ user, size = 36, ring }: { user: Pick<User, "avatar" | "name">; size?: number; ring?: boolean }) {
  return (
    <span
      title={user.name}
      className={clsx("inline-grid shrink-0 place-items-center rounded-full bg-raised", ring && "ring-2 ring-ink")}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {user.avatar || user.name[0]}
    </span>
  );
}

export function AvatarStack({ users, size = 28 }: { users: User[]; size?: number }) {
  return (
    <span className="flex -space-x-2">
      {users.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
    </span>
  );
}

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      title="ID verified"
      className={clsx("inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold text-good", className)}
    >
      ✓ Verified
    </span>
  );
}

/** Deterministic gradient per artist so cards are distinguishable without images. */
export function ArtistArt({ name, className }: { name: string; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <div
      className={clsx("grid shrink-0 place-items-center rounded-xl text-lg font-black text-white/90", className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 25%))` }}
    >
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)}
    </div>
  );
}

export function EventRow({ event, href, right, sub }: { event: Event; href?: string; right?: ReactNode; sub?: ReactNode }) {
  const body = (
    <div className="flex items-center gap-3">
      <ArtistArt name={event.artist.name} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{event.artist.name}</div>
        <div className="truncate text-xs text-muted">
          {event.venue.name} · {fmtShortDate(event.start_at)}
        </div>
        {sub}
      </div>
      {right}
    </div>
  );
  return href ? (
    <Link href={href} className="card block transition hover:bg-raised">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="card border border-bad/30 text-sm text-bad">
      Something went wrong. {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
