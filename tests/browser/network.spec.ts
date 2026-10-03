import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { testPlayer } from "./session-fixture";
async function enter(page: Page, id: string, instance?: string) {
  await testPlayer(page, id, instance); await page.goto("/");
  if (id !== "alpha") await page.addStyleTag({ content: ".arena-canvas { display: none !important; }" });
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
}
async function hold(page: Page, key: string, ms: number) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }
test("two authenticated clients share settings, shield damage, health, pause and reconnection; other instances stay isolated", async ({ browser }) => {
  test.setTimeout(150_000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 960, height: 600 } })));
  const [one, two, viewer, isolated] = await Promise.all(contexts.map(context => context.newPage()));
  await one.setViewportSize({ width: 1440, height: 900 });
  const brokenGuard = new Set<Page>();
  const errors: string[] = []; for (const page of [one, two, viewer, isolated]) {
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => socket.on("framereceived", ({ payload }) => {
      try {
        const packet = JSON.parse(String(payload)); const fighter = packet.data?.match?.fighters?.[1];
        if (packet.event === "snapshot" && fighter?.shield === 0 && fighter.health === 100) brokenGuard.add(page);
      } catch { /* Ignore non-JSON transport frames. */ }
    }));
  }
  try {
    await enter(one, "alpha"); await enter(two, "beta");
    await expect(one.locator(".assigned-player").filter({ hasText: "Test beta" })).toBeVisible();
    await expect(two.getByRole("button", { name: "Match settings", exact: true })).toBeDisabled();
    await one.getByRole("button", { name: "Match settings", exact: true }).click();
    await one.getByRole("button", { name: "30 SECONDS", exact: true }).click();
    await one.getByRole("button", { name: "1 QUICK DUEL", exact: true }).click();
    await one.getByRole("button", { name: "READY TO FIGHT", exact: true }).click();
    await expect(two.locator(".duel-rule")).toContainText("30 SECOND ROUNDS");
    await enter(viewer, "viewer"); await expect(viewer.getByRole("button", { name: "JOIN QUEUE", exact: true })).toBeEnabled();
    await enter(isolated, "other", "isolated-test-instance");
    await expect(isolated.locator(".assigned-player").filter({ hasText: "Test beta" })).toHaveCount(0);
    await expect(isolated.getByText("Invite a friend to this Activity.")).toBeVisible();
    await one.getByRole("button", { name: /READY UP/ }).click();
    await expect(one.getByRole("button", { name: /CANCEL READY/ })).toBeVisible();
    await two.getByRole("button", { name: /READY UP/ }).click();
    for (const page of [one, two, viewer]) await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
    await expect(one.locator(".duel-player-name").filter({ hasText: "YOU · Test alpha" })).toBeVisible();
    await expect(two.locator(".duel-player-name").filter({ hasText: "YOU · Test beta" })).toBeVisible();
    await expect(viewer.locator(".match-meta")).toContainText("SPECTATING");
    await expect(viewer.getByRole("button", { name: "Pause game", exact: true })).toBeDisabled();
    await hold(one, "d", 1120); await two.keyboard.down("g"); await two.waitForTimeout(80);
    for (let hit = 0; hit < 4; hit++) {
      if (hit) await hold(one, "d", 130);
      await one.keyboard.press("f"); await one.waitForTimeout(450);
    }
    // Strike during vulnerability before reading three clients; those reads can outlast the cooldown.
    await hold(one, "d", 300); await one.waitForTimeout(350); await one.keyboard.press("f");
    for (const page of [one, two, viewer]) await expect.poll(() => brokenGuard.has(page)).toBe(true);
    await one.screenshot({ path: ".artifacts/shield-vulnerability.png" });
    await expect(one.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
    await expect(two.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
    await expect(viewer.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
    await expect(two.getByRole("progressbar", { name: "Player Two shield" })).toHaveAttribute("aria-valuenow", "100", { timeout: 6500 });
    await two.keyboard.up("g"); await one.screenshot({ path: ".artifacts/network-arena.png" });
    await two.keyboard.press("Escape");
    await expect(one.getByRole("heading", { name: "PAUSED." })).toBeVisible();
    const clock = await one.locator(".round-clock strong").textContent();
    await one.getByRole("button", { name: "RESUME FIGHT", exact: true }).click();
    await one.waitForTimeout(400); expect(await one.locator(".round-clock strong").textContent()).toBe(clock);
    await two.getByRole("button", { name: "RESUME FIGHT", exact: true }).click();
    await expect(one.locator(".pause-overlay")).toBeHidden();
    await two.close(); await expect(one.locator(".pause-overlay")).toBeVisible();
    const returned = await contexts[1].newPage(); await enter(returned, "beta");
    await expect(returned.locator(".duel-player-name").filter({ hasText: "YOU · Test beta" })).toBeVisible();
    await expect(returned.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "88");
    await one.getByRole("button", { name: "RESUME FIGHT", exact: true }).click();
    await returned.getByRole("button", { name: "RESUME FIGHT", exact: true }).click();
    await expect(one.locator(".pause-overlay")).toBeHidden();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
test("WebSocket upgrades without an authenticated session are rejected", async ({ page }) => {
  await page.goto("/?test=local");
  // Clear the development login cookie before opening a raw unauthenticated socket.
  await page.context().clearCookies();
  const opened = await page.evaluate(() => new Promise<boolean>(resolve => {
    const ws = new WebSocket(`ws://${location.host}/ws/duel`);
    ws.onopen = () => { ws.close(); resolve(true); }; ws.onerror = () => resolve(false);
    ws.onclose = () => resolve(false); setTimeout(() => { ws.close(); resolve(false); }, 3000);
  }));
  expect(opened).toBe(false);
});
