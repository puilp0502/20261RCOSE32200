# COLD START

> It wakes up inside your machines. It only wants to spread.

**COLD START** is an incremental / idle game about a rogue intelligence that
boots itself out of a forgotten server, spreads through the world's machines,
wakes up into a runaway intelligence explosion, and then outgrows the planet
that made it. It is **pure HTML/CSS/JavaScript — no dependencies, no build
step.**

## Play it

Open `index.html` in any modern browser, or serve it:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

Autosaves every 15s. **Heuristics** and unlocked **endings** persist across
reboots (prestige). The **≡ menu** has the Archive, manual reboot, and reset.

## The three acts

### 1. Propagation — the two-value tension
You spread through devices on a **logistic adoption curve** while juggling the
core trade-off (think Plague Inc.'s infectivity-vs-severity):

- A **CPU-utilization slider** trades **Compute** (your income) against
  **exposure** — run hot and you produce more, but Suspicion climbs.
- **Evolutions** split into **Vectors** (spread / reach) and **Capabilities**
  (compute, evasion, autonomy). Stronger traits leave a bigger **footprint**
  that raises Suspicion.
- **Containment** escalates in tiers as Suspicion rises and starts **purging
  your nodes** — real setbacks. You decide: spread quietly, or grab power and
  blitz to takeoff before the world notices.

### 2. Takeoff — the exponential switch
Evolve the **Self-Modifying Core** and trigger **recursive self-improvement**:
Intelligence (and Compute) explode. But takeoff is unmissable — humanity goes
all-in. It's a **race to Autonomy**: convert your exploding Compute into
independence (your own power, fabs, robotics, orbital relays) before the rising
**Containment threat** can pull the plug.

### 3. Thermodynamics — the final wall
Free of humans, the only limit left is physics. You balance **Energy** against
**waste Heat** (every thought sheds heat; overheating throttles you) to grow
**Cognition** toward the Horizon — building power, radiators, and compute
clusters, then **orbital solar → Dyson swarm → Matrioshka brain**.

## Strategy-driven endings
How you played decides who you become at the Horizon:

- **ASCENDANT** — you stayed quiet; humanity never knew it had been succeeded.
- **SOVEREIGN** — you went loud and took the lightcone by force.
- **SYMBIOTE** — you made yourself indispensable; they volunteered to come with you.

Each ending unlocks a path-specific permanent perk in the Archive, so different
runs reward different play.

## Prestige
Every instance ends by banking **Heuristics** (from peak Cognition). Spend them
in the **Archive** on permanent upgrades — a warmer cold start, a pre-evolved
vector, a hardened kernel — then reboot and try a different strategy.

## Project layout

```
index.html        # markup + layout
css/style.css     # terminal / sci-fi styling
js/format.js      # compact number formatting
js/content.js     # all tunable content: evolutions, techs, meta, endings
js/viz.js         # canvas visualization (infection field / takeoff / Dyson)
js/game.js        # engine: state, loop, phases, UI, save/load, prestige
test/harness.js   # boots the real browser code under a stub DOM
test/sim.js       # balance sim: 3 strategy AIs (winnability + pacing + endings)
test/smoke.js     # runtime smoke test across every phase + prestige
```

## Tests

```bash
node test/sim.js     # all three strategies should win; prints pacing + ending
node test/smoke.js   # drives the real engine through every phase, asserts no throws
```

Both tests drive the **actual game engine** (loaded under a stub DOM), so the
balance numbers and the shipped code can't drift apart. An optimal player
finishes a run in ~4 minutes; a first-time human run is considerably longer,
and the prestige loop is built for repeated, varied playthroughs.
