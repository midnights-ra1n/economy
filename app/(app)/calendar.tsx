"use client";

import { useState } from "react";
import { dayInMonth } from "@/lib/forecast";

/** `display` is the amount already formatted on the server (the currency setting lives there). */
export type CalendarItem = { key: string; date: string; label: string; amount: number; display: string; transfer: boolean };

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const dot = (it: CalendarItem) => (it.transfer ? "bg-accent" : it.amount < 0 ? "bg-loss" : "bg-gain");

/** Month grid (Monday first), one dot per scheduled debit or credit. Clicking a day narrows the list to it. */
export function MonthCalendar({ month, today, items }: { month: string; today: string; items: CalendarItem[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // JS weeks start on Sunday
  const days = Number(dayInMonth(month, 31).slice(8));
  const byDay = new Map<number, CalendarItem[]>();
  for (const it of items) {
    const d = Number(it.date.slice(8));
    byDay.set(d, [...(byDay.get(d) ?? []), it]);
  }
  const todayDay = today.startsWith(month) ? Number(today.slice(8)) : 0;
  const shown = selected ? (byDay.get(selected) ?? []) : items;
  const dayTitle = selected && new Date(y, m - 1, selected).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,20rem)_1fr]">
      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted" aria-hidden>
          {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <ol className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: offset }, (_, i) => <li key={`pad${i}`} aria-hidden />)}
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1;
            const list = byDay.get(d) ?? [];
            const active = d === selected;
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setSelected(active ? null : d)}
                  aria-pressed={active}
                  aria-label={`${d}${list.length ? `, ${list.length} échéance${list.length > 1 ? "s" : ""}` : ""}`}
                  className={`flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${active ? "ring-2 ring-accent ring-inset" : ""} ${
                    d === todayDay ? "bg-ink text-paper" : d < todayDay ? "text-muted/60 hover:bg-paper" : list.length ? "bg-paper hover:bg-line" : "hover:bg-paper"
                  }`}
                >
                  {d}
                  {/* One dot per item: wraps to a second row on busy days. */}
                  <span className="flex min-h-1 max-w-[80%] flex-wrap justify-center gap-0.5">
                    {list.map((it) => <span key={it.key} className={`size-1 rounded-full ${dot(it)}`} />)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-loss" />Prélèvement</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-gain" />Rentrée</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent" />Virement</span>
        </p>
      </div>
      <div className="self-start" aria-live="polite">
        {selected && (
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="font-medium first-letter:uppercase">{dayTitle}</p>
            <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted hover:text-ink">Tout le mois</button>
          </div>
        )}
        {shown.length ? (
          <ul key={selected ?? 0} className="anim-rise divide-y divide-line">
            {shown.map((it) => (
              <li key={it.key} className={`flex items-center gap-3 py-2 ${!selected && it.date < today ? "opacity-45" : ""}`}>
                <span className={`size-2 shrink-0 rounded-full ${dot(it)}`} />
                <span className="w-10 shrink-0 font-mono text-xs text-muted">{it.date.slice(8)}/{it.date.slice(5, 7)}</span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className={`font-mono text-sm tracking-tight whitespace-nowrap tabular-nums ${it.transfer ? "" : it.amount < 0 ? "text-loss" : "text-gain"}`}>
                  {it.display}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted">{selected ? "Rien de prévu ce jour-là." : "Aucun prélèvement prévu ce mois-ci."}</p>
        )}
      </div>
    </div>
  );
}
