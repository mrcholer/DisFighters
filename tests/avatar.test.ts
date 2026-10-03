import test from "node:test";
import assert from "node:assert/strict";
import { AvatarCache, avatarTarget } from "../lib/server/avatar.ts";
const avatar = "https://cdn.discordapp.com/avatars/123456789012345678/0123456789abcdef0123456789abcdef.png";
test("avatar loading accepts public portrait paths only, with a fixed CDN and size", () => {
  assert.equal(avatarTarget(avatar), `${avatar}?size=128`);
  assert.equal(avatarTarget(avatar.replace(".png", ".gif?size=4096")), `${avatar}?size=128`);
  for (const value of ["http://127.0.0.1/", "https://cdn.discordapp.com.evil.example/avatars/x", "https://cdn.discordapp.com/attachments/private/file.png", avatar.replace("https:", "http:"), avatar.replace("cdn.discordapp.com", "user@cdn.discordapp.com"), null]) assert.equal(avatarTarget(value), null);
});
test("avatar cache coalesces requests, caches images for repeat openings, and refreshes expired entries", async () => {
  let requests = 0; let now = 0;
  const cache = new AvatarCache(async () => { requests++; return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }); }, () => now);
  const responses = await Promise.all([cache.get(avatar), cache.get(avatar)]);
  assert.equal(requests, 1); assert.equal(responses[0].headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual(new Uint8Array(await responses[1].arrayBuffer()), new Uint8Array([1, 2, 3]));
  await cache.get(avatar); assert.equal(requests, 1); now = 86400_001; await cache.get(avatar); assert.equal(requests, 2);
});
test("avatar proxy rejects HTML, oversized content, redirects and failed fetches without caching failures", async () => {
  for (const load of [async () => new Response("<script/>", { headers: { "Content-Type": "text/html" } }), async () => new Response(new Uint8Array(256 * 1024 + 1), { headers: { "Content-Type": "image/png" } }), async () => { throw new Error("redirect"); }]) {
    const cache = new AvatarCache(load); assert.equal((await cache.get(avatar)).status, 502); assert.equal((await cache.get("https://evil.example")).status, 400);
  }
});
