# Playtest lab

Two complementary ways to playtest À la Structs, plus one report that brings them together.

| Layer | What it answers | Speed |
|---|---|---|
| **Seats** (`pt.mjs`) — a persona plays the real game in a browser, turn by turn, thinking aloud | *How does it feel? Where do people get lost? What do they love?* | minutes per session |
| **Bots** (`sim.mjs`) — scripted policies drive the real `DemoService` headlessly | *How does it behave over 45 minutes, hundreds of times? Is it balanced?* | seconds for hundreds of sessions |
| **Report** (`report.mjs`) — merges every journal and the bot run into one HTML page | issues ranked by severity, mood curves, funnels, dead clicks, balance charts | instant |

## Quick start

```bash
npm install                        # adds playwright (dev dependency)
npx playwright install chromium    # once
npm run playtest:sim               # 60 bot sessions + 396 bot challenges → playtest/out/<date>/sim.json

# a playtest seat (human, script or AI agent)
node playtest/pt.mjs open maya --persona cozy-casual --headed   # --headed to watch it on a GPU
node playtest/pt.mjs maya look
node playtest/pt.mjs maya click @20
node playtest/pt.mjs maya think "I have no idea what hustle is"
node playtest/pt.mjs maya flag major clarity "Hire says 8 hustle but took all 193"
node playtest/pt.mjs maya debrief '{"fun":3,"clarity":2,"nps":6,"oneSentence":"…"}'
node playtest/pt.mjs maya close

npm run playtest:report            # → playtest/out/<run>/report.html  (add -- --embed to inline screenshots)
```

`open` builds the current `src/` into a playtest page and serves it on :5199
(`pt.mjs serve`), so tests always run what's on disk. To test the Vite dev
server instead: `npm run dev`, then `open … --url http://localhost:5173`.

## Personas (`personas/*.json`)

Each card sets who the player is (bio, goals, patience, reading style, quirks,
research questions) **and** how their browser is configured: viewport, touch,
device pixel ratio, zoom, reduced motion, game clock. Shipped cards:

- `cozy-casual` — Maya, Stardew/Animal Crossing player, never played strategy
- `structs-veteran` — Raj, runs a Structs guild, checks mapping fidelity
- `optimizer` — Tess, solves the economy with a spreadsheet
- `mobile-skimmer` — Leo, 390×844 touch, doesn't read, quits fast
- `access-keyboard` — Ana, keyboard only, 150% zoom, reduced motion
- `chaos-qa` — Kai, breaks things on purpose

Add a JSON file to add a persona.

## Seats (`pt.mjs`)

- `look` returns what the **player** can see — HUD, panels, popups, speech
  bubbles, name tags with screen positions — with `@n` handles on every control.
  It never reads hidden state; playtesters must build their own mental model.
- Action commands (`click`, `type`, `key`, `tap`, `drag`, `hover`, `scroll`,
  `wait`, `reload`, `resize`) reply with the new screen plus "while you were
  playing" (speech bubbles, popups, clicks that did nothing). `click` clicks
  wherever the control *is*: if something covers it, the cover gets the click
  and you're told — that is how the "critic hidden behind the menu bar" bug
  was found.
- Research commands: `think`, `feel 1-5`, `flag <severity> <category>`,
  `love`, `debrief` — flags and loves attach a screenshot automatically.
- `playtest/lib/instrument.js` runs in the page and records dead clicks, rage
  clicks, JS errors, long tasks, fps, every toast (with announcer backlog),
  view/panel/popup changes. Each step also logs a designer-only game-state
  snapshot (`lib/observe.js → snapshot()`).
- Everything lands in `playtest/out/<run>/<seat>/journal.jsonl` + `shots/`.
  Set `PT_RUN=name` to group sessions into a run.

### Running AI playtesters

`PLAYTESTER.md` is the protocol brief. Give an agent the brief, a persona card
and a seat name, e.g. *"Read playtest/PLAYTESTER.md and
playtest/personas/optimizer.json, then open seat `tess` and play."* Run 2–3 in
parallel per machine. On a machine without a GPU (CI, cloud) add
`--quality low` and `PT_MAX_DPR=1`; the renderer falls back to SwiftShader
(~1 fps), so tell agents not to judge frame rate there.

## Bots (`sim.mjs`)

Policies: `afk`, `cozy`, `economist`, `raider`, `tactician` (each mirrors a
persona). Every session is deterministic by seed. The challenge matrix plays
every rival × difficulty × {player does nothing, random targets, focus fire} ×
{visiting, hosting}. Options: `--runs 12 --ticks 900`.

Use it as a balance regression test: after changing raid frequency or the
recipe pool, re-run and compare the policy table and the matrix.
