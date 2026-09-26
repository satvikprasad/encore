"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";

import { ErrorNote, EventRow, Page, Spinner, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { readPhoto } from "@/lib/exif";
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
    for (let i = 0; i < images.length; i++) {
      setFiles((rows) => rows.map((r, j) => (j === i ? { ...r, status: "reading" } : r)));
      const item = await readPhoto(images[i]);
      if (item) items.push(item);
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
      <TopBar title="Import from camera roll" back="/" />
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
                "flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition",
                dragging ? "border-accent bg-accent/10" : "border-line bg-card hover:border-accent/60",
              )}
            >
              <span className="text-4xl">📸</span>
              <span className="text-lg font-semibold">Choose photos</span>
              <span className="text-sm text-muted">or drop them here. We&apos;ll find the shows you were at from when and where each photo was taken.</span>
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
            <div className="card space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{phase === "reading" ? "Reading photos on your device…" : "Matching to shows…"}</span>
                <span className="text-muted">
                  {read}/{files.length}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line">
                <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${files.length ? (read / files.length) * 100 : 0}%` }} />
              </div>
              <ul className="max-h-[380px] space-y-1 overflow-y-auto text-xs">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted">{f.name}</span>
                    <span
                      className={clsx("shrink-0", {
                        "text-dim": f.status === "queued",
                        "text-accent": f.status === "reading",
                        "text-good": f.status === "found",
                        "text-warn": f.status === "none",
                      })}
                    >
                      {f.status === "queued" ? "waiting" : f.status === "reading" ? "reading…" : f.status === "found" ? "📍 time + place" : "no location"}
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
            <div>
              <h2 className="text-2xl font-bold">
                We found {matches.length} show{matches.length === 1 ? "" : "s"}
              </h2>
              <p className="text-sm text-muted">
                From {files.length} photos
                {itemCount - matchedPhotos > 0 ? ` · ${itemCount - matchedPhotos} didn't match a show` : ""}
                {files.length - itemCount > 0 ? ` · ${files.length - itemCount} had no location` : ""}
              </p>
            </div>
            <ul className="space-y-3">
              {matches.map((m) => (
                <li key={m.cluster_id}>
                  <label
                    className={clsx(
                      "card flex cursor-pointer items-center gap-3 border transition",
                      checked[m.cluster_id] ? "border-accent/60" : "border-transparent",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-violet-500"
                      checked={!!checked[m.cluster_id]}
                      onChange={(e) => setChecked((c) => ({ ...c, [m.cluster_id]: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      {m.suggested === "ask" ? <div className="text-xs text-warn">Were you at…?</div> : null}
                      <div className="truncate font-semibold">{m.event.artist.name}</div>
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
              ))}
            </ul>
            {matches.length ? (
              <button className="btn-primary sticky bottom-4 w-full shadow-lg" disabled={!selected} onClick={confirm}>
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
            <div className="card animate-pop text-center">
              <div className="text-4xl">🎉</div>
              <div className="mt-2 text-xl font-bold">
                Added {added.length} show{added.length === 1 ? "" : "s"}
              </div>
              <p className="text-sm text-muted">Review one to start your ranking.</p>
            </div>
            <ul className="space-y-3">
              {added.map((m) => (
                <li key={m.cluster_id}>
                  <EventRow
                    event={m.event}
                    href={`/review/${m.event.id}`}
                    right={<span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">Review</span>}
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

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-1 text-xs font-semibold",
        value >= 0.8 ? "bg-good/15 text-good" : "bg-warn/15 text-warn",
      )}
    >
      {pct}%
    </span>
  );
}

function PrivacyNote() {
  return <p className="text-center text-xs text-dim">🔒 Photos never leave your device. Only time and location are sent.</p>;
}
