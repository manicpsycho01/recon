"use client";

import { useRef } from "react";
import { gsap, MOTION, useGSAP } from "@/lib/gsap";
import type { Slot } from "./App";
import { DropSlot } from "./DropSlot";
import { Icon, type IconName } from "./Icon";
import { Footer, REPO } from "./SiteHeader";
import { Threads } from "./Threads";

const HANDLES: { icon: IconName; title: string; body: string }[] = [
  { icon: "percent", title: "TDS deductions", body: "A client paid ₹2,12,400 against ₹2,36,000? That's 10% TDS — matched, and labelled so you can claim the credit." },
  { icon: "coins", title: "Bank charges", body: "Inward remittances that arrive ₹17.70 short still match, flagged as likely bank charges." },
  { icon: "merge", title: "One payment, many invoices", body: "A single transfer that settles two or three invoices from the same client." },
  { icon: "split", title: "One invoice, paid in parts", body: "₹30,000 now and ₹29,000 later — recognised as one ₹59,000 invoice." },
  { icon: "search", title: "Messy names", body: "“BRIGHTLOOP DSGN LLP” is Brightloop Design LLP. Abbreviations, suffixes and “& / and” don’t get in the way." },
  { icon: "spark", title: "Learns as you review", body: "Confirm that Rahul Verma pays for Pixelpeak once, and his other payments match themselves." },
];

const SOURCES = ["Zoho Books", "Tally (Bills Receivable / Payable)", "QuickBooks", "Vyapar", "Any spreadsheet with invoice no., party, date and amount"];

export function Landing({ bankSlot, invSlot, onBank, onInvoices, onClear, onStart, onSample }: {
  bankSlot: Slot;
  invSlot: Slot;
  onBank: (f: File, pw?: string) => void;
  onInvoices: (f: File, pw?: string) => void;
  onClear: (which: "bank" | "invoices") => void;
  onStart: () => void;
  onSample: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const ready = bankSlot.status === "ready" && invSlot.status === "ready";

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => {
      gsap.from("[data-hero] > *", { y: 22, opacity: 0, duration: 0.85, ease: "expo.out", stagger: 0.07 });
      gsap.utils.toArray<HTMLElement>("[data-rise]").forEach((el) =>
        gsap.from(el, { y: 28, opacity: 0, duration: 0.85, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } }),
      );
    });
  }, { scope: root });

  return (
    <div ref={root}>
      <section className="wrap grid gap-10 pt-8 pb-16 sm:pt-12 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pt-16 lg:pb-24 short:pt-8">
        <div data-hero className="lg:col-span-6">
          <p className="label text-muted">Bank reconciliation · for Indian businesses</p>
          <h1 className="display mt-4 text-[clamp(2.6rem,7vw,4.6rem)] text-balance short:text-[clamp(2.4rem,5vw,3.6rem)]">
            Match every payment to its <em className="text-thread">invoice</em>.
          </h1>
          <p className="mt-4 max-w-xl text-[17px] text-ink-2 sm:text-lg">
            <span className="sm:hidden">Drop your bank statement and invoice list. See what&apos;s paid, what isn&apos;t, and what needs a look.</span>
            <span className="hidden sm:inline">Drop your bank statement and your invoice list. Recon matches them in seconds — TDS, bank charges, split and combined payments included — and shows what&apos;s still unpaid.</span>
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <DropSlot id="bank" step="1 · Bank statement" title="Bank statement" hint="CSV, Excel or PDF from net banking" icon="bank" accept=".csv,.txt,.xls,.xlsx,.pdf" slot={bankSlot} onFile={onBank} onClear={() => onClear("bank")} />
            <DropSlot id="invoices" step="2 · Invoices & bills" title="Invoices & bills" hint="Export from Zoho, Tally, QuickBooks or a spreadsheet" icon="receipt" accept=".csv,.txt,.xls,.xlsx" slot={invSlot} onFile={onInvoices} onClear={() => onClear("invoices")} />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onStart}
              disabled={!ready}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[3px] bg-ink px-6 font-semibold text-paper transition-[opacity,transform] hover:-translate-y-px disabled:pointer-events-none disabled:opacity-35"
            >
              <Icon name="link" className="size-5" /> Match them
            </button>
            <button type="button" onClick={onSample} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[3px] border border-line bg-sheet px-5 font-medium hover:border-ink/40">
              Try with sample data
            </button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Icon name="lock" className="size-3.5 shrink-0" /> Both files are read on this device. Nothing is uploaded. No sign-up.
          </p>
        </div>

        <div className="hidden md:block lg:col-span-6">
          <Threads />
        </div>
      </section>

      <section aria-labelledby="handles-title" className="border-t border-line bg-sheet">
        <div className="wrap py-16 md:py-24">
          <div data-rise className="max-w-2xl">
            <p className="label text-muted">What it handles</p>
            <h2 id="handles-title" className="display mt-3 text-[clamp(2rem,4.5vw,3.25rem)] text-balance">The awkward cases are the whole point.</h2>
          </div>
          <ul data-rise className="mt-10 grid gap-px overflow-hidden rounded-[3px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {HANDLES.map((h) => (
              <li key={h.title} className="bg-sheet p-6">
                <Icon name={h.icon} className="size-6 text-thread" />
                <h3 className="mt-4 text-lg font-semibold">{h.title}</h3>
                <p className="mt-1 text-[15px] text-ink-2">{h.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="decide-title" className="border-t border-line">
        <div className="wrap grid gap-10 py-16 md:grid-cols-12 md:py-24">
          <div data-rise className="md:col-span-5">
            <p className="label text-muted">How it decides</p>
            <h2 id="decide-title" className="display mt-3 text-[clamp(2rem,4.5vw,3.25rem)] text-balance">Every match shows its working.</h2>
            <p className="mt-4 text-ink-2">Four signals, each one visible on the match. Only confident, unambiguous pairs are matched automatically — everything else waits for you.</p>
          </div>
          <ol data-rise className="flex flex-col divide-y divide-line rounded-[3px] border border-line bg-sheet md:col-span-7">
            {[
              ["Amount", "Exact, or short by a TDS rate (1/2/5/10%) or by bank charges.", "45"],
              ["Invoice number", "Quoted in the narration — in full, or just its digits.", "30"],
              ["Party name", "The payer is the invoice's customer, abbreviations allowed.", "30"],
              ["Date", "Paid after it was raised, around when it was due.", "10"],
            ].map(([t, d, pts]) => (
              <li key={t} className="flex items-start gap-4 p-5">
                <span className="num display w-12 shrink-0 text-right text-3xl leading-none text-thread">{pts}</span>
                <span><span className="font-semibold">{t}.</span> <span className="text-ink-2">{d}</span></span>
              </li>
            ))}
            <li className="p-5 text-[15px] text-ink-2">
              <span className="font-semibold text-ink">85+ and no close rival</span> → matched automatically. <span className="font-semibold text-ink">50–84</span>, or two invoices that fit almost equally → sent to your review queue.
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="sources-title" className="border-t border-line bg-ink text-paper">
        <div className="wrap grid gap-8 py-16 md:grid-cols-12 md:py-24">
          <div data-rise className="md:col-span-6">
            <p className="label text-paper/60">Works with what you have</p>
            <h2 id="sources-title" className="display mt-3 text-[clamp(2rem,4.5vw,3.25rem)] text-balance">Your bank. Your books. No integrations.</h2>
            <p className="mt-4 text-paper/75">Bank statements from HDFC, ICICI, SBI, Axis, Kotak and others — CSV, Excel or PDF, including password-protected PDFs. Invoice lists from:</p>
          </div>
          <ul data-rise className="flex flex-col gap-3 text-[15px] text-paper/85 md:col-span-6 md:pt-2">
            {SOURCES.map((s) => <li key={s} className="flex gap-3"><Icon name="check" className="mt-1 size-4 shrink-0 text-thread" /> {s}</li>)}
            <li className="flex gap-3"><Icon name="lock" className="mt-1 size-4 shrink-0 text-thread" />
              <p>Everything runs in your browser — <a href={REPO} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-paper">read the source</a>.</p>
            </li>
          </ul>
        </div>
      </section>
      <Footer />
    </div>
  );
}
