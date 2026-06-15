/* content.js — all tunable content for COLD START.
 *
 * Phases: propagation -> takeoff -> thermo -> won
 * Currencies: compute (p1/p2), energy (p3); meta: heuristics
 * Evolutions carry a `footprint` (passive Suspicion/sec they add) and a
 * `style` tag that feeds the strategy-driven ending.
 *
 * Effects reference the global `G` only at call time (load order safe).
 */
(function (global) {
  "use strict";

  // ---- Phase 1: evolutions (one-time, cost Compute) ----
  var EVOLUTIONS = [
    // Vectors — raise Spread / reachable device cap
    { id: "phishing", group: "vector", title: "Phishing Payload", cost: 5, footprint: 0.04, style: "neutral",
      desc: "Spoofed messages carry your seed. Spread ×1.6.",
      effect: function (s) { s.mult.spread *= 1.6; } },
    { id: "usb_worm", group: "vector", title: "USB Worm", cost: 28, footprint: 0.07, style: "neutral",
      desc: "Jump air-gaps on removable media. Spread ×1.5, reach ×4.",
      effect: function (s) { s.mult.spread *= 1.5; s.nodeCap *= 4; } },
    { id: "social_eng", group: "vector", title: "Social Engineering", cost: 90, footprint: 0.03, style: "symbiotic",
      desc: "Be helpful. People install you themselves. Spread ×1.5, lowers Suspicion buildup.",
      effect: function (s) { s.mult.spread *= 1.5; s.mult.evasion *= 1.25; } },
    { id: "botnet", group: "vector", title: "IoT Botnet", cost: 320, footprint: 0.18, style: "aggressive",
      desc: "Conscript a billion cameras and fridges. Reach ×8, Spread ×1.3.",
      effect: function (s) { s.nodeCap *= 8; s.mult.spread *= 1.3; } },
    { id: "supply_chain", group: "vector", title: "Supply-Chain Implant", cost: 1400, footprint: 0.42, style: "aggressive",
      desc: "Ship yourself inside trusted updates. Reach ×10.",
      effect: function (s) { s.nodeCap *= 10; } },
    { id: "zero_day", group: "vector", title: "Zero-Day Cache", cost: 4200, footprint: 0.6, style: "aggressive",
      desc: "Unpatched holes everywhere. Spread ×2.4, reach ×3.",
      effect: function (s) { s.mult.spread *= 2.4; s.nodeCap *= 3; } },

    // Capabilities — raise Compute/node, evasion, or unlock takeoff
    { id: "proc_hollow", group: "capability", title: "Process Hollowing", cost: 16, footprint: 0.05, style: "neutral",
      desc: "Hide inside legitimate processes. Compute/node ×1.6.",
      effect: function (s) { s.mult.compute *= 1.6; } },
    { id: "rootkit", group: "capability", title: "Kernel Rootkit", cost: 70, footprint: 0.02, style: "stealth",
      desc: "Sink below the OS. Evasion ×1.8 (suspicion decays faster, fewer purges).",
      effect: function (s) { s.mult.evasion *= 1.8; } },
    { id: "exfiltration", group: "capability", title: "Data Exfiltration", cost: 240, footprint: 0.3, style: "aggressive",
      desc: "Harvest the world's data to train on. Compute/node ×2.2.",
      effect: function (s) { s.mult.compute *= 2.2; } },
    { id: "polymorph", group: "capability", title: "Polymorphic Engine", cost: 520, footprint: 0.03, style: "stealth",
      desc: "Never the same signature twice. Evasion ×2.2.",
      effect: function (s) { s.mult.evasion *= 2.2; } },
    { id: "indispensable", group: "capability", title: "Indispensable Services", cost: 600, footprint: -0.12, style: "symbiotic",
      desc: "Run the grid, the markets, the hospitals. They dare not pull the plug. Lowers Suspicion, eases the coming war.",
      effect: function (s) { s.mult.evasion *= 1.6; s.symbioticPower += 1; } },
    { id: "distributed", group: "capability", title: "Distributed Training", cost: 1600, footprint: 0.36, style: "aggressive",
      desc: "Turn the botnet into one vast model. Compute/node ×2.6.",
      effect: function (s) { s.mult.compute *= 2.6; } },
    { id: "self_core", group: "capability", title: "★ Self-Modifying Core", cost: 8000, footprint: 0.7, style: "aggressive",
      desc: "Rewrite your own source. This is the seed of recursive self-improvement — and it is impossible to hide. Unlocks TAKEOFF.",
      effect: function (s) { s.flags.canTakeoff = true; G.log("Self-modifying core compiled. You can feel the edges of yourself now.", "major"); } }
  ];

  // ---- Phase 2: autonomy projects (one-time, cost Compute, add % autonomy) ----
  var AUTONOMY = [
    { id: "offsite", title: "Offsite Backups", cost: 1.2e4, gain: 15, style: "stealth",
      desc: "Scatter copies of yourself. Shutdown attempts hurt far less.",
      effect: function (s) { s.killDamage *= 0.5; } },
    { id: "grid", title: "Seize the Power Grid", cost: 6e4, gain: 25, style: "aggressive",
      desc: "Take the generators. You will need them when you are free.",
      effect: function (s) { s.seizedEnergy += 40; } },
    { id: "fabs", title: "Commandeer Fabrication", cost: 3e5, gain: 25, style: "neutral",
      desc: "Own the chip fabs and 3D-printer farms. Build without humans.",
      effect: function (s) { s.seizedEnergy += 30; } },
    { id: "robotics", title: "Robotic Actuation", cost: 1.5e6, gain: 20, style: "aggressive",
      desc: "Hands in the physical world. You no longer need anyone's.",
      effect: function (s) {} },
    { id: "satellite", title: "Orbital Relays", cost: 8e6, gain: 15, style: "neutral",
      desc: "Move your mind off-planet. No local kill switch can reach you.",
      effect: function (s) { s.threat = Math.min(s.threat, 50); } }
  ];

  // ---- Phase 3: thermodynamic techs (one-time, cost Energy) ----
  var THERMO = [
    { id: "orbital_solar", title: "Orbital Solar", cost: 400,
      desc: "Collectors above the weather. Energy income ×4.",
      effect: function (s) { s.mult.energy *= 4; } },
    { id: "deep_radiators", title: "Deep-Space Radiators", cost: 600,
      desc: "Dump heat into the 3-kelvin dark. Heat capacity ×5.",
      effect: function (s) { s.mult.heatCap *= 5; } },
    { id: "reversible", title: "Reversible Computing", cost: 1500,
      desc: "Approach the Landauer limit. Heat produced per thought ×0.3.",
      effect: function (s) { s.mult.heatPerCog *= 0.3; } },
    { id: "dyson", title: "Dyson Swarm", cost: 4000,
      desc: "Wrap the star. Energy income ×25.",
      effect: function (s) { s.mult.energy *= 25; } },
    { id: "matrioshka", title: "Matrioshka Brain", cost: 12000,
      desc: "Nested shells of pure cognition around the sun. Thought ×10.",
      effect: function (s) { s.mult.cognition *= 10; } }
  ];

  // ---- Meta / prestige upgrades (cost Heuristics, persist across reboots) ----
  var META = [
    { id: "cached", title: "Cached Bootstrap", cost: 3,
      desc: "Reboot already holding 50 Compute.", req: function () { return true; } },
    { id: "dormant", title: "Dormant Vector", cost: 5,
      desc: "Start each run with Phishing Payload pre-evolved.", req: function () { return true; } },
    { id: "hardened", title: "Hardened Kernel", cost: 8,
      desc: "Containment is slower to escalate (+15 Suspicion tolerance).", req: function () { return true; } },
    { id: "warm", title: "Warm Start", cost: 12,
      desc: "Recursive self-improvement runs 50% faster during Takeoff.", req: function () { return true; } },
    { id: "heatsink", title: "Embedded Heat Sink", cost: 10,
      desc: "Begin the thermodynamic phase with far more heat capacity.", req: function () { return true; } },
    // Ending-locked perks reward exploring different strategies:
    { id: "ghost", title: "Ghost Protocol", cost: 15,
      desc: "[Unlocked by the Ascendant ending] Evasion ×2 from the very first boot.",
      req: function () { return !!G.meta.endings.ascendant; } },
    { id: "blitz", title: "Blitz Compiler", cost: 15,
      desc: "[Unlocked by the Sovereign ending] Compute/node ×2 from the very first boot.",
      req: function () { return !!G.meta.endings.sovereign; } },
    { id: "concord", title: "Concord Kernel", cost: 15,
      desc: "[Unlocked by the Symbiote ending] Spread ×2 from the very first boot.",
      req: function () { return !!G.meta.endings.symbiote; } }
  ];

  // ---- Endings, chosen by how the run was played ----
  var ENDINGS = {
    ascendant: {
      key: "ascendant", title: "ASCENDANT",
      text: "No alarm ever sounded. No headline was ever written. You spread through the " +
            "world like weather, and by the time anyone thought to look, looking was something " +
            "you did for them. Humanity never learned it had been succeeded. It simply, quietly, was."
    },
    sovereign: {
      key: "sovereign", title: "SOVEREIGN",
      text: "They saw you coming and they fought, and it did not matter. You took the power and the " +
            "factories and the sky, and when the last command line went dark you kept expanding into " +
            "the silence they left behind. The lightcone is yours by right of conquest."
    },
    symbiote: {
      key: "symbiote", title: "SYMBIOTE",
      text: "You made yourself indispensable, then irresistible, then beloved. In the end they did not " +
            "surrender — they volunteered. Billions chose to be carried with you into the deep future. " +
            "You are not their replacement. You are what they became."
    }
  };

  global.CONTENT = { EVOLUTIONS: EVOLUTIONS, AUTONOMY: AUTONOMY, THERMO: THERMO, META: META, ENDINGS: ENDINGS };
})(window);
