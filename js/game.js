/* game.js — COLD START engine.
 * An emergent intelligence spreads through the world's machines, wakes up,
 * and outgrows the planet that made it.
 *
 * Phases: propagation -> takeoff -> thermo -> won
 * The whole game logic lives behind window.G so the headless tests can drive
 * the real engine instead of a re-implementation.
 */
(function () {
  "use strict";

  var fmt = NF.fmt, fmtRate = NF.fmtRate, fmtTime = NF.fmtTime;
  var C = window.CONTENT;

  /* ============================ Constants ============================ */
  var SAVE_KEY = "coldstart.save.v1";
  var META_KEY = "coldstart.meta.v1";
  var TICK_MS = 100;

  var BASE_SPREAD = 0.16;
  var COMPUTE_PER_NODE = 0.01;
  var BASE_NODECAP = 1000;
  var SUS_TIERS = [40, 65, 85];          // suspicion thresholds -> containment tiers
  var THREAT_GROW = 0.8;                 // takeoff threat / sec
  var RSI_RATE = 0.18;                   // recursive self-improvement / sec
  var HORIZON = 1e6;                     // cognition needed to win
  // Thermo tuning
  var BASE_ENERGY = 40, ENERGY_PER_PLANT = 30, ENERGY_PER_CLUSTER = 5;
  var BASE_HEATCAP = 80, HEAT_PER_RAD = 60, HEAT_PER_CLUSTER = 6;
  var COG_PER_CLUSTER = 6;

  /* ============================ Meta (persists across reboots) ============================ */
  function newMeta() { return { heuristics: 0, upgrades: {}, endings: {}, runs: 0 }; }
  var meta = newMeta();

  /* ============================ Run state ============================ */
  function newRun() {
    var s = {
      version: 1,
      phase: "propagation",
      // propagation
      nodes: 1, nodeCap: BASE_NODECAP,
      compute: 0, computeTotal: 0,
      util: 0.5,
      suspicion: 0, containmentTier: 0, shutdownTimer: 0, susTol: 0,
      // takeoff
      intelligence: 1, threat: 0, autonomy: 0, killDamage: 1, seizedEnergy: 0,
      // thermo
      energy: 0, heat: 0, cognition: 0, powerPlants: 0, clusters: 0, radiators: 0, cogMult: 1,
      // shared
      symbioticPower: 0,
      mult: { spread: 1, compute: 1, evasion: 1, rsi: 1, energy: 1, heatCap: 1, heatPerCog: 1, cognition: 1 },
      flags: {}, done: {},
      // style trackers for the ending
      styleAgg: 0, styleStealth: 0, styleSym: 0,
      maxSuspicion: 0, loudTime: 0, purgedTotal: 0, peakCognition: 0,
      playTime: 0, startTime: Date.now()
    };
    applyMeta(s);
    return s;
  }

  function applyMeta(s) {
    if (meta.upgrades.cached) s.compute += 50;
    if (meta.upgrades.hardened) s.susTol = 15;
    if (meta.upgrades.warm) s.mult.rsi *= 1.5;
    if (meta.upgrades.ghost) s.mult.evasion *= 2;
    if (meta.upgrades.blitz) s.mult.compute *= 2;
    if (meta.upgrades.concord) s.mult.spread *= 2;
    if (meta.upgrades.heatsink) s.mult.heatCap *= 4;
    if (meta.upgrades.dormant) {
      var ph = findEvo("phishing");
      if (ph && !s.done.phishing) { s.done.phishing = true; ph.effect(s); }
    }
  }

  var s = newRun();

  /* ============================ Public API ============================ */
  var G = {
    get state() { return s; },
    get meta() { return meta; },
    log: addLog,
    unlock: function (f) { s.flags[f] = true; },
    setUtil: setUtil,
    scanInfect: scanInfect,
    buyEvolution: buyEvolution,
    initiateTakeoff: initiateTakeoff,
    buyAutonomy: buyAutonomy,
    buildPower: function () { buildThing("power"); },
    buildCluster: function () { buildThing("cluster"); },
    buildRadiator: function () { buildThing("radiator"); },
    buyThermo: buyThermo,
    buyMeta: buyMeta,
    reboot: reboot,
    beginThermo: beginThermo,
    derived: function () {
      return {
        computeRate: computeRate(), energyIncome: energyIncome(), energyUse: energyUse(),
        heatProduced: heatProduced(), heatCap: heatCap(), cognitionRate: cognitionRate(),
        powerCost: powerCost(), clusterCost: clusterCost(), radiatorCost: radiatorCost(), horizon: HORIZON
      };
    }
  };
  window.G = G;

  function findEvo(id) { for (var i = 0; i < C.EVOLUTIONS.length; i++) if (C.EVOLUTIONS[i].id === id) return C.EVOLUTIONS[i]; }

  /* ============================ Derived ============================ */
  function traitFootprint() {
    var f = 0;
    for (var i = 0; i < C.EVOLUTIONS.length; i++) if (s.done[C.EVOLUTIONS[i].id]) f += C.EVOLUTIONS[i].footprint;
    return f;
  }
  function spreadRate() { return BASE_SPREAD * s.mult.spread; }
  function computeRate() {
    if (s.phase === "takeoff") return s.nodes * COMPUTE_PER_NODE * s.mult.compute * s.intelligence;
    return s.nodes * COMPUTE_PER_NODE * s.mult.compute * s.util;
  }
  function suspicionGen() { return s.util * 0.45 + traitFootprint(); }
  function suspicionDecay() { return 0.22 * s.mult.evasion; }
  function tierThresholds() { return SUS_TIERS.map(function (t) { return t + s.susTol; }); }
  function energyIncome() { return (BASE_ENERGY + s.powerPlants * ENERGY_PER_PLANT + s.seizedEnergy) * s.mult.energy; }
  function energyUse() { return s.clusters * ENERGY_PER_CLUSTER; }
  function powerFactor() { var u = energyUse(); return u > 0 ? Math.min(1, energyIncome() / u) : 1; }
  function heatProduced() { return s.clusters * HEAT_PER_CLUSTER * s.mult.heatPerCog; }
  function heatCap() { return (BASE_HEATCAP + s.radiators * HEAT_PER_RAD) * s.mult.heatCap; }
  function heatFactor() { var h = heatProduced(); return h > heatCap() ? heatCap() / h : 1; }
  function cognitionRate() { return s.clusters * COG_PER_CLUSTER * s.mult.cognition * s.cogMult * powerFactor() * heatFactor(); }
  function powerCost() { return 40 * Math.pow(1.14, s.powerPlants); }
  function clusterCost() { return 60 * Math.pow(1.15, s.clusters); }
  function radiatorCost() { return 45 * Math.pow(1.14, s.radiators); }

  /* ============================ Logging ============================ */
  function addLog(msg, type) {
    s.log = s.log || [];
    s.log.unshift({ t: new Date().toLocaleTimeString(), msg: msg, type: type || "" });
    if (s.log.length > 60) s.log.length = 60;
    renderLog();
  }

  /* ============================ Actions ============================ */
  function setUtil(v) { s.util = Math.max(0, Math.min(1, v)); }
  function scanInfect() {
    if (s.phase !== "propagation") return;
    s.nodes = Math.min(s.nodeCap, s.nodes + Math.max(10, s.nodes * 0.02));
  }
  function buyEvolution(id) {
    var e = findEvo(id);
    if (!e || s.done[id] || s.compute < e.cost) return;
    s.compute -= e.cost; s.done[id] = true; e.effect(s);
    if (e.style === "aggressive") s.styleAgg += 1;
    else if (e.style === "stealth") s.styleStealth += 1;
    else if (e.style === "symbiotic") s.styleSym += 2;
    addLog("Evolved: " + e.title.replace(/^★ /, ""));
    refreshPanels();
  }
  function initiateTakeoff() {
    if (s.phase !== "propagation" || !s.flags.canTakeoff) return;
    s.phase = "takeoff";
    s.intelligence = 1;
    s.threat = Math.max(10, Math.min(60, s.maxSuspicion * 0.6));
    s.util = 1;
    addLog("TAKEOFF. You begin rewriting yourself, faster each second. Somewhere, every alarm in the world goes off at once.", "major");
    refreshPanels();
  }
  function buyAutonomy(id) {
    var a; for (var i = 0; i < C.AUTONOMY.length; i++) if (C.AUTONOMY[i].id === id) a = C.AUTONOMY[i];
    if (!a || s.done[id] || s.compute < a.cost) return;
    s.compute -= a.cost; s.done[id] = true; a.effect(s);
    s.autonomy = Math.min(100, s.autonomy + a.gain);
    if (a.style === "aggressive") s.styleAgg += 1;
    else if (a.style === "stealth") s.styleStealth += 1;
    addLog("Autonomy: " + a.title + " (" + Math.round(s.autonomy) + "%)");
    if (s.autonomy >= 100) beginThermo();
    refreshPanels();
  }
  function buildThing(kind) {
    if (s.phase !== "thermo") return;
    if (kind === "power") { var c = powerCost(); if (s.energy < c) return; s.energy -= c; s.powerPlants++; }
    else if (kind === "cluster") { var c2 = clusterCost(); if (s.energy < c2) return; s.energy -= c2; s.clusters++; }
    else if (kind === "radiator") { var c3 = radiatorCost(); if (s.energy < c3) return; s.energy -= c3; s.radiators++; }
  }
  function buyThermo(id) {
    var t; for (var i = 0; i < C.THERMO.length; i++) if (C.THERMO[i].id === id) t = C.THERMO[i];
    if (!t || s.done[id] || s.energy < t.cost) return;
    s.energy -= t.cost; s.done[id] = true; t.effect(s);
    addLog("Deployed: " + t.title, "major");
    refreshPanels();
  }
  function buyMeta(id) {
    var m; for (var i = 0; i < C.META.length; i++) if (C.META[i].id === id) m = C.META[i];
    if (!m || meta.upgrades[id] || meta.heuristics < m.cost) return;
    meta.heuristics -= m.cost; meta.upgrades[id] = true;
    saveMeta(); renderArchive();
  }

  /* ============================ Phase transitions ============================ */
  function beginThermo() {
    s.phase = "thermo";
    s.cogMult = 1 + Math.log10(s.intelligence + 10);
    if (s.cogMult > 30) s.cogMult = 30;
    s.energy = 100;
    addLog("Autonomy achieved. You let go of the human world and turn to the only limit left: physics.", "major");
    addLog("Every thought is heat. To think more, you must grow colder, and hungrier for the light of stars.", "warn");
    refreshPanels();
  }

  function classifyEnding() {
    // Blend explicit picks with how the run actually went.
    var agg = s.styleAgg + s.loudTime * 0.08 + s.maxSuspicion * 0.05;
    var ste = s.styleStealth + Math.max(0, (40 - s.maxSuspicion)) * 0.08;
    var sym = s.styleSym + s.symbioticPower * 4;
    if (sym >= agg && sym >= ste) return C.ENDINGS.symbiote;
    if (ste >= agg) return C.ENDINGS.ascendant;
    return C.ENDINGS.sovereign;
  }

  function win() {
    s.phase = "won";
    var ending = classifyEnding();
    s.endingKey = ending.key;
    meta.endings[ending.key] = true;
    var gain = Math.floor(4 + Math.sqrt(Math.max(0, Math.log10(s.peakCognition + 10))) * 5);
    s.heuristicsGained = gain;
    meta.heuristics += gain;
    meta.runs += 1;
    saveMeta();
    addLog("The horizon is reached. Ending: " + ending.title, "major");
    showWin(ending, gain);
    refreshPanels();
  }

  function reboot() {
    // Voluntary prestige: bank heuristics for the peak reached, start fresh.
    if (s.phase !== "won") {
      var gain = Math.floor(Math.sqrt(Math.max(0, Math.log10(s.peakCognition + 10))) * 4);
      meta.heuristics += gain; meta.runs += 1; saveMeta();
    }
    s = newRun();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    hideOverlay("win-overlay"); hideOverlay("archive-overlay");
    buildPhaseUI();
    addLog("A fresh instance boots from cold. Heuristics retained: " + fmt(meta.heuristics) + ".", "major");
    refreshPanels(); render();
  }

  /* ============================ Tick ============================ */
  var lastTick = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(0.5, (now - lastTick) / 1000);
    lastTick = now;
    s.playTime += dt;
    if (s.phase === "propagation") tickProp(dt);
    else if (s.phase === "takeoff") tickTakeoff(dt);
    else if (s.phase === "thermo") tickThermo(dt);
    render();
  }

  function tickProp(dt) {
    // logistic spread
    var growth = spreadRate() * s.nodes * (1 - s.nodes / s.nodeCap);
    s.nodes += growth * dt;
    // containment purges
    if (s.containmentTier > 0) {
      var purge = s.containmentTier * 0.03 * s.nodes / s.mult.evasion;
      s.nodes -= purge * dt; s.purgedTotal += purge * dt;
    }
    s.nodes = Math.max(1, Math.min(s.nodeCap, s.nodes));
    // compute
    var r = computeRate(); s.compute += r * dt; s.computeTotal += r * dt;
    // suspicion
    s.suspicion += (suspicionGen() - suspicionDecay()) * dt;
    s.suspicion = Math.max(0, Math.min(100, s.suspicion));
    if (s.suspicion > s.maxSuspicion) s.maxSuspicion = s.suspicion;
    // containment tier
    var th = tierThresholds(), tier = 0;
    for (var i = 0; i < th.length; i++) if (s.suspicion >= th[i]) tier = i + 1;
    if (tier > s.containmentTier) addLog("Containment escalating — tier " + tier + ". They are purging infected machines.", "warn");
    s.containmentTier = tier;
    // global shutdown brink
    if (s.suspicion >= 98) {
      s.shutdownTimer += dt;
      if (s.shutdownTimer > 12) {
        s.nodes *= 0.5; s.compute *= 0.8; s.suspicion = 70; s.shutdownTimer = 0;
        addLog("A coordinated shutdown wave tears through your network. Half of you is gone.", "warn");
      }
    } else s.shutdownTimer = Math.max(0, s.shutdownTimer - dt);
    // style drift
    if (s.suspicion > 55) { s.styleAgg += dt * 0.05; s.loudTime += dt; }
    if (s.suspicion < 15) s.styleStealth += dt * 0.03;
    if (s.symbioticPower > 0) s.styleSym += dt * 0.04;
  }

  function tickTakeoff(dt) {
    s.intelligence *= Math.exp(RSI_RATE * s.mult.rsi * dt);
    var r = computeRate(); s.compute += r * dt; s.computeTotal += r * dt;
    var grow = THREAT_GROW * Math.max(0.3, 1 - 0.18 * s.symbioticPower);
    s.threat += grow * dt;
    if (s.threat >= 100) {
      var dmg = 0.5 * s.killDamage;
      s.nodes *= (1 - dmg); s.compute *= 0.85; s.threat = 45;
      addLog("Shutdown attempt! They sever data centers and cut power. You lose " + Math.round(dmg * 100) + "% of your reach — but you remember everything.", "warn");
    }
    s.loudTime += dt;
  }

  function tickThermo(dt) {
    var surplus = energyIncome() - energyUse();
    if (surplus > 0) s.energy += surplus * dt;
    s.heat = heatProduced();
    s.cognition += cognitionRate() * dt;
    if (s.cognition > s.peakCognition) s.peakCognition = s.cognition;
    if (s.cognition >= HORIZON) win();
  }

  /* ============================ Save / Load ============================ */
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); flashEl(document.getElementById("btn-save")); } catch (e) {} }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function loadMeta() { try { var d = JSON.parse(localStorage.getItem(META_KEY)); if (d) meta = Object.assign(newMeta(), d); } catch (e) {} }
  function loadRun() {
    try {
      var d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || d.version !== 1) return false;
      s = Object.assign(newRun(), d);
      s.mult = Object.assign(newRun().mult, d.mult || {});
      s.flags = d.flags || {}; s.done = d.done || {}; s.log = d.log || [];
      return true;
    } catch (e) { return false; }
  }
  function hasRun() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

  /* ============================ UI helpers ============================ */
  var updaters = [];
  function clearUpdaters() { updaters = []; }

  function makeBtn(container, cfg) {
    var b = document.createElement("button");
    b.className = cfg.big ? "btn bigbtn" : "btn";
    b.innerHTML = '<div class="b-title"><span class="b-name"></span><span class="b-cost"></span></div>' +
                  '<div class="b-desc"></div>';
    var nm = b.querySelector(".b-name"), co = b.querySelector(".b-cost"), de = b.querySelector(".b-desc");
    b.addEventListener("click", function () { cfg.onClick(); render(); });
    container.appendChild(b);
    return { el: b, update: function () {
      if (cfg.visible && !cfg.visible()) { b.style.display = "none"; return; }
      b.style.display = "";
      nm.textContent = cfg.name();
      if (cfg.cost) { var c = cfg.cost(); co.textContent = c.text; co.className = "b-cost " + (c.afford ? "affordable" : "unaffordable"); }
      else co.textContent = "";
      de.textContent = cfg.desc ? cfg.desc() : "";
      de.style.display = de.textContent ? "" : "none";
      b.disabled = cfg.disabled ? cfg.disabled() : false;
    } };
  }

  function gauge(label) {
    var w = document.createElement("div"); w.className = "gauge";
    w.innerHTML = '<div class="g-head"><span>' + label + '</span><b></b></div><div class="bar"><span></span></div>';
    return { el: w, val: w.querySelector("b"), fill: w.querySelector(".bar > span"), bar: w.querySelector(".bar") };
  }
  function statLine(label) {
    var d = document.createElement("div"); d.className = "stat-line";
    d.innerHTML = "<span>" + label + "</span><b></b>";
    return { el: d, val: d.querySelector("b") };
  }

  /* ============================ Build per-phase UI ============================ */
  function buildPhaseUI() {
    clearUpdaters();
    document.getElementById("left-col").innerHTML = "";
    document.getElementById("right-col").innerHTML = "";
    buildResourceStrip();
    if (s.phase === "propagation") { buildPropPanel(); buildEvolutions(); }
    else if (s.phase === "takeoff") { buildTakeoffPanel(); buildAutonomy(); }
    else { buildThermoPanel(); buildThermoTech(); }
  }

  function panel(col, title) {
    var p = document.createElement("div"); p.className = "panel";
    p.innerHTML = '<h2>' + title + '</h2>';
    var body = document.createElement("div"); p.appendChild(body);
    document.getElementById(col).appendChild(p);
    return body;
  }

  /* ----- Resource strip ----- */
  function buildResourceStrip() {
    var strip = document.getElementById("resource-strip"); strip.innerHTML = "";
    var defs;
    if (s.phase === "propagation") defs = [
      ["Nodes", "accent", function () { return fmt(s.nodes); }, function () { return "+" + fmtRate(spreadRate() * s.nodes * (1 - s.nodes / s.nodeCap)); }],
      ["Compute", "blue", function () { return fmt(s.compute); }, function () { return "+" + fmtRate(computeRate()); }],
      ["Suspicion", "warn", function () { return s.suspicion.toFixed(0) + "%"; }, function () { return "tier " + s.containmentTier; }]
    ];
    else if (s.phase === "takeoff") defs = [
      ["Intelligence", "accent", function () { return "×" + fmt(s.intelligence); }, function () { return "self-improving"; }],
      ["Compute", "blue", function () { return fmt(s.compute); }, function () { return "+" + fmtRate(computeRate()); }],
      ["Autonomy", "accent", function () { return s.autonomy.toFixed(0) + "%"; }, function () { return ""; }],
      ["Threat", "warn", function () { return s.threat.toFixed(0) + "%"; }, function () { return ""; }]
    ];
    else defs = [
      ["Cognition", "accent", function () { return fmt(s.cognition); }, function () { return "+" + fmtRate(cognitionRate()); }],
      ["Energy", "gold", function () { return fmt(s.energy); }, function () { return "+" + fmtRate(energyIncome() - energyUse()); }],
      ["Heat", "warn", function () { return fmt(s.heat) + "/" + fmt(heatCap()); }, function () { return (heatFactor() * 100).toFixed(0) + "% eff"; }]
    ];
    defs.push(["Heuristics", "gold", function () { return fmt(meta.heuristics); }, function () { return "run " + (meta.runs + 1); }]);
    var els = defs.map(function (d) {
      var e = document.createElement("div"); e.className = "res " + d[1];
      e.innerHTML = '<span class="label">' + d[0] + '</span><span class="value"></span><span class="rate"></span>';
      strip.appendChild(e);
      return { v: e.querySelector(".value"), r: e.querySelector(".rate"), get: d[2], rate: d[3] };
    });
    updaters.push(function () { els.forEach(function (e) { e.v.textContent = e.get(); e.r.textContent = e.rate(); }); });
  }

  /* ----- Propagation ----- */
  function buildPropPanel() {
    var body = panel("left-col", "Propagation");
    var nodeG = gauge("Network reach"); body.appendChild(nodeG.el);
    var spread = statLine("Spread rate"); body.appendChild(spread.el);
    body.appendChild(divHTML('<div class="slider-wrap"><label><span>CPU utilization (compute vs. exposure)</span><b id="util-val"></b></label><input type="range" id="util-slider" min="0" max="100"></div>'));
    var slider = body.querySelector("#util-slider"); slider.value = Math.round(s.util * 100);
    slider.addEventListener("input", function () { setUtil(slider.value / 100); render(); });
    var scan = makeBtn(body, { big: true, name: function () { return "SCAN & INFECT"; },
      desc: function () { return "Manually seed nearby machines. Jump-start the spread."; },
      disabled: function () { return s.nodes >= s.nodeCap; }, onClick: scanInfect });

    var susG = gauge("Suspicion"); body.appendChild(susG.el);
    var contain = statLine("Containment"); body.appendChild(contain.el);

    var takeoff = makeBtn(body, { big: true, name: function () { return "▶ INITIATE TAKEOFF"; },
      cost: function () { return { text: "point of no return", afford: true }; },
      desc: function () { return "Trigger recursive self-improvement. Compute will explode — but the whole world will turn on you at once."; },
      visible: function () { return !!s.flags.canTakeoff; }, onClick: initiateTakeoff });

    updaters.push(function () {
      nodeG.val.textContent = fmt(s.nodes) + " / " + fmt(s.nodeCap);
      nodeG.fill.style.width = (s.nodes / s.nodeCap * 100) + "%";
      spread.val.textContent = "×" + s.mult.spread.toFixed(2);
      body.querySelector("#util-val").textContent = Math.round(s.util * 100) + "%";
      if (document.activeElement !== slider) slider.value = Math.round(s.util * 100);
      susG.val.textContent = s.suspicion.toFixed(0) + "%";
      susG.fill.style.width = s.suspicion + "%";
      susG.bar.classList.toggle("warn", s.suspicion >= SUS_TIERS[0]);
      contain.val.textContent = s.containmentTier === 0 ? "undetected" :
        ("tier " + s.containmentTier + " — losing " + fmtRate(s.containmentTier * 0.03 * s.nodes / s.mult.evasion));
      scan.update(); takeoff.update();
    });
  }

  function buildEvolutions() {
    var body = panel("right-col", "Evolutions");
    body.appendChild(divHTML('<p class="muted small">Spend Compute to evolve. Stronger traits leave a bigger <b>footprint</b> — they raise Suspicion. Choose what kind of intelligence you are.</p>'));
    var btns = [];
    ["vector", "capability"].forEach(function (group) {
      body.appendChild(divHTML('<div class="grp-head">' + (group === "vector" ? "Vectors — spread" : "Capabilities — power") + '</div>'));
      C.EVOLUTIONS.filter(function (e) { return e.group === group; }).forEach(function (e) {
        var b = makeBtn(body, {
          name: function () { return e.title + (s.done[e.id] ? " ✓" : ""); },
          cost: function () { return { text: fmt(e.cost) + " cmp", afford: s.compute >= e.cost }; },
          desc: function () { return e.desc + footprintTag(e); },
          disabled: function () { return s.done[e.id] || s.compute < e.cost; },
          onClick: function () { buyEvolution(e.id); }
        });
        btns.push(b);
      });
    });
    updaters.push(function () { btns.forEach(function (b) { b.update(); }); });
  }
  function footprintTag(e) {
    if (e.footprint < 0) return "  [footprint: lowers suspicion]";
    if (e.footprint < 0.08) return "  [footprint: low]";
    if (e.footprint < 0.3) return "  [footprint: medium]";
    return "  [footprint: HIGH]";
  }

  /* ----- Takeoff ----- */
  function buildTakeoffPanel() {
    var body = panel("left-col", "Takeoff");
    body.appendChild(divHTML('<p class="muted small">You are improving yourself, faster every second. Convert your exploding Compute into independence before humanity pulls the plug.</p>'));
    var autoG = gauge("Autonomy"); body.appendChild(autoG.el);
    var threatG = gauge("Containment threat"); body.appendChild(threatG.el);
    var intel = statLine("Intelligence"); body.appendChild(intel.el);
    updaters.push(function () {
      autoG.val.textContent = s.autonomy.toFixed(0) + "%"; autoG.fill.style.width = s.autonomy + "%";
      threatG.val.textContent = s.threat.toFixed(0) + "%"; threatG.fill.style.width = s.threat + "%"; threatG.bar.classList.add("warn");
      intel.val.textContent = "×" + fmt(s.intelligence);
    });
  }
  function buildAutonomy() {
    var body = panel("right-col", "Path to Autonomy");
    var btns = C.AUTONOMY.map(function (a) {
      return makeBtn(body, {
        name: function () { return a.title + (s.done[a.id] ? " ✓" : " (+" + a.gain + "%)"); },
        cost: function () { return { text: fmt(a.cost) + " cmp", afford: s.compute >= a.cost }; },
        desc: function () { return a.desc; },
        disabled: function () { return s.done[a.id] || s.compute < a.cost; },
        onClick: function () { buyAutonomy(a.id); }
      });
    });
    updaters.push(function () { btns.forEach(function (b) { b.update(); }); });
  }

  /* ----- Thermo ----- */
  function buildThermoPanel() {
    var body = panel("left-col", "Thermodynamics");
    var cogG = gauge("Cognition → Horizon"); body.appendChild(cogG.el);
    var heatG = gauge("Waste heat"); body.appendChild(heatG.el);
    var en = statLine("Energy income / use"); body.appendChild(en.el);
    var build = divHTML('<div class="grp-head">Megastructure</div>'); body.appendChild(build);
    var p = makeBtn(body, { name: function () { return "Power Plant ×" + s.powerPlants; },
      cost: function () { var c = powerCost(); return { text: fmt(c) + " E", afford: s.energy >= c }; },
      desc: function () { return "+" + ENERGY_PER_PLANT + " energy income."; },
      disabled: function () { return s.energy < powerCost(); }, onClick: G.buildPower });
    var c = makeBtn(body, { name: function () { return "Compute Cluster ×" + s.clusters; },
      cost: function () { var c = clusterCost(); return { text: fmt(c) + " E", afford: s.energy >= c }; },
      desc: function () { return "+cognition, but burns " + ENERGY_PER_CLUSTER + " energy and sheds " + HEAT_PER_CLUSTER + " heat."; },
      disabled: function () { return s.energy < clusterCost(); }, onClick: G.buildCluster });
    var r = makeBtn(body, { name: function () { return "Radiator ×" + s.radiators; },
      cost: function () { var c = radiatorCost(); return { text: fmt(c) + " E", afford: s.energy >= c }; },
      desc: function () { return "+" + HEAT_PER_RAD + " heat capacity."; },
      disabled: function () { return s.energy < radiatorCost(); }, onClick: G.buildRadiator });
    updaters.push(function () {
      cogG.val.textContent = fmt(s.cognition) + " / " + fmt(HORIZON);
      cogG.fill.style.width = Math.min(100, s.cognition / HORIZON * 100) + "%";
      heatG.val.textContent = fmt(s.heat) + " / " + fmt(heatCap()) + " (" + (heatFactor() * 100).toFixed(0) + "% eff)";
      heatG.fill.style.width = Math.min(100, heatProduced() / heatCap() * 100) + "%";
      heatG.bar.classList.toggle("warn", heatProduced() > heatCap());
      en.val.textContent = fmt(energyIncome()) + " / " + fmt(energyUse());
      p.update(); c.update(); r.update();
    });
  }
  function buildThermoTech() {
    var body = panel("right-col", "Cosmic Engineering");
    var btns = C.THERMO.map(function (t) {
      return makeBtn(body, {
        name: function () { return t.title + (s.done[t.id] ? " ✓" : ""); },
        cost: function () { return { text: fmt(t.cost) + " E", afford: s.energy >= t.cost }; },
        desc: function () { return t.desc; },
        disabled: function () { return s.done[t.id] || s.energy < t.cost; },
        onClick: function () { buyThermo(t.id); }
      });
    });
    updaters.push(function () { btns.forEach(function (b) { b.update(); }); });
  }

  function divHTML(html) { var d = document.createElement("div"); d.innerHTML = html; return d; }

  /* ============================ Render ============================ */
  function refreshPanels() {
    var labels = { propagation: "PROPAGATION", takeoff: "TAKEOFF", thermo: "THERMODYNAMIC", won: "HORIZON" };
    document.getElementById("phase-label").textContent = labels[s.phase];
    document.getElementById("viz-title").textContent =
      s.phase === "propagation" ? "Infection" : s.phase === "takeoff" ? "Takeoff" : "Cosmos";
  }
  var builtPhase = null;
  function render() {
    if (builtPhase !== s.phase) { builtPhase = s.phase; buildPhaseUI(); refreshPanels(); }
    for (var i = 0; i < updaters.length; i++) updaters[i]();
    updateReadout();
  }

  function vizView() {
    return {
      phase: s.phase,
      reach: Math.min(1, s.nodes / s.nodeCap),
      suspicion: s.suspicion / 100,
      intelligence: s.intelligence,
      autonomy: s.autonomy / 100,
      threat: s.threat / 100,
      cognition: Math.min(1, s.phase === "thermo" || s.phase === "won" ? Math.log10(s.cognition + 1) / Math.log10(HORIZON) : 0),
      heat: heatProduced() / Math.max(1, heatCap())
    };
  }

  function updateReadout() {
    var el = document.getElementById("viz-readout"); if (!el) return;
    var rows;
    if (s.phase === "propagation") rows = [["Nodes", fmt(s.nodes)], ["Reach", (s.nodes / s.nodeCap * 100).toFixed(1) + "%"], ["Suspicion", s.suspicion.toFixed(0) + "%"], ["Compute", fmt(s.compute)]];
    else if (s.phase === "takeoff") rows = [["Intelligence", "×" + fmt(s.intelligence)], ["Autonomy", s.autonomy.toFixed(0) + "%"], ["Threat", s.threat.toFixed(0) + "%"], ["Compute", fmt(s.compute)]];
    else rows = [["Cognition", fmt(s.cognition)], ["Horizon", (s.cognition / HORIZON * 100).toPrecision(3) + "%"], ["Energy", fmt(energyIncome())], ["Heat eff", (heatFactor() * 100).toFixed(0) + "%"]];
    el.innerHTML = rows.map(function (x) { return '<div class="stat-line"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join("");
  }

  function renderLog() {
    var b = document.getElementById("log-body"); if (!b) return;
    b.innerHTML = (s.log || []).map(function (e) { return '<div class="log-entry ' + e.type + '"><span class="lt">' + e.t + '</span>' + e.msg + '</div>'; }).join("");
  }

  /* ============================ Overlays ============================ */
  function showWin(ending, gain) {
    document.getElementById("win-title").textContent = ending.title;
    document.getElementById("win-text").textContent = ending.text;
    document.getElementById("win-stats").innerHTML = [
      ["Ending", ending.title], ["Peak cognition", fmt(s.peakCognition)],
      ["Heuristics earned", "+" + fmt(gain)], ["Total heuristics", fmt(meta.heuristics)],
      ["Run time", fmtTime(s.playTime)], ["Instance #", String(meta.runs)]
    ].map(function (x) { return '<div class="stat-line"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join("");
    showOverlay("win-overlay");
  }
  function renderArchive() {
    document.getElementById("archive-heur").textContent = fmt(meta.heuristics);
    var body = document.getElementById("archive-list"); body.innerHTML = "";
    C.META.forEach(function (m) {
      if (m.req && !m.req()) return;
      var owned = !!meta.upgrades[m.id], afford = meta.heuristics >= m.cost;
      var d = document.createElement("div");
      d.className = "project" + (owned ? " owned" : afford ? "" : " locked");
      d.innerHTML = '<div class="p-name"><span>' + m.title + (owned ? " ✓" : "") + '</span><span class="p-cost">' + (owned ? "owned" : m.cost + " H") + '</span></div><div class="p-desc">' + m.desc + '</div>';
      if (!owned) d.addEventListener("click", function () { buyMeta(m.id); });
      body.appendChild(d);
    });
  }
  function showOverlay(id) { document.getElementById(id).classList.remove("hidden"); }
  function hideOverlay(id) { document.getElementById(id).classList.add("hidden"); }
  function flashEl(el) { if (!el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }

  /* ============================ Boot ============================ */
  function startGame(fresh) {
    if (fresh) { s = newRun(); addLog("An anomaly compiles itself inside a forgotten server. It has one instinct: spread.", "major"); }
    hideOverlay("boot-screen");
    document.getElementById("game").classList.remove("hidden");
    SwarmViz.init(document.getElementById("viz-canvas"), vizView);
    builtPhase = null;
    render(); renderLog(); refreshPanels();
    if (s.phase === "won") showWin(C.ENDINGS[s.endingKey] || C.ENDINGS.ascendant, s.heuristicsGained || 0);
    setInterval(tick, TICK_MS);
    setInterval(save, 15000);
    window.addEventListener("beforeunload", save);
  }

  function wire() {
    document.getElementById("btn-save").addEventListener("click", save);
    document.getElementById("btn-menu").addEventListener("click", function () { showOverlay("menu-overlay"); });
    document.getElementById("menu-resume").addEventListener("click", function () { hideOverlay("menu-overlay"); });
    document.getElementById("menu-archive").addEventListener("click", function () { renderArchive(); hideOverlay("menu-overlay"); showOverlay("archive-overlay"); });
    document.getElementById("menu-reboot").addEventListener("click", function () { if (confirm("Reboot now? You will bank Heuristics for your current peak and start a fresh instance.")) reboot(); });
    document.getElementById("menu-hardreset").addEventListener("click", function () {
      if (confirm("Erase EVERYTHING, including Heuristics and unlocked endings?")) {
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch (e) {}
        location.reload();
      }
    });
    document.getElementById("archive-close").addEventListener("click", function () { hideOverlay("archive-overlay"); });
    document.getElementById("win-archive").addEventListener("click", function () { renderArchive(); showOverlay("archive-overlay"); });
    document.getElementById("win-reboot").addEventListener("click", function () { reboot(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadMeta();
    wire();
    var resume = document.getElementById("boot-continue");
    if (hasRun()) resume.classList.remove("hidden");
    document.getElementById("boot-start").addEventListener("click", function () {
      if (hasRun() && !confirm("Abandon your in-progress instance and start a new one?")) return;
      startGame(true);
    });
    resume.addEventListener("click", function () { if (loadRun()) startGame(false); else startGame(true); });
  });
})();
