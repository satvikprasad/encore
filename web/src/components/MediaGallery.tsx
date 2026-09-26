"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconCamera, IconLock, IconPlus, IconX } from "@/components/icons";
import { deleteMedia, listMedia, saveMedia, type StoredMedia } from "@/lib/media";

/** Object URLs for blobs, revoked when the list changes. */
function useObjectUrls(items: StoredMedia[]): Record<string, string> {
  const urls = useMemo(() => Object.fromEntries(items.map((m) => [m.id, URL.createObjectURL(m.blob)])), [items]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

/**
 * "Your photos & videos" for a show: what the import attached plus anything added here.
 * Everything stays in this browser (IndexedDB); nothing is uploaded.
 */
export function MediaGallery({ userId, eventId, title = "Your photos & videos" }: { userId: string; eventId: string; title?: string }) {
  const [items, setItems] = useState<StoredMedia[]>([]);
  const [open, setOpen] = useState<StoredMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useObjectUrls(items);

  useEffect(() => {
    let live = true;
    listMedia(userId, eventId).then((l) => live && setItems(l));
    return () => {
      live = false;
    };
  }, [userId, eventId]);

  async function add(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const stored = await saveMedia(userId, eventId, files);
    setItems((cur) => [...cur, ...stored]);
    setBusy(false);
  }

  async function remove(m: StoredMedia) {
    await deleteMedia(m.id);
    setItems((cur) => cur.filter((x) => x.id !== m.id));
    setOpen(null);
  }

  const photos = items.filter((m) => m.kind === "image").length;
  const videos = items.length - photos;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="display text-[26px] leading-none">{title}</h2>
        {items.length ? (
          <span className="text-xs text-muted">
            {photos ? `${photos} photo${photos === 1 ? "" : "s"}` : ""}
            {photos && videos ? " · " : ""}
            {videos ? `${videos} video${videos === 1 ? "" : "s"}` : ""}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken shadow-card transition hover:opacity-90">
            {m.kind === "video" ? (
              <video src={urls[m.id]} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[m.id]} alt={m.name} className="h-full w-full object-cover" />
            )}
            {m.kind === "video" ? (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Video</span>
            ) : null}
          </button>
        ))}
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className={clsx(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-xs font-semibold transition",
            items.length ? "border-line text-muted hover:border-accent hover:text-accent" : "col-span-3 aspect-auto py-8 border-line text-muted hover:border-accent hover:text-accent",
          )}
        >
          {items.length ? <IconPlus size={20} /> : <IconCamera size={24} />}
          {items.length ? "Add" : "Add photos or videos from this show"}
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
        <IconLock size={12} /> Stored on this device only — never uploaded.
      </p>

      {open ? <Lightbox item={open} url={urls[open.id]} onClose={() => setOpen(null)} onDelete={() => remove(open)} /> : null}
    </section>
  );
}

function Lightbox({ item, url, onClose, onDelete }: { item: StoredMedia; url: string; onClose: () => void; onDelete: () => void }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("phone-overlay")), []);
  if (!root) return null;
  return createPortal(
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-14">
        <span className="truncate text-xs text-white/70">{item.name}</span>
        <button aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
          <IconX size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {item.kind === "video" ? (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.name} className="max-h-full max-w-full rounded-xl object-contain" />
        )}
      </div>
      <div className="flex justify-center pb-10 pt-2">
        <button onClick={onDelete} className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
          Remove from this show
        </button>
      </div>
    </div>,
    root,
  );
}
