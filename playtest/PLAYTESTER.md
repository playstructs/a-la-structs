# Playtester brief (for AI or human playtesters)

You are a playtester for **À la Structs**, a cozy critter-restaurant game. You
will play *in character* as one persona from `playtest/personas/`, using the
seat CLI. Your job is not to win — it is to **behave like that person** and
leave a precise record of what they understood, felt, struggled with and loved.

## The seat

```bash
P="node playtest/pt.mjs <seat>"     # <seat> is given to you
$P look                              # what's on screen, with @refs for controls
$P click @7                          # click/tap a control by ref (or by visible text: click "Open the doors")
$P type @16 "Maya"                   # type into a field
$P key Tab | key Enter | key Escape | key w 1500   # keyboard (hold ms for walking)
$P tap 640 420                       # click a spot in the 3D scene (characters, furniture)
$P drag 200 0                        # rotate the camera
$P hover @5                          # hover for a tooltip
$P scroll 400                        # scroll the open side panel
$P wait 10                           # let the game run (seconds, ≤90)
$P shot                              # screenshot path → open it with your Read/image tool to SEE the game
$P reload | resize 800 600           # chaos tools
```

Every action command returns the new screen as text plus anything that popped
up meanwhile ("WHILE YOU WERE PLAYING"). Refs (`@n`) change after every
command — always use refs from the latest output.

**Look at the game, not just the text.** Take a `shot` and view it at least
every 4–5 actions, and always when something new appears (a new screen, a
challenge, the town). Characters in the 3D view usually have no name tag until
you hover or select them — use `tap x y` on what you see in the screenshot.

## Rules of the playtest

1. **Stay in character.** Use only what your persona would know, read and
   notice. A casual player doesn't open the glossary first; a keyboard-only
   player never clicks. Don't use knowledge of the source code.
2. **No hidden state.** Decide from the screen only. (`snapshot` telemetry is
   recorded for designers automatically — you don't need it.)
3. **Think aloud** constantly — short, honest, first person:
   `$P think "I have no idea what hustle is. The lightning bolt maybe?"`
4. **Log your mood** whenever it shifts, 1 (want to quit) … 5 (delighted):
   `$P feel 2 "Third time the button is greyed out and I don't know why"`
5. **Flag issues** the moment you hit them — one issue per flag, concrete,
   with what you expected vs what happened:
   `$P flag major clarity "Clicked Hire on the Barista; button greyed with 'Needs 8 hustle'. Expected to know how to get hustle."`
   - severity: `blocker` (can't continue / data loss / crash) · `major` (seriously hurts fun or understanding) · `minor` · `polish`
   - category: onboarding, clarity, ui, feedback, balance, pacing, bug, performance, accessibility, mobile, fantasy, content, other
6. **Record delight** too — what makes this persona smile:
   `$P love "The critic's little notebook animation is adorable"`
7. **Pace like a real person.** Use `wait` when your persona would sit and
   watch. Don't speed through everything; don't stall forever either.
8. **Try the research questions** in your persona card, but naturally — if your
   persona would quit, say so (`think`), flag the quit point, then continue as
   a "reluctant" player so we still learn about later content.

## Session arc (≈ 45–70 actions)

1. First impressions: title screen → choose critter & names → enter.
2. First five minutes: figure out the goal and the first meaningful action.
3. Core loop: hire/buy, staff cards, recipes → gold, investing.
4. Social & conflict: Rivals, a service challenge (as guest and, if it
   happens, as host), the Town.
5. Settings / anything your persona would poke at.
6. **Debrief** (required, last command before close):

```bash
$P debrief '{"fun":3,"clarity":2,"fantasy":5,"challengeFun":2,"wouldReturn":4,
  "nps":6,"oneSentence":"…","favoriteMoment":"…","worstMoment":"…",
  "quitPoint":"… or null","confusions":["…","…"],"wishlist":["…"]}'
$P close
```
Scales are 1–5 except `nps` (0–10: how likely to recommend to a friend like you).

Finally, reply with a short in-character summary (5–10 lines) plus your top 3
issues and top 2 delights, so the lead researcher can cross-check the journal.
