/* Balance simulation for COLD START.
 * Drives the REAL engine (via test/harness.js) with three strategy AIs to
 * confirm the game is winnable, report pacing, and check that play-style maps
 * to the expected ending. Run: node test/sim.js
 */
const { boot } = require("./harness");

// Per-bias evolution preference (ids in buy order).
const PREF = {
  aggressive: ["proc_hollow", "phishing", "usb_worm", "exfiltration", "botnet", "distributed", "supply_chain", "zero_day", "self_core"],
  stealth: ["proc_hollow", "phishing", "rootkit", "usb_worm", "social_eng", "polymorph", "botnet", "self_core"],
  symbiotic: ["proc_hollow", "phishing", "social_eng", "usb_worm", "indispensable", "botnet", "self_core"]
};

function play(h, bias) {
  const { G, CONTENT } = h, s = G.state;
  if (s.phase === "propagation") {
    if (s.nodes < s.nodeCap * 0.55) G.scanInfect();
    let util = bias === "aggressive" ? 0.95 : bias === "stealth" ? 0.4 : 0.65;
    if (s.suspicion > 80) util = 0.05; else if (s.suspicion > 58) util *= 0.45;
    G.setUtil(util);
    // buy preferred evolutions in order when affordable
    for (const id of PREF[bias]) { if (!s.done[id] && s.compute >= evoCost(CONTENT, id)) G.buyEvolution(id); }
    // opportunistically grab any cheap stealth/evasion tool to stay alive
    if (s.suspicion > 50) for (const id of ["rootkit", "polymorph", "social_eng"]) if (!s.done[id] && s.compute >= evoCost(CONTENT, id)) G.buyEvolution(id);
    if (s.flags.canTakeoff && s.nodes > s.nodeCap * 0.4 && s.compute > 3000) G.initiateTakeoff();
  } else if (s.phase === "takeoff") {
    for (const a of CONTENT.AUTONOMY) if (!s.done[a.id] && s.compute >= a.cost) G.buyAutonomy(a.id);
  } else if (s.phase === "thermo") {
    const d = G.derived();
    // grab any affordable tech immediately (big multiplicative jumps)
    for (const t of CONTENT.THERMO) if (!s.done[t.id] && s.energy >= t.cost) G.buyThermo(t.id);
    // reserve energy toward the next unowned tech, build infra with the surplus
    const next = CONTENT.THERMO.find(t => !s.done[t.id]);
    const reserve = next ? next.cost * 0.7 : 0;
    if (s.energy > reserve) {
      if (d.heatProduced > d.heatCap * 0.9 && s.energy - reserve >= d.radiatorCost) G.buildRadiator();
      else if (d.energyUse > d.energyIncome * 0.8 && s.energy - reserve >= d.powerCost) G.buildPower();
      else if (s.energy - reserve >= d.clusterCost) G.buildCluster();
    }
  }
}
function evoCost(CONTENT, id) { const e = CONTENT.EVOLUTIONS.find(e => e.id === id); return e ? e.cost : Infinity; }

function run(bias) {
  const h = boot();
  const { G } = h, s = G.state;
  const dt = 0.2; let t = 0; let prev = "propagation"; const marks = {};
  for (let i = 0; i < 60 * 60 * 4 / dt && s.phase !== "won"; i++) {
    if (i % 3 === 0) play(h, bias);   // act a few times/sec
    h.advance(dt); t += dt;
    if (s.phase !== prev) { marks[s.phase] = t; prev = s.phase; }
  }
  return { bias, t, phase: s.phase, ending: s.endingKey, marks,
    peak: s.peakCognition, heur: G.meta.heuristics, intel: s.intelligence,
    maxSus: s.maxSuspicion };
}

let pass = true;
for (const bias of ["aggressive", "stealth", "symbiotic"]) {
  const r = run(bias);
  const p = r.marks;
  const line = `${bias.padEnd(11)} -> ${r.phase.padEnd(5)} | ending=${(r.ending || "-").padEnd(9)}` +
    ` | total=${(r.t / 60).toFixed(1)}min` +
    ` | prop=${fmtm(p.takeoff)} takeoff=${fmtm(p.thermo, p.takeoff)} thermo=${fmtm(r.t, p.thermo)}` +
    ` | maxSus=${r.maxSus.toFixed(0)} peakCog=${r.peak.toExponential(1)}`;
  console.log(line);
  if (r.phase !== "won") { pass = false; console.log("   !! did not win"); }
}
function fmtm(end, start) { if (end == null) return "—"; return (((end - (start || 0))) / 60).toFixed(1) + "m"; }

console.log(pass ? "\nALL STRATEGIES WIN ✓" : "\nFAILURE: some strategy did not win");
process.exit(pass ? 0 : 1);
