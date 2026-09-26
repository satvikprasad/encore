"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconAlert, IconBack, IconCheck, IconHome, IconPlus, IconSearch, IconUser, IconX } from "@/components/icons";
import { fmtShortDate } from "@/lib/format";
import type { Event, User } from "@/types";

function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string | true; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 flex h-[96px] items-end gap-3 bg-canvas/80 px-4 pb-3 backdrop-blur-xl">
      {back ? (
        <button
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg shadow-card transition hover:bg-sunken active:scale-95"
          onClick={() => (back === true ? router.back() : router.push(back))}
        >
          <IconBack size={18} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{title}</div>
      {right}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={clsx("space-y-5 px-4 pb-12 pt-2", className)}>{children}</main>;
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-baseline justify-between px-1", className)}>
      <h2 className="display text-[26px] leading-none">{children}</h2>
      {right}
    </div>
  );
}

export function Avatar({ user, size = 36, ring, className }: { user: Pick<User, "avatar" | "name">; size?: number; ring?: boolean; className?: string }) {
  const h = hue(user.name);
  return (
    <span
      title={user.name}
      className={clsx("inline-grid shrink-0 place-items-center rounded-full", ring && "ring-[2.5px] ring-surface", className)}
      style={{ width: size, height: size, fontSize: size * 0.48, background: `hsl(${h} 70% 92%)` }}
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
      className={clsx("inline-flex items-center gap-0.5 rounded-full bg-good-soft py-0.5 pl-1 pr-2 text-[10px] font-semibold text-good", className)}
    >
      <IconCheck size={11} strokeWidth={2.6} /> Verified
    </span>
  );
}

/** The show's poster from the venue site when we have one; otherwise a deterministic gradient per artist. */
export function ArtistArt({ name, image, className, big }: { name: string; image?: string | null; className?: string; big?: boolean }) {
  const h = hue(name);
  const h2 = (h + 50) % 360;
  const h3 = (h + 300) % 360;
  return (
    <div
      className={clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-2xl text-white", className)}
      style={{
        background: [
          `radial-gradient(circle at 20% 15%, hsl(${h2} 95% 72%) 0%, transparent 55%)`,
          `radial-gradient(circle at 85% 90%, hsl(${h3} 85% 60%) 0%, transparent 60%)`,
          `linear-gradient(135deg, hsl(${h} 75% 58%), hsl(${h} 65% 38%))`,
        ].join(","),
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className={clsx("display relative drop-shadow-sm", big ? "italic" : "")}>
          {name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)}
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/5" />
    </div>
  );
}

export function EventRow({ event, href, right, sub, className }: { event: Event; href?: string; right?: ReactNode; sub?: ReactNode; className?: string }) {
  const body = (
    <div className="flex items-center gap-3.5">
      <ArtistArt name={event.artist.name} image={event.image_url} className="h-14 w-14 text-2xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-tight">{event.artist.name}</div>
        <div className="truncate text-xs text-muted">
          {event.venue.name} · {fmtShortDate(event.start_at)}
        </div>
        {sub}
      </div>
      {right}
    </div>
  );
  return href ? (
    <Link href={href} className={clsx("card block p-3 transition hover:-translate-y-0.5 hover:shadow-lift", className)}>
      {body}
    </Link>
  ) : (
    <div className={clsx("card p-3", className)}>{body}</div>
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
    <div className="flex items-start gap-2 rounded-2xl border border-bad/20 bg-bad-soft p-3 text-sm text-bad">
      <IconAlert size={18} className="mt-px shrink-0" />
      <span>Something went wrong. {error instanceof Error ? error.message : String(error)}</span>
    </div>
  );
}

/** Match / fit percentage as a small ring. */
export function Ring({ pct, size = 52, stroke = 5, className }: { pct: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={clsx("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEEBFF" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#5B45F5"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold tabular-nums tracking-tight" style={{ fontSize: size * 0.25 }}>
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/** Search input styled as a pill. Controlled; `onSubmit` fires on Enter. */
export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <label className="flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface pl-4 pr-2 shadow-card transition focus-within:border-accent">
      <IconSearch size={18} className="shrink-0 text-muted" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-dim"
      />
      {value ? (
        <button aria-label="Clear" onClick={() => onChange("")} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-sunken">
          <IconX size={15} />
        </button>
      ) : null}
    </label>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-full border border-line bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet, rendered into the phone frame's overlay layer. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("phone-overlay")), []);
  if (!open || !root) return null;
  return createPortal(
    <div className="pointer-events-auto absolute inset-0 flex items-end">
      <button aria-label="Close" className="animate-fade absolute inset-0 bg-fg/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-slide-up relative w-full rounded-t-[32px] bg-surface px-5 pb-9 pt-3 shadow-lift">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>,
    root,
  );
}

const TABS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/search", label: "Search", Icon: IconSearch },
  { href: "/log", label: "Log", Icon: IconPlus },
  { href: "/profile", label: "You", Icon: IconUser },
];
const TAB_ROUTES = new Set(["/", "/search", "/log", "/profile", "/rank"]);

/** Floating tab bar on the top-level screens. */
export function TabBar() {
  const path = usePathname();
  if (!TAB_ROUTES.has(path)) return null;
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 px-5 pb-6 pt-3">
      <div className="mx-auto flex items-center justify-around rounded-full border border-white/60 bg-surface/85 p-1.5 shadow-lift backdrop-blur-xl">
        {TABS.map(({ href, label, Icon }) => {
          const on = path === href || (href === "/profile" && path === "/rank");
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-semibold transition",
                on ? "bg-fg text-white" : "text-muted hover:text-fg",
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
