/**
 * Reads an invoice/bill list exported from Zoho Books, Tally, QuickBooks, Vyapar or a plain spreadsheet:
 * finds the header, maps the columns, and keeps what's still open (balance > 0).
 * Sales invoices are money you're owed (matched to credits); purchase bills are money you owe (matched to debits).
 */
import { parseAmount, parseDate, ParseError, type Grid } from "./parse";

export type Invoice = {
  id: number;
  number: string;
  party: string;
  date: string;
  due?: string;
  /** Invoice total. */
  amount: number;
  /** Still unpaid (the balance column when there is one, otherwise the total). */
  open: number;
  kind: "invoice" | "bill";
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z#/ ]/g, " ").replace(/\s+/g, " ").trim();

type Cols = { number: number; party: number; date: number; amount: number; due?: number; balance?: number; status?: number; type?: number; vendorSheet: boolean };

function header(row: string[]): Cols | null {
  const c = row.map((x) => norm(String(x ?? "")));
  const find = (re: RegExp, not?: RegExp) => c.findIndex((x) => x && re.test(x) && !(not && not.test(x)));
  const number = find(/^(invoice|inv|bill|voucher|vch|document|doc)\s*(no|number|#|num)|^invoice$|^bill#?$|^number$|^ref(erence)?( no)?$|invoice id/);
  const party = find(/customer|client|party|vendor|supplier|bill to|billed to|buyer|^name$|company|ledger/);
  const date = find(/^(invoice |bill |voucher |vch |document |txn )?date$|^date$|invoice date|bill date/, /due/);
  const due = find(/due date|^due$|due on/);
  const balance = find(/balance|outstanding|amount due|due amount|pending|unpaid/, /date/);
  const amount = find(/^(invoice |bill )?(total|amount)|grand total|invoice value|bill value|^value$|net amount|total amount/, /balance|due|tax|paid/);
  const status = find(/^status$/);
  const type = find(/^type$|voucher type|vch type|document type|transaction type/);
  if (number < 0 || party < 0 || date < 0 || (amount < 0 && balance < 0)) return null;
  return {
    number, party, date, amount: amount >= 0 ? amount : balance,
    ...(due >= 0 ? { due } : {}), ...(balance >= 0 && balance !== amount ? { balance } : {}),
    ...(status >= 0 ? { status } : {}), ...(type >= 0 ? { type } : {}),
    vendorSheet: /vendor|supplier/.test(c[party]!),
  };
}

export function gridToInvoices(grid: Grid): Invoice[] {
  let at = -1, cols: Cols | null = null;
  for (let i = 0; i < Math.min(grid.length, 60); i++) { const h = header(grid[i] ?? []); if (h) { at = i; cols = h; break; } }
  if (!cols) throw new ParseError("Couldn't find the invoice list (looked for Invoice no., Customer, Date and Amount columns).");
  const out: Invoice[] = [];
  for (let i = at + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const cell = (k?: number) => (k === undefined ? "" : String(row[k] ?? "").trim());
    const date = parseDate(cell(cols.date));
    const number = cell(cols.number);
    const party = cell(cols.party).replace(/\s+/g, " ");
    const amt = parseAmount(cell(cols.amount));
    if (!date || !number || !party || !amt) continue;
    const bal = cols.balance !== undefined ? parseAmount(cell(cols.balance)) : null;
    const open = bal ? Math.abs(bal.value) : Math.abs(amt.value);
    const status = norm(cell(cols.status));
    if (open < 0.5 || /^(paid|closed|void|cancel)/.test(status)) continue;
    const type = norm(cell(cols.type));
    const kind: Invoice["kind"] = /bill|purchase|expense|vendor|payable/.test(type) || (cols.vendorSheet && !/invoice|sale/.test(type)) ? "bill" : "invoice";
    const due = cols.due !== undefined ? parseDate(cell(cols.due)) : null;
    out.push({ id: out.length, number, party, date, ...(due ? { due } : {}), amount: Math.abs(amt.value), open, kind });
  }
  if (!out.length) throw new ParseError("Found the invoice list header, but no open invoices under it.");
  return out;
}
