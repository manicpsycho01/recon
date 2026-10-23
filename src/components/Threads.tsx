"use client";

import { useRef } from "react";
import { gsap, MOTION, useGSAP } from "@/lib/gsap";

const PAY = [
  ["12 Jul", "BRIGHTLOOP DSGN", "1,18,000"],
  ["02 Aug", "NORTHWIND MEDIA PVT", "2,12,400"],
  ["20 Aug", "SAHYADRI FOODS", "82,600"],
  ["18 Aug", "KESTREL APPS", "88,482.30"],
];
const INV = [
  ["INV-041", "Brightloop Design LLP", "1,18,000"],
  ["INV-042", "Northwind Media", "2,36,000"],
  ["INV-043 + 047", "Sahyadri Foods", "82,600"],
  ["INV-045", "Kestrel Apps", "88,500"],
];
const TAGS = [["Exact", "thread"], ["10% TDS", "info"], ["2 invoices", "info"], ["₹17.70 fees", "review"]] as const;

/** The hero illustration: payments on the left, invoices on the right, threads drawn between them. */
export function Threads() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => {
      const tl = gsap.timeline({ delay: 0.4, defaults: { ease: "power3.out" } });
      tl.from("[data-row]", { y: 12, opacity: 0, duration: 0.6, stagger: 0.06 });
      gsap.utils.toArray<SVGPathElement>("[data-thread]").forEach((p, i) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        tl.to(p, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" }, 0.6 + i * 0.28);
        tl.from(`[data-tag="${i}"]`, { scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(2)" }, 1.1 + i * 0.28);
      });
    });
  }, { scope: root });

  return (
    <div ref={root} aria-hidden className="ledger relative overflow-hidden rounded-3xl border border-line bg-sheet p-4 sm:p-6">
      <div className="label mb-4 flex justify-between text-muted">
        <span>Bank statement</span>
        <span>Invoices</span>
      </div>
      <div className="relative grid grid-cols-[1fr_6.75rem_1fr] items-center gap-y-3 xl:grid-cols-[1fr_7.5rem_1fr]">
        {PAY.map((p, i) => (
          <div key={i} className="contents">
            <div data-row className="min-w-0 rounded-xl border border-line bg-paper px-3 py-2.5">
              <p className="label truncate text-[10.5px] text-muted">{p[0]} · NEFT</p>
              <p className="truncate text-[13px] font-medium">{p[1]}</p>
              <p className="num text-[13px] text-ink-2">₹{p[2]}</p>
            </div>
            <div className="relative h-full">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                <path data-thread d="M0 20 C 45 20, 55 20, 100 20" fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className={TAGS[i]![1] === "review" ? "stroke-review" : "stroke-thread"} />
              </svg>
              <span data-tag={i} className={`label absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] tracking-[0.02em] whitespace-nowrap ${
                TAGS[i]![1] === "thread" ? "bg-thread-soft text-thread" : TAGS[i]![1] === "review" ? "bg-review-soft text-review" : "bg-info-soft text-info"
              }`}>{TAGS[i]![0]}</span>
            </div>
            <div data-row className="min-w-0 rounded-xl border border-line bg-paper px-3 py-2.5">
              <p className="label truncate text-[10.5px] text-muted">{INV[i]![0]}</p>
              <p className="truncate text-[13px] font-medium">{INV[i]![1]}</p>
              <p className="num text-[13px] text-ink-2">₹{INV[i]![2]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
