import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}
const sample = async (page: Page) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
};
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });
const toast = (page: Page) => page.locator("[data-toast]");

test("landing: clear promise, two inputs, Match disabled until both are loaded", async ({ page }) => {
  const errors = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Match every payment to its invoice/);
  await expect(page.getByRole("button", { name: /Match them/ })).toBeDisabled();
  await page.locator("input[data-slot=bank]").setInputFiles("public/samples/kavach-bank-hdfc.csv");
  await expect(page.getByText("25 transactions")).toBeVisible();
  await expect(page.getByRole("button", { name: /Match them/ })).toBeDisabled();
  await page.locator("input[data-slot=invoices]").setInputFiles("public/samples/kavach-invoices-zoho.csv");
  await expect(page.getByText("20 open items")).toBeVisible();
  await page.getByRole("button", { name: /Match them/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/of ₹9,61,621 received is matched/);
  expect(errors).toEqual([]);
});

test("dropping both files at once sorts them into the right slots", async ({ page }) => {
  await page.goto("/");
  const files = ["public/samples/kavach-invoices-zoho.csv", "public/samples/kavach-bank-hdfc.csv"].map((p) => [p.split("/").pop()!, readFileSync(p).toString("base64")]);
  const dt = await page.evaluateHandle((fs) => {
    const d = new DataTransfer();
    for (const [name, b64] of fs) d.items.add(new File([Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0))], name!, { type: "text/csv" }));
    return d;
  }, files);
  await page.dispatchEvent("body", "drop", { dataTransfer: dt });
  await expect(page.getByText("25 transactions")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("20 open items")).toBeVisible();
  await expect(page.getByRole("button", { name: /Match them/ })).toBeEnabled();
});

test("a Tally Bills Receivable export works as the invoice list", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[data-slot=invoices]").setInputFiles("tests/fixtures/tally-outstanding.csv");
  await expect(page.getByText("2 open items")).toBeVisible();
});

test("the wrong file in a slot gets a clear message and can be replaced", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[data-slot=invoices]").setInputFiles("public/samples/kavach-bank-hdfc.csv");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't find the invoice list" })).toBeVisible();
  await page.locator("input[data-slot=invoices]").setInputFiles("public/samples/kavach-invoices-zoho.csv");
  await expect(page.getByText("20 open items")).toBeVisible();
});

test.describe("workspace", () => {
  test.beforeEach(async ({ page }) => { await sample(page); });

  test("summary and tab counts", async ({ page }) => {
    await expect(tab(page, /Needs review/)).toContainText("4");
    await expect(tab(page, /^Matched/)).toContainText("9");
    await expect(tab(page, /Unpaid/)).toContainText("6");
    await expect(page.getByText("₹3,41,900")).toBeVisible();
  });

  test("every review card explains itself", async ({ page }) => {
    for (const t of ["10% TDS deducted (₹23,600)", "₹17.70 short — likely bank charges", "Paid in 2 parts"]) await expect(page.getByText(t)).toBeVisible();
  });

  test("confirm moves a match to Matched; 'Not a match' sends both sides back", async ({ page }) => {
    const first = page.locator("article").first();
    await first.getByRole("button", { name: "Confirm" }).click();
    await expect(toast(page)).toContainText("Confirmed");
    await expect(tab(page, /Needs review/)).toContainText("3");
    await expect(tab(page, /^Matched/)).toContainText("10");
    await page.locator("article").first().getByRole("button", { name: "Not a match" }).click();
    await expect(tab(page, /Needs review/)).toContainText("2");
    await expect(tab(page, /Unpaid/)).toContainText("7");
  });

  test("keyboard: A confirms, R rejects, J moves", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcuts are a desktop affordance");
    await page.locator("body").press("j");
    await page.locator("body").press("a");
    await expect(tab(page, /Needs review/)).toContainText("3");
    await page.locator("body").press("r");
    await expect(tab(page, /Needs review/)).toContainText("2");
  });

  test("matching by hand from Unmatched payments, and the payer is learned", async ({ page }) => {
    await tab(page, /Unmatched payments/).click();
    await page.locator("li", { hasText: "Rahul Verma" }).getByRole("button", { name: "Find invoice" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("label", { hasText: "INV-2026-048" }).click();
    await expect(dialog).toContainText("Selected ₹50,000 of ₹50,000");
    await dialog.getByRole("button", { name: /^Match/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("“rahul verma” pays for “pixelpeak studio”")).toBeVisible();
    await tab(page, /^Matched/).click();
    await expect(page.locator("article", { hasText: "INV-2026-048" })).toContainText("Confirmed");
  });

  test("Esc closes the picker", async ({ page }) => {
    await tab(page, /Unpaid/).click();
    await page.locator("li", { hasText: "Greenfield Realty" }).getByRole("button", { name: "Find payment" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("unpaid: aging, payables, reminders", async ({ page, context, browserName }) => {
    await tab(page, /Unpaid/).click();
    await expect(page.locator("li", { hasText: "Greenfield Realty" })).toContainText("90 days overdue");
    const wa = page.locator("li", { hasText: "Greenfield Realty" }).getByRole("link", { name: "WhatsApp" });
    expect(decodeURIComponent((await wa.getAttribute("href"))!)).toContain("invoice INV-2026-039 for ₹1,41,600");
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.locator("li", { hasText: "Greenfield Realty" }).getByRole("button", { name: "Copy reminder" }).click();
      await expect(toast(page)).toContainText("Reminder for INV-2026-039 copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("90 days ago");
    }
    await page.getByRole("button", { name: /You owe/ }).click();
    await expect(page.locator("li", { hasText: "Inkwell Printers" })).toContainText("10 days overdue");
  });

  test("exports: reconciled statement and unpaid list", async ({ page }) => {
    const [a] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download reconciled statement" }).click()]);
    const csv = readFileSync((await a.path())!, "utf8");
    expect(a.suggestedFilename()).toBe("kavach-bank-hdfc-reconciled.csv");
    expect(csv.split("\n")).toHaveLength(26);
    expect(csv).toContain("INV-2026-041");
    const [b] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download open invoices" }).click()]);
    expect(readFileSync((await b.path())!, "utf8")).toContain("Greenfield Realty");
  });

  test("decisions survive a reload and can be cleared", async ({ page }) => {
    await page.locator("article").first().getByRole("button", { name: "Confirm" }).click();
    await expect(tab(page, /Needs review/)).toContainText("3");
    await page.reload();
    await page.getByRole("button", { name: "Try with sample data" }).click();
    await expect(tab(page, /Needs review/)).toContainText("3");
    await page.getByRole("button", { name: "Clear my decisions" }).click();
    await expect(tab(page, /Needs review/)).toContainText("4");
  });

  test("'New files' goes back to the start", async ({ page }) => {
    await page.getByRole("button", { name: "New reconciliation" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Match every payment/);
  });
});

test("header promise; source link only in the footer", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator("header")).toContainText(isMobile ? "Never uploaded" : "Your files never leave this device");
  await expect(page.locator("header a[href*='github.com']")).toHaveCount(0);
  await expect(page.locator("footer").getByRole("link", { name: /Source code on GitHub/ })).toHaveAttribute("href", "https://github.com/manicpsycho01/recon");
});
