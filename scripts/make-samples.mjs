/**
 * Fictional sample data for Recon: Kavach Design Studio (Bengaluru), Jul–Sep 2026.
 *   public/samples/kavach-bank-hdfc.csv      — HDFC-style bank statement
 *   public/samples/kavach-invoices-zoho.csv  — Zoho Books-style invoice & bill list (open items)
 *   tests/fixtures/tally-outstanding.csv     — Tally "Bills Receivable" layout
 * Each planted case is listed in EXPECT so tests can check the matcher finds exactly these.
 */
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/samples", { recursive: true });
mkdirSync("tests/fixtures", { recursive: true });

const inv = []; // [number, party, date, due, total, balance, type]
const bank = []; // [date, narration, amount]
const I = (n, party, date, due, total, type = "Sales Invoice", balance = total) => inv.push([n, party, date, due, total, balance, type]);
const B = (date, narration, amount) => bank.push([date, narration, amount]);
let ref = 412345678901;
const r = () => String(ref += 7919);

// --- Sales invoices and how they were paid ---------------------------------------------
// 1. Monthly retainer, abbreviated name + invoice number quoted → auto
for (const [n, d, due, pay] of [["INV-2026-041", "2026-07-01", "2026-07-15", "2026-07-12"], ["INV-2026-046", "2026-08-01", "2026-08-15", "2026-08-14"], ["INV-2026-051", "2026-09-01", "2026-09-15", "2026-09-13"]]) {
  I(n, "Brightloop Design LLP", d, due, 118000);
  B(pay, `NEFT CR-ICIC0000104-BRIGHTLOOP DSGN LLP-${n}`, 118000);
}
// 2. 10% TDS deducted, full legal name, no invoice number → review (TDS)
I("INV-2026-042", "Northwind Media Pvt Ltd", "2026-07-05", "2026-08-04", 236000);
B("2026-08-02", "NEFT CR-HDFC0000240-NORTHWIND MEDIA PRIVATE LIMITED-PAYMENT JUL WORK", 212400);
// 3. One payment for two invoices, both numbers quoted → auto group
I("INV-2026-043", "Sahyadri Foods", "2026-07-08", "2026-07-23", 47200);
I("INV-2026-047", "Sahyadri Foods", "2026-08-06", "2026-08-21", 35400);
B("2026-08-20", `IMPS-${r()}-SAHYADRI FOODS-INV 043 047`, 82600);
// 4. Paid in two parts by UPI → split (review)
I("INV-2026-044", "Mehta & Sons Traders", "2026-07-10", "2026-08-09", 59000);
B("2026-07-28", `UPI-MEHTA AND SONS TRADERS-mehtasons@okhdfcbank-HDFC0000314-${r()}-PART PAYMENT`, 30000);
B("2026-08-08", `UPI-MEHTA AND SONS TRADERS-mehtasons@okhdfcbank-HDFC0000314-${r()}-BALANCE`, 29000);
// 5. Bank charges deducted on an inward remittance → review (₹17.70 short)
I("INV-2026-045", "Kestrel Apps Pvt Ltd", "2026-07-20", "2026-08-19", 88500);
B("2026-08-18", `NEFT CR-UTIB0000221-KESTREL APPS PVT LTD-${r()}`, 88482.3);
// 6. Two clients owe exactly ₹50,000; a director pays personally with no reference → ambiguous review
I("INV-2026-048", "Pixelpeak Studio", "2026-08-10", "2026-09-09", 50000);
I("INV-2026-049", "Orbit Labs", "2026-08-12", "2026-09-11", 50000);
B("2026-09-05", `UPI-RAHUL VERMA-rahul.verma@oksbi-SBIN0001234-${r()}-UPI`, 50000);
// 7. Old invoice paid late but quoted → auto, flagged late
I("INV-2026-038", "Lumen Healthcare", "2026-05-20", "2026-06-19", 70800);
B("2026-08-25", `NEFT CR-KKBK0000958-LUMEN HEALTHCARE-INV-2026-038`, 70800);
// 8. Unpaid: overdue and not yet due
I("INV-2026-039", "Greenfield Realty", "2026-06-02", "2026-07-02", 141600);
I("INV-2026-050", "Coastline Exports", "2026-08-16", "2026-09-15", 70800);
I("INV-2026-052", "Aurora Learning", "2026-09-10", "2026-10-10", 29500);
// 9. Credits with no invoice
B("2026-07-31", "CREDIT INTEREST CAPITALISED", 1840);
B("2026-08-29", `NEFT CR-YESB0000431-ZENITH ROBOTICS-ADVANCE FOR WEBSITE`, 40000);
B("2026-09-18", "REFUND AMAZON PAY ORDER 408-1129", 2499);

// --- Purchase bills and payments ---------------------------------------------------------
for (const [m, d] of [["JUL", "2026-07-03"], ["AUG", "2026-08-03"], ["SEP", "2026-09-03"]]) {
  I(`PW/26/${m}`, "Prestige Workspaces", d.replace(/-03$/, "-01"), d.replace(/-03$/, "-05"), 45000, "Purchase Bill");
  B(d, `NEFT DR-HDFC0000501-PRESTIGE WORKSPACES-RENT ${m}`, -45000);
}
I("AWS-IN-88213", "Amazon Web Services India Pvt Ltd", "2026-08-02", "2026-08-12", 21240, "Purchase Bill");
B("2026-08-04", `ACH D- AMAZON WEB SERVICES-${r()}`, -21240);
I("AI-007", "Ananya Iyer", "2026-08-20", "2026-08-30", 40000, "Purchase Bill"); // freelancer, we deduct 10% TDS
B("2026-08-28", `IMPS-${r()}-ANANYA IYER-ILLUSTRATIONS AUG`, -36000);
I("IP-2291", "Inkwell Printers", "2026-08-21", "2026-09-20", 18880, "Purchase Bill"); // unpaid, overdue
// Debits with no bill
for (const [d, n, a] of [["2026-07-07", "FIGMA INC SUBSCRIPTION", -5100], ["2026-07-30", "SALARY JUL26 BULK NEFT 4 TXNS", -186000], ["2026-08-30", "SALARY AUG26 BULK NEFT 4 TXNS", -186000], ["2026-09-30", "SALARY SEP26 BULK NEFT 4 TXNS", -186000], ["2026-07-20", "GST PMT CPIN 26072900123456", -38900], ["2026-08-20", "GST PMT CPIN 26082900123457", -41200], ["2026-09-12", "ATW 1234 BLR INDIRANAGAR", -10000]]) B(d, n, a);

// --- Write the bank statement (HDFC CSV layout, oldest first, running balance) ----------
bank.sort((a, b) => a[0].localeCompare(b[0]));
let bal = 512340.55;
const dmy = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const rows = bank.map(([d, n, a]) => { bal = Math.round((bal + a) * 100) / 100; return [dmy(d), `"${n}"`, `0000${r().slice(4)}`, dmy(d), a < 0 ? (-a).toFixed(2) : "", a > 0 ? a.toFixed(2) : "", bal.toFixed(2)].join(","); });
writeFileSync("public/samples/kavach-bank-hdfc.csv", [
  "HDFC BANK Ltd.,,,,,,", "Account Statement,,,,,,", "KAVACH DESIGN STUDIO (fictional),,,,,,", "Account No :50200XXXXXX471,,,,,,", "Statement From :01/07/2026  To :30/09/2026,,,,,,", ",,,,,,",
  "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance", ...rows,
].join("\n"));

// --- Write the invoice list (Zoho Books-style export of open items) ---------------------
const dmyLong = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
writeFileSync("public/samples/kavach-invoices-zoho.csv", [
  "Invoice Date,Invoice Number,Party Name,Due Date,Total,Balance,Status,Type",
  ...inv.sort((a, b) => a[2].localeCompare(b[2])).map(([n, p, d, due, t, b, type]) => [dmyLong(d), n, `"${p}"`, dmyLong(due), t.toFixed(2), b.toFixed(2), new Date(due) < new Date("2026-09-30") ? "Overdue" : "Open", type].join(",")),
].join("\n"));

// --- Tally "Bills Receivable" fixture -----------------------------------------------------
writeFileSync("tests/fixtures/tally-outstanding.csv", [
  "Kavach Design Studio,,,,,,", "Bills Receivable,,,,,,", "1-Jul-26 to 30-Sep-26,,,,,,",
  "Date,Ref. No.,Party's Name,Opening Amount,Pending Amount,Due on,Overdue by days",
  "2-Jun-26,INV-2026-039,Greenfield Realty,\"1,41,600.00 Dr\",\"1,41,600.00 Dr\",2-Jul-26,90",
  "16-Aug-26,INV-2026-050,Coastline Exports,\"70,800.00 Dr\",\"70,800.00 Dr\",15-Sep-26,15",
].join("\n"));

console.log(`bank ${bank.length} rows · ledger ${inv.length} open items`);
