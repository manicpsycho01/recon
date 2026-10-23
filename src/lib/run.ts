/** Reads both files in the browser and returns bank transactions and open invoices, or a fixable error. */
import { gridToInvoices, type Invoice } from "./ledger";
import { toBank, type BankTxn } from "./match";
import { gridToTxns, ParseError } from "./parse";
import { PasswordNeeded, readToGrid } from "./read";

export type Loaded<T> = { ok: true; data: T; name: string } | { ok: false; kind: "password"; wrong: boolean } | { ok: false; kind: "error"; message: string };

async function load<T>(file: File, parse: (g: string[][]) => T, password?: string): Promise<Loaded<T>> {
  try {
    if (file.size > 25 * 1024 * 1024) return { ok: false, kind: "error", message: "That file is over 25 MB — try a shorter period." };
    return { ok: true, data: parse(await readToGrid(file, password)), name: file.name };
  } catch (e) {
    if (e instanceof PasswordNeeded) return { ok: false, kind: "password", wrong: e.wrong };
    if (e instanceof ParseError) return { ok: false, kind: "error", message: e.message };
    console.error(e);
    return { ok: false, kind: "error", message: "This file couldn't be read. Export it as CSV or Excel and try again." };
  }
}

export const loadBank = (f: File, password?: string): Promise<Loaded<BankTxn[]>> => load(f, (g) => toBank(gridToTxns(g)), password);
export const loadInvoices = (f: File, password?: string): Promise<Loaded<Invoice[]>> => load(f, gridToInvoices, password);
