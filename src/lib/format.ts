const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const inr = (n: number, decimals = false) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: decimals ? 2 : 0, minimumFractionDigits: decimals ? 2 : 0 });

/** Rupees with paise only when there are any. */
export const money = (n: number) => inr(n, Math.round(Math.abs(n) * 100) % 100 !== 0);

export function day(iso: string, withYear = true) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m! - 1]}${withYear ? ` ${y}` : ""}`;
}

export function inrShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (a >= 1e3) return `₹${(a / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(a)}`;
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => (typeof v === "number" ? v.toFixed(2) : `"${v.replace(/"/g, '""')}"`);
  const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
