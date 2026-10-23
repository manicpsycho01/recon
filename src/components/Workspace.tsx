"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Invoice } from "@/lib/ledger";
import { agingBucket, matchKey, overdueDays, rankInvoicesFor, rankPaymentsFor, reconcile, reminderText, type BankTxn, type Decisions, type Match } from "@/lib/match";
import { nameSim, normName } from "@/lib/names";
import { day, downloadCsv, inr, inrShort, money } from "@/lib/format";
import { gsap, MOTION, useGSAP } from "@/lib/gsap";
import { Icon } from "./Icon";
import { MatchCard } from "./MatchCard";
import { Picker, type PickItem } from "./Picker";
import { Footer } from "./SiteHeader";
import { lenisStore } from "./SmoothScroll";

type Tab = "review" | "matched" | "unmatched" | "unpaid";
const BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

export function Workspace({ bank, invoices, names, decisions, update, onReset }: {
  bank: BankTxn[];
  invoices: Invoice[];
  names: { bank: string; invoices: string };
  decisions: Decisions;
  update: (fn: (d: Decisions) => Decisions) => void;
  onReset: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const result = useMemo(() => reconcile(bank, invoices, decisions), [bank, invoices, decisions]);
  const asOf = bank[bank.length - 1]!.date;
  const review = result.matches.filter((m) => m.status === "review");
  const matched = result.matches.filter((m) => m.status !== "review");
  const [tab, setTab] = useState<Tab>(review.length ? "review" : "matched");
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | { kind: "bank"; id: number } | { kind: "invoice"; id: number }>(null);

  const say = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 3200); }, []);

  // ---------- decisions ----------
  const learn = (d: Decisions, bankIds: number[], invIds: number[]) => {
    const party = invoices[invIds[0]!]!.party;
    for (const b of bankIds) if (nameSim(bank[b]!.party, party) < 0.85) d.aliases.set(normName(bank[b]!.party), normName(party));
  };
  const confirm = (m: Match) => {
    update((d) => { const n = { ...d, confirmed: new Set(d.confirmed).add(m.key), aliases: new Map(d.aliases) }; learn(n, m.bank, m.invoices); return n; });
    say("Confirmed. Recon will remember this payer.");
  };
  const reject = (m: Match) => {
    update((d) => { const confirmed = new Set(d.confirmed); confirmed.delete(m.key); return { ...d, confirmed, rejected: new Set(d.rejected).add(m.key) }; });
    say(m.status === "review" ? "Marked as not a match. It won't be suggested again." : "Unmatched. Both sides are open again.");
  };
  const manual = (bankIds: number[], invIds: number[]) => {
    const key = matchKey(bankIds, invIds);
    update((d) => { const rejected = new Set(d.rejected); rejected.delete(key); const n = { ...d, rejected, confirmed: new Set(d.confirmed).add(key), aliases: new Map(d.aliases) }; learn(n, bankIds, invIds); return n; });
    setPicker(null);
    say("Matched by hand.");
  };
  const forget = (alias: string) => update((d) => { const aliases = new Map(d.aliases); aliases.delete(alias); return { ...d, aliases }; });
  const clearAll = () => { update(() => ({ confirmed: new Set(), rejected: new Set(), aliases: new Map() })); say("All your decisions were cleared."); };

  // ---------- numbers ----------
  const credits = bank.filter((b) => b.amount > 0);
  const inTotal = credits.reduce((s, b) => s + b.amount, 0);
  const matchedIds = new Set(matched.flatMap((m) => m.bank));
  const inMatched = credits.filter((b) => matchedIds.has(b.id)).reduce((s, b) => s + b.amount, 0);
  const openInv = result.openInvoices.map((i) => invoices[i]!);
  const receivable = openInv.filter((i) => i.kind === "invoice");
  const payable = openInv.filter((i) => i.kind === "bill");
  const overdue = receivable.filter((i) => overdueDays(i, asOf) > 0);
  const unmatched = result.unmatchedBank.map((i) => bank[i]!);

  // Always open the workspace at the top, whatever was scrolled on the landing page.
  useEffect(() => {
    lenisStore.current?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
  }, []);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => { gsap.from("[data-in]", { y: 18, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.06 }); });
  }, { scope: root });

  const exportStatement = () => {
    const byBank = new Map<number, Match>();
    for (const m of result.matches) for (const b of m.bank) byBank.set(b, m);
    downloadCsv(names.bank.replace(/\.[^.]+$/, "") + "-reconciled.csv", [
      ["Date", "Narration", "Party", "Amount", "Status", "Matched to", "Score"],
      ...bank.map((b) => { const m = byBank.get(b.id); return [b.date, b.description, b.party, b.amount, m ? (m.status === "review" ? "Needs review" : m.status === "auto" ? "Matched" : "Confirmed") : "Unmatched", m ? m.invoices.map((i) => invoices[i]!.number).join(" + ") : "", m ? String(m.score) : ""]; }),
    ]);
  };
  const exportOpen = () => downloadCsv("open-invoices-" + asOf + ".csv", [
    ["Type", "Number", "Party", "Date", "Due", "Open amount", "Days overdue", "Aging"],
    ...openInv.map((i) => { const d = overdueDays(i, asOf); return [i.kind === "invoice" ? "Receivable" : "Payable", i.number, i.party, i.date, i.due ?? "", i.open, String(Math.max(0, d)), agingBucket(d)]; }),
  ]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "review", label: "Needs review", count: review.length },
    { id: "matched", label: "Matched", count: matched.length },
    { id: "unmatched", label: "Unmatched payments", count: unmatched.length },
    { id: "unpaid", label: "Unpaid", count: openInv.length },
  ];

  return (
    <div ref={root}>
      <section className="wrap pt-8 pb-6 md:pt-12">
        <div data-in className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="label text-muted">Reconciliation · {day(bank[0]!.date)} – {day(asOf)}</p>
            <p className="mt-1 truncate text-[15px]"><span className="font-medium">{names.bank}</span> <span className="text-muted">({bank.length} transactions)</span></p>
            <p className="truncate text-[15px]"><span className="font-medium">{names.invoices}</span> <span className="text-muted">({invoices.length} open items)</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onReset} aria-label="New reconciliation" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium whitespace-nowrap text-paper hover:opacity-90">
              <Icon name="upload" className="size-4" /> New<span className="hidden sm:inline"> files</span>
            </button>
            <button type="button" onClick={exportStatement} aria-label="Download reconciled statement" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-sheet px-4 text-[15px] whitespace-nowrap hover:border-ink/40">
              <Icon name="download" className="size-4" /> Statement<span className="hidden sm:inline"> CSV</span>
            </button>
            <button type="button" onClick={exportOpen} aria-label="Download open invoices" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-sheet px-4 text-[15px] whitespace-nowrap hover:border-ink/40">
              <Icon name="download" className="size-4" /> Unpaid<span className="hidden sm:inline"> CSV</span>
            </button>
          </div>
        </div>

        <div data-in className="mt-8 md:mt-10">
          <h1 className="display text-[clamp(2.2rem,5.5vw,3.75rem)] text-balance">
            {inr(inMatched)} of {inr(inTotal)} received is <span className="text-thread">matched</span>.
          </h1>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-line-2" role="img" aria-label={`${Math.round((inMatched / Math.max(inTotal, 1)) * 100)}% of money received is matched`}>
            <div className="h-full rounded-full bg-thread transition-[width] duration-700 ease-out-expo" style={{ width: `${(inMatched / Math.max(inTotal, 1)) * 100}%` }} />
          </div>
        </div>

        <dl data-in className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-sheet lg:grid-cols-4">
          {[
            ["Matched", String(matched.length), `${matched.filter((m) => m.status === "auto").length} automatically`, "text-thread"],
            ["Needs review", String(review.length), review.length ? "your call on each" : "nothing waiting", review.length ? "text-review" : ""],
            ["Unmatched payments", String(unmatched.length), `${inrShort(unmatched.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0))} in · ${inrShort(-unmatched.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0))} out`, ""],
            ["Owed to you", inr(receivable.reduce((s, i) => s + i.open, 0)), `${inrShort(overdue.reduce((s, i) => s + i.open, 0))} overdue · ${receivable.length} invoices`, overdue.length ? "text-rose" : ""],
          ].map(([label, value, sub, tone], i) => (
            <div key={label} className={`min-w-0 p-5 md:p-6 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              <dt className="label text-muted">{label}</dt>
              <dd className={`num mt-2 truncate text-[clamp(1.35rem,3vw,1.9rem)] font-semibold leading-tight ${tone}`}>{value}</dd>
              <dd className="mt-1 text-[13px] leading-snug text-muted">{sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="wrap pb-16 md:pb-24">
        <div role="tablist" aria-label="Results" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`relative min-h-12 shrink-0 px-3 text-[15px] whitespace-nowrap transition-colors ${tab === t.id ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.label} <span className={`num ml-1 rounded-full px-2 py-0.5 text-[12px] ${tab === t.id ? "bg-ink text-paper" : "bg-line-2"}`}>{t.count}</span>
              {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" className="mt-6">
          {tab === "review" && <Review matches={review} bank={bank} invoices={invoices} onConfirm={confirm} onReject={reject} />}
          {tab === "matched" && (
            matched.length ? (
              <ul className="flex flex-col gap-4">
                {matched.map((m) => <li key={m.key}><MatchCard m={m} bank={bank} invoices={invoices} onReject={() => reject(m)} /></li>)}
              </ul>
            ) : <Empty text="Nothing matched yet." />
          )}
          {tab === "unmatched" && <Unmatched txns={unmatched} hasOpen={(b) => openInv.some((i) => (b.amount > 0) === (i.kind === "invoice"))} onFind={(id) => setPicker({ kind: "bank", id })} />}
          {tab === "unpaid" && <Unpaid receivable={receivable} payable={payable} asOf={asOf} onFind={(id) => setPicker({ kind: "invoice", id })} say={say} />}
        </div>

        {(decisions.aliases.size > 0 || decisions.confirmed.size > 0 || decisions.rejected.size > 0) && (
          <div className="mt-12 rounded-2xl border border-line bg-sheet p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">What Recon learned from you</h2>
              <button type="button" onClick={clearAll} className="min-h-11 text-[14px] text-muted underline underline-offset-4 hover:text-ink">Clear my decisions</button>
            </div>
            <p className="mt-1 text-[14px] text-muted">{decisions.confirmed.size} confirmed · {decisions.rejected.size} marked not a match · saved in this browser only</p>
            {decisions.aliases.size > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...decisions.aliases].map(([from, to]) => (
                  <li key={from} className="inline-flex items-center gap-1 rounded-full bg-thread-soft py-1 pr-1 pl-3 text-[13px] text-thread">
                    “{from}” pays for “{to}”
                    <button type="button" onClick={() => forget(from)} aria-label={`Forget ${from}`} className="grid size-8 place-items-center rounded-full hover:bg-sheet/60"><Icon name="x" className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {picker?.kind === "bank" && (() => {
        const b = bank[picker.id]!;
        const items: PickItem[] = rankInvoicesFor(b, openInv, decisions.aliases).map((c) => ({ id: c.inv.id, title: `${c.inv.number} · ${c.inv.party}`, sub: `Raised ${day(c.inv.date)}${c.inv.due ? ` · due ${day(c.inv.due)}` : ""}`, amount: c.inv.open, score: c.score, fit: c.fit }));
        return <Picker title={b.amount > 0 ? "Which invoice does this pay?" : "Which bill does this pay?"} target={{ label: `${b.party} · ${day(b.date)}`, amount: Math.abs(b.amount) }} items={items} onPick={(ids) => manual([b.id], ids)} onClose={() => setPicker(null)} />;
      })()}
      {picker?.kind === "invoice" && (() => {
        const inv = invoices[picker.id]!;
        const items: PickItem[] = rankPaymentsFor(inv, unmatched, decisions.aliases).map((c) => ({ id: c.b.id, title: c.b.party, sub: `${day(c.b.date)} · ${c.b.description}`, amount: Math.abs(c.b.amount), score: c.score, fit: c.fit }));
        return <Picker title="Which payment settles this?" target={{ label: `${inv.number} · ${inv.party}`, amount: inv.open }} items={items} onPick={(ids) => manual(ids, [inv.id])} onClose={() => setPicker(null)} />;
      })()}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toast && <p className="pointer-events-auto rounded-full bg-ink px-5 py-3 text-[14px] text-paper shadow-xl">{toast}</p>}
      </div>
      <Footer />
    </div>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="ledger rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-semibold">{text}</p>
      {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

/** Review queue: one card in focus; A / Enter confirm, R / X not a match, J / K move. */
function Review({ matches, bank, invoices, onConfirm, onReject }: {
  matches: Match[]; bank: BankTxn[]; invoices: Invoice[]; onConfirm: (m: Match) => void; onReject: (m: Match) => void;
}) {
  const [at, setAt] = useState(0);
  const cur = Math.min(at, matches.length - 1);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input,textarea,select,[role=dialog]") || !matches.length) return;
      const m = matches[cur]!;
      if (e.key === "a" || e.key === "A" || (e.key === "Enter" && t === document.body)) { e.preventDefault(); onConfirm(m); }
      else if (e.key === "r" || e.key === "R" || e.key === "x" || e.key === "X") { e.preventDefault(); onReject(m); }
      else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setAt(Math.min(cur + 1, matches.length - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setAt(Math.max(cur - 1, 0)); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [matches, cur, onConfirm, onReject]);
  useEffect(() => {
    document.querySelector(`[data-match="${matches[cur]?.key}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cur, matches]);

  if (!matches.length) return <Empty text="Review queue is clear." sub="Every suggested match has been confirmed or set aside." />;
  return (
    <div>
      <p className="mb-4 hidden items-center gap-2 text-[14px] text-muted md:flex">
        <Icon name="keyboard" className="size-4" /> <kbd className="label rounded border border-line px-1.5">A</kbd> confirm · <kbd className="label rounded border border-line px-1.5">R</kbd> not a match · <kbd className="label rounded border border-line px-1.5">J</kbd>/<kbd className="label rounded border border-line px-1.5">K</kbd> next / previous
      </p>
      <ul className="flex flex-col gap-4">
        {matches.map((m, i) => (
          <li key={m.key}>
            <MatchCard m={m} bank={bank} invoices={invoices} active={i === cur} onFocus={() => setAt(i)} onConfirm={() => onConfirm(m)} onReject={() => onReject(m)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Unmatched({ txns, hasOpen, onFind }: { txns: BankTxn[]; hasOpen: (b: BankTxn) => boolean; onFind: (id: number) => void }) {
  const [flow, setFlow] = useState<"in" | "out">("in");
  const list = txns.filter((b) => (flow === "in" ? b.amount > 0 : b.amount < 0));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[15px] text-muted">Payments with no invoice or bill. Some are expected (salaries, taxes, interest); for the rest, find the invoice by hand.</p>
        <div className="flex rounded-xl border border-line bg-sheet p-1" role="group" aria-label="Direction">
          {(["in", "out"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={flow === f} onClick={() => setFlow(f)} className={`min-h-11 rounded-lg px-4 text-[14px] ${flow === f ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
              {f === "in" ? "Money in" : "Money out"} ({txns.filter((b) => (f === "in" ? b.amount > 0 : b.amount < 0)).length})
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {list.map((b) => (
            <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3.5 md:grid-cols-[6.5rem_1fr_9rem_auto]">
              <span className="num order-2 col-span-2 text-[13px] text-muted md:order-none md:col-span-1 md:text-[14px]">{day(b.date)}</span>
              <span className="order-1 min-w-0 md:order-none">
                <span className="block truncate font-medium">{b.party}</span>
                <span className="block truncate text-[13px] text-muted" title={b.description}>{b.description}</span>
              </span>
              <span className={`num order-1 text-right font-semibold md:order-none ${b.amount > 0 ? "text-thread" : ""}`}>{b.amount > 0 ? "+" : "−"}{money(b.amount)}</span>
              <span className="order-3 col-span-2 md:order-none md:col-span-1">
                <button type="button" disabled={!hasOpen(b)} onClick={() => onFind(b.id)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-3 text-[14px] font-medium hover:border-ink/40 disabled:opacity-35 md:w-auto">
                  <Icon name="link" className="size-4" /> {b.amount > 0 ? "Find invoice" : "Find bill"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : <div className="mt-4"><Empty text={flow === "in" ? "Every payment received is matched." : "Every payment made is matched."} /></div>}
    </div>
  );
}

function Unpaid({ receivable, payable, asOf, onFind, say }: { receivable: Invoice[]; payable: Invoice[]; asOf: string; onFind: (id: number) => void; say: (s: string) => void }) {
  const [side, setSide] = useState<"receivable" | "payable">("receivable");
  const list = (side === "receivable" ? receivable : payable).map((i) => ({ i, d: overdueDays(i, asOf) })).sort((a, b) => b.d - a.d);
  const totals = BUCKETS.map((k) => ({ k, v: list.filter((x) => agingBucket(x.d) === k).reduce((s, x) => s + x.i.open, 0), n: list.filter((x) => agingBucket(x.d) === k).length }));
  const max = Math.max(1, ...totals.map((t) => t.v));
  const copy = async (inv: Invoice) => {
    try { await navigator.clipboard.writeText(reminderText(inv, asOf)); say(`Reminder for ${inv.number} copied.`); }
    catch { say("Couldn't copy — your browser blocked the clipboard."); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted">Still open as of {day(asOf)} (the last day of the statement).</p>
        <div className="flex rounded-xl border border-line bg-sheet p-1" role="group" aria-label="Side">
          {(["receivable", "payable"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={side === f} onClick={() => setSide(f)} className={`min-h-11 rounded-lg px-4 text-[14px] ${side === f ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
              {f === "receivable" ? `Owed to you (${receivable.length})` : `You owe (${payable.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-sheet p-5">
        <h3 className="font-semibold">Aging</h3>
        <ul className="mt-4 flex flex-col gap-1">
          {totals.map((t) => (
            <li key={t.k} className="grid min-h-10 grid-cols-[6.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[8rem_1fr_auto]">
              <span className="text-[14px] text-ink-2">{t.k}</span>
              <span className="relative h-3" title={`${t.k}: ${inr(t.v)} across ${t.n}`}>
                {t.v > 0 && <span className={`absolute inset-y-0 left-0 rounded-r-[4px] ${t.k === "Not yet due" ? "bg-series-1" : "bg-rose"}`} style={{ width: `${Math.max((t.v / max) * 100, 1.5)}%` }} />}
              </span>
              <span className="num w-24 text-right text-[14px] font-medium">{t.v ? inr(t.v) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>

      {list.length ? (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {list.map(({ i, d }) => {
            const wa = `https://wa.me/?text=${encodeURIComponent(reminderText(i, asOf))}`;
            return (
              <li key={i.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate font-semibold">{i.party}</span>
                    <span className={`label rounded-full px-2 py-0.5 ${d > 0 ? "bg-rose-soft text-rose" : "bg-info-soft text-info"}`}>{d > 0 ? `${d} days overdue` : d === 0 ? "Due today" : `Due in ${-d} days`}</span>
                  </p>
                  <p className="mt-0.5 text-[14px] text-muted">{i.number} · raised {day(i.date)}{i.due ? ` · due ${day(i.due)}` : ""}</p>
                </div>
                <p className="num text-lg font-semibold md:w-32 md:text-right">{money(i.open)}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onFind(i.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-[14px] font-medium hover:border-ink/40">
                    <Icon name="link" className="size-4" /> Find payment
                  </button>
                  {side === "receivable" && d > -7 && (
                    <>
                      <button type="button" onClick={() => copy(i)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-[14px] font-medium hover:border-ink/40">
                        <Icon name="copy" className="size-4" /> Copy reminder
                      </button>
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-[14px] font-medium hover:border-ink/40">
                        <Icon name="send" className="size-4" /> WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <div className="mt-6"><Empty text={side === "receivable" ? "Nothing owed to you is open." : "You don't owe anything open."} /></div>}
    </div>
  );
}
