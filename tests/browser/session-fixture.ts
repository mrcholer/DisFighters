import type { Page } from "@playwright/test";
import type { LudicordSession } from "ludicord/auth";
// Test-only imports of the installed cookie codec. This module never enters app bundles.
import { sealLudicordSession } from "../../node_modules/ludicord/dist/sessions/crypto.js";
import { scopedCookieName } from "../../node_modules/ludicord/dist/sessions/cookies.js";
export const TEST_SECRET = "disfighters-browser-test-session-secret-only-2026";
export async function testPlayer(page: Page, id: string, instance = "network-test-instance", avatar: string | null = null) {
  await page.route("**/_ludicord/auth/dev-login", async route => {
    const issuedAt = Date.now();
    const session: LudicordSession = { authenticated: true, kind: "development", user: { id, username: id, displayName: `Test ${id}`, avatar },
      applicationId: "123456789012345678", instanceId: instance, scopes: ["identify"], issuedAt, expiresAt: issuedAt + 3600_000 };
    const launch = route.request().headers()["x-ludicord-launch-id"];
    await page.context().addCookies([{ name: scopedCookieName("ludicord_session", launch), value: sealLudicordSession(session, TEST_SECRET),
      url: "http://127.0.0.1:3174", httpOnly: true, sameSite: "Lax" }]);
    await route.fulfill({ json: session });
  });
}
