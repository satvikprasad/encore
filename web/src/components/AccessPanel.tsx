import clsx from "clsx";

import type { Venue } from "@/types";

type Tone = "good" | "warn" | "bad";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function AccessPanel({ venue }: { venue: Venue }) {
  const a = venue.access_profile;
  const rows: [string, string, Tone][] = [
    ["Step-free entry", a.step_free ? "Yes" : "No", a.step_free ? "good" : "bad"],
    ["ADA seating", a.ada_seating ? "Yes" : "No", a.ada_seating ? "good" : "bad"],
    ["Quiet room", a.quiet_room ? "Yes" : "No", a.quiet_room ? "good" : "bad"],
    [
      "Strobes",
      a.strobe_policy === "none" ? "None" : a.strobe_policy === "warned" ? "Warned in advance" : "Unrestricted",
      a.strobe_policy === "none" ? "good" : a.strobe_policy === "warned" ? "warn" : "bad",
    ],
    ["ASL interpreter", a.interpreter === "on_request" ? "On request" : "Not offered", a.interpreter === "on_request" ? "good" : "bad"],
  ];
  const okCount = rows.filter((r) => r[2] === "good").length;
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="label">Access</div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-tight">{venue.name}</div>
        </div>
        <span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">
          {okCount}/{rows.length} covered
        </span>
      </div>
      <ul className="divide-y divide-line/70 text-sm">
        {rows.map(([k, v, tone]) => (
          <li key={k} className="flex items-center justify-between py-2.5">
            <span className="text-muted">{k}</span>
            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone])}>{v}</span>
          </li>
        ))}
      </ul>
      {venue.multi_room ? <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-muted">Multi-room venue — check which room your show is in.</p> : null}
    </section>
  );
}
