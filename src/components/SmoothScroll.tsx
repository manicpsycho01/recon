"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

export const lenisStore: { current: Lenis | null } = { current: null };

/** Lenis smooth scrolling on desktop pointers, driven by GSAP's ticker so ScrollTrigger stays in sync. Native on touch. */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: false, lerp: 0.11, syncTouch: false });
    lenisStore.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisStore.current = null;
    };
  }, []);
  return null;
}

/** Smooth-scroll to an element (or the top) whether or not Lenis is running. */
export function scrollToEl(target: HTMLElement | number, offset = -16) {
  if (lenisStore.current) lenisStore.current.scrollTo(target, { offset, duration: 1.1 });
  else if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
  else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
}
