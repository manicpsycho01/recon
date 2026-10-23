import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gridToInvoices } from "../src/lib/ledger";
import { amountFit, matchKey, reconcile, refFit, toBank, type Decisions, type Result } from "../src/lib/match";
import { counterparty, nameSim, normName } from "../src/lib/names";
import { gridToTxns } from "../src/lib/parse";
import { readCsv } from "../src/lib/read";

const bank = toBank(gridToTxns(readCsv(readFileSync("public/samples/kavach-bank-hdfc.csv", "utf8"))));
const invoices = gridToInvoices(readCsv(readFileSync("public/samples/kavach-invoices-zoho.csv", "utf8")));
const inv = (n: string) => invoices.find((i) => i.number === n)!;
const b = (re: RegExp) => bank.find((t) => re.test(t.description))!;
const matchOf = (r: Result, n: string) => r.matches.find((m) => m.invoices.includes(inv(n).id));
const fresh = (): Decisions => ({ confirmed: new Set(), rejected: new Set(), aliases: new Map() });

describe("names", () => {
  it.each([
    ["Brightloop Dsgn Llp", "Brightloop Design LLP", 0.85],
    ["Northwind Media Private Limited", "Northwind Media Pvt Ltd", 0.99],
    ["Mehta And Sons Traders", "Mehta & Sons Traders", 0.99],
    ["Amazon Web Services", "Amazon Web Services India Pvt Ltd", 0.95],
    ["Kestrel Apps Pvt Ltd", "Kestrel Apps Pvt Ltd", 1],
  ])("%s ≈ %s", (a, c, min) => expect(nameSim(a, c)).toBeGreaterThanOrEqual(min));
  it.each([
    ["Mehra Traders", "Mehta & Sons Traders"],
    ["Rahul Verma", "Pixelpeak Studio"],
    ["Orbit Labs", "Pixelpeak Studio"],
  ])("%s ≠ %s", (a, c) => expect(nameSim(a, c)).toBeLessThan(0.6));
  it("strips company suffixes and punctuation", () => expect(normName("M/s. Brightloop Design Pvt. Ltd.")).toBe("brightloop design"));
  it("reads the payer out of narrations", () => {
    expect(counterparty("NEFT CR-ICIC0000104-BRIGHTLOOP DSGN LLP-INV-2026-041")).toBe("Brightloop Dsgn Llp");
    expect(counterparty("IMPS-412345678901-SAHYADRI FOODS-INV 043 047")).toBe("Sahyadri Foods");
    expect(counterparty("UPI-MEHTA AND SONS TRADERS-mehtasons@okhdfcbank-HDFC0000314-412345694739-PART PAYMENT")).toBe("Mehta And Sons Traders");
  });
});

describe("signals", () => {
  it("amount: exact, TDS, bank charges, or no fit", () => {
    expect(amountFit(118000, 118000)!.pts).toBe(45);
    expect(amountFit(212400, 236000)!.reason.label).toBe("10% TDS deducted (₹23,600)");
    expect(amountFit(88482.3, 88500)!.reason.label).toBe("₹17.70 short — likely bank charges");
    expect(amountFit(100000, 118000)).toBeNull();
    expect(amountFit(118500, 118000)).toBeNull();
  });
  it("reference: full number, digits only, or none", () => {
    expect(refFit("INV-2026-041", "NEFT CR-ICIC0000104-BRIGHTLOOP DSGN LLP-INV-2026-041")!.pts).toBe(30);
    expect(refFit("INV-2026-043", "IMPS-412345678901-SAHYADRI FOODS-INV 043 047")!.pts).toBe(18);
    expect(refFit("INV-2026-043", "IMPS-412345678043-SOMEONE")).toBeNull(); // digits inside a long reference don't count
  });
});

describe("invoice lists", () => {
  it("Zoho-style export: invoices and bills, open balance", () => {
    expect(invoices).toHaveLength(20);
    expect(invoices.filter((i) => i.kind === "bill").map((i) => i.party)).toEqual(expect.arrayContaining(["Prestige Workspaces", "Ananya Iyer", "Inkwell Printers"]));
    expect(inv("INV-2026-042")).toMatchObject({ amount: 236000, open: 236000, due: "2026-08-04", kind: "invoice" });
  });
  it("Tally Bills Receivable layout", () => {
    const t = gridToInvoices(readCsv(readFileSync("tests/fixtures/tally-outstanding.csv", "utf8")));
    expect(t.map((x) => [x.number, x.party, x.open, x.due])).toEqual([["INV-2026-039", "Greenfield Realty", 141600, "2026-07-02"], ["INV-2026-050", "Coastline Exports", 70800, "2026-09-15"]]);
  });
  it("skips paid rows and explains a wrong file", () => {
    const g = [["Invoice Date", "Invoice Number", "Customer Name", "Total", "Balance", "Status"], ["01/07/2026", "A-1", "X Ltd", "100", "0", "Paid"], ["01/07/2026", "A-2", "Y Ltd", "200", "200", "Open"]];
    expect(gridToInvoices(g).map((i) => i.number)).toEqual(["A-2"]);
    expect(() => gridToInvoices([["name", "email"]])).toThrow(/Couldn't find the invoice list/);
  });
});

describe("reconcile the sample studio", () => {
  const r = reconcile(bank, invoices, fresh());

  it("auto-matches the retainer payments that quote the invoice number", () => {
    for (const n of ["INV-2026-041", "INV-2026-046", "INV-2026-051"]) expect(matchOf(r, n)).toMatchObject({ status: "auto", kind: "one" });
  });
  it("auto-matches the late payment that quotes its invoice, and says it was late", () => {
    const m = matchOf(r, "INV-2026-038")!;
    expect(m.status).toBe("auto");
    expect(m.reasons.map((x) => x.label).join(" ")).toMatch(/days after it was due/);
  });
  it("finds the TDS payment and the bank-charges payment but asks for review", () => {
    expect(matchOf(r, "INV-2026-042")).toMatchObject({ status: "review", bank: [b(/NORTHWIND/).id] });
    expect(matchOf(r, "INV-2026-045")).toMatchObject({ status: "review", bank: [b(/KESTREL/).id] });
  });
  it("one payment for two invoices (both quoted) is a confident group", () => {
    const m = matchOf(r, "INV-2026-043")!;
    expect(m).toMatchObject({ kind: "many", status: "auto", bank: [b(/SAHYADRI/).id] });
    expect(m.invoices.sort()).toEqual([inv("INV-2026-043").id, inv("INV-2026-047").id].sort());
  });
  it("an invoice paid in two parts is found and sent for review", () => {
    expect(matchOf(r, "INV-2026-044")).toMatchObject({ kind: "split", status: "review" });
    expect(matchOf(r, "INV-2026-044")!.bank).toHaveLength(2);
  });
  it("a ₹50,000 payment from an unknown person when two clients owe ₹50,000 is never auto-matched", () => {
    const m = r.matches.find((x) => x.bank.includes(b(/RAHUL VERMA/).id));
    if (m) expect(m.status).toBe("review");
    expect(r.matches.filter((x) => x.status === "auto").some((x) => x.invoices.includes(inv("INV-2026-048").id) || x.invoices.includes(inv("INV-2026-049").id))).toBe(false);
  });
  it("vendor bills match debits, including a freelancer paid net of 10% TDS", () => {
    for (const n of ["PW/26/JUL", "PW/26/AUG", "PW/26/SEP", "AWS-IN-88213"]) expect(matchOf(r, n)?.status).toBe("auto");
    expect(matchOf(r, "AI-007")).toMatchObject({ status: "review" });
  });
  it("leaves the unpaid invoices open and the no-invoice credits unmatched", () => {
    const open = r.openInvoices.map((i) => invoices[i]!.number);
    expect(open).toEqual(expect.arrayContaining(["INV-2026-039", "INV-2026-050", "INV-2026-052", "IP-2291"]));
    const unmatched = r.unmatchedBank.map((i) => bank[i]!.description);
    for (const re of [/INTEREST/, /ZENITH ROBOTICS/, /REFUND AMAZON/, /SALARY JUL/, /FIGMA/]) expect(unmatched.some((d) => re.test(d))).toBe(true);
  });
  it("never uses a payment or an invoice twice", () => {
    const bs = r.matches.flatMap((m) => m.bank), is = r.matches.flatMap((m) => m.invoices);
    expect(new Set(bs).size).toBe(bs.length);
    expect(new Set(is).size).toBe(is.length);
    expect(bs.length + r.unmatchedBank.length).toBe(bank.length);
    expect(is.length + r.openInvoices.length).toBe(invoices.length);
  });
});

describe("decisions", () => {
  it("a rejected pair is never suggested again", () => {
    const first = reconcile(bank, invoices, fresh());
    const m = matchOf(first, "INV-2026-045")!;
    const d = fresh(); d.rejected.add(m.key);
    const again = reconcile(bank, invoices, d);
    expect(again.matches.some((x) => x.key === m.key)).toBe(false);
    expect(again.openInvoices).toContain(inv("INV-2026-045").id);
  });
  it("confirmed and manual matches are kept first, even ones the engine wouldn't make", () => {
    const d = fresh(); d.confirmed.add(matchKey([b(/ZENITH/).id], [inv("INV-2026-052").id]));
    const r = reconcile(bank, invoices, d);
    expect(matchOf(r, "INV-2026-052")).toMatchObject({ status: "confirmed", bank: [b(/ZENITH/).id] });
  });
  it("a learned alias lifts other payments from the same payer", () => {
    // Teach: "Rahul Verma" pays for Pixelpeak Studio.
    const d = fresh(); d.aliases.set(normName("Rahul Verma"), normName("Pixelpeak Studio"));
    const r = reconcile(bank, invoices, d);
    const m = r.matches.find((x) => x.bank.includes(b(/RAHUL VERMA/).id))!;
    expect(m.invoices).toEqual([inv("INV-2026-048").id]);
    expect(m.reasons.map((x) => x.label)).toContain("Name learned from your earlier match");
  });
});

describe("ambiguity", () => {
  it("two invoices from the same client for the same amount, one payment: review, not auto", () => {
    const g = [["Invoice Date", "Invoice Number", "Customer Name", "Due Date", "Total"], ["01/08/2026", "Q-1", "Tidewater Labs", "31/08/2026", "25000"], ["03/08/2026", "Q-2", "Tidewater Labs", "02/09/2026", "25000"]];
    const invs = gridToInvoices(g);
    const pay = toBank([{ date: "2026-08-20", description: "NEFT CR-HDFC0000001-TIDEWATER LABS-PAYMENT", amount: 25000 }]);
    const r = reconcile(pay, invs);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.status).toBe("review");
    expect(r.matches[0]!.reasons.at(-1)!.label).toMatch(/fits almost as well/);
  });
  it("monthly rent: each payment pairs with its own month's bill, confidently", () => {
    const r = reconcile(bank, invoices, fresh());
    for (const [n, re] of [["PW/26/JUL", /RENT JUL/], ["PW/26/AUG", /RENT AUG/], ["PW/26/SEP", /RENT SEP/]] as const) expect(matchOf(r, n)).toMatchObject({ status: "auto", bank: [b(re).id] });
  });
});

describe("helpers", () => {
  it("ranks the likely invoices for an unmatched payment by amount fit", async () => {
    const { rankInvoicesFor } = await import("../src/lib/match");
    const pay = b(/RAHUL VERMA/);
    const ranked = rankInvoicesFor(pay, invoices.filter((i) => i.kind === "invoice"));
    expect(ranked.slice(0, 2).map((c) => c.inv.number).sort()).toEqual(["INV-2026-048", "INV-2026-049"]);
    expect(ranked[0]!.fit).toBe("Exact amount");
  });
  it("writes a reminder with the invoice, amount and how late it is", async () => {
    const { reminderText } = await import("../src/lib/match");
    const t = reminderText(inv("INV-2026-039"), "2026-09-30");
    expect(t).toContain("INV-2026-039 for ₹1,41,600");
    expect(t).toContain("90 days ago");
  });
});
