/**
 * Party names: who a bank narration was from/to, and how alike two business names are.
 * "BRIGHTLOOP DSGN" vs "Brightloop Design LLP" should match; "Mehta Traders" vs "Mehra Traders" should not.
 */

const STOP = new Set(["upi", "dr", "cr", "p2m", "p2a", "neft", "imps", "rtgs", "ach", "nach", "pos", "ecom", "payment", "pay", "paid", "sent", "to", "from", "transfer", "trf", "via", "ref", "na", "null", "txn", "debit", "credit", "card", "inward", "outward", "phone", "ph", "mob", "bank", "inb", "mb", "ib", "the", "for", "by", "of", "india", "upi payment", "payment from ph", "invoice", "inv", "bill", "against", "settlement", "mmt", "mobile banking"]);
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Best guess at the counterparty name inside a bank narration. */
export function counterparty(desc: string): string {
  const handle = desc.match(/([a-z0-9._-]+@[a-z]+)/i)?.[1];
  // Channel prefixes ("NEFT CR-", "ACH D- ", "TO TRANSFER-") are not names.
  const body = desc.replace(/^\s*(by|to)\s+transfer\s*-?/i, "").replace(/^\s*(neft|imps|rtgs|ach|nach|upi|mmt)\b\s*(cr|dr|c|d|inward|outward)?\b\s*-?\s*/i, "");
  const tokens = body
    .split(/[/|:\\]|(?<=\S)-(?=\S)|\s-\s|\s{2,}/)
    .map((t) => t.trim())
    .filter((t) => t && !t.includes("@"))
    .filter((t) => !/^[\d\s]+$/.test(t) && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(t) && !/^[A-Z]{4}$/.test(t) && !/^x+\d+$/i.test(t) && !/^[A-Z]?\d{6,}[A-Z0-9]*$/i.test(t))
    .filter((t) => !STOP.has(t.toLowerCase()) && /[a-z]{3}/i.test(t))
    .filter((t) => !/^(inv|invoice|bill)[\s#.-]*\w*\d/i.test(t));
  const name = tokens.find((t) => !/^(to|by|from)\b/i.test(t)) ?? (handle ? handle.split("@")[0]! : desc.slice(0, 30));
  return titleCase(name.replace(/\b(upi|neft|imps|rtgs)\b/gi, "").replace(/\s+/g, " ").trim()).slice(0, 48);
}

const SUFFIX = /\b(private|pvt|limited|ltd|llp|llc|inc|co|company|corp|corporation|the|and|india|opc|m\/s|ms)\b/g;

/** "M/s. Brightloop Design Pvt. Ltd." → "brightloop design" */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/m\/s\.?/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const consonants = (s: string) => s[0] + s.slice(1).replace(/[aeiou]/g, "");

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++)
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** How alike two tokens are: equal, prefix ("tech" / "technologies"), abbreviation ("dsgn" / "design"), or spelling. */
function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.startsWith(s)) return 0.9;
  if (s.length >= 3 && consonants(l).startsWith(consonants(s)) && consonants(s).length >= 3) return 0.85;
  const jw = jaroWinkler(a, b);
  return jw >= 0.92 ? jw : 0;
}

/**
 * Similarity of two party names in 0..1. Every word of the shorter name has to find a partner in the
 * longer one (abbreviated bank narrations drop words, they don't add them); a missing first word is fatal.
 */
export function nameSim(x: string, y: string): number {
  const a = normName(x).split(" ").filter(Boolean), b = normName(y).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  if (a.join("") === b.join("")) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let total = 0;
  for (const [i, t] of short.entries()) {
    const best = Math.max(...long.map((u) => tokenSim(t, u)));
    if (i === 0 && best < 0.85) return 0;
    total += best;
  }
  const coverage = short.length / long.length;
  return (total / short.length) * (0.75 + 0.25 * coverage);
}
