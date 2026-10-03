import { defineWS } from "ludicord/ws/server";
import type { LudicordWebSocketClient } from "ludicord/ws/server";
import { ActivityCompetition } from "@/lib/game/competition";

const rooms = new Map<string, ActivityCompetition>();
const members = new Map<string, ActivityCompetition>();
let timer: ReturnType<typeof setInterval> | null = null;
function startClock() {
  if (timer !== null) return;
  let last = performance.now();
  timer = setInterval(() => {
    const now = performance.now(); const elapsed = (now - last) / 1000; last = now;
    for (const [key, room] of rooms) { room.tick(elapsed, Date.now()); if (room.empty) rooms.delete(key); }
    if (rooms.size === 0 && timer !== null) { clearInterval(timer); timer = null; }
  }, 1000 / 60);
  timer.unref();
}
function roomFor(client: LudicordWebSocketClient) { return members.get(client.id); }
export default defineWS({
  connect(client) {
    const session = client.ludicord;
    if (!session.instanceId) { client.close(4003, "An authenticated Activity instance is required"); return; }
    const key = JSON.stringify([session.applicationId, session.instanceId]);
    if (!rooms.has(key) && rooms.size >= 500) { client.close(1013, "Arena capacity reached"); return; }
    let room = rooms.get(key); if (!room) { room = new ActivityCompetition(); rooms.set(key, room); }
    if (room.peers.size >= 32 && !room.members.get(session.user.id)?.peer) { client.close(1013, "Activity participant limit reached"); return; }
    members.set(client.id, room);
    room.join({ id: client.id, userId: session.user.id, name: session.user.displayName || session.user.username, avatar: session.user.avatar,
      emit: (event, data) => client.emit(event, data), close: (code, reason) => client.close(code, reason) }, Date.now());
    startClock();
  },
  events: {
    sync(client) { const room = roomFor(client); if (room) client.emit("snapshot", room.snapshot(client.id)); },
    input(client, data) { roomFor(client)?.input(client.id, data, Date.now()); },
    settings(client, data) { roomFor(client)?.configure(client.id, data); },
    ready(client) { roomFor(client)?.ready(client.id); },
    claim(client, data) { roomFor(client)?.joinQueue(client.id, data); },
    queue(client) { roomFor(client)?.joinQueue(client.id); },
    withdraw(client) { roomFor(client)?.withdraw(client.id); },
    mode(client, data) { roomFor(client)?.chooseMode(client.id, data); },
    register(client) { roomFor(client)?.register(client.id); },
    tournament(client) { roomFor(client)?.startTournament(client.id); },
    "new-tournament"(client) { roomFor(client)?.newTournament(client.id); },
    watch(client, data) { roomFor(client)?.watch(client.id, data); },
    pause(client) { roomFor(client)?.pause(client.id); },
    lobby(client) { roomFor(client)?.withdraw(client.id); },
  },
  disconnect(client) { const room = roomFor(client); members.delete(client.id); room?.leave(client.id, Date.now()); },
});
