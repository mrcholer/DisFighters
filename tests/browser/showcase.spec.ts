import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { holdPad, pressPad, setPad, virtualControllers } from "./gamepad-fixture";
import { testPlayer } from "./session-fixture";

const output = "docs/screenshots";
test("capture the game, controller guide, mobile arena and competition showcase", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await virtualControllers(page); await page.goto("/?test=local");
  await expect(page.getByRole("button", { name: "ENTER THE LOBBY" })).toBeEnabled();
  await setPad(page, 0, { id: "Xbox XInput" }); await setPad(page, 1, { id: "DualSense Wireless Controller" });
  await page.screenshot({ path: `${output}/loading.png` });
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.getByRole("button", { name: /START FIGHT/ })).toBeVisible();
  await expect(page.getByLabel("Controller status")).toContainText("PS5 · P2");
  await page.screenshot({ path: `${output}/lobby.png` });
  await page.getByRole("button", { name: /HOW TO PLAY/ }).click();
  await expect(page.getByLabel("Controller controls")).toBeVisible();
  await page.screenshot({ path: `${output}/controllers.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Match settings", exact: true }).click();
  await page.screenshot({ path: `${output}/settings.png` }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /START FIGHT/ }).click();
  await expect(page.locator(".fight-screen")).toBeVisible();
  await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
  await holdPad(page, 0, [15], 1020); await setPad(page, 1, { buttons: [7] }); await pressPad(page, 0, 2);
  await expect(page.getByRole("progressbar", { name: "Player Two shield" })).toHaveAttribute("aria-valuenow", "75");
  await page.screenshot({ path: `${output}/guard.png` });
  await setPad(page, 1, { buttons: [] }); await holdPad(page, 0, [15], 100); await pressPad(page, 0, 2);
  await expect(page.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
  await page.screenshot({ path: `${output}/gameplay.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Player 1 attack", exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.close();

  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 960, height: 600 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const host = pages[0]; await host.setViewportSize({ width: 1440, height: 900 });
  try {
    for (const [index, player] of pages.entries()) {
      player.on("pageerror", error => errors.push(error.message));
      const cdp = await player.context().newCDPSession(player); await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await virtualControllers(player); await testPlayer(player, `Player${index + 1}`, "showcase-capture-instance");
      await player.goto("/");
      if (index) await player.addStyleTag({ content: ".arena-canvas { display: none !important; }" });
      await player.getByRole("button", { name: "ENTER THE LOBBY" }).click();
      await expect(player.getByLabel("Your Discord player")).toContainText(`Test Player${index + 1}`);
    }
    await setPad(host, 0, { id: "Xbox XInput" });
    for (const player of pages.slice(2)) await player.getByRole("button", { name: "JOIN QUEUE", exact: true }).click();
    await expect(host.locator(".challenger-list li")).toHaveCount(2);
    await host.screenshot({ path: `${output}/pvp-queue.png` });
    await host.getByRole("button", { name: /02 TOURNAMENT/ }).click();
    for (const player of pages) await player.getByRole("button", { name: "JOIN TOURNAMENT", exact: true }).click();
    await expect(host.locator(".entrant-grid .competition-profile")).toHaveCount(4);
    await host.screenshot({ path: `${output}/tournament-lobby.png` });
    await host.getByRole("button", { name: "START TOURNAMENT", exact: true }).click();
    await pressPad(host, 0, 9);
    for (const player of pages.slice(1)) await player.getByRole("button", { name: "READY UP", exact: true }).click();
    await expect(host.locator(".fight-screen")).toBeVisible();
    await host.locator(".match-browser-button").click();
    await expect(host.locator(".bracket-match")).toHaveCount(3);
    await host.screenshot({ path: `${output}/tournament.png` });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
