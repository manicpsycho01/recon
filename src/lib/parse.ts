/**
 * Turns a grid of cells (from CSV, Excel or a reconstructed PDF table) into transactions.
 * Works with the column layouts Indian banks export: separate withdrawal/deposit columns
 * (HDFC, ICICI, SBI, Axis) or one amount column with a Dr/Cr marker (Kotak and others),
 * with account details above the header and narrations that wrap onto following rows.
 */

export type RawTxn = { date: string; description: string; amount: number; balance?: number };
export type Grid = string[][];

export class ParseError extends Error {}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Parses the date formats Indian statements use (day first) into YYYY-MM-DD, or null. */
export function parseDate(input: string): string | null {
  const s = input.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i, "");
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) return valid(year(+m[3]!), +m[2]!, +m[1]!);
  m = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,4})[A-Za-z]*[\s\-/,]*(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2]!.toLowerCase()]) return valid(year(+m[3]!), MONTHS[m[2]!.toLowerCase()]!, +m[1]!);
  m = s.match(/^([A-Za-z]{3,4})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1]!.toLowerCase()]) return valid(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? iso(y, m, d) : null;
}

/** "1,23,456.78", "₹ 1,200", "(500.00)", "500.00 Dr", "-500" → signed number (Dr/brackets negative), or null. */
export function parseAmount(input: string): { value: number; marker?: "dr" | "cr" } | null {
  let s = input.replace(/[₹\s]|INR|Rs\.?/gi, "");
  if (!s || s === "-" || s === "--") return null;
  let marker: "dr" | "cr" | undefined;
  const mk = s.match(/(dr|cr)\.?$/i);
  if (mk) { marker = mk[1]!.toLowerCase() as "dr" | "cr"; s = s.slice(0, -mk[0].length); }
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const v = parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  return { value: neg ? -v : v, marker };
}

type Cols = { date: number; desc: number; debit?: number; credit?: number; amount?: number; drcr?: number; balance?: number; ref?: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z/ ]/g, " ").replace(/\s+/g, " ").trim();

function scoreHeader(row: string[]): Cols | null {
  const cells = row.map(norm);
  const find = (re: RegExp, not?: RegExp) => cells.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const date = find(/^(txn |tran |transaction |posting |value )?date|^date|date$|^txn dt|^tran dt/, /value d/);
  const dateAny = date >= 0 ? date : find(/date|^dt$/);
  const desc = find(/narration|description|particulars|remarks|details|transaction remarks|^transaction$/);
  const debit = find(/withdrawal|^debit|debit amount|^dr$|^dr |paid out|money out/, /credit/);
  const credit = find(/deposit|^credit|credit amount|^cr$|^cr |paid in|money in/, /debit/);
  const amount = find(/^amount|^txn amount|transaction amount|^amt|debit ?\/ ?credit amount/);
  const drcr = find(/^dr ?\/ ?cr|^cr ?\/ ?dr|^type$|^txn type|^d ?\/ ?c$/);
  const balance = find(/balance|^bal/);
  const ref = find(/ref|chq|cheque/);
  if (dateAny < 0 || desc < 0) return null;
  // One column holding both ("Withdrawal (Dr) / Deposit (Cr)", Kotak) is an amount column with Dr/Cr markers.
  if (debit >= 0 && debit === credit) return { date: dateAny, desc, amount: debit, ...(balance >= 0 ? { balance } : {}), ...(drcr >= 0 && drcr !== debit ? { drcr } : {}) };
  const hasMoney = (debit >= 0 && credit >= 0 && debit !== credit) || amount >= 0;
  if (!hasMoney) return null;
  return {
    date: dateAny, desc,
    ...(debit >= 0 && credit >= 0 && debit !== credit ? { debit, credit } : { amount }),
    ...(drcr >= 0 && drcr !== amount ? { drcr } : {}),
    ...(balance >= 0 ? { balance } : {}),
    ...(ref >= 0 ? { ref } : {}),
  };
}

/** Finds the header row and reads every transaction under it. */
export function gridToTxns(grid: Grid): RawTxn[] {
  let headerAt = -1;
  let cols: Cols | null = null;
  for (let i = 0; i < Math.min(grid.length, 120); i++) {
    const c = scoreHeader(grid[i] ?? []);
    if (c) { headerAt = i; cols = c; break; }
  }
  if (!cols) throw new ParseError("Couldn't find the transaction table (looked for Date, Description and Debit/Credit or Amount columns).");

  const out: (RawTxn & { unmarked?: boolean })[] = [];
  const markersSeen = new Set<string>();
  let opening: number | undefined;
  for (let i = headerAt + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const cell = (k: number | undefined) => (k === undefined ? "" : String(row[k] ?? "").trim());
    if (scoreHeader(row)) continue; // repeated header on a new PDF page
    const date = parseDate(cell(cols.date));
    const desc = cell(cols.desc).replace(/\s+/g, " ");
    if (!date) {
      // A wrapped narration line belongs to the transaction above it.
      const money = cols.amount !== undefined ? parseAmount(cell(cols.amount)) : parseAmount(cell(cols.debit)) ?? parseAmount(cell(cols.credit));
      if (desc && !money && out.length && !/opening balance|closing balance|total|statement summary|page \d/i.test(desc)) {
        out[out.length - 1]!.description += " " + desc;
      }
      continue;
    }
    if (/opening balance|^b\/f|brought forward/i.test(desc)) {
      const ob = cols.balance !== undefined ? parseAmount(cell(cols.balance)) : null;
      if (ob) opening = ob.marker === "dr" ? -Math.abs(ob.value) : ob.value;
      continue;
    }
    if (/closing balance|carried forward/i.test(desc)) continue;
    let amount: number | null = null;
    let unmarked = false;
    if (cols.debit !== undefined && cols.credit !== undefined) {
      const d = parseAmount(cell(cols.debit));
      const c = parseAmount(cell(cols.credit));
      if (d && Math.abs(d.value) > 0) amount = -Math.abs(d.value);
      else if (c && Math.abs(c.value) > 0) amount = Math.abs(c.value);
    } else if (cols.amount !== undefined) {
      const a = parseAmount(cell(cols.amount));
      if (a) {
        const mark = cols.drcr !== undefined ? norm(cell(cols.drcr)) : a.marker;
        if (mark === "dr" || mark === "d" || mark === "debit" || mark?.startsWith("dr")) amount = -Math.abs(a.value);
        else if (mark === "cr" || mark === "c" || mark === "credit" || mark?.startsWith("cr")) amount = Math.abs(a.value);
        else { amount = a.value; if (a.value > 0) unmarked = true; } // signed or unmarked amount
        if (a.marker) markersSeen.add(a.marker);
      }
    }
    if (amount === null || amount === 0) continue;
    const bal = cols.balance !== undefined ? parseAmount(cell(cols.balance)) : null;
    const balance = bal ? (bal.marker === "dr" ? -Math.abs(bal.value) : bal.value) : undefined;
    out.push({ date, description: desc || "(no description)", amount, ...(balance !== undefined ? { balance } : {}), ...(unmarked ? { unmarked } : {}) });
  }
  if (!out.length) throw new ParseError("Found the table header but no transactions under it.");
  // Card statements print spends unmarked and tag only refunds/payments "Cr"; with no balance column and
  // no negatives, unmarked amounts are spends.
  const noBalance = out.every((t) => t.balance === undefined);
  const noNegatives = out.every((t) => t.amount > 0);
  const unmarkedAreSpends = (markersSeen.has("cr") && !markersSeen.has("dr")) || (noBalance && noNegatives && markersSeen.size === 0);
  return orient(opening, out.map(({ unmarked, ...t }) => (unmarked && unmarkedAreSpends ? { ...t, amount: -Math.abs(t.amount) } : t)));
}

/** Puts transactions oldest-first and, when balances exist, uses them to fix a mis-signed amount column. */
function orient(opening: number | undefined, txns: RawTxn[]): RawTxn[] {
  const newestFirst = txns.length > 1 && txns[0]!.date > txns[txns.length - 1]!.date;
  const list = newestFirst ? [...txns].reverse() : txns;
  if (!list.some((t) => t.balance !== undefined)) return list;
  let agree = 0, flipped = 0;
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!.balance, cur = list[i]!.balance;
    if (prev === undefined || cur === undefined) continue;
    const delta = Math.round((cur - prev) * 100);
    if (delta === Math.round(list[i]!.amount * 100)) agree++;
    else if (delta === Math.round(-list[i]!.amount * 100)) flipped++;
  }
  // Whole column backwards (debit/credit headers swapped)?
  const base = flipped > 3 && flipped > agree * 2 ? list.map((t) => ({ ...t, amount: -t.amount })) : list;
  // Row by row: when a blank debit/credit cell put the amount in the wrong column, the balance knows.
  return base.map((t, i) => {
    const prev = i === 0 ? opening : base[i - 1]!.balance;
    if (prev === undefined || t.balance === undefined) return t;
    const delta = Math.round((t.balance - prev) * 100);
    return delta === Math.round(-t.amount * 100) ? { ...t, amount: -t.amount } : t;
  });
}
