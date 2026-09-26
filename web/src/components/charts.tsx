"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, LabelList, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { DIMS } from "@/constants";
import { DIM_LABELS, radarData } from "@/lib/dims";
import type { Vec7 } from "@/types";

const ACCENT = "#5B45F5";
const INK_MUTED = "#6B6675";
const LINE = "#E8E4DC";

export function ReviewRadar({ theta, height = 240 }: { theta: Vec7; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={radarData(theta)} outerRadius="72%">
        <PolarGrid stroke={LINE} />
        <PolarAngleAxis dataKey="dim" tick={{ fill: INK_MUTED, fontSize: 11, fontWeight: 500 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.18} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

const TWEEN_MS = 700;

/**
 * Eases from the previously shown vector to `target`. We drive the animation ourselves
 * (Recharts' own update animation is flaky), and always snap to the final value at the
 * end so the bars can never get stuck mid-way.
 */
function useTween(target: Vec7): Vec7 {
  const [shown, setShown] = useState<Vec7>(target);
  const shownRef = useRef(target);
  const key = target.join(",");

  useEffect(() => {
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const set = (v: Vec7) => {
      shownRef.current = v;
      setShown(v);
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      set(from.map((x, i) => x + (target[i] - x) * e) as Vec7);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const snap = setTimeout(() => set(target), TWEEN_MS + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(snap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return shown;
}

/** "What you care about": w_u as horizontal bars, animated between weight vectors. */
export function PreferenceBars({ weights, height = 196 }: { weights: Vec7; height?: number }) {
  const shown = useTween(weights);
  // Highlight the dimension the user cares most about, once there is one.
  const max = Math.max(...weights);
  const top = max - Math.min(...weights) > 0.01 ? weights.indexOf(max) : -1;
  const data = DIMS.map((d, i) => ({ dim: DIM_LABELS[d], value: shown[i], pct: `${Math.round(shown[i] * 100)}%` }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide domain={[0, 0.4]} allowDataOverflow />
        <YAxis type="category" dataKey="dim" width={80} tickLine={false} axisLine={false} tick={{ fill: INK_MUTED, fontSize: 12, fontWeight: 500 }} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} isAnimationActive={false} background={{ fill: "#F1EEE8", radius: 8 }}>
          {data.map((d, i) => (
            <Cell key={d.dim} fill={i === top ? ACCENT : "#C9C1FF"} />
          ))}
          <LabelList dataKey="pct" position="right" fill={INK_MUTED} fontSize={11} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
