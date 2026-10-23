import type { Invoice } from "@/lib/ledger";
import type { BankTxn, Match } from "@/lib/match";
import { day, money } from "@/lib/format";
import { Icon } from "./Icon";

const TONE = { good: "text-thread", info: "text-info", warn: "text-review" } as const;

export function BankSide({ b }: { b: BankTxn }) {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-paper p-3.5">
      <p className="label truncate text-muted">{day(b.date)} · {b.amount > 0 ? "Money in" : "Money out"}</p>
      <p className="mt-1 truncate font-semibold">{b.party}</p>
      <p className="truncate text-[13px] text-muted" title={b.description}>{b.description}</p>
      <p className={`num mt-1.5 text-lg font-semibold ${b.amount > 0 ? "text-thread" : ""}`}>{b.amount > 0 ? "+" : "−"}{money(b.amount)}</p>
    </div>
  );
}

export function InvoiceSide({ inv }: { inv: Invoice }) {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-paper p-3.5">
      <p className="label truncate text-muted">{inv.kind === "invoice" ? "Invoice" : "Bill"} {inv.number}</p>
      <p className="mt-1 truncate font-semibold">{inv.party}</p>
      <p className="truncate text-[13px] text-muted">Raised {day(inv.date)}{inv.due ? ` · due ${day(inv.due)}` : ""}</p>
      <p className="num mt-1.5 text-lg font-semibold">{money(inv.open)}</p>
    </div>
  );
}

/** A proposed or settled match: payments on the left, invoices on the right, the thread and the reasons between. */
export function MatchCard({ m, bank, invoices, active, onConfirm, onReject, onFocus }: {
  m: Match;
  bank: BankTxn[];
  invoices: Invoice[];
  active?: boolean;
  onConfirm?: () => void;
  onReject: () => void;
  onFocus?: () => void;
}) {
  const kindLabel = m.kind === "many" ? `1 payment → ${m.invoices.length} invoices` : m.kind === "split" ? `${m.bank.length} payments → 1 invoice` : "1 payment → 1 invoice";
  return (
    <article
      onFocus={onFocus}
      onClick={onFocus}
      aria-label={`${kindLabel}, score ${m.score}`}
      data-match={m.key}
      className={`rounded-[3px] border bg-sheet p-4 transition-[border-color,box-shadow] duration-200 sm:p-5 ${active ? "border-ink/40 outline outline-1 outline-ink" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label text-muted">{kindLabel}</p>
        <span className={`stamp -rotate-1 ${m.status === "review" ? "text-review" : "text-thread"}`}>
          {m.status === "review" ? `Needs review · ${m.score}` : m.status === "auto" ? `Matched · ${m.score}` : "Confirmed"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_3rem_1fr] md:items-center">
        <div className="flex min-w-0 flex-col gap-2">{m.bank.map((i) => <BankSide key={i} b={bank[i]!} />)}</div>
        <div className="flex items-center justify-center text-thread" aria-hidden>
          <span className="h-px w-full bg-thread/40 md:hidden" />
          <Icon name="link" className="mx-2 size-5 shrink-0" />
          <span className="h-px w-full bg-thread/40 md:hidden" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">{m.invoices.map((i) => <InvoiceSide key={i} inv={invoices[i]!} />)}</div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Why">
        {m.reasons.map((r) => <li key={r.label} className={`border-l-2 border-current pl-2 text-[13.5px] leading-tight ${TONE[r.tone]}`}><span className="text-ink-2">{r.label}</span></li>)}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onConfirm && (
          <button type="button" onClick={onConfirm} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] bg-ink px-4 text-[15px] font-semibold text-paper hover:opacity-90">
            <Icon name="check" className="size-4" strokeWidth={2.4} /> Confirm
          </button>
        )}
        <button type="button" onClick={onReject} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-line px-4 text-[15px] font-medium hover:border-ink/40">
          {m.status === "review" ? <><Icon name="x" className="size-4" /> Not a match</> : <><Icon name="undo" className="size-4" /> Unmatch</>}
        </button>
        {Math.abs(m.diff) >= 0.5 && (
          <span className="num ml-auto text-[13px] text-muted">{m.diff < 0 ? `${money(m.diff)} less than invoiced` : `${money(m.diff)} more than invoiced`}</span>
        )}
      </div>
    </article>
  );
}
