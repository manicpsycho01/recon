# Recon

**Match every payment to its invoice.** Bank reconciliation for Indian small businesses. Drop in your bank statement and your invoice list, and Recon matches payments to invoices. It handles TDS deductions, bank charges, split payments and combined payments. It then shows what's still unpaid.

**Live:** https://recon-manicpsycho01.vercel.app

Everything runs in your browser. Neither file is uploaded: there's no server, no database and no account.

## How it decides

Each candidate pair gets a score from 0 to 100, built from four signals. Every signal is shown on the match card.

| Signal | Points | What counts |
|---|---|---|
| Amount | 45 | An exact match, or short by a TDS rate (1, 2, 5 or 10%), or short by bank charges |
| Invoice number | 30 | Quoted in the narration, in full (30) or as its digits only (18) |
| Party name | 30 | The payer is the invoice's party. Abbreviations ("DSGN"), company suffixes and "& / and" are allowed, and payers you've confirmed before are learned. |
| Date | 10 | Paid after the invoice was raised, around its due date |

- **Matched automatically:** a score of 85 or more, with no other pairing within 10 points.
- **Review queue:** everything from 50 to 84, plus any close call.
- **No proof:** a pair with neither a name nor a reference is capped at 60. A matching amount alone is a coincidence until someone confirms it.

After single matches, Recon looks for groups from the same party:
- one payment that covers 2–4 invoices;
- one invoice paid in 2–3 parts.

## What you can do

- **Review queue:** confirm or reject each match. On a keyboard, `A` confirms, `R` rejects, and `J`/`K` move between matches. A rejected pair is never suggested again.
- **Manual matching:** match by hand from either side. Candidates are ranked by fit, and you can pick several to make up a total.
- **Learning:** Recon learns payer names. Confirm once that "Rahul Verma" pays for Pixelpeak Studio, and his later payments match.
- **Unpaid:** see what's still owed to you and what you owe, with an aging chart. You can copy a payment reminder or send it on WhatsApp.
- **Export:** download the statement with match status, or the open invoices, as CSV.
- **Saved progress:** your decisions are kept in this browser for the same pair of files.

## Inputs

- **Bank statements:** CSV, Excel or PDF from HDFC, ICICI, SBI, Axis, Kotak and others, including password-protected PDFs. Uses the same parser as [Statement Autopsy](https://github.com/manicpsycho01/statement-autopsy).
- **Invoice lists:** exports from Zoho Books, Tally (Bills Receivable / Payable), QuickBooks or Vyapar, or any sheet with invoice number, party, date and amount columns. Paid and void rows are skipped. Bills (purchases) are matched to debits; invoices are matched to credits.

## Run it

```bash
pnpm install
pnpm samples        # regenerate the fictional sample files
pnpm dev            # http://localhost:3300
```

## Tests

```bash
pnpm test                                   # unit tests: names, signals, every planted case, decisions
pnpm build && pnpm start &
BASE_URL=http://localhost:3300 pnpm e2e     # browser flows + layout audit at 17 screen sizes
```

The sample studio has one planted example of every case:
- invoice numbers quoted in narrations;
- 10% TDS;
- bank charges;
- one payment for two invoices;
- an invoice paid in two parts;
- a late payment;
- an ambiguous ₹50,000 from an unknown payer;
- vendor rent;
- a freelancer paid net of TDS;
- credits and debits with no invoice.

The tests assert that every one of these comes out right.

The matching design was informed by the open-source [Midday](https://github.com/midday-ai/midday) inbox-matching notes, which use deterministic scoring, conservative auto-matching and learning from declines. No code was copied.

The sample data describes a fictional company. Recon is not accounting advice.
