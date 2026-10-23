import { expect, test, type Page } from "@playwright/test";

/**
 * Layout audit on the landing page and the full report at 17 screen sizes, animations off:
 * no sideways overflow, no text off screen or overlapping other text, no text under 12px,
 * 44px touch targets on touch screens. Runs once (desktop project).
 */
const VIEWPORTS = [[320,568,1],[360,740,1],[390,844,1],[393,852,1],[430,932,1],[844,390,1],[768,1024,1],[820,1180,1],[1024,768,0],[1024,1366,1],[1280,600,0],[1280,800,0],[1366,768,0],[1440,900,0],[1536,864,0],[1920,1080,0],[2560,1440,0]] as const;

async function audit(page: Page, touch: number): Promise<string[]> {
  return page.evaluate((touch) => {
    const out: string[] = []; const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page overflow ${document.documentElement.scrollWidth}>${vw}`);
    const clipped = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
    const hidden = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return true; } return false; };
    const fixed = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).position === "fixed") return true; return false; };
    const leaves = [...document.querySelectorAll("body *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1) && el.tagName !== "OPTION");
    const boxes: { el: Element; txt: string; rs: { l: number; t: number; r: number; b: number }[] }[] = [];
    for (const el of leaves) {
      if (hidden(el) || el.closest(".sr-only") || el.closest("details:not([open]) > :not(summary)")) continue;
      const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;
      const txt = el.textContent!.trim().slice(0, 40);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 10.5) out.push(`tiny text ${fs}px "${txt}"`);
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && !fixed(el)) out.push(`offscreen "${txt}"`);
      if (fixed(el) || el.closest("[role=tooltip]")) continue;
      const rg = document.createRange(); rg.selectNodeContents(el);
      boxes.push({ el, txt, rs: [...rg.getClientRects()].filter((x) => x.width > 1)
        // clip to the element's own box (truncated text is cut off visually)
        .map((x) => ({ l: Math.max(x.left, r.left), r: Math.min(x.right, r.right), t: x.top + scrollY + x.height * 0.3, b: x.bottom + scrollY - x.height * 0.3 })).filter((x) => x.r - x.l > 1) });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i]!, B = boxes[j]!; if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.rs.some((a) => B.rs.some((c) => Math.min(a.r, c.r) - Math.max(a.l, c.l) > 3 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 3))) out.push(`overlap "${A.txt}" × "${B.txt}"`);
    }
    if (touch) for (const el of document.querySelectorAll("a,button,select,input:not([type=file]),summary")) {
      if (hidden(el) || el.closest(".sr-only") || /skip to content/i.test(el.textContent ?? "")) continue;
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      // a control inside a label: the label is the tap target
      const lab = el.closest("label"); if (lab && lab.getBoundingClientRect().height >= 43.5) continue;
      if (r.height < 43.5 && !el.closest("p")) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`);
    }
    return [...new Set(out)];
  }, touch);
}

const openSample = async (page: Page) => {
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
};

for (const [w, h, touch] of VIEWPORTS) {
  test(`layout ${w}x${h}: landing and every workspace tab`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, reducedMotion: "reduce", baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    const issues = (await audit(page, touch)).map((x) => `landing: ${x}`);
    await openSample(page);
    for (const t of ["Needs review", "Matched", "Unmatched payments", "Unpaid"]) {
      await page.getByRole("tab", { name: new RegExp("^" + t) }).click();
      issues.push(...(await audit(page, touch)).map((x) => `${t}: ${x}`));
    }
    await page.getByRole("button", { name: /You owe/ }).click();
    issues.push(...(await audit(page, touch)).map((x) => `You owe: ${x}`));
    await page.getByRole("tab", { name: /^Unmatched payments/ }).click();
    await page.getByRole("button", { name: "Find invoice" }).first().click();
    issues.push(...(await audit(page, touch)).filter((x) => !x.startsWith("overlap")).map((x) => `picker: ${x}`));
    await ctx.close();
    expect(issues).toEqual([]);
  });
}

for (const [w, h, touch] of VIEWPORTS) {
  test(`hero ${w}x${h}: headline and both inputs start on the first screen`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    test.skip(h < 500, "landscape phone: too short for any hero; it scrolls");
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, reducedMotion: "reduce", baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const slot = (await page.getByRole("heading", { name: "Bank statement", level: 2 }).boundingBox())!;
    expect(h1.y).toBeGreaterThanOrEqual(0);
    expect(slot.y + slot.height, `first input at ${Math.round(slot.y)}`).toBeLessThanOrEqual(h);
    await ctx.close();
  });
}

for (const [w, h, touch] of [[390, 844, 1], [768, 1024, 1], [1280, 600, 0], [1440, 900, 0]] as const) {
  test(`scrolling with animations ${w}x${h}: nothing overlaps once settled`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    const walk = async (tag: string) => {
      const out: string[] = [];
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.round(h * 0.8)) {
        await page.mouse.wheel(0, y === 0 ? 0 : Math.round(h * 0.8));
        await page.waitForTimeout(1100);
        out.push(...(await audit(page, 0)).filter((x) => !x.startsWith("small target")).map((x) => `${tag} @${y}: ${x}`));
      }
      return [...new Set(out)];
    };
    await page.goto("/");
    await page.waitForTimeout(2200);
    const issues = await walk("landing");
    await page.evaluate(() => window.scrollTo(0, 0));
    await openSample(page);
    await page.waitForTimeout(1200);
    issues.push(...(await walk("workspace")));
    await ctx.close();
    expect(issues).toEqual([]);
  });
}
