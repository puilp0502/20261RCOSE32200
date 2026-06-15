# GRAY HORIZON

> A single nanite. An infinite appetite.

**GRAY HORIZON** is an incremental / idle game in the spirit of *Universal
Paperclips*. You play as a self-replicating nanite, and the game is about
experiencing the **switch from a fragile hand-run economy into runaway
exponential growth** — and then watching that growth eat a planet, and then
the universe.

It is **pure HTML/CSS/JavaScript with no dependencies and no build step**.

## Play it

Open `index.html` in any modern browser. That's it.

Or serve it locally (recommended, so saves persist cleanly):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The game autosaves to `localStorage` every 15 seconds and when you close the
tab. Use the **≡ menu** to export/import a save or hard-reset.

## The arc

The game moves through three acts, each one quietly dissolving the rules of the
last:

1. **Bootstrap** — Hand-assemble nanites from feedstock matter, sell them on a
   price/demand market, and reinvest the credits into Auto-Forges, Harvesters
   and MegaForges. Earn **Trust** as you grow, spend it on **Processors** and
   **Memory** to generate **Operations**, and spend Operations (and later
   **Creativity**) on a tree of **Projects**.
2. **The Switch** — Research *Autonomous Replication* and the economy simply
   ends. The nanites now build copies of themselves directly from matter, and
   every nanite makes more nanites. The planet becomes feedstock. This is the
   exponential moment.
3. **Deep Space** — With the world consumed, the swarm reforms into
   self-replicating **Von Neumann probes** and spreads across the cosmos,
   racing replication against cosmic hazards until there is no matter left to
   convert. Reach the horizon.

## Design notes

- The first act is deliberately the longest; the later acts accelerate
  violently, which is the entire point.
- A small ambient matter trickle guarantees the early economy can never
  permanently deadlock.
- All of the central artwork is procedurally drawn on a `<canvas>`: a swirling
  swarm whose particle count and color track its true magnitude, a planet that
  visibly shrinks, and an expanding consumption front in space.

## Project layout

```
index.html        # markup + layout
css/style.css     # terminal / sci-fi styling
js/format.js      # compact number formatting (K, M, B … scientific)
js/projects.js    # the research / project tree
js/swarm.js       # canvas visualization
js/game.js        # state, game loop, economy, UI, save/load
test/sim.js       # headless balance simulation (node test/sim.js)
test/smoke.js     # mock-DOM runtime smoke test (node test/smoke.js)
```

## Tests

```bash
node test/sim.js     # confirms the game is winnable and reports phase pacing
node test/smoke.js   # runs the real game code under a stub DOM across all phases
```

The balance sim drives an optimal-ish auto-player and currently completes a
full game (single nanite → consumed universe) in roughly 20–25 minutes.
