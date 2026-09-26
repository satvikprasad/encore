"use client";

import clsx from "clsx";

import { IconCheck, IconClock, IconPin, IconScale, IconSparkle } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { firstName, fmtDate, fmtMoney, fmtTime } from "@/lib/format";
import type { Plan, User } from "@/types";

export function PlanCard({ plan, members, adopted, onAdopt }: { plan: Plan; members: User[]; adopted: boolean; onAdopt: () => void }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <section
      className={clsx(
        "animate-pop overflow-hidden rounded-3xl border shadow-lift",
        adopted ? "border-good/30 bg-surface" : "border-accent/25 bg-surface",
      )}
    >
      <div className={clsx("flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]", adopted ? "bg-good-soft text-good" : "bg-accent-soft text-accent")}>
        <span className="flex items-center gap-1.5">
          {adopted ? <IconCheck size={14} strokeWidth={2.4} /> : <IconSparkle size={14} />}
          {adopted ? "Adopted plan" : "Proposed plan"}
        </span>
        <span className="rounded-full bg-surface px-2 py-0.5 normal-case tracking-normal text-fg">
          {plan.option.tier_label} · {fmtMoney(plan.option.price)}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <p className="display text-[22px] leading-tight">{plan.summary}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-start gap-2 rounded-2xl bg-sunken p-3">
            <IconClock size={16} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <div className="label">Meet</div>
              <div className="mt-0.5 text-sm font-semibold">{fmtTime(plan.meet_at)}</div>
              <div className="text-xs text-muted">{fmtDate(plan.meet_at).split(",").slice(0, 2).join(",")}</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-2xl bg-sunken p-3">
            <IconPin size={16} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <div className="label">Where</div>
              <div className="mt-0.5 text-sm font-semibold leading-snug">{plan.meet_where}</div>
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {plan.per_member.map((p) => {
            const u = byId.get(p.user_id);
            const pct = Math.round(p.score * 100);
            return (
              <li key={p.user_id} className="flex items-start gap-3 text-sm">
                {u ? <Avatar user={u} size={30} /> : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{u ? firstName(u.name) : p.user_id}</span>
                    <span className="text-xs font-semibold tabular-nums text-muted">{pct}% fit</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{p.note}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
          <IconScale size={15} className="mt-px shrink-0" />
          {plan.compromise_note}
        </p>

        {!adopted ? (
          <button className="btn-primary w-full" onClick={onAdopt}>
            Adopt plan
          </button>
        ) : null}
      </div>
    </section>
  );
}
