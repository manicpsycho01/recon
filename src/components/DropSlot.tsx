"use client";

import { useRef, useState } from "react";
import type { Slot } from "./App";
import { Icon, type IconName } from "./Icon";

/** One input: a bank statement or an invoice list. Shows its own loading, ready, password and error states. */
export function DropSlot({ id, step, title, hint, icon, accept, slot, onFile, onClear }: {
  id: string;
  step: string;
  title: string;
  hint: string;
  icon: IconName;
  accept: string;
  slot: Slot;
  onFile: (f: File, password?: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pw, setPw] = useState("");
  const ready = slot.status === "ready";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={`relative rounded-2xl border bg-sheet transition-[border-color,box-shadow,background-color] duration-300 ${
        over ? "border-thread bg-thread-soft shadow-[0_0_0_4px_var(--color-thread-soft)]" : ready ? "border-thread/50" : slot.status === "error" ? "border-rose/50" : "border-line"
      }`}
    >
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${ready ? "bg-thread text-sheet" : "bg-paper text-ink"}`}>
          {ready ? <Icon name="check" className="size-5" strokeWidth={2.4} /> : <Icon name={icon} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label text-muted">{step}</p>
          <h2 className="mt-0.5 text-[17px] font-semibold">{title}</h2>

          {slot.status === "ready" && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-2">
              <span className="max-w-full truncate font-medium text-ink">{slot.name}</span>
              <span className="text-muted">· {slot.count} {id === "bank" ? "transactions" : "open items"}</span>
            </p>
          )}
          {slot.status === "loading" && <p className="mt-1 text-[14px] text-muted" role="status">Reading {slot.name}…</p>}
          {slot.status === "empty" && <p className="mt-1 text-[14px] text-muted">{hint}</p>}
          {slot.status === "error" && <p className="mt-1 text-[14px] text-rose" role="alert">{slot.message}</p>}
          {slot.status === "password" && (
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (pw) onFile(slot.file, pw); }}>
              <label className="sr-only" htmlFor={`${id}-pw`}>PDF password</label>
              <input id={`${id}-pw`} type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="PDF password" className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 outline-none focus:border-ink" />
              <button type="submit" disabled={!pw} className="min-h-11 rounded-lg bg-ink px-4 text-[15px] font-medium text-paper disabled:opacity-40">Open</button>
              {slot.wrong && <p className="text-[14px] text-rose sm:hidden" role="alert">Wrong password.</p>}
            </form>
          )}
        </div>
        {ready ? (
          <button type="button" onClick={onClear} className="-m-1 min-h-11 shrink-0 rounded-lg px-2 text-[14px] text-muted underline underline-offset-4 hover:text-ink" aria-label={`Change ${title.toLowerCase()}`}>
            Change
          </button>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-[14px] font-medium hover:border-ink/40" aria-label={`Choose ${title.toLowerCase()}`}>
            Choose
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-label={`${title} file`} data-slot={id} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}
