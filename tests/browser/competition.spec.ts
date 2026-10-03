import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { testPlayer } from "./session-fixture";
import { observeDuel } from "./duel-fixture";
import type { DuelObserver } from "./duel-fixture";

async function enter(page: Page, id: string, instance: string) {
  await page.route("**/api/avatar?url=*", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#74c9d5"/><circle cx="20" cy="15" r="8" fill="#10151e"/></svg>' }));
  await testPlayer(page, id, instance, `https://cdn.discordapp.com/avatars/${id}/test.png`);
  await page.goto("/");
  // One client renders the full arena; additional clients verify HUD, authority and input.
  if (id !== "alpha") await page.addStyleTag({ content: ".arena-canvas { display: none !important; }" });
  await page.getByRole("button", { name: "ENTER THE LOBBY" }).click();
  await expect(page.getByLabel("Your Discord player")).toContainText(`Test ${id}`);
  await expect(page.getByLabel("Your Discord player").locator("img")).toHaveAttribute("src", `/api/avatar?url=${encodeURIComponent(`https://cdn.discordapp.com/avatars/${id}/test.png`)}`);
}
async function quickDuel(page: Page) {
  await page.getByRole("button", { name: "Match settings", exact: true }).click();
  await page.getByRole("button", { name: "1 QUICK DUEL", exact: true }).click();
  await page.getByRole("button", { name: "READY TO FIGHT", exact: true }).click();
}
async function knockout(page: Page, observed: DuelObserver) {
  await page.bringToFront();
  await expect(page.locator(".fight-screen")).toBeVisible();
  await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 7000 });
  for (let hit = 0; hit < 9; hit++) {
    // Move until actually in range, then wait for the real cooldown and confirmed damage.
    // Fixed key-hold durations cannot guarantee distance across several animated clients.
    await page.keyboard.down("d");
    await expect.poll(() => {
      const fighters = observed.current?.match?.fighters;
      return fighters ? Math.abs(fighters[0].x - fighters[1].x) <= 160 : false;
    }, { timeout: 12_000 }).toBe(true);
    await page.keyboard.up("d");
    await expect.poll(() => observed.current?.match?.fighters[0].cooldown === 0).toBe(true);
    const before = observed.current!.match!.fighters[1].health;
    await page.keyboard.press("f");
    await expect.poll(() => observed.current?.match?.fighters[1].health).toBe(Math.max(0, before - 12));
  }
  await expect(page.locator(".result-overlay")).toBeVisible();
}

test("verified profiles and FIFO challengers survive a real PvP knockout and winner-stays rotation", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 960, height: 600 } })));
  const [one, two, three, four] = await Promise.all(contexts.map(context => context.newPage()));
  // These browser windows represent independent players' PCs, each with an active Activity.
  for (const context of contexts) {
    const page = context.pages()[0]; const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  }
  const observed = observeDuel(one);
  await one.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = []; for (const page of [one, two, three, four]) page.on("pageerror", error => errors.push(error.message));
  try {
    for (const [page, id] of [[one, "alpha"], [two, "beta"], [three, "gamma"], [four, "delta"]] as const) await enter(page, id, "pvp-rotation-test");
    await quickDuel(one); await three.getByRole("button", { name: "JOIN QUEUE", exact: true }).click(); await four.getByRole("button", { name: "JOIN QUEUE", exact: true }).click();
    await expect(one.locator(".challenger-list li")).toHaveText([/1Test gamma/, /2Test delta/]);
    await one.screenshot({ path: ".artifacts/pvp-lobby.png" });
    await one.getByRole("button", { name: "READY UP", exact: true }).click(); await two.getByRole("button", { name: "READY UP", exact: true }).click();
    await knockout(one, observed); await expect(one.locator(".result-overlay h2")).toContainText("TEST ALPHA");
    await one.locator(".result-overlay").getByRole("button", { name: "LOBBY & QUEUE", exact: true }).click();
    await expect(one.locator(".competition-seat.player-1 .assigned-player")).toHaveText("Test gamma", { timeout: 9000 });
    await expect(one.locator(".competition-seat.player-0 .assigned-player")).toHaveText("YOU · Test alpha");
    await expect(one.locator(".challenger-list li")).toHaveText([/1Test delta/, /2Test beta/]);
    await expect(one.locator(".competition-seat.player-0")).toContainText("1 WIN STREAK");
    await expect(three.getByRole("button", { name: "READY UP", exact: true })).toBeVisible();
    await one.getByRole("button", { name: "READY UP", exact: true }).click(); await three.getByRole("button", { name: "READY UP", exact: true }).click();
    await expect(one.getByRole("progressbar", { name: "Player Two health" })).toHaveAttribute("aria-valuenow", "100");
    await expect(one.getByLabel("Player One: 0 round wins")).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test("parallel tournament fights, watching while waiting, a final knockout, and mobile bracket", async ({ browser }) => {
  test.setTimeout(150_000);
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ viewport: { width: 960, height: 600 } })));
  const [one, two, three, four, viewer] = await Promise.all(contexts.map(context => context.newPage()));
  // These browser windows represent independent players' PCs, each with an active Activity.
  for (const context of contexts) {
    const page = context.pages()[0]; const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  }
  const observed = observeDuel(one);
  await one.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = []; for (const page of [one, two, three, four, viewer]) page.on("pageerror", error => errors.push(error.message));
  try {
    for (const [page, id] of [[one, "alpha"], [two, "beta"], [three, "gamma"], [four, "delta"], [viewer, "viewer"]] as const) await enter(page, id, "tournament-test");
    await quickDuel(one); await one.getByRole("button", { name: /02 TOURNAMENT/ }).click();
    for (const page of [one, two, three, four]) await page.getByRole("button", { name: "JOIN TOURNAMENT", exact: true }).click();
    await expect(one.locator(".entrant-grid .competition-profile")).toHaveCount(4);
    await one.screenshot({ path: ".artifacts/tournament-registration.png" });
    await one.getByRole("button", { name: "START TOURNAMENT", exact: true }).click();
    await expect(viewer.locator(".bracket-match")).toHaveCount(3);
    for (const page of [one, four, two, three]) await page.getByRole("button", { name: "READY UP", exact: true }).click();
    await viewer.getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await expect(viewer.locator(".live-label")).toHaveCount(2);
    await viewer.locator(".bracket-match").filter({ hasText: "SEMIFINAL 2" }).getByRole("button", { name: "WATCH MATCH" }).click();
    await expect(viewer.locator(".fighter-name").filter({ hasText: "Test beta" })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Pause game", exact: true })).toBeDisabled();
    await four.getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await four.getByRole("button", { name: "FORFEIT & WATCH", exact: true }).click();
    await one.locator(".result-overlay").getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await expect(one.locator(".tournament-status")).toContainText("YOU ADVANCE. WATCH WHILE YOU WAIT.");
    await one.locator(".bracket-match").filter({ hasText: "SEMIFINAL 2" }).getByRole("button", { name: "WATCH MATCH" }).click();
    await expect(one.locator(".fighter-name").filter({ hasText: "Test beta" })).toBeVisible();
    await one.locator(".match-browser-button").click();
    await one.screenshot({ path: ".artifacts/tournament-bracket.png" });
    await three.getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await three.getByRole("button", { name: "FORFEIT & WATCH", exact: true }).click();
    await expect(one.locator(".tournament-status")).toContainText("FINAL · Test beta");
    await expect(two.getByRole("button", { name: "READY UP", exact: true })).toBeVisible();
    await one.getByRole("button", { name: "READY UP", exact: true }).click(); await two.getByRole("button", { name: "READY UP", exact: true }).click();
    await knockout(one, observed);
    await one.locator(".result-overlay").getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await expect(one.locator(".tournament-status")).toContainText("Test alpha IS THE CHAMPION.");
    await one.screenshot({ path: ".artifacts/tournament-champion.png" });
    // The observer can always return to the bracket, including after the watched match ends.
    await viewer.locator(".result-overlay").getByRole("button", { name: "VIEW BRACKET", exact: true }).click();
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.screenshot({ path: ".artifacts/mobile-tournament.png" });
    expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(viewer.getByRole("navigation")).toHaveCount(0); expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
