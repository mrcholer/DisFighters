import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function lobby(page: Page) {
  await page.goto("/?test=local");
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.getByRole("button", { name: /START FIGHT/ })).toBeVisible();
}
async function fight(page: Page) {
  await lobby(page); await page.getByRole("button", { name: /START FIGHT/ }).click();
  await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 6000 });
}
async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key);
}

test("loading, lobby and controls are a full-screen game with no website navigation", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await mkdir(".artifacts", { recursive: true }); await page.goto("/?test=local");
  await expect(page.getByRole("heading", { name: /DIS\s*FIGHTERS/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "ENTER THE LOBBY" })).toBeEnabled();
  await page.screenshot({ path: ".artifacts/loading.png" });
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /START FIGHT/ })).toBeVisible();
  await page.waitForTimeout(300); await page.screenshot({ path: ".artifacts/lobby.png" });
  await page.getByRole("button", { name: /HOW TO PLAY/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("players can move, hit, guard, pause safely, restart, and return to the lobby", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await fight(page);
  const health = page.getByRole("progressbar", { name: "Player Two health" });
  await expect(health).toHaveAttribute("aria-valuenow", "100");
  await hold(page, "d", 1120); await page.keyboard.down("l"); await page.keyboard.press("f");
  await page.waitForTimeout(400); await expect(health).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.up("l"); await page.keyboard.press("f"); await page.waitForTimeout(400);
  await expect(health).toHaveAttribute("aria-valuenow", "88");
  await hold(page, "w", 150); await page.screenshot({ path: ".artifacts/arena.png" });
  await page.keyboard.press("Escape"); await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  const time = await page.locator(".round-clock strong").textContent();
  await page.waitForTimeout(1100); expect(await page.locator(".round-clock strong").textContent()).toBe(time);
  await page.getByRole("button", { name: "RESUME FIGHT" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "PAUSED." })).toBeVisible();
  await page.getByRole("button", { name: "RESTART MATCH" }).click();
  await expect(health).toHaveAttribute("aria-valuenow", "100");
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "RETURN TO LOBBY" }).click();
  await expect(page.getByRole("button", { name: /START FIGHT/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test("a real knockout gives a round win and the next round restores health", async ({ page }) => {
  await fight(page);
  for (let i = 0; i < 9; i++) {
    await hold(page, "d", i === 0 ? 1120 : 180);
    await page.keyboard.press("f"); await page.waitForTimeout(450);
  }
  await expect(page.locator(".result-overlay")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByLabel("Player One: 1 round wins")).toBeVisible();
  await page.screenshot({ path: ".artifacts/round-result.png" });
  await page.getByRole("button", { name: "NEXT ROUND" }).click();
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator(".round-clock > span")).toHaveText("ROUND 02");
});
test("mobile lobby and touch controls fit inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await lobby(page);
  await page.screenshot({ path: ".artifacts/mobile-lobby.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const start = await page.getByRole("button", { name: /START FIGHT/ }).boundingBox();
  expect(start).not.toBeNull(); expect(start!.y + start!.height).toBeLessThan(844);
  await page.getByRole("button", { name: /START FIGHT/ }).click();
  await expect(page.getByRole("button", { name: "Player 1 attack", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Player 2 block", exact: true })).toBeVisible();
  await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
  const move = await page.getByRole("button", { name: "Player 1 right", exact: true }).boundingBox();
  await page.mouse.move(move!.x + move!.width / 2, move!.y + move!.height / 2); await page.mouse.down();
  await page.waitForTimeout(1120); await page.mouse.up();
  await page.getByRole("button", { name: "Player 1 attack", exact: true }).click({ delay: 100 });
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
  await page.screenshot({ path: ".artifacts/mobile-arena.png" });
});
test("round settings persist and set the timer and round markers for a local test", async ({ page }) => {
  await lobby(page); await page.getByRole("button", { name: "Match settings", exact: true }).click();
  await page.getByRole("button", { name: "90 SECONDS", exact: true }).click();
  await page.getByRole("button", { name: "3 BEST OF 5", exact: true }).click();
  await page.screenshot({ path: ".artifacts/settings.png" });
  await page.getByRole("button", { name: "READY TO FIGHT", exact: true }).click();
  await page.reload(); await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.locator(".duel-rule")).toContainText("BEST OF 5");
  await page.getByRole("button", { name: /START FIGHT/ }).click();
  await expect(page.locator(".round-clock strong")).toHaveText("90");
  await expect(page.locator(".round-wins").first().locator("i")).toHaveCount(3);
});
