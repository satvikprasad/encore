"use client";

import clsx from "clsx";

import { Avatar } from "@/components/ui";
import { firstName, fmtDate, fmtMoney, fmtTime } from "@/lib/format";
import type { Plan, User } from "@/types";

export function PlanCard({ plan, members, adopted, onAdopt }: { plan: Plan; members: User[]; adopted: boolean; onAdopt: () => void }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <section className={clsx("animate-pop rounded-2xl border p-4", adopted ? "border-good/50 bg-good/5" : "border-accent/50 bg-accent/10")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-accent">{adopted ? "📌 Adopted plan" : "✨ Proposed plan"}</span>
        <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold">
          {plan.option.tier_label} · {fmtMoney(plan.option.price)}
        </span>
      </div>
      <p className="text-[15px] font-semibold leading-snug">{plan.summary}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-ink/60 p-2">
          <div className="label">Meet</div>
          <div className="mt-0.5 font-medium">
            {fmtTime(plan.meet_at)} · {fmtDate(plan.meet_at).split(",").slice(0, 2).join(",")}
          </div>
        </div>
        <div className="rounded-xl bg-ink/60 p-2">
          <div className="label">Where</div>
          <div className="mt-0.5 font-medium">{plan.meet_where}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {plan.per_member.map((p) => {
          const u = byId.get(p.user_id);
          return (
            <li key={p.user_id} className="flex items-start gap-2 text-sm">
              {u ? <Avatar user={u} size={26} /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{u ? firstName(u.name) : p.user_id}</span>
                  <span className="text-xs text-muted">{Math.round(p.score * 100)}% fit</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-line">
                  <div className="h-1 rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.round(p.score * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{p.note}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-xl bg-warn/10 p-2 text-xs text-warn">⚖️ {plan.compromise_note}</p>
      {!adopted ? (
        <button className="btn-primary mt-3 w-full" onClick={onAdopt}>
          Adopt plan
        </button>
      ) : null}
    </section>
  );
}
