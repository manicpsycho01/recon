"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invoice } from "@/lib/ledger";
import type { BankTxn, Decisions } from "@/lib/match";
import { loadBank, loadInvoices } from "@/lib/run";
import { gridToInvoices } from "@/lib/ledger";
import { readToGrid } from "@/lib/read";
import { Landing } from "./Landing";
import { SiteHeader } from "./SiteHeader";
import { scrollToEl } from "./SmoothScroll";
import { Workspace } from "./Workspace";

export type Slot =
  | { status: "empty" }
  | { status: "loading"; name: string }
  | { status: "ready"; name: string; count: number }
  | { status: "password"; file: File; wrong: boolean }
  | { status: "error"; message: string };

const empty = (): Decisions => ({ confirmed: new Set(), rejected: new Set(), aliases: new Map() });

/** A short fingerprint of the two files, so review progress can be restored for the same pair. */
function fingerprint(bank: BankTxn[], inv: Invoice[]) {
  let h = 7;
  for (const s of [...bank.map((b) => b.date + b.amount), ...inv.map((i) => i.number + i.open)]) for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `recon:v1:${h}`;
}
function restore(key: string): Decisions {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty();
    const d = JSON.parse(raw) as { confirmed: string[]; rejected: string[]; aliases: [string, string][] };
    return { confirmed: new Set(d.confirmed), rejected: new Set(d.rejected), aliases: new Map(d.aliases) };
  } catch { return empty(); }
}
function persist(key: string, d: Decisions) {
  try { localStorage.setItem(key, JSON.stringify({ confirmed: [...d.confirmed], rejected: [...d.rejected], aliases: [...d.aliases] })); } catch { /* private mode: progress just isn't kept */ }
}

export function App() {
  const [bankSlot, setBankSlot] = useState<Slot>({ status: "empty" });
  const [invSlot, setInvSlot] = useState<Slot>({ status: "empty" });
  const [bank, setBank] = useState<BankTxn[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [names, setNames] = useState<{ bank: string; invoices: string }>({ bank: "", invoices: "" });
  const [work, setWork] = useState<{ key: string; decisions: Decisions } | null>(null);

  const openBank = useCallback(async (f: File, password?: string) => {
    setBankSlot({ status: "loading", name: f.name });
    const r = await loadBank(f, password);
    if (r.ok) { setBank(r.data); setNames((n) => ({ ...n, bank: r.name })); setBankSlot({ status: "ready", name: r.name, count: r.data.length }); }
    else setBankSlot(r.kind === "password" ? { status: "password", file: f, wrong: r.wrong } : { status: "error", message: r.message });
  }, []);
  const openInvoices = useCallback(async (f: File, password?: string) => {
    setInvSlot({ status: "loading", name: f.name });
    const r = await loadInvoices(f, password);
    if (r.ok) { setInvoices(r.data); setNames((n) => ({ ...n, invoices: r.name })); setInvSlot({ status: "ready", name: r.name, count: r.data.length }); }
    else setInvSlot(r.kind === "password" ? { status: "password", file: f, wrong: r.wrong } : { status: "error", message: r.message });
  }, []);

  /** Several files dropped at once: an invoice list is recognised by its columns, everything else is a statement. */
  const openAny = useCallback(async (files: File[]) => {
    for (const f of files.slice(0, 2)) {
      let isInvoices = false;
      try { gridToInvoices(await readToGrid(f)); isInvoices = true; } catch { /* not an invoice list */ }
      await (isInvoices ? openInvoices(f) : openBank(f));
    }
  }, [openBank, openInvoices]);

  const start = useCallback((b = bank, i = invoices) => {
    if (!b || !i) return;
    const key = fingerprint(b, i);
    setWork({ key, decisions: restore(key) });
    requestAnimationFrame(() => scrollToEl(0));
  }, [bank, invoices]);

  const sample = useCallback(async () => {
    const get = async (p: string, n: string) => new File([await (await fetch(p)).blob()], n);
    const [bf, inf] = await Promise.all([get("/samples/kavach-bank-hdfc.csv", "kavach-bank-hdfc.csv"), get("/samples/kavach-invoices-zoho.csv", "kavach-invoices-zoho.csv")]);
    const [b, i] = await Promise.all([loadBank(bf), loadInvoices(inf)]);
    if (b.ok && i.ok) {
      setBank(b.data); setInvoices(i.data); setNames({ bank: b.name, invoices: i.name });
      setBankSlot({ status: "ready", name: b.name, count: b.data.length }); setInvSlot({ status: "ready", name: i.name, count: i.data.length });
      start(b.data, i.data);
    }
  }, [start]);

  const update = useCallback((fn: (d: Decisions) => Decisions) => {
    setWork((w) => {
      if (!w) return w;
      const decisions = fn(w.decisions);
      persist(w.key, decisions);
      return { ...w, decisions };
    });
  }, []);

  const reset = useCallback(() => {
    setWork(null); setBank(null); setInvoices(null);
    setBankSlot({ status: "empty" }); setInvSlot({ status: "empty" });
    requestAnimationFrame(() => scrollToEl(0));
  }, []);

  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length || work) return;
      e.preventDefault();
      void openAny(files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [openAny, work]);

  return (
    <>
      <SiteHeader onHome={work ? reset : undefined} />
      <main id="main">
        {work && bank && invoices ? (
          <Workspace bank={bank} invoices={invoices} names={names} decisions={work.decisions} update={update} onReset={reset} />
        ) : (
          <Landing
            bankSlot={bankSlot} invSlot={invSlot}
            onBank={openBank} onInvoices={openInvoices}
            onClear={(which) => (which === "bank" ? (setBank(null), setBankSlot({ status: "empty" })) : (setInvoices(null), setInvSlot({ status: "empty" })))}
            onStart={() => start()} onSample={sample}
          />
        )}
      </main>
    </>
  );
}
