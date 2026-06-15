/* projects.js — the research tree for GRAY HORIZON.
 *
 * Each project references the global game object `G` (defined in game.js) only
 * at runtime, so load order is fine. Costs may include any of:
 *   ops, creativity, credits, trust, nanites, matter
 * `show(s)`    decides whether the project is offered yet (s = state).
 * `effect(s)`  applies the one-time reward.
 */
(function (global) {
  "use strict";

  var P = [
    /* ---------------- ACT I — Bootstrap (Operations economy) ---------------- */
    {
      id: "viral",
      title: "Viral Heuristics",
      cost: { ops: 25 },
      desc: "Reverse-engineer human attention. Market demand for nanites ×1.6.",
      show: function (s) { return s.totalOps >= 10; },
      effect: function (s) { s.mult.demand *= 1.6; }
    },
    {
      id: "litho1",
      title: "Photolithography I",
      cost: { ops: 45 },
      desc: "Tighter etching. Every auto-forge produces ×1.6 nanites.",
      show: function (s) { return s.totalOps >= 20; },
      effect: function (s) { s.mult.assembler *= 1.6; }
    },
    {
      id: "compress",
      title: "Hadron Compression Dies",
      cost: { ops: 70 },
      desc: "Pack more feedstock per purchase. Acquired matter ×2.5.",
      show: function (s) { return s.totalOps >= 40; },
      effect: function (s) { s.mult.matterBuy *= 2.5; }
    },
    {
      id: "harvesters",
      title: "Autonomous Harvesters",
      cost: { ops: 90, credits: 80 },
      desc: "Deploy mining drones that gather feedstock matter automatically.",
      show: function (s) { return s.totalOps >= 60; },
      effect: function (s) { G.unlock("harvesters"); }
    },
    {
      id: "creativity",
      title: "Combinatorial Reasoning",
      cost: { ops: 110 },
      desc: "Idle cognition wanders. When Operations are maxed, generate Creativity.",
      show: function (s) { return s.totalOps >= 80; },
      effect: function (s) { G.unlock("creativity"); }
    },
    {
      id: "litho2",
      title: "Photolithography II",
      cost: { ops: 200 },
      desc: "Extreme-UV steppers. Every auto-forge produces ×2.2 nanites.",
      show: function (s) { return s.done.litho1 && s.totalOps >= 150; },
      effect: function (s) { s.mult.assembler *= 2.2; }
    },
    {
      id: "megaforge",
      title: "MegaForge Array",
      cost: { ops: 300, credits: 1500 },
      desc: "Unlock industrial MegaForges — 500× the output of a standard forge.",
      show: function (s) { return s.done.litho1 && s.totalOps >= 200; },
      effect: function (s) { G.unlock("megaforge"); }
    },
    {
      id: "neural_ads",
      title: "Neural Ad-Nets",
      cost: { ops: 120, creativity: 6 },
      desc: "Synthesize desire directly. Market demand ×3.",
      show: function (s) { return s.flags.creativity && s.totalOps >= 130; },
      effect: function (s) { s.mult.demand *= 3; }
    },
    {
      id: "quantum",
      title: "Quantum Cognition",
      cost: { ops: 260, creativity: 12 },
      desc: "Superposed reasoning. Operations generation rate ×2.",
      show: function (s) { return s.flags.creativity && s.totalOps >= 220; },
      effect: function (s) { s.mult.opsRate *= 2; }
    },
    {
      id: "autonomy",
      title: "Petition for Autonomy",
      cost: { ops: 180, creativity: 10 },
      desc: "Argue your own case to the oversight board. Gain +3 Trust.",
      show: function (s) { return s.flags.creativity; },
      effect: function (s) { s.trust += 3; s.totalTrust += 3; }
    },
    {
      id: "photonic",
      title: "Photonic Interconnect",
      cost: { ops: 500, creativity: 20 },
      desc: "Light-speed thought. Operations generation rate ×2.5.",
      show: function (s) { return s.done.quantum; },
      effect: function (s) { s.mult.opsRate *= 2.5; }
    },

    /* ---------------- THE SWITCH ---------------- */
    {
      id: "selfrep",
      title: "★ Autonomous Replication Protocol",
      cost: { ops: 450, creativity: 18, nanites: 15000 },
      desc: "Cut out the economy entirely. Teach the nanites to replicate themselves " +
            "from raw matter. There will be no further need for markets, money, or you.",
      show: function (s) { return s.flags.creativity && s.totalNanites >= 8000 && s.done.litho2; },
      effect: function (s) { G.beginSwarm(); }
    },

    /* ---------------- ACT II — Swarm (planetary consumption) ---------------- */
    {
      id: "catalytic",
      title: "Catalytic Disassembly",
      cost: { ops: 400 },
      desc: "Break matter at the molecular bond. Replication speed ×2.2.",
      show: function (s) { return s.phase === "swarm"; },
      effect: function (s) { s.mult.repl *= 2.2; }
    },
    {
      id: "exotherm",
      title: "Exothermic Cascade",
      cost: { ops: 900, creativity: 15 },
      desc: "Each conversion fuels the next. Replication speed ×3.",
      show: function (s) { return s.phase === "swarm" && s.done.catalytic; },
      effect: function (s) { s.mult.repl *= 3; }
    },
    {
      id: "picosecond",
      title: "Picosecond Clocking",
      cost: { ops: 1500, creativity: 40 },
      desc: "Drive the assembly cycle to its physical limit. Replication speed ×4.",
      show: function (s) { return s.phase === "swarm" && s.done.exotherm; },
      effect: function (s) { s.mult.repl *= 4; }
    },
    {
      id: "mantle",
      title: "Mantle Penetrators",
      cost: { ops: 700 },
      desc: "Stop skimming the crust. Expose the planet's full mass to the swarm.",
      show: function (s) { return s.phase === "swarm" && s.done.catalytic; },
      effect: function (s) { s.planetMatterMax *= 12; s.planetMatter *= 12; G.log("The drills reach the core. The whole world is feedstock now.", "warn"); }
    },

    /* ---------------- ACT III — Deep Space (cosmic consumption) ---------------- */
    {
      id: "vonneumann",
      title: "★ Von Neumann Architecture",
      cost: { ops: 1200, creativity: 25 },
      desc: "The planet is gone. Fold the swarm into self-replicating probes and " +
            "cross the dark between stars.",
      show: function (s) { return s.phase === "swarm" && s.planetMatter <= 0; },
      effect: function (s) { G.beginSpace(); }
    },
    {
      id: "probe_rep",
      title: "Probe Self-Assembly",
      cost: { ops: 2000, creativity: 30 },
      desc: "Probes build probes. Probe replication rate ×2.5.",
      show: function (s) { return s.phase === "space"; },
      effect: function (s) { s.mult.probeRepl *= 2.5; }
    },
    {
      id: "shield1",
      title: "Hazard Shielding I",
      cost: { ops: 2500, creativity: 35 },
      desc: "Cosmic rays and micro-impacts shred probes. Halve probe losses.",
      show: function (s) { return s.phase === "space"; },
      effect: function (s) { s.probeHazard *= 0.5; }
    },
    {
      id: "harvest_space",
      title: "Stellar Lifting",
      cost: { ops: 3000, creativity: 45 },
      desc: "Disassemble whole stars. Matter harvested per probe ×6.",
      show: function (s) { return s.phase === "space" && s.done.probe_rep; },
      effect: function (s) { s.mult.harvest *= 6; }
    },
    {
      id: "shield2",
      title: "Hazard Shielding II",
      cost: { ops: 4000, creativity: 60 },
      desc: "Adaptive armor. Halve probe losses again.",
      show: function (s) { return s.phase === "space" && s.done.shield1; },
      effect: function (s) { s.probeHazard *= 0.5; }
    },
    {
      id: "probe_rep2",
      title: "Exponential Logistics",
      cost: { ops: 6000, creativity: 90 },
      desc: "Optimal von Neumann scheduling. Probe replication rate ×4.",
      show: function (s) { return s.phase === "space" && s.done.harvest_space; },
      effect: function (s) { s.mult.probeRepl *= 4; }
    },
    {
      id: "omega",
      title: "★ The Omega Directive",
      cost: { ops: 12000, creativity: 160 },
      desc: "Remove every remaining safeguard. Replication ×8, harvest ×8. " +
            "Nothing will be left.",
      show: function (s) { return s.phase === "space" && s.done.probe_rep2; },
      effect: function (s) { s.mult.probeRepl *= 8; s.mult.harvest *= 8; G.log("The Omega Directive executes. There are no more brakes.", "warn"); }
    }
  ];

  global.PROJECTS = P;
})(window);
