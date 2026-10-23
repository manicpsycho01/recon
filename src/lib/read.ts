/**
 * Reads a statement file into a cell grid, entirely in the browser. CSV via Papa Parse, Excel
 * (.xls/.xlsx) via SheetJS, PDF via pdf.js — rows rebuilt from text positions using the header's
 * column positions. Password-protected PDFs (common for Indian e-statements) ask for the password.
 */
import Papa from "papaparse";
import type { Grid } from "./parse";

export class PasswordNeeded extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? "That password didn't open the PDF." : "This PDF is password-protected.");
  }
}

export async function readToGrid(file: File, password?: string): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return readPdf(file, password);
  if (/\.(xlsx|xls|xlsm|ods)$/.test(name)) return readExcel(file);
  return readCsv(await file.text());
}

export function readCsv(text: string): Grid {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  return res.data.map((r) => r.map((c) => String(c ?? "")));
}

async function readExcel(file: File): Promise<Grid> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // The sheet with the most rows is the statement.
  let best: Grid = [];
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n]!, { header: 1, raw: false, defval: "", blankrows: false });
    if (rows.length > best.length) best = rows.map((r) => r.map((c) => String(c ?? "")));
  }
  return best;
}

type Item = { x: number; x2: number; y: number; str: string };

async function readPdf(file: File, password?: string): Promise<Grid> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...(password ? { password } : {}) }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === "PasswordException") throw new PasswordNeeded(Boolean(password));
    throw e;
  }
  return pdfDocToGrid(doc);
}

type PdfDoc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> };

/** Groups a PDF's text into lines (by vertical position), then rebuilds the table. */
export async function pdfDocToGrid(doc: PdfDoc): Promise<Grid> {
  const lines: Item[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      const it = raw as { str?: string; transform: number[]; width: number };
      if (!it.str?.trim()) continue;
      items.push({ x: it.transform[4], x2: it.transform[4] + it.width, y: -it.transform[5] + p * 100000, str: it.str.trim() });
    }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of items) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line[0]!.y - it.y) <= 3) line.push(it);
      else lines.push([it]);
    }
  }
  return linesToGrid(lines.map((l) => l.sort((a, b) => a.x - b.x)));
}

const HEADER_WORDS = /date|narration|description|particulars|remarks|details|withdrawal|deposit|debit|credit|amount|balance|chq|ref|dr|cr/i;

/** Uses the header line's word positions as column anchors and drops every item into the nearest column. */
export function linesToGrid(lines: Item[][]): Grid {
  const headerIdx = lines.findIndex((l) => {
    const text = l.map((i) => i.str).join(" ").toLowerCase();
    return /date/.test(text) && /(narration|description|particulars|remarks|details)/.test(text) && /(withdrawal|debit|amount|deposit|credit)/.test(text);
  });
  if (headerIdx < 0) return lines.map((l) => l.map((i) => i.str));
  // Merge header fragments that belong to one label ("Withdrawal" + "Amt."), then anchor columns on them.
  const header: Item[] = [];
  for (const it of lines[headerIdx]!) {
    const last = header[header.length - 1];
    if (last && it.x - last.x2 < 6 && !HEADER_WORDS.test(it.str.split(/\s/)[0]!)) { last.str += " " + it.str; last.x2 = it.x2; }
    else header.push({ ...it });
  }
  const anchors = header.map((h) => ({ left: h.x, right: h.x2, mid: (h.x + h.x2) / 2 }));
  const numeric = (s: string) => /^[-(]?[\d,]+\.\d{2}\)?\s*(dr|cr)?$/i.test(s);
  const grid: Grid = [header.map((h) => h.str)];
  for (const line of lines.slice(headerIdx + 1)) {
    const row = anchors.map(() => "");
    for (const it of line) {
      // Numbers are right-aligned under their header; text is left-aligned.
      let best = 0, bestD = Infinity;
      anchors.forEach((a, k) => {
        const d = numeric(it.str) ? Math.abs(it.x2 - a.right) : it.x >= a.left - 4 ? it.x - a.left : Infinity;
        if (d >= 0 && d < bestD) { bestD = d; best = k; }
      });
      if (bestD === Infinity) best = 0;
      row[best] = row[best] ? `${row[best]} ${it.str}` : it.str;
    }
    grid.push(row);
  }
  return grid;
}
