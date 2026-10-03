const MAX_BYTES = 256 * 1024;
const TTL = 86400_000;
interface Asset { bytes: Uint8Array<ArrayBuffer>; type: string; at: number }

export function avatarTarget(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "cdn.discordapp.com" || url.port || url.username || url.password) return null;
    if (!/^\/avatars\/\d{15,22}\/(?:a_)?[a-f0-9]{32}\.(?:png|gif|webp)$/.test(url.pathname) && !/^\/embed\/avatars\/[0-5]\.png$/.test(url.pathname)) return null;
    // A small static portrait works consistently across Discord desktop and mobile.
    return `https://cdn.discordapp.com${url.pathname.replace(/\.(gif|webp)$/, ".png")}?size=128`;
  } catch { return null; }
}

/** A bounded cache of public Discord avatar images, never a general URL proxy. */
export class AvatarCache {
  private cache = new Map<string, Asset>();
  private pending = new Map<string, Promise<Asset>>();
  constructor(private readonly load: typeof fetch = fetch, private readonly now = Date.now) {}
  private async fetchAsset(target: string): Promise<Asset> {
    const response = await this.load(target, { signal: AbortSignal.timeout(5000), redirect: "error", credentials: "omit" });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png" || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Avatar unavailable");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength;
        if (length > MAX_BYTES) throw new Error("Avatar exceeds limit"); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const asset = { bytes, type: "image/png", at: this.now() };
    if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(target, asset); return asset;
  }
  async get(value: string | null): Promise<Response> {
    const target = avatarTarget(value);
    if (!target) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
    let asset = this.cache.get(target);
    if (asset && this.now() - asset.at >= TTL) { this.cache.delete(target); asset = undefined; }
    if (!asset) {
      let pending = this.pending.get(target);
      if (!pending) {
        if (this.pending.size >= 16) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
        pending = this.fetchAsset(target); this.pending.set(target, pending);
      }
      try { asset = await pending; } catch { return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } }); }
      finally { if (this.pending.get(target) === pending) this.pending.delete(target); }
    } else { this.cache.delete(target); this.cache.set(target, asset); }
    return new Response(asset.bytes, { headers: { "Content-Type": asset.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }
}
