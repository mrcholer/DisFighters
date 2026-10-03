# DisFighters — playable prototype

DisFighters is a full-screen 2D fighting game. Its primary mode is an authenticated
Discord Activity duel. Browser development retains a clearly labelled local test.

## Current implementation contract

- PC controllers use the browser Standard Gamepad mapping for Xbox, DualShock 4
  and DualSense. Poll current snapshots each animation frame, with a 0.3 stick
  dead zone. Left stick/D-pad moves, up/A/Cross jumps, down crouches, X/Square
  punches, B/Circle or RT/R2 guards, and Start/Options pauses/resumes.
- In Discord, one controller controls the authenticated user's own seat, including
  P2. Local browser testing supports two stable controller assignments; sparse
  device indexes and disconnects cannot transfer P2 to P1. Keyboard/touch remain
  available alongside controllers, with opposing movement inputs neutralized.
- Controllers also navigate game menus: stick/D-pad focuses buttons, A/Cross
  confirms, B/Circle closes help/settings, View/Share opens help, Start/Options
  readies the default lobby action. Destructive menu actions require explicit focus.
- Disconnecting an assigned controller during combat clears inputs and pauses the
  duel. Spectators cannot pause or control a match. Release held controls after
  connecting, switching screens, focus loss, pause, and round transitions before
  gameplay resumes. Unsupported mappings or blocked Gamepad access are visible.
- Validate with mapping/assignment/neutrality unit tests and browser simulations
  of independent controllers, focus loss, hot unplug, menus, combat and P2 online
  ownership. Real USB/Bluetooth hardware and the live Discord frame need a device
  check; no controller model is claimed to have been physically tested here.

- Required Discord authentication; production outside-Discord access is rejected.
- A single authoritative Node server owns competitions per verified application +
  Activity instance. Browser inputs never supply identity, room, score, or hits.
- An Activity competition owns verified Discord profiles, host, PvP seats/FIFO
  queue, session win streaks, a 2–16 player single-elimination bracket and per-user
  viewing selection. Each tournament pair runs an independent authoritative duel.
- PvP seats initially follow Activity connection order; a vacant seat can be claimed
  without jumping an existing queue. After a completed duel, the winner stays and
  the next queued challenger enters after a 6-second results display. Losers requeue.
- Tournament entry is opt-in before the host starts. Tournament seeding follows
  Activity join order. Standard seed pairing grants byes for non-power-of-two counts.
  Winners advance, can spectate other matches while waiting, and receive their next
  assignment automatically. Only the final winner is the tournament champion.
- Inputs include arena identity and match generation; watching a match never grants
  control. Active fighters cannot switch away to another live match. Spectators,
  eliminated players, and waiting winners can choose any match in their Activity.
- Disconnect grace is 30 seconds. Expiry forfeits only that pair and advances the
  remaining player. Voluntary withdrawal forfeits immediately. Empty brackets
  resolve without inventing a winner. Modes/rules cannot change during live play.
- New files: competition service and tests, Discord player cards, online competition
  lobby and match browser. Existing engine, duel transport, hook, arena and tests
  are extended; original browser local combat remains a test surface.
- Two distinct authenticated users occupy the fighter slots. Extra users spectate.
  A second tab for the same identity replaces its earlier connection.
- Both players must ready up; the first connected player hosts the Activity and
  controls rules while idle. Host ownership transfers to the earliest connected
  remaining player when the host disconnects.
- Simulation: 120 Hz rules, 60 Hz server scheduling, 20 Hz snapshots, bounded inputs
  and monotonically increasing sequence numbers. Clients interpolate positions.
- Held controls expire after 350 ms without renewal. A disconnect pauses play;
  a reserved slot can reconnect within 30 seconds, after which that pair forfeits.
- Match state is in memory on one server process. Restart/HMR resets it. Horizontal
  scaling, durable rankings, rollback netcode and matchmaking are later work.
- Shield: 100 strength, 25 per blocked hit, brief break stun, 5-second full recovery;
  partial guard regens at 20/sec after 1.5 seconds while guard is released.
- Round settings: 30/60/90 seconds, first to 1/2/3, retained across consecutive
  duels and tournament pairings. Draws award neither player.
- Changed files: config; engine/renderer/fighters; room/protocol and socket route;
  realtime hook; game lobby/arena/UI/CSS; documentation and rules/network/browser tests.
- Validation: route discovery, Hooks lint, TypeScript, production build, room/rules
  tests, browser input/visual flows and two independently authenticated test clients.
  Real Discord OAuth/frame testing requires this project's app credentials and mapping.

## Game experience

- Discord duels use one fighter per player/device. The browser-only test also
  supports two players on one keyboard. Both modes offer on-screen touch controls.
- Original illustrated fighters: Player One and Player Two. One night-time casbah arena.
- Move, jump, crouch, punch, and block. Crouching punches must be blocked low.
- Configurable rounds. First to the configured win target takes the match. Equal health at
  timeout and simultaneous knockouts are draws; draws award neither player.
- Loading → lobby → countdown → fighting → round result → next round / match result.
- Escape, window blur, and backgrounding pause play and clear held inputs.
- A fixed 120 Hz simulation owns rules (server for Discord, local for browser tests). Canvas paints the arena and fighters;
  React owns menus, accessible controls, and the HUD. Rendering never decides hits.
- Original vector arena, procedural fighter animation, small synthesized sound
  effects activated by a user gesture, with mute and reduced-motion support.
- Public Discord portraits use a bounded same-origin avatar endpoint with strict
  path validation, no redirects, fixed size, request coalescing and cache expiry.
  No player/session metadata is exposed by that image endpoint.
- One Ludicord root page, plain CSS, one authenticated WebSocket route. Discord is
  the primary player-versus-player mode. Browser development is for testing only.
- No ranking, store, progression, special moves, external art, or online matchmaking.

Implementation: `lib/game/engine.ts` (rules), `lib/game/renderer.ts` (canvas),
`lib/game/audio.ts` (sound), `components/disfighters.tsx` (game flow),
`components/arena.tsx` (input and simulation), `app/globals.css` (visuals),
`lib/game/competition.ts` (seats/queue/bracket authority),
`components/competition-lobby.tsx` (competition screens),
`lib/server/avatar.ts` (portrait cache), and `public/arena.svg` (original environment).

Validation: rules tests, real-browser game flow and input tests, desktop and mobile
screenshots, Ludicord route inspection, Hooks lint, TypeScript, production build.
All project work stays in this directory. Generated Ludicord output is compiler-owned.
