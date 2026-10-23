/**
 * The matcher: pairs bank transactions with open invoices (credits ↔ sales invoices, debits ↔ purchase bills).
 *
 * Score (0–100) from four explainable signals:
 *   amount  45  exact; or short by bank charges; or short by a TDS rate (1/2/5/10%)
 *   ref     30  the invoice number (or its digits) is quoted in the narration
 *   name    30  the narration's party is the invoice's party (abbreviations allowed, learned aliases)
 *   date    10  paid after it was raised and around when it was due
 * A pair needs an amount fit. Auto-match is conservative: ≥ 85 and no rival within 10 points.
 * Then groups: one payment covering several invoices, and one invoice paid in parts.
 * Confirmed and manual matches are fixed first; rejected pairs are never suggested again.
 */
import type { Invoice } from "./ledger";
import { counterparty, nameSim, normName } from "./names";
import type { RawTxn } from "./parse";

export type BankTxn = RawTxn & { id: number; party: string };
export type Reason = { label: string; tone: "good" | "info" | "warn" };
export type Match = {
  key: string;
  kind: "one" | "many" | "split";
  bank: number[];
  invoices: number[];
  score: number;
  reasons: Reason[];
  status: "auto" | "review" | "confirmed";
  /** Bank total minus invoice total (negative when less was received/paid). */
  diff: number;
};
export type Decisions = {
  confirmed: Set<string>;
  rejected: Set<string>;
  /** normalised bank party → normalised invoice party, learned from confirmations */
  aliases: Map<string, string>;
};
export type Result = { matches: Match[]; unmatchedBank: number[]; openInvoices: number[] };

export const AUTO = 85;
export const SUGGEST = 50;
const TDS = [0.1, 0.02, 0.01, 0.05];
const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const rupees = (n: number) => {
  const paise = Math.round(Math.abs(n) * 100) % 100 !== 0;
  return "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 });
};
export const matchKey = (bank: number[], invoices: number[]) => `${[...bank].sort((a, b) => a - b).join("+")}|${[...invoices].sort((a, b) => a - b).join("+")}`;
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function toBank(raw: RawTxn[]): BankTxn[] {
  return raw.map((t, id) => ({ ...t, id, party: counterparty(t.description) }));
}

/** Does `paid` settle `due`? */
export function amountFit(paid: number, due: number): { pts: number; reason: Reason } | null {
  const d = paid - due;
  if (Math.abs(d) < 0.5) return { pts: 45, reason: { label: "Exact amount", tone: "good" } };
  if (d > 0 && d <= 1) return { pts: 44, reason: { label: "Amount matches (rounded)", tone: "good" } };
  for (const r of TDS) {
    if (Math.abs(paid - due * (1 - r)) <= Math.max(1, due * 0.0005))
      return { pts: 38, reason: { label: `${Math.round(r * 100)}% TDS deducted (${rupees(due * r)})`, tone: "info" } };
  }
  if (d < 0 && -d <= Math.max(60, due * 0.003)) return { pts: 36, reason: { label: `${rupees(-d)} short — likely bank charges`, tone: "warn" } };
  return null;
}

/** Is the invoice number quoted in the narration? Full number beats digits only. */
export function refFit(number: string, narration: string): { pts: number; reason: Reason } | null {
  const n = compact(number), text = compact(narration);
  if (n.length >= 4 && text.includes(n)) return { pts: 30, reason: { label: `${number} quoted in the narration`, tone: "good" } };
  const digits = number.match(/(\d{3,})\D*$/)?.[1];
  if (digits) {
    const tokens = narration.toUpperCase().split(/[^A-Z0-9]+/);
    const bare = digits.replace(/^0+/, "");
    if (tokens.some((t) => t === digits || (/^[A-Z]{1,6}\d+$/.test(t) && t.replace(/^[A-Z]+0*/, "") === bare)))
      return { pts: 18, reason: { label: `Invoice digits ${digits} quoted`, tone: "info" } };
  }
  return null;
}

function nameFit(b: BankTxn, inv: Invoice, aliases: Map<string, string>): { pts: number; sim: number; reason?: Reason } {
  if (aliases.get(normName(b.party)) === normName(inv.party)) return { pts: 30, sim: 1, reason: { label: "Name learned from your earlier match", tone: "good" } };
  const sim = Math.max(nameSim(b.party, inv.party), nameSim(b.description, inv.party) * 0.95);
  if (sim >= 0.85) return { pts: Math.round(30 * sim), sim, reason: { label: sim >= 0.99 ? "Same party name" : `Party name matches (“${b.party}”)`, tone: "good" } };
  if (sim >= 0.6) return { pts: Math.round(30 * sim * 0.8), sim, reason: { label: `Party name is similar (“${b.party}”)`, tone: "info" } };
  return { pts: 0, sim };
}

function dateFit(pay: string, inv: Invoice): { pts: number; reason: Reason } | null {
  const after = days(inv.date, pay);
  if (after < -5 || after > 400) return null;
  const term = inv.due ? days(inv.date, inv.due) : 30;
  const late = after - term;
  if (late <= 0) return { pts: 10, reason: { label: after < 0 ? "Paid in advance" : "Paid on time", tone: "good" } };
  return { pts: Math.max(2, Math.round(10 - late / 15)), reason: { label: `Paid ${late} days after it was due`, tone: late > 30 ? "warn" : "info" } };
}

type Pair = { b: BankTxn; inv: Invoice; score: number; reasons: Reason[]; diff: number };

export function scorePair(b: BankTxn, inv: Invoice, aliases = new Map<string, string>()): Pair | null {
  if ((b.amount > 0) !== (inv.kind === "invoice")) return null;
  const amt = amountFit(Math.abs(b.amount), inv.open);
  const date = dateFit(b.date, inv);
  if (!amt || !date) return null;
  const ref = refFit(inv.number, b.description);
  const name = nameFit(b, inv, aliases);
  let score = amt.pts + (ref?.pts ?? 0) + name.pts + date.pts;
  // No name and no reference: an amount alone is a coincidence until someone confirms it.
  if (!ref && name.pts === 0) score = Math.min(score - 15, 60);
  const reasons = [amt.reason, ...(ref ? [ref.reason] : []), ...(name.reason ? [name.reason] : [{ label: "Party name doesn't match", tone: "warn" as const }]), date.reason];
  return { b, inv, score: Math.max(0, Math.min(100, score)), reasons, diff: Math.abs(b.amount) - inv.open };
}

function* subsets<T>(items: T[], min: number, max: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length >= min) yield acc;
  if (acc.length === max) return;
  for (let i = start; i < items.length; i++) yield* subsets(items, min, max, i + 1, [...acc, items[i]!]);
}

export function reconcile(bank: BankTxn[], invoices: Invoice[], dec: Decisions = { confirmed: new Set(), rejected: new Set(), aliases: new Map() }): Result {
  const usedB = new Set<number>(), usedI = new Set<number>();
  const matches: Match[] = [];
  const add = (m: Omit<Match, "key">) => { const key = matchKey(m.bank, m.invoices); matches.push({ ...m, key }); m.bank.forEach((i) => usedB.add(i)); m.invoices.forEach((i) => usedI.add(i)); };

  // 1 · What the user already decided.
  for (const key of dec.confirmed) {
    const [bs, is] = key.split("|");
    const b = bs!.split("+").map(Number), i = is!.split("+").map(Number);
    if (b.some((x) => usedB.has(x) || !bank[x]) || i.some((x) => usedI.has(x) || !invoices[x])) continue;
    const paid = b.reduce((s, x) => s + Math.abs(bank[x]!.amount), 0), due = i.reduce((s, x) => s + invoices[x]!.open, 0);
    add({ kind: b.length > 1 ? "split" : i.length > 1 ? "many" : "one", bank: b, invoices: i, score: 100, status: "confirmed", diff: paid - due, reasons: [{ label: "Confirmed by you", tone: "good" }] });
  }

  // 2 · One payment ↔ one invoice, best first.
  const pairs: Pair[] = [];
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    for (const inv of invoices) {
      if (usedI.has(inv.id) || dec.rejected.has(matchKey([b.id], [inv.id]))) continue;
      const p = scorePair(b, inv, dec.aliases);
      if (p && p.score >= SUGGEST) pairs.push(p);
    }
  }
  pairs.sort((a, b) => b.score - a.score || Math.abs(a.diff) - Math.abs(b.diff));
  for (const p of pairs) {
    if (usedB.has(p.b.id) || usedI.has(p.inv.id)) continue;
    // A rival is another still-available pairing for the same payment or invoice that scores within 10 points —
    // unless the rival's other side has a better partner of its own (three rents, three rent bills: each month
    // pairs with its own month, so they aren't competing).
    const bestScore = (pick: (q: Pair) => boolean, except: Pair) => Math.max(-1, ...pairs.filter((q) => q !== except && pick(q)).map((q) => q.score));
    const ambiguous = pairs.some((q) => {
      if (q === p || q.score < p.score - 10) return false;
      if (q.b.id === p.b.id && q.inv.id !== p.inv.id && !usedI.has(q.inv.id)) return bestScore((x) => x.inv.id === q.inv.id && !usedB.has(x.b.id), q) <= q.score;
      if (q.inv.id === p.inv.id && q.b.id !== p.b.id && !usedB.has(q.b.id)) return bestScore((x) => x.b.id === q.b.id && !usedI.has(x.inv.id), q) <= q.score;
      return false;
    });
    add({
      kind: "one", bank: [p.b.id], invoices: [p.inv.id], score: p.score, diff: p.diff,
      status: p.score >= AUTO && !ambiguous ? "auto" : "review",
      reasons: ambiguous ? [...p.reasons, { label: "Another payment or invoice fits almost as well", tone: "warn" }] : p.reasons,
    });
  }

  const samePartyOrRef = (b: BankTxn, inv: Invoice) =>
    dec.aliases.get(normName(b.party)) === normName(inv.party) || nameSim(b.party, inv.party) >= 0.7 || nameSim(b.description, inv.party) >= 0.75 || Boolean(refFit(inv.number, b.description));

  // 3 · One payment covering several invoices of the same party.
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    const cands = invoices
      .filter((inv) => !usedI.has(inv.id) && (b.amount > 0) === (inv.kind === "invoice") && days(inv.date, b.date) >= -5 && samePartyOrRef(b, inv))
      .sort((x, y) => days(x.date, b.date) - days(y.date, b.date)).slice(0, 12);
    let best: { set: Invoice[]; fit: NonNullable<ReturnType<typeof amountFit>>; refs: number } | null = null;
    for (const set of subsets(cands, 2, 4)) {
      if (dec.rejected.has(matchKey([b.id], set.map((s) => s.id)))) continue;
      const fit = amountFit(Math.abs(b.amount), set.reduce((s, i) => s + i.open, 0));
      if (!fit) continue;
      const refs = set.filter((i) => refFit(i.number, b.description)).length;
      if (!best || fit.pts + refs * 5 > best.fit.pts + best.refs * 5) best = { set, fit, refs };
    }
    if (best) {
      const allQuoted = best.refs === best.set.length;
      add({
        kind: "many", bank: [b.id], invoices: best.set.map((i) => i.id), score: allQuoted ? 92 : 74 + best.refs * 4,
        status: allQuoted ? "auto" : "review", diff: Math.abs(b.amount) - best.set.reduce((s, i) => s + i.open, 0),
        reasons: [{ label: `One payment for ${best.set.length} invoices`, tone: "info" }, best.fit.reason, ...(best.refs ? [{ label: `${best.refs} of ${best.set.length} invoice numbers quoted`, tone: "good" as const }] : []), { label: `Party: ${b.party}`, tone: "good" }],
      });
    }
  }

  // 4 · One invoice paid in parts.
  for (const inv of invoices) {
    if (usedI.has(inv.id)) continue;
    const cands = bank
      .filter((b) => !usedB.has(b.id) && (b.amount > 0) === (inv.kind === "invoice") && days(inv.date, b.date) >= -5 && samePartyOrRef(b, inv))
      .slice(0, 10);
    for (const set of subsets(cands, 2, 3)) {
      if (dec.rejected.has(matchKey(set.map((s) => s.id), [inv.id]))) continue;
      const paid = set.reduce((s, b) => s + Math.abs(b.amount), 0);
      const fit = amountFit(paid, inv.open);
      if (!fit) continue;
      add({
        kind: "split", bank: set.map((b) => b.id), invoices: [inv.id], score: 76, status: "review", diff: paid - inv.open,
        reasons: [{ label: `Paid in ${set.length} parts`, tone: "info" }, fit.reason, { label: `Party: ${set[0]!.party}`, tone: "good" }],
      });
      break;
    }
  }

  return {
    matches,
    unmatchedBank: bank.filter((b) => !usedB.has(b.id)).map((b) => b.id),
    openInvoices: invoices.filter((i) => !usedI.has(i.id)).map((i) => i.id),
  };
}

/** Days past due as of a date (negative = not yet due). */
export function overdueDays(inv: Invoice, asOf: string) {
  const due = inv.due ?? new Date(Date.parse(inv.date) + 30 * DAY).toISOString().slice(0, 10);
  return days(due, asOf);
}

export function agingBucket(d: number): "Not yet due" | "1–30 days" | "31–60 days" | "61–90 days" | "90+ days" {
  return d <= 0 ? "Not yet due" : d <= 30 ? "1–30 days" : d <= 60 ? "31–60 days" : d <= 90 ? "61–90 days" : "90+ days";
}

export type Candidate = { inv: Invoice; score: number; fit: string | null };

/** Open invoices that could explain a payment, best first (for picking a match by hand). */
export function rankInvoicesFor(b: BankTxn, open: Invoice[], aliases = new Map<string, string>()): Candidate[] {
  return open
    .filter((i) => (b.amount > 0) === (i.kind === "invoice"))
    .map((inv) => {
      const p = scorePair(b, inv, aliases);
      const fit = amountFit(Math.abs(b.amount), inv.open);
      return { inv, score: p?.score ?? 0, fit: fit?.reason.label ?? null };
    })
    .sort((x, y) => y.score - x.score || Math.abs(Math.abs(b.amount) - x.inv.open) - Math.abs(Math.abs(b.amount) - y.inv.open));
}

/** Unmatched payments that could settle an invoice, best first. */
export function rankPaymentsFor(inv: Invoice, unmatched: BankTxn[], aliases = new Map<string, string>()) {
  return unmatched
    .filter((b) => (b.amount > 0) === (inv.kind === "invoice"))
    .map((b) => ({ b, score: scorePair(b, inv, aliases)?.score ?? 0, fit: amountFit(Math.abs(b.amount), inv.open)?.reason.label ?? null }))
    .sort((x, y) => y.score - x.score || Math.abs(Math.abs(x.b.amount) - inv.open) - Math.abs(Math.abs(y.b.amount) - inv.open));
}

const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A polite payment reminder for an overdue invoice, ready to paste into email or WhatsApp. */
export function reminderText(inv: Invoice, asOf: string) {
  const late = overdueDays(inv, asOf);
  const amount = "₹" + inv.open.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return [
    `Hi ${inv.party} team,`,
    ``,
    `A gentle reminder that invoice ${inv.number} for ${amount}, dated ${fmtDay(inv.date)}, ${late > 0 ? `was due on ${fmtDay(inv.due ?? asOf)} (${late} ${late === 1 ? "day" : "days"} ago)` : `is due on ${fmtDay(inv.due ?? asOf)}`}.`,
    `If you've already paid, please share the payment reference so we can match it. Otherwise, could you let us know when to expect it?`,
    ``,
    `Thank you!`,
  ].join("\n");
}
