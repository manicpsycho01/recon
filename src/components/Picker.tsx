"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { day, money } from "@/lib/format";
import { lenisStore } from "./SmoothScroll";
import { Icon } from "./Icon";

export type PickItem = { id: number; title: string; sub: string; amount: number; score: number; fit: string | null };

/** Modal list for matching by hand: pick one or more items whose total settles the target. */
export function Picker({ title, target, items, onPick, onClose }: {
  title: string;
  target: { label: string; amount: number };
  items: PickItem[];
  onPick: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => !n || i.title.toLowerCase().includes(n) || i.sub.toLowerCase().includes(n) || String(i.amount).includes(n)).slice(0, 40);
  }, [items, q]);
  const total = sel.reduce((s, id) => s + Math.abs(items.find((i) => i.id === id)!.amount), 0);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    lenisStore.current?.stop();
    document.documentElement.style.overflow = "hidden";
    search.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { lenisStore.current?.start(); document.documentElement.style.overflow = ""; window.removeEventListener("keydown", key); opener?.focus(); };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-lenis-prevent className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[min(88dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[4px] border border-line bg-sheet sm:rounded-[3px]">
        <div className="border-b border-line p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-0.5 truncate text-[14px] text-muted">{target.label} · <span className="num text-ink">{money(target.amount)}</span></p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-m-1 grid size-11 shrink-0 place-items-center rounded-[3px] hover:bg-paper"><Icon name="x" /></button>
          </div>
          <label className="relative mt-3 block">
            <span className="sr-only">Search</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by party, number or amount" className="min-h-12 w-full rounded-[3px] border border-line bg-paper pr-4 pl-10 outline-none focus:border-ink" />
          </label>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
          {shown.map((i) => {
            const on = sel.includes(i.id);
            return (
              <li key={i.id}>
                <label className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 sm:px-5 ${on ? "bg-thread-soft shadow-[inset_3px_0_0_var(--color-thread)]" : "hover:bg-paper"}`}>
                  <input type="checkbox" checked={on} onChange={() => setSel((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))} className="size-5 shrink-0 accent-[var(--color-thread)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.title}</span>
                    <span className="block truncate text-[13px] text-muted">{i.sub}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="num font-semibold">{money(i.amount)}</span>
                    {i.fit && <span className="text-[12px] text-thread">{i.fit}</span>}
                  </span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="p-8 text-center text-muted">Nothing matches that search.</li>}
        </ul>

        <div className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-[14px] text-muted" aria-live="polite">
            {sel.length ? <>Selected <span className="num text-ink">{money(total)}</span> of <span className="num text-ink">{money(target.amount)}</span></> : "Select one or more."}
          </p>
          <button type="button" disabled={!sel.length} onClick={() => onPick(sel)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[3px] bg-ink px-5 font-semibold text-paper disabled:opacity-35">
            <Icon name="link" className="size-4" /> Match {sel.length > 1 ? `${sel.length} items` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export const pickDate = day;
