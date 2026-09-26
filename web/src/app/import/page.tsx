"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";

import { IconCamera, IconCheck, IconLock, IconPin } from "@/components/icons";
import { ArtistArt, ErrorNote, EventRow, Page, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { readPhoto } from "@/lib/exif";
import { saveMedia } from "@/lib/media";
import { fmtDate } from "@/lib/format";
import { useUser } from "@/lib/user";
import type { MediaItem, MediaMatch } from "@/types";

type FileStatus = "queued" | "reading" | "found" | "none";
interface FileRow {
  name: string;
  status: FileStatus;
}
type Phase = "pick" | "reading" | "matching" | "results" | "done";

export default function ImportPage() {
  const { userId } = useUser();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [matches, setMatches] = useState<MediaMatch[]>([]);
  const itemFiles = useRef<File[]>([]); // files that produced each posted item, in order
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<MediaMatch[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(list: File[]) {
    const images = list.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|heic|heif|png)$/i.test(f.name));
    if (!images.length) return;
    setError(null);
    setPhase("reading");
    setFiles(images.map((f) => ({ name: f.name, status: "queued" })));

    const items: MediaItem[] = [];
    itemFiles.current = [];
    for (let i = 0; i < images.length; i++) {
      setFiles((rows) => rows.map((r, j) => (j === i ? { ...r, status: "reading" } : r)));
      const item = await readPhoto(images[i]);
      if (item) {
        items.push(item);
        itemFiles.current.push(images[i]);
      }
      setFiles((rows) => rows.map((r, j) => (j === i ? { ...r, status: item ? "found" : "none" } : r)));
    }
    setItemCount(items.length);

    setPhase("matching");
    try {
      const result = await api.mediaMatch(userId, items);
      setMatches(result);
      setChecked(Object.fromEntries(result.map((m) => [m.cluster_id, m.suggested === "auto"])));
      setPhase("results");
    } catch (e) {
      setError(e);
      setPhase("pick");
    }
  }

  async function confirm() {
    const chosen = matches.filter((m) => checked[m.cluster_id]);
    try {
      await api.attendanceConfirm(userId, {
        event_ids: chosen.map((m) => m.event.id),
        evidence: "photo",
        confidences: chosen.map((m) => m.confidence),
      });
      // Keep the photos with the show (in this browser only) so they're there when you look back.
      await Promise.all(
        chosen.map((m) => {
          const files = (m.item_indices ?? []).map((i) => itemFiles.current[i]).filter((f): f is File => !!f);
          return files.length ? saveMedia(userId, m.event.id, files) : Promise.resolve([]);
        }),
      );
      setAdded(chosen);
      setPhase("done");
    } catch (e) {
      setError(e);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    run(Array.from(e.dataTransfer.files));
  }

  const read = files.filter((f) => f.status === "found" || f.status === "none").length;
  const matchedPhotos = matches.reduce((n, m) => n + m.photo_count, 0);
  const selected = matches.filter((m) => checked[m.cluster_id]).length;

  return (
    <>
      <TopBar title="Import from camera roll" back="/log" />
      <Page>
        {error ? <ErrorNote error={error} /> : null}

        {phase === "pick" ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => input.current?.click()}
              className={clsx(
                "relative flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-[32px] border-2 border-dashed px-6 py-14 text-center transition",
                dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/50",
              )}
            >
              <PhotoFan />
              <span className="display text-[28px] leading-none">Choose photos</span>
              <span className="max-w-[260px] text-sm leading-relaxed text-muted">
                or drop them here. We match each photo&apos;s time and place to a show.
              </span>
              <span className="btn-primary pointer-events-none mt-1 px-6 py-3">
                <IconCamera size={18} /> Pick from camera roll
              </span>
              <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => run(Array.from(e.target.files ?? []))}
              />
            </div>
            <PrivacyNote />
          </>
        ) : null}

        {phase === "reading" || phase === "matching" ? (
          <>
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-semibold tracking-tight">{phase === "reading" ? "Reading photos on your device" : "Matching to shows"}</div>
                  <div className="text-xs text-muted">{phase === "reading" ? "Only time and location are read" : "Checking venues and show times"}</div>
                </div>
                <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold tabular-nums text-muted">
                  {read}/{files.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunken">
                <div
                  className={clsx("h-full rounded-full bg-accent transition-all duration-300", phase === "matching" && "animate-pulse")}
                  style={{ width: `${files.length ? (read / files.length) * 100 : 0}%` }}
                />
              </div>
              <ul className="max-h-[360px] space-y-1.5 overflow-y-auto text-xs">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="truncate text-muted">{f.name}</span>
                    <span
                      className={clsx("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium", {
                        "text-dim": f.status === "queued",
                        "bg-accent-soft text-accent": f.status === "reading",
                        "bg-good-soft text-good": f.status === "found",
                        "bg-warn-soft text-warn": f.status === "none",
                      })}
                    >
                      {f.status === "found" ? <IconPin size={11} /> : null}
                      {f.status === "queued" ? "waiting" : f.status === "reading" ? "reading…" : f.status === "found" ? "time + place" : "no location"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {phase === "matching" ? <Spinner label="Checking venues and show times" /> : null}
            <PrivacyNote />
          </>
        ) : null}

        {phase === "results" ? (
          <>
            <div className="px-1">
              <h2 className="display text-[32px] leading-none">
                We found {matches.length} show{matches.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                From {files.length} photos
                {itemCount - matchedPhotos > 0 ? ` · ${itemCount - matchedPhotos} didn't match a show` : ""}
                {files.length - itemCount > 0 ? ` · ${files.length - itemCount} had no location` : ""}
              </p>
            </div>
            <ul className="space-y-3">
              {matches.map((m, i) => {
                const on = !!checked[m.cluster_id];
                return (
                  <li key={m.cluster_id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <label
                      className={clsx(
                        "card flex cursor-pointer items-center gap-3 p-3 transition",
                        on ? "border-accent/60 ring-1 ring-accent/40" : "hover:border-fg/15",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={(e) => setChecked((c) => ({ ...c, [m.cluster_id]: e.target.checked }))}
                      />
                      <span
                        className={clsx(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
                          on ? "border-accent bg-accent text-white" : "border-line bg-surface text-transparent",
                        )}
                      >
                        <IconCheck size={14} strokeWidth={2.6} />
                      </span>
                      <ArtistArt name={m.event.artist.name} image={m.event.image_url} className="h-14 w-14 text-2xl" />
                      <div className="min-w-0 flex-1">
                        {m.suggested === "ask" ? <div className="text-[11px] font-semibold text-warn">Were you at…?</div> : null}
                        <div className="truncate text-[15px] font-semibold tracking-tight">{m.event.artist.name}</div>
                        <div className="truncate text-xs text-muted">
                          {m.event.venue.name} · {fmtDate(m.event.start_at)}
                        </div>
                        <div className="mt-1 text-[11px] text-dim">
                          {m.photo_count} photo{m.photo_count === 1 ? "" : "s"}
                        </div>
                      </div>
                      <ConfidenceChip value={m.confidence} />
                    </label>
                  </li>
                );
              })}
            </ul>
            {matches.length ? (
              <button className="btn-primary sticky bottom-6 w-full" disabled={!selected} onClick={confirm}>
                Confirm {selected} show{selected === 1 ? "" : "s"}
              </button>
            ) : (
              <button className="btn-ghost w-full" onClick={() => setPhase("pick")}>
                Try other photos
              </button>
            )}
          </>
        ) : null}

        {phase === "done" ? (
          <>
            <div className="animate-pop relative overflow-hidden rounded-3xl bg-fg p-6 text-center text-white shadow-lift">
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent opacity-70 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-coral opacity-60 blur-2xl" />
              <div className="relative">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/15">
                  <IconCheck size={24} strokeWidth={2.4} />
                </span>
                <div className="display mt-3 text-[30px] leading-none">
                  Added {added.length} show{added.length === 1 ? "" : "s"}
                </div>
                <p className="mt-2 text-sm text-white/70">Your photos are attached to each show. Review one to start your ranking.</p>
              </div>
            </div>
            <ul className="space-y-3">
              {added.map((m, i) => (
                <li key={m.cluster_id} className="animate-rise" style={{ animationDelay: `${100 + i * 50}ms` }}>
                  <EventRow
                    event={m.event}
                    href={`/review/${m.event.id}`}
                    right={<span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Review</span>}
                  />
                </li>
              ))}
            </ul>
            <Link href="/rank" className="btn-ghost w-full">
              See my ranking
            </Link>
          </>
        ) : null}
      </Page>
    </>
  );
}

/** Three tilted "polaroids" for the empty state. */
function PhotoFan() {
  const tiles = [
    { rot: -12, x: -34, hue: 262 },
    { rot: 0, x: 0, hue: 14 },
    { rot: 12, x: 34, hue: 156 },
  ];
  return (
    <div className="relative h-24 w-40">
      {tiles.map((t, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-24 w-20 rounded-xl border-4 border-white shadow-lift"
          style={{
            transform: `translate(calc(-50% + ${t.x}px), -50%) rotate(${t.rot}deg)`,
            background: `linear-gradient(160deg, hsl(${t.hue} 80% 70%), hsl(${t.hue + 40} 70% 45%))`,
            zIndex: i === 1 ? 2 : 1,
          }}
        />
      ))}
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-1 text-xs font-semibold tabular-nums", value >= 0.8 ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
      {pct}%
    </span>
  );
}

function PrivacyNote() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-dim">
      <IconLock size={13} /> Photos never leave your device. Only time and location are sent.
    </p>
  );
}
