import clsx from "clsx";

import type { Venue } from "@/types";

export function AccessPanel({ venue }: { venue: Venue }) {
  const a = venue.access_profile;
  const rows: [string, string, "good" | "warn" | "bad"][] = [
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
  return (
    <section className="card">
      <div className="label mb-2">Access · {venue.name}</div>
      <ul className="divide-y divide-line/60 text-sm">
        {rows.map(([k, v, tone]) => (
          <li key={k} className="flex items-center justify-between py-2">
            <span className="text-muted">{k}</span>
            <span className={clsx("flex items-center gap-1.5 font-medium", { "text-good": tone === "good", "text-warn": tone === "warn", "text-bad": tone === "bad" })}>
              <span className="text-xs">{tone === "good" ? "●" : tone === "warn" ? "◐" : "○"}</span>
              {v}
            </span>
          </li>
        ))}
      </ul>
      {venue.multi_room ? <p className="mt-2 text-xs text-dim">Multi-room venue: check which room your show is in.</p> : null}
    </section>
  );
}
