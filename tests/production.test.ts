import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "@playwright/test";
import { request } from "node:http";
import { randomBytes } from "node:crypto";
import { createLudicordProductionServer } from "ludicord/runtime/server";
import { sealLudicordSession } from "../node_modules/ludicord/dist/sessions/crypto.js";
import { TEST_SECRET } from "./browser/session-fixture.ts";

test("production blocks browser test bypasses, fake auth endpoints and encrypted development socket sessions", async () => {
  process.env.NODE_ENV = "production";
  process.env.LUDICORD_DISCORD_CLIENT_ID = "123456789012345678";
  process.env.LUDICORD_SESSION_SECRET = TEST_SECRET;
  process.env.LUDICORD_DEV_FAKE_AUTH = "true";
  process.env.DISFIGHTERS_BROWSER_TEST = "true";
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".cache/playwright");
  const server = await createLudicordProductionServer({ projectRoot: process.cwd(), port: 3180, host: "127.0.0.1" });
  const browser = await chromium.launch();
  try {
    assert.equal((await fetch(`${server.url}/_ludicord/auth/dev-login`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/avatar?url=${encodeURIComponent("http://127.0.0.1/private")}`)).status, 400);
    const page = await browser.newPage(); await page.goto(`${server.url}/?test=local`);
    await page.getByRole("heading", { name: /DISCORD SIGN-IN REQUIRED/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /ENTER THE LOBBY|START FIGHT|READY UP/ }).count(), 0);
    await page.screenshot({ path: ".artifacts/production-auth-gate.png" });
    const now = Date.now();
    const cookie = sealLudicordSession({ kind: "development", authenticated: true, user: { id: "fake", username: "fake", displayName: "Fake", avatar: null },
      applicationId: "123456789012345678", instanceId: "test", scopes: ["identify"], issuedAt: now, expiresAt: now + 60_000 }, TEST_SECRET);
    const status = await new Promise<number>((resolve, reject) => {
      const upgrade = request(`${server.url}/ws/duel`, { headers: { Cookie: `ludicord_session=${cookie}`, Origin: server.url,
        Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": randomBytes(16).toString("base64"), "Sec-WebSocket-Version": "13" } });
      upgrade.setTimeout(4000, () => upgrade.destroy(new Error("Upgrade did not finish")));
      upgrade.on("response", response => { response.resume(); resolve(response.statusCode!); });
      upgrade.on("upgrade", (_response, socket) => { socket.destroy(); resolve(101); });
      upgrade.on("error", reject); upgrade.end();
    });
    assert.equal(status, 401);
  } finally { await browser.close(); await server.close(); }
});
