# À la Structs

A cozy critter-restaurant skin for **Structs**. Same chain, same rules, same
opponents — a completely different game on the surface.

You own a restaurant run by animal staff. Your Chef discovers recipes, your
Sous Chef turns them into gold, a sign spinner dances on the sidewalk, and
when you're ready you send your crew across town to a rival restaurant as
*customers* for a **service challenge**. The rival on the other end may be
playing regular Structs and see a raid on their planet; you see a dining room
full of grumpy customers and hard-working servers.

Built with three.js. Everything you see — characters, furniture, the town —
is generated in code; there are no image or model files.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Pick a critter, name your restaurant, then choose:

- **Demo kitchen** — fully offline. The economy runs on a fast clock and service
  challenges run on the desktop app's port of structsd's combat keeper
  (`SimulatorChain`) against its computer player (`SimulatorAi`), so every serve,
  complaint, cover, dodge and comeback resolves the way the chain resolves it.
- **Open for real** — connects to a Structs guild through the structs-webapp
  game core (wallet, signing queue, GRASS stream, guild API, proof-of-work).

### Deploying (SEO)

Set the public URL when you build so crawlers and link previews get absolute
URLs:

```bash
VITE_SITE_URL=https://your-domain.example/ npm run build
```

That adds a canonical link, `og:url`, absolute `og:image`/`twitter:image` and
schema.org JSON-LD (`VideoGame`) to `index.html`, and writes `robots.txt` and
`sitemap.xml` into `dist/` (see `scripts/seo.mjs`). Without it the build warns
and only writes `robots.txt`. Icons, the web manifest and the 1200×630 social
card (`og-image.jpg`) live in `public/`.

### Connecting to a guild

Choose **Open for real**, then pick a guild. Nothing about a guild is
hardcoded: each guild publishes a config file (the `endpoint` on its on-chain
record), and À la Structs reads the services from it:

1. `GET {reactor}/structs/guild/{id}` → the guild's `endpoint`
2. fetch that config → `services.guild_api`, `services.grass_nats_websocket`, …
3. talk to those directly: the guild API over CORS (with credentials, for the
   session cookie), GRASS and the chain RPC over websockets.

The picker lists the guilds on chain and greys out ones that can't take
browser players, with the reason: no guild API, `guild.json` not shared with
other sites (CORS), unreachable, or a guild API that refuses this origin
(checked with `GET {guild_api}/timestamp`).

`guild.json` is treated as hostile input, following structs.xyz's onboarding
rules: reads are capped at 64 KB and 2.5 s with no redirects, `guild.id` must
match the chain, strings are truncated, and service URLs must be https/wss on a
public hostname (no IP literals, localhost, `.local`-style or wildcard-DNS
hosts; loopback only when the page and the LCD are both on loopback). A guild
without a usable `wss://` event stream uses `wss://beta.playstructs.com:1443`.
The chain REST API (LCD) defaults to `https://public.testnet.structs.network`
(`VITE_LCD_URL`).

Sign-up is the guild-stack proxy join: the browser signs
`GUILD{id}ADDRESS{addr}NONCE0`, the guild broadcasts the join, and the client
waits for the player on GRASS — and, in case the stream is down, also polls
`GET {LCD}/structs/address/{addr}` and finishes the login itself.
`.env.example` lists the local overrides — for example `GRASS_URL` relays the
event stream through the dev server if your browser can't reach it directly.

`GUILD_URL` switches back to the older same-origin mode: the dev server proxies
`/api` to that one guild and the picker is skipped. Use it when a guild's API
doesn't allow cross-origin requests yet, or when the page is served by the
guild itself.

New owners get a recovery phrase in-game (the guild signs them up and opens a
first restaurant). Existing Structs players sign in with their recovery phrase,
which registers the browser as another device — the same flow as the webapp.

### Guild chat (Matrix)

In live mode the town chat is the guild's real Matrix chat. Sign-in is one
request: the page signs the same `LOGIN_GUILD…` message it uses for the guild
API and posts it to `POST {guild_api}/auth/matrix`, which does the OAuth dance
with the guild's auth service server-side and returns tokens. No pop-up,
redirect or relay, so it works the same on `127.0.0.1` and on a real domain.
The page then checks `whoami` matches the account the guild returned, long-polls
`/sync` for the guild room, refreshes tokens at the auth service, and revokes
them on sign-out. Tokens live only in memory.

The homeserver comes from the guild config (`services.matrix_homeserver`) or
the user id's `.well-known/matrix/client`; the room from
`services.matrix_room`, or the busiest non-DM room the account is in.
`VITE_MATRIX_HOMESERVER` / `VITE_MATRIX_ROOM` override both. If the guild has
no `/auth/matrix`, chat falls back to the town square below.

### Town square (presence + chat)

Structs has no avatars, so walking around the square uses a tiny relay (and,
without guild chat, the chat too):

```bash
npm run hangout                      # ws://0.0.0.0:8787
VITE_HANGOUT_URL=ws://localhost:8787 npm run dev
```

Owners in the same restaurant group share a room: they see each other walking
around the town and chat. Without the relay, other tabs in the same browser
still see each other (BroadcastChannel), and the demo town has bot neighbours.

### Hosted preview

`npm run build:preview-page` writes a single self-contained HTML file (demo
kitchen only, three.js from a CDN) to `dist-artifact/`.

## The mapping

| Structs | À la Structs |
|---|---|
| Player | Restaurant Owner |
| Guild | Restaurant Group (the town) |
| Planet | Restaurant |
| Fleet / Fleet struct | Crew / Employee |
| Planetary struct | Employee or Equipment |
| Command Ship | Manager (a Food Critic when visiting) |
| Space / Air / Land / Water | Bar & Counter / Dining Room / Cooking Line / Dish Pit |
| Ore / Undiscovered Ore | Recipes / Undiscovered Recipes |
| Alpha | Gold |
| Energy (capacity / load) | Cash (takings / wages & bills) |
| Charge | Hustle |
| Block | Tick |
| Raid | Service Challenge |
| Build | Hire / Buy |
| Activate / Deactivate | Clock in / Clock out (Switch on / off) |
| Attack | Serve (as host) / Complain (as visiting customer) |
| Defend | Cover for |
| Stealth | Blend in |
| Health | Morale (staff) / Needs (customers) |
| Destroyed | Fired (staff) / Satisfied and left (customers) |
| Planetary shield | Reputation |

| Struct type | Role |
|---|---|
| Ore Extractor | Chef |
| Ore Refinery | Sous Chef |
| Planetary Defense Cannon | Swing Cook |
| Ore Bunker | Extra Freezer |
| Jamming Satellite | Lucky Cat (waving) |
| Orbital Shield Generator | Soft-Serve Machine |
| Field Generator | Light-Up Pole Sign (out front) |
| Continental Power Plant | Sign Spinner (out front) |
| World Engine | Influencer (roams, takes selfies) |
| High Altitude Interceptor | Server |
| Pursuit Fighter | Busser |
| Stealth Bomber | Host |
| Mobile Artillery | Fry Cook |
| SAM Launcher | Baker |
| Tank | Line Cook |
| Battleship | Bartender |
| Frigate | Cashier |
| Starfighter | Barista |
| Cruiser | Pot Washer |
| Destroyer | Dishwasher |
| Submersible | Kitchen Porter |

All player-facing words live in `src/lexicon/`. Settings has a glossary that
shows both names side by side.

## How it's put together

```
src/
  lexicon/        every name: areas, roles (per struct type), terms, cute name generator
  game/model.js   the restaurant's view of Structs data, shared by both backends
  services/
    Service.js        the interface the UI talks to
    DemoService.js    offline kitchen; challenges on SimulatorChain + SimulatorAi
    LiveService.js    structs-webapp core wired up without its screens
    live-entry.js     lazy-loaded so the demo never downloads the chain stack
    Hangout.js        town presence + chat (relay / tabs / demo bots)
    live/guildConfig.js  guild id → on-chain record → published config → endpoints
    live/MatrixChat.js   guild Matrix chat via POST {guild_api}/auth/matrix
  three/          engine, toon look, critter builder, outfits, items, props, FX,
                  floor plan + routing, duties (what each role does all day),
                  scenes: Restaurant, Challenge, Town
  ui/             app shell, HUD, dock, sheets (staff card, hiring, roster, rivals, settings)
vendor/           copied verbatim from ../structs-webapp and ../structs-desktop (see below)
server/hangout.mjs  the town-square relay
```

### The vendored core

`npm run sync-vendor` copies `../structs-webapp/src/js` and the desktop app's
`simulator-chain.js`, `simulator-ai.js` and `simulator-types.js` into
`vendor/`, unchanged. A few webapp modules are its own screens (MenuPage, the
map components, banners); the `structs-ui-shim` plugin in
`scripts/structs-shim.mjs` swaps those for inert stand-ins at build time, so
the managers can call `MenuPage.router.goto(...)` and nothing happens. The same
plugin papers over two message types the generated protobuf registry imports
but no longer exports (webpack made them `undefined`; native ESM would refuse
to load the file). Re-run the sync after a webapp update and rebuild.

`LiveService` mirrors the webapp's `index.js` wiring — GameState, GuildAPI,
GrassManager (×2), SigningClientManager, AuthManager, StructManager,
TaskManager (with its proof-of-work worker), RaidManager, FleetManager,
AlphaManager — and reads `gameState.keyPlayers` into the restaurant model.
GRASS `struct_attack` frames have the same shape as the simulator's events, so
one animation path plays both demo and live service challenges.

### What the demo approximates

Combat in the demo is the real keeper transcription. Around it, the demo
simplifies a few things the live game handles on chain:

- The recipe-copying timer (raid proof-of-work) is a tick countdown that grows
  with your Soft-Serve Machines (shield).
- Swing Cooks serve any complainer once per complaint; the Lucky Cat knocks a
  guided complaint off course 30% of the time; each Extra Freezer protects
  four recipes.
- Hiring time, mining and refining run on tick counts instead of hashing.

In live mode all of those come from the chain and the guild.

## Status

- Demo kitchen: playable end to end (hire/buy, shifts, covering, the Manager
  walking the floor, recipes → gold, investing gold, service challenges both
  ways, town with chat).
- Live guild: wired through the unmodified webapp core and builds cleanly, but
  has not yet been exercised against a running guild — expect a round of
  fixes the first time you point it at one.

## Licence

Apache-2.0, like the Structs code it builds on.
