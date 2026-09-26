"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconCamera, IconPlus, IconUsers, IconX } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { firstName, fmtShortDate } from "@/lib/format";
import type { MediaFile } from "@/types";

interface Upload {
  key: string;
  name: string;
  pct: number;
  error?: string;
}

/**
 * Photos & videos of a show: yours plus everyone you follow. Uploads go to the API's media storage
 * (local disk by default, Supabase when configured) and are visible to the people who follow you.
 */
export function MediaGallery({ userId, eventId, title = "Photos & videos" }: { userId: string; eventId: string; title?: string }) {
  const [items, setItems] = useState<MediaFile[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [open, setOpen] = useState<MediaFile | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api.eventMedia(userId, eventId).then((l) => live && setItems(l), () => live && setItems([]));
    return () => {
      live = false;
    };
  }, [userId, eventId]);

  async function add(files: File[]) {
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setUploads((u) => [...u, { key, name: file.name, pct: 0 }]);
      try {
        const stored = await api.uploadMedia(userId, eventId, file, (pct) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x))));
        setItems((cur) => [stored, ...(cur ?? [])]);
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
  }

  async function remove(m: MediaFile) {
    await api.deleteMedia(userId, m.id);
    setItems((cur) => cur?.filter((x) => x.id !== m.id) ?? cur);
    setOpen(null);
  }

  const list = items ?? [];
  const mine = list.filter((m) => m.user.id === userId).length;
  const friends = list.length - mine;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="display text-[26px] leading-none">{title}</h2>
        {list.length ? (
          <span className="text-xs text-muted">
            {mine ? `${mine} yours` : ""}
            {mine && friends ? " · " : ""}
            {friends ? `${friends} from friends` : ""}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {list.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken shadow-card transition hover:opacity-90">
            {m.kind === "video" ? (
              <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
            )}
            {m.kind === "video" ? (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Video</span>
            ) : null}
            {m.user.id !== userId ? (
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-0.5 pr-1.5 text-[10px] font-semibold text-fg backdrop-blur">
                <Avatar user={m.user} size={16} /> {firstName(m.user.name)}
              </span>
            ) : null}
          </button>
        ))}
        {uploads.map((u) => (
          <div key={u.key} className="relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-sunken text-[10px] text-muted">
            {u.error ? (
              <span className="px-2 text-center text-bad">{u.error}</span>
            ) : (
              <>
                <span className="h-1.5 w-2/3 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(u.pct * 100)}%` }} />
                </span>
                {Math.round(u.pct * 100)}%
              </>
            )}
          </div>
        ))}
        <button
          onClick={() => input.current?.click()}
          className={clsx(
            "flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-xs font-semibold transition",
            list.length || uploads.length ? "aspect-square border-line text-muted hover:border-accent hover:text-accent" : "col-span-3 border-line py-8 text-muted hover:border-accent hover:text-accent",
          )}
        >
          {list.length || uploads.length ? <IconPlus size={20} /> : <IconCamera size={24} />}
          {list.length || uploads.length ? "Add" : "Add photos or videos from this show"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-dim">
        <IconUsers size={12} /> Your uploads are visible to people who follow you.
      </p>

      {open ? <Lightbox item={open} mine={open.user.id === userId} onClose={() => setOpen(null)} onDelete={() => remove(open)} /> : null}
    </section>
  );
}

export function Lightbox({ item, mine, onClose, onDelete }: { item: MediaFile; mine: boolean; onClose: () => void; onDelete?: () => void }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("phone-overlay")), []);
  if (!root) return null;
  return createPortal(
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-14">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <Avatar user={item.user} size={26} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{item.user.name}</span>
            <span className="block truncate text-white/60">
              {item.event.artist.name} · {fmtShortDate(item.event.start_at)}
            </span>
          </span>
        </span>
        <button aria-label="Close" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
          <IconX size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {item.kind === "video" ? (
          <video src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.caption ?? ""} className="max-h-full max-w-full rounded-xl object-contain" />
        )}
      </div>
      <div className="flex flex-col items-center gap-2 pb-10 pt-2">
        {item.caption ? <p className="px-6 text-center text-sm text-white/85">{item.caption}</p> : null}
        {mine && onDelete ? (
          <button onClick={onDelete} className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
            Remove
          </button>
        ) : null}
      </div>
    </div>,
    root,
  );
}
