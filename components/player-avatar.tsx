import { useState } from "react";
import type { Identity } from "@/lib/game/protocol";

export function PlayerAvatar({ player }: { player: Pick<Identity, "name" | "avatar"> }) {
  const [failed, setFailed] = useState<string | null>(null);
  const initials = player.name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0]).join("").toUpperCase() || "?";
  return <span className="player-avatar" aria-hidden="true">
    {player.avatar && failed !== player.avatar ? <img src={`/api/avatar?url=${encodeURIComponent(player.avatar)}`} alt="" referrerPolicy="no-referrer" onError={() => setFailed(player.avatar)} /> : initials}
  </span>;
}
