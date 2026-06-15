/* Mock-DOM smoke test for COLD START.
 * Boots the real engine and exercises every phase + the win/archive/reboot UI
 * paths, asserting nothing throws. Run: node test/smoke.js
 */
const { boot } = require("./harness");

const h = boot();
const G = h.G, CONTENT = h.CONTENT, s = G.state;
if (!G) throw new Error("G not exposed");
console.log("Booted. phase =", s.phase);

// 1) Propagation: drive the spread + buy a couple evolutions through the UI path.
for (let i = 0; i < 40; i++) { G.scanInfect(); G.setUtil(0.6); h.advance(0.2); }
G.buyEvolution("phishing"); G.buyEvolution("proc_hollow");
console.log("Propagation: nodes=", s.nodes.toFixed(0), "compute=", s.compute.toFixed(1), "suspicion=", s.suspicion.toFixed(0));

// 2) Force takeoff: fund and evolve everything, then initiate.
s.compute = 1e7;
CONTENT.EVOLUTIONS.forEach(e => G.buyEvolution(e.id));
G.initiateTakeoff();
for (let i = 0; i < 10; i++) h.advance(0.2);
console.log("Takeoff: intelligence=", s.intelligence.toExponential(2), "threat=", s.threat.toFixed(0));

// 3) Autonomy -> thermo.
s.compute = 1e9;
CONTENT.AUTONOMY.forEach(a => G.buyAutonomy(a.id));
console.log("Phase after autonomy:", s.phase, "(expect thermo)");
for (let i = 0; i < 10; i++) h.advance(0.2);

// 4) Thermo: buy techs + build, then push cognition to the horizon.
s.energy = 1e6;
CONTENT.THERMO.forEach(t => G.buyThermo(t.id));
for (let i = 0; i < 30; i++) { G.buildPower(); G.buildCluster(); G.buildRadiator(); h.advance(0.2); }
s.cognition = G.derived().horizon * 0.999;
let guard = 0;
while (s.phase !== "won" && guard++ < 500) h.advance(0.4);
console.log("Final phase:", s.phase, "ending=", s.endingKey, "heuristics=", G.meta.heuristics);

// 5) Exercise win UI + archive purchase + reboot.
G.buyMeta("cached");
G.reboot();
console.log("After reboot: phase=", G.state.phase, "runs=", G.meta.runs);

if (G.state.phase !== "propagation") { console.error("FAILED: reboot did not return to propagation"); process.exit(1); }
if (guard >= 500) { console.error("FAILED: never reached won"); process.exit(1); }
console.log("\nSMOKE TEST PASSED — no exceptions across all phases + prestige.");
