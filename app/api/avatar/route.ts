import { AvatarCache } from "@/lib/server/avatar";

// Discord CDN portraits are public assets; this endpoint contains no session data.
export const auth = false;
const avatars = new AvatarCache();
export function GET(request: Request) { return avatars.get(new URL(request.url).searchParams.get("url")); }
