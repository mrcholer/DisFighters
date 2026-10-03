import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { testPlayer } from "./session-fixture";
import { holdPad, pressPad, setPad, virtualControllers } from "./gamepad-fixture";

async function localFight(page: Page) {
  await virtualControllers(page); await page.goto("/?test=local");
  await expect(page.getByRole("button", { name: "ENTER THE LOBBY" })).toBeEnabled();
  await setPad(page, 3); await pressPad(page, 3, 0);
  await expect(page.getByRole("button", { name: /START FIGHT/ })).toBeVisible();
  await pressPad(page, 3, 9); await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
}
test("Xbox and PS4 controllers play local combat, survive hot unplug, and operate pause menus", async ({ page }) => {
  test.setTimeout(55_000); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await localFight(page); await setPad(page, 6, { id: "DualShock 4 Wireless Controller" });
  await expect(page.getByLabel("Controller status")).toContainText("PLAYSTATION · P2");
  await holdPad(page, 3, [15], 1020); await setPad(page, 6, { buttons: [7] });
  await setPad(page, 3, { buttons: [2] }); await page.waitForTimeout(950);
  await expect(page.getByRole("progressbar", { name: "Player Two shield" })).toHaveAttribute("aria-valuenow", "75");
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "100");
  await setPad(page, 3, { buttons: [] }); await setPad(page, 6, { buttons: [] });
  await holdPad(page, 3, [15], 100); await pressPad(page, 3, 2);
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
  await page.screenshot({ path: ".artifacts/controllers-arena.png" });
  await setPad(page, 3, null); await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  await expect(page.getByLabel("Controller status")).toHaveText(/PLAYSTATION · P2/);
  await pressPad(page, 6, 9); await expect(page.locator(".pause-overlay")).toBeHidden();
  await setPad(page, 0); await expect(page.getByLabel("Controller status")).toContainText("XBOX · P1");
  await setPad(page, 0, { buttons: [9] }); await page.waitForTimeout(700);
  await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  await setPad(page, 0, { buttons: [] }); await pressPad(page, 0, 13);
  await expect(page.getByRole("button", { name: "RESTART MATCH", exact: true })).toBeFocused();
  await pressPad(page, 0, 0);
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator(".pause-overlay")).toBeHidden(); expect(errors).toEqual([]);
});
test("focus loss clears held controls and controller-only help can be opened and closed", async ({ page }) => {
  await virtualControllers(page); await page.goto("/?test=local");
  await expect(page.getByRole("button", { name: "ENTER THE LOBBY" })).toBeEnabled();
  await setPad(page, 3); await pressPad(page, 3, 0); await pressPad(page, 3, 8);
  await expect(page.getByRole("dialog")).toBeVisible(); await expect(page.getByLabel("Controller controls")).toBeVisible();
  await page.screenshot({ path: ".artifacts/controllers-guide.png" });
  await pressPad(page, 3, 1); await expect(page.getByRole("dialog")).toHaveCount(0);
  await pressPad(page, 3, 9); await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
  await setPad(page, 3, { axes: [.9, 0] }); await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "RESUME FIGHT", exact: true }).click();
  await expect(page.getByLabel("Controller status")).toContainText("RELEASE CONTROLS");
  await setPad(page, 3, { axes: [0, 0] }); await expect(page.getByLabel("Controller status")).toContainText("XBOX · P1");
  await pressPad(page, 3, 9); await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".artifacts/controllers-mobile-pause.png" });
});
test("blocked controller APIs leave keyboard controls usable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "getGamepads", { value: () => { throw new DOMException("Policy blocked", "SecurityError"); } }));
  await page.goto("/?test=local"); await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.getByLabel("Controller status")).toContainText("Controller access blocked");
  await page.keyboard.press("Enter"); await expect(page.locator(".fight-screen")).toBeVisible();
});
test("a PS5 controller owns online P2; spectator input is ignored and unplug requires both players to resume", async ({ browser }) => {
  test.setTimeout(65_000);
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
  const [one, two, viewer] = await Promise.all(contexts.map(context => context.newPage()));
  const errors: string[] = []; for (const page of [one, two, viewer]) page.on("pageerror", error => errors.push(error.message));
  try {
    for (const [page, id] of [[one, "pad-alpha"], [two, "pad-beta"], [viewer, "pad-viewer"]] as const) {
      await virtualControllers(page); await testPlayer(page, id, "online-controller-instance"); await page.goto("/");
      await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
    }
    await setPad(one, 2); await setPad(two, 4, { id: "DualSense Wireless Controller" }); await setPad(viewer, 0, { id: "DualShock 4" });
    await pressPad(one, 2, 9); await expect(one.getByRole("button", { name: "CANCEL READY", exact: true })).toBeVisible();
    await pressPad(two, 4, 9);
    for (const page of [one, two, viewer]) await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
    await expect(two.getByLabel("Controller status")).toContainText("PS5 · YOU");
    await holdPad(viewer, 0, [2, 9, 15], 300);
    await expect(one.locator(".pause-overlay")).toBeHidden();
    await expect(one.getByRole("progressbar", { name: "Player One health" })).toHaveAttribute("aria-valuenow", "100");
    await holdPad(two, 4, [14], 1020); await pressPad(two, 4, 2);
    for (const page of [one, two, viewer]) await expect(page.getByRole("progressbar", { name: "Player One health" })).toHaveAttribute("aria-valuenow", "88");
    await expect(two.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "100");
    await setPad(two, 4, null); await expect(one.getByRole("heading", { name: "PAUSED." })).toBeVisible();
    await pressPad(one, 2, 9); await expect(one.getByRole("button", { name: "CANCEL READY", exact: true })).toBeVisible();
    await expect(one.locator(".pause-overlay")).toBeVisible();
    await setPad(two, 0, { id: "DualSense Wireless Controller" }); await pressPad(two, 0, 9);
    await expect(one.locator(".pause-overlay")).toBeHidden();
    await expect(one.getByRole("progressbar", { name: "Player One health" })).toHaveAttribute("aria-valuenow", "88");
    await two.screenshot({ path: ".artifacts/controllers-online-p2.png" }); expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test("unsupported controller mappings show their status and leave keyboard controls usable", async ({ page }) => {
  await virtualControllers(page); await page.goto("/?test=local");
  await setPad(page, 3, { mapping: "" });
  await expect(page.getByLabel("Controller status")).toContainText("UNSUPPORTED MAPPING");
  await pressPad(page, 3, 0); await expect(page.locator(".loading-screen")).toBeVisible();
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await page.keyboard.press("Enter"); await expect(page.locator(".fight-screen")).toBeVisible();
});
