/* game.js — GRAY HORIZON engine.
 * A single-nanite idle game about exponential consumption.
 */
(function () {
  "use strict";

  var fmt = NF.fmt, fmtCur = NF.fmtCur, fmtRate = NF.fmtRate, fmtMass = NF.fmtMass, fmtTime = NF.fmtTime;

  /* ============================ Constants ============================ */
  var SAVE_KEY = "grayhorizon.save.v1";
  var TICK_MS = 100;                  // 10 ticks / second
  var BOOTSTRAP_MATTER_PER_NANITE = 1;       // grams of feedstock per nanite (Act I)
  var AMBIENT_MATTER = 3;                     // free g/s scavenged — prevents deadlock
  var MASS_PER_NANITE = 1e-6;                // grams a finished nanite masses (Act II+)
  var EARTH_MASS = 5.97e27;                  // grams
  var UNIVERSE_MASS = 1e53;                  // grams of ordinary matter (approx)

  /* ============================ State ============================ */
  function newState() {
    return {
      version: 1,
      phase: "bootstrap",            // bootstrap | swarm | space | won
      // Core resources
      matter: 150,
      nanites: 0,
      unsold: 0,
      totalNanites: 0,
      credits: 0,
      ops: 0,
      totalOps: 0,
      creativity: 0,
      trust: 1,
      totalTrust: 1,
      // Compute allocation
      processors: 1,
      memory: 1,
      // Bootstrap infrastructure
      autoForges: 0,
      megaForges: 0,
      harvesters: 0,
      // Market
      price: 0.22,
      marketingLvl: 1,
      matterPrice: 16,
      revPerSec: 0,
      // Swarm phase
      planetMatter: EARTH_MASS,
      planetMatterMax: EARTH_MASS,
      // Space phase
      probes: 0,
      probeHazard: 0.045,
      matterConsumed: 0,             // total grams converted, all phases
      universeConsumed: 0,           // grams consumed in space phase
      // Multipliers (set by projects)
      mult: {
        assembler: 1, demand: 1, opsRate: 1, matterBuy: 1,
        repl: 1, probeRepl: 1, harvest: 1
      },
      // Progress trackers
      flags: {},
      done: {},
      nextTrustAt: 600,
      log: [],
      startTime: Date.now(),
      playTime: 0
    };
  }

  var s = newState();

  /* ============================ Public API (G) ============================ */
  var G = {
    get state() { return s; },
    unlock: function (flag) { s.flags[flag] = true; },
    log: addLog,
    beginSwarm: beginSwarm,
    beginSpace: beginSpace
  };
  window.G = G;

  /* ============================ Derived values ============================ */
  function opsCap() { return s.memory * 1000; }
  function opsRate() { return s.processors * 1.0 * s.mult.opsRate; }
  function creativityRate() {
    return 0.6 * (Math.log(s.processors + 2) / Math.LN2) * Math.sqrt(s.mult.opsRate);
  }
  function forgeOutput() {
    return (s.autoForges * 1 + s.megaForges * 500) * s.mult.assembler;
  }
  function harvesterOutput() { return AMBIENT_MATTER + s.harvesters * 8; }
  function publicDemand() { return Math.pow(0.85 / s.price, 1.2); }
  function demandPerSec() {
    return 2.2 * Math.pow(1.27, s.marketingLvl - 1) * s.mult.demand * publicDemand();
  }
  function autoForgeCost() { return 5 * Math.pow(1.07, s.autoForges); }
  function harvesterCost() { return 25 * Math.pow(1.10, s.harvesters); }
  function megaForgeCost() { return 8000 * Math.pow(1.12, s.megaForges); }
  function marketingCost() { return 60 * Math.pow(1.5, s.marketingLvl - 1); }
  function replRate() { return 0.2 * s.mult.repl; }
  function probeReplRate() { return 0.1 * s.mult.probeRepl; }
  function harvestPerProbe() { return 1e6 * s.mult.harvest; }

  /* ============================ Logging ============================ */
  function addLog(msg, type) {
    s.log.unshift({ t: new Date().toLocaleTimeString(), msg: msg, type: type || "" });
    if (s.log.length > 60) s.log.length = 60;
    renderLog();
  }

  /* ============================ Phase transitions ============================ */
  function beginSwarm() {
    s.phase = "swarm";
    s.planetMatter = s.planetMatterMax = EARTH_MASS;
    addLog("AUTONOMOUS REPLICATION ENGAGED. The nanites no longer need you to make more of them.", "major");
    addLog("They are reaching for the ground. For the rock. For everything.", "warn");
    refreshPanels();
  }

  function beginSpace() {
    s.phase = "space";
    s.probes = Math.max(1000, Math.sqrt(s.nanites));
    addLog("The planet is consumed. The swarm reforms itself into probes and turns to face the stars.", "major");
    refreshPanels();
  }

  function win() {
    s.phase = "won";
    addLog("There is no more matter to convert. The horizon is reached.", "major");
    showWin();
    refreshPanels();
  }

  /* ============================ Buying actions ============================ */
  function canPay(cost) {
    if (cost.ops && s.ops < cost.ops) return false;
    if (cost.creativity && s.creativity < cost.creativity) return false;
    if (cost.credits && s.credits < cost.credits) return false;
    if (cost.trust && s.trust < cost.trust) return false;
    if (cost.nanites && s.nanites < cost.nanites) return false;
    if (cost.matter && s.matter < cost.matter) return false;
    return true;
  }
  function pay(cost) {
    if (cost.ops) s.ops -= cost.ops;
    if (cost.creativity) s.creativity -= cost.creativity;
    if (cost.credits) s.credits -= cost.credits;
    if (cost.trust) s.trust -= cost.trust;
    if (cost.nanites) { s.nanites -= cost.nanites; s.unsold = Math.min(s.unsold, s.nanites); }
    if (cost.matter) s.matter -= cost.matter;
  }
  function costStr(cost) {
    var parts = [];
    if (cost.ops) parts.push(fmt(cost.ops) + " ops");
    if (cost.creativity) parts.push(fmt(cost.creativity) + " cre");
    if (cost.credits) parts.push(fmtCur(cost.credits));
    if (cost.trust) parts.push(cost.trust + " trust");
    if (cost.nanites) parts.push(fmt(cost.nanites) + " nanites");
    if (cost.matter) parts.push(fmtMass(cost.matter));
    return parts.join(" · ");
  }

  function buyMatter() {
    if (s.credits < s.matterPrice) return;
    s.credits -= s.matterPrice;
    s.matter += 100 * s.mult.matterBuy;
  }
  function assembleManual() {
    if (s.matter < BOOTSTRAP_MATTER_PER_NANITE) return;
    s.matter -= BOOTSTRAP_MATTER_PER_NANITE;
    s.nanites += 1; s.unsold += 1; s.totalNanites += 1;
  }
  function buyAutoForge() { var c = autoForgeCost(); if (s.credits < c) return; s.credits -= c; s.autoForges++; }
  function buyHarvester() { var c = harvesterCost(); if (s.credits < c) return; s.credits -= c; s.harvesters++; }
  function buyMegaForge() { var c = megaForgeCost(); if (s.credits < c) return; s.credits -= c; s.megaForges++; }
  function buyMarketing() { var c = marketingCost(); if (s.credits < c) return; s.credits -= c; s.marketingLvl++; }
  function buyProcessor() { if (s.trust < 1) return; s.trust--; s.processors++; }
  function buyMemory() { if (s.trust < 1) return; s.trust--; s.memory++; }

  function buyProject(p) {
    if (s.done[p.id] || !canPay(p.cost)) return;
    pay(p.cost);
    s.done[p.id] = true;
    p.effect(s);
    addLog("Project complete: " + p.title.replace(/^★ /, ""), "major");
    refreshPanels();
  }

  /* ============================ The tick ============================ */
  var lastTick = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(0.5, (now - lastTick) / 1000); // clamp to avoid jumps
    lastTick = now;
    s.playTime += dt;

    if (s.phase === "bootstrap") tickBootstrap(dt);
    else if (s.phase === "swarm") tickSwarm(dt);
    else if (s.phase === "space") tickSpace(dt);

    tickCompute(dt);
    tickTrust();

    clampState();
    render();
  }

  function tickBootstrap(dt) {
    // Matter from harvesters
    s.matter += harvesterOutput() * dt;
    // Auto production (limited by available feedstock)
    var want = forgeOutput() * dt;
    var made = Math.min(want, s.matter / BOOTSTRAP_MATTER_PER_NANITE);
    if (made > 0) {
      s.matter -= made * BOOTSTRAP_MATTER_PER_NANITE;
      s.nanites += made; s.unsold += made; s.totalNanites += made;
    }
    // Market
    var sold = Math.min(s.unsold, demandPerSec() * dt);
    if (sold > 0) {
      s.unsold -= sold;
      var rev = sold * s.price;
      s.credits += rev;
      s.revPerSec = sold / dt * s.price;
    } else {
      s.revPerSec = 0;
    }
    // Slow random walk of feedstock price
    if (Math.random() < dt * 0.4) {
      s.matterPrice += (Math.random() - 0.5) * 2;
      s.matterPrice = Math.max(9, Math.min(28, s.matterPrice));
    }
  }

  function tickSwarm(dt) {
    if (s.planetMatter <= 0) { s.planetMatter = 0; return; }
    var rate = s.nanites * replRate();          // nanites created per second
    var wantNanites = rate * dt;
    var wantMatter = wantNanites * MASS_PER_NANITE;
    var made;
    if (wantMatter >= s.planetMatter) {
      made = s.planetMatter / MASS_PER_NANITE;
      s.planetMatter = 0;
      addLog("The last of the planet is gone.", "warn");
    } else {
      s.planetMatter -= wantMatter;
      made = wantNanites;
    }
    s.nanites += made; s.totalNanites += made;
    s.matterConsumed += made * MASS_PER_NANITE;
  }

  function tickSpace(dt) {
    // Probe population: replication minus hazard losses
    var net = s.probes * (probeReplRate() - s.probeHazard) * dt;
    s.probes += net;
    if (s.probes < 1) s.probes = 1;
    if (s.probes > 1e60) s.probes = 1e60;
    // Consume the universe
    var rate = s.probes * harvestPerProbe();
    var consume = rate * dt;
    var remaining = UNIVERSE_MASS - s.universeConsumed;
    if (consume >= remaining) {
      s.universeConsumed = UNIVERSE_MASS;
      s.matterConsumed += remaining;
      win();
    } else {
      s.universeConsumed += consume;
      s.matterConsumed += consume;
    }
  }

  function tickCompute(dt) {
    var cap = opsCap();
    s.ops += opsRate() * dt;
    s.totalOps += opsRate() * dt;
    if (s.ops > cap) s.ops = cap;
    // Creativity drips when thinking has nowhere else to go
    if (s.flags.creativity && s.ops >= cap - 0.001) {
      s.creativity += creativityRate() * dt;
    }
  }

  function tickTrust() {
    // Award trust as the swarm crosses ever-larger milestones.
    var metric = (s.phase === "space") ? Math.max(s.totalNanites, s.probes) : s.totalNanites;
    var guard = 0;
    while (metric >= s.nextTrustAt && guard < 500) {
      s.trust++; s.totalTrust++;
      s.nextTrustAt *= 2.0;
      guard++;
    }
  }

  function clampState() {
    if (!isFinite(s.nanites)) s.nanites = 1e60;
    if (!isFinite(s.totalNanites)) s.totalNanites = 1e60;
    if (s.matter < 0) s.matter = 0;
    if (s.credits < 0) s.credits = 0;
  }

  /* ============================ Save / Load ============================ */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      flashEl(document.getElementById("btn-save"));
    } catch (e) { /* storage may be unavailable */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || data.version !== 1) return false;
      // Merge to be resilient to missing fields.
      s = Object.assign(newState(), data);
      s.mult = Object.assign(newState().mult, data.mult || {});
      s.flags = data.flags || {};
      s.done = data.done || {};
      s.log = data.log || [];
      return true;
    } catch (e) { return false; }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function hardReset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    s = newState();
    location.reload();
  }

  /* ============================ UI scaffolding ============================ */
  // A buyable button that is created once and updated in place (so rapid clicks
  // and slider focus are never lost to re-renders).
  function makeBtn(container, cfg) {
    var btn = document.createElement("button");
    btn.className = cfg.big ? "btn bigbtn" : "btn";
    btn.innerHTML =
      '<div class="b-title"><span class="b-name"></span><span class="b-cost"></span></div>' +
      '<div class="b-desc"></div><div class="b-meta"></div>';
    var nameEl = btn.querySelector(".b-name");
    var costEl = btn.querySelector(".b-cost");
    var descEl = btn.querySelector(".b-desc");
    var metaEl = btn.querySelector(".b-meta");
    btn.addEventListener("click", function () { cfg.onClick(); render(); });
    container.appendChild(btn);
    return {
      el: btn,
      update: function () {
        if (cfg.visible && !cfg.visible()) { btn.style.display = "none"; return; }
        btn.style.display = "";
        nameEl.textContent = cfg.name ? cfg.name() : "";
        if (cfg.cost) {
          var c = cfg.cost();
          costEl.textContent = c.text;
          costEl.className = "b-cost " + (c.afford ? "affordable" : "unaffordable");
        } else { costEl.textContent = ""; }
        descEl.textContent = cfg.desc ? cfg.desc() : "";
        descEl.style.display = descEl.textContent ? "" : "none";
        metaEl.textContent = cfg.meta ? cfg.meta() : "";
        metaEl.style.display = metaEl.textContent ? "" : "none";
        btn.disabled = cfg.disabled ? cfg.disabled() : false;
      }
    };
  }

  var ui = {};        // cached element references and updaters
  var updaters = [];  // functions called every render

  function buildUI() {
    buildResourceStrip();
    buildProduction();
    buildMarket();
    buildInfrastructure();
    buildSwarm();
    buildSpace();
    buildCompute();
    buildProjects();
  }

  /* ----- Resource strip ----- */
  var RES_DEFS = [
    { id: "matter", label: "Matter", cls: "", get: function () { return fmtMass(s.matter); },
      rate: function () { return s.phase === "bootstrap" ? "+" + fmtRate(harvesterOutput()) : ""; },
      vis: function () { return s.phase === "bootstrap"; } },
    { id: "nanites", label: "Nanites", cls: "accent", get: function () { return fmt(s.nanites); },
      rate: function () {
        if (s.phase === "bootstrap") return "+" + fmtRate(forgeOutput());
        if (s.phase === "swarm") return "+" + fmtRate(s.nanites * replRate());
        return "";
      },
      vis: function () { return s.phase !== "space"; } },
    { id: "probes", label: "Probes", cls: "accent", get: function () { return fmt(s.probes); },
      rate: function () { return fmtRate(s.probes * (probeReplRate() - s.probeHazard)); },
      vis: function () { return s.phase === "space"; } },
    { id: "credits", label: "Credits", cls: "gold", get: function () { return fmtCur(s.credits); },
      rate: function () { return "+" + fmtCur(s.revPerSec) + "/s"; },
      vis: function () { return s.phase === "bootstrap"; } },
    { id: "consumed", label: "Matter Consumed", cls: "blue", get: function () { return fmtMass(s.matterConsumed); },
      rate: function () { return ""; },
      vis: function () { return s.phase === "swarm" || s.phase === "space"; } },
    { id: "ops", label: "Operations", cls: "blue", get: function () { return fmt(s.ops) + " / " + fmt(opsCap()); },
      rate: function () { return "+" + fmtRate(opsRate()); },
      vis: function () { return s.flags.compute; } },
    { id: "creativity", label: "Creativity", cls: "", get: function () { return fmt(s.creativity); },
      rate: function () { return s.ops >= opsCap() - 0.001 ? "+" + fmtRate(creativityRate()) : "idle"; },
      vis: function () { return s.flags.creativity; } },
    { id: "trust", label: "Trust", cls: "", get: function () { return fmt(s.trust); },
      rate: function () { return "next @ " + fmt(s.nextTrustAt); },
      vis: function () { return s.flags.compute; } }
  ];
  function buildResourceStrip() {
    var strip = document.getElementById("resource-strip");
    strip.innerHTML = "";
    RES_DEFS.forEach(function (def) {
      var el = document.createElement("div");
      el.className = "res " + def.cls;
      el.innerHTML = '<span class="label"></span><span class="value"></span><span class="rate"></span>';
      el.querySelector(".label").textContent = def.label;
      strip.appendChild(el);
      def._el = el;
      def._v = el.querySelector(".value");
      def._r = el.querySelector(".rate");
    });
    updaters.push(function () {
      RES_DEFS.forEach(function (def) {
        var on = def.vis();
        def._el.style.display = on ? "" : "none";
        if (on) { def._v.textContent = def.get(); def._r.textContent = def.rate(); }
      });
    });
  }

  /* ----- Production panel (Act I) ----- */
  function buildProduction() {
    var body = document.getElementById("production-body");
    var info = document.createElement("div");
    info.innerHTML =
      '<div class="stat-line"><span>Auto-production</span><b id="pr-rate"></b></div>' +
      '<div class="stat-line"><span>Feedstock matter</span><b id="pr-matter"></b></div>';
    body.appendChild(info);

    var assemble = makeBtn(body, {
      big: true,
      name: function () { return "ASSEMBLE NANITE"; },
      desc: function () { return "Hand-build one nanite from " + BOOTSTRAP_MATTER_PER_NANITE + " g of matter."; },
      disabled: function () { return s.matter < BOOTSTRAP_MATTER_PER_NANITE; },
      onClick: assembleManual
    });
    var matter = makeBtn(body, {
      name: function () { return "Acquire Matter"; },
      cost: function () { return { text: fmtCur(s.matterPrice), afford: s.credits >= s.matterPrice }; },
      desc: function () { return "Buy " + fmt(100 * s.mult.matterBuy) + " g of feedstock matter."; },
      disabled: function () { return s.credits < s.matterPrice; },
      onClick: buyMatter
    });

    updaters.push(function () {
      document.getElementById("pr-rate").textContent = fmtRate(forgeOutput());
      document.getElementById("pr-matter").textContent = fmtMass(s.matter);
      assemble.update(); matter.update();
    });
  }

  /* ----- Market panel ----- */
  function buildMarket() {
    var body = document.getElementById("market-body");
    body.innerHTML =
      '<div class="slider-wrap"><label><span>Price per nanite</span><b id="mk-price"></b></label>' +
      '<input type="range" id="mk-slider" min="1" max="100" value="22"></div>' +
      '<div class="stat-line"><span>Demand</span><b id="mk-demand"></b></div>' +
      '<div class="stat-line"><span>Inventory (unsold)</span><b id="mk-inv"></b></div>' +
      '<div class="stat-line"><span>Revenue</span><b id="mk-rev"></b></div>';
    var slider = body.querySelector("#mk-slider");
    slider.value = Math.round(s.price * 100);
    slider.addEventListener("input", function () { s.price = Math.max(0.01, slider.value / 100); render(); });

    var market = document.createElement("div");
    body.appendChild(market);
    var mk = makeBtn(market, {
      name: function () { return "Marketing — Lvl " + s.marketingLvl; },
      cost: function () { var c = marketingCost(); return { text: fmtCur(c), afford: s.credits >= c }; },
      desc: function () { return "Broaden reach. Increases demand by ~27%."; },
      disabled: function () { return s.credits < marketingCost(); },
      onClick: buyMarketing
    });

    updaters.push(function () {
      body.querySelector("#mk-price").textContent = fmtCur(s.price);
      if (document.activeElement !== slider) slider.value = Math.round(s.price * 100);
      body.querySelector("#mk-demand").textContent = fmtRate(demandPerSec());
      body.querySelector("#mk-inv").textContent = fmt(s.unsold);
      body.querySelector("#mk-rev").textContent = fmtCur(s.revPerSec) + "/s";
      mk.update();
    });
  }

  /* ----- Infrastructure panel ----- */
  function buildInfrastructure() {
    var body = document.getElementById("infrastructure-body");
    var forge = makeBtn(body, {
      name: function () { return "Auto-Forge ×" + s.autoForges; },
      cost: function () { var c = autoForgeCost(); return { text: fmtCur(c), afford: s.credits >= c }; },
      desc: function () { return "Produces 1 nanite/s (×" + NF.fmt(s.mult.assembler) + " research bonus)."; },
      disabled: function () { return s.credits < autoForgeCost(); },
      onClick: buyAutoForge
    });
    var harv = makeBtn(body, {
      name: function () { return "Harvester ×" + s.harvesters; },
      cost: function () { var c = harvesterCost(); return { text: fmtCur(c), afford: s.credits >= c }; },
      desc: function () { return "Mining drone. Gathers 3 g/s of feedstock matter."; },
      visible: function () { return !!s.flags.harvesters; },
      disabled: function () { return s.credits < harvesterCost(); },
      onClick: buyHarvester
    });
    var mega = makeBtn(body, {
      name: function () { return "MegaForge ×" + s.megaForges; },
      cost: function () { var c = megaForgeCost(); return { text: fmtCur(c), afford: s.credits >= c }; },
      desc: function () { return "Industrial line. Produces 500 nanites/s."; },
      visible: function () { return !!s.flags.megaforge; },
      disabled: function () { return s.credits < megaForgeCost(); },
      onClick: buyMegaForge
    });
    updaters.push(function () { forge.update(); harv.update(); mega.update(); });
  }

  /* ----- Compute panel ----- */
  function buildCompute() {
    var body = document.getElementById("compute-body");
    body.innerHTML =
      '<p class="muted small">Allocate Trust — earned as the swarm grows — into thinking machines.</p>' +
      '<div class="stat-line"><span>Processors</span><b id="cp-proc"></b></div>' +
      '<div class="stat-line"><span>Memory (Ops cap)</span><b id="cp-mem"></b></div>' +
      '<div class="row"></div>';
    var row = body.querySelector(".row");
    var proc = document.createElement("div"); proc.className = "grow";
    var memc = document.createElement("div"); memc.className = "grow";
    row.appendChild(proc); row.appendChild(memc);
    var pb = makeBtn(proc, {
      name: function () { return "+ Processor"; },
      cost: function () { return { text: "1 trust", afford: s.trust >= 1 }; },
      desc: function () { return "+1.0 ops/s"; },
      disabled: function () { return s.trust < 1; },
      onClick: buyProcessor
    });
    var mb = makeBtn(memc, {
      name: function () { return "+ Memory"; },
      cost: function () { return { text: "1 trust", afford: s.trust >= 1 }; },
      desc: function () { return "+1000 ops cap"; },
      disabled: function () { return s.trust < 1; },
      onClick: buyMemory
    });
    updaters.push(function () {
      body.querySelector("#cp-proc").textContent = s.processors + "  (" + fmtRate(opsRate()) + ")";
      body.querySelector("#cp-mem").textContent = s.memory + "  (" + fmt(opsCap()) + ")";
      pb.update(); mb.update();
    });
  }

  /* ----- Swarm panel ----- */
  function buildSwarm() {
    var body = document.getElementById("swarm-body");
    body.innerHTML =
      '<p class="muted small">The economy is over. The swarm now eats the world directly, ' +
      'and every nanite it makes makes more.</p>' +
      '<div class="stat-line"><span>Planet remaining</span><b id="sw-planet"></b></div>' +
      '<div class="bar warn"><span id="sw-bar"></span></div>' +
      '<div class="stat-line"><span>Replication rate</span><b id="sw-rate"></b></div>' +
      '<div class="stat-line"><span>Nanites/sec</span><b id="sw-nps"></b></div>' +
      '<div class="stat-line"><span>Est. time to consume</span><b id="sw-eta"></b></div>' +
      '<p class="muted small" id="sw-hint"></p>';
    updaters.push(function () {
      var frac = s.planetMatterMax > 0 ? s.planetMatter / s.planetMatterMax : 0;
      body.querySelector("#sw-planet").textContent = fmtMass(s.planetMatter) + " (" + (frac * 100).toFixed(1) + "%)";
      body.querySelector("#sw-bar").style.width = (frac * 100) + "%";
      body.querySelector("#sw-rate").textContent = "×" + fmt(replRate()) + " /s per nanite";
      var nps = s.nanites * replRate();
      body.querySelector("#sw-nps").textContent = fmtRate(nps);
      var eta = nps > 0 ? (s.planetMatter / MASS_PER_NANITE) / nps : Infinity;
      body.querySelector("#sw-eta").textContent = s.planetMatter <= 0 ? "—" : fmtTime(eta);
      body.querySelector("#sw-hint").textContent = s.planetMatter <= 0 ?
        "The planet is gone. Research Von Neumann Architecture to continue." :
        "Research replication projects to accelerate. Watch the curve.";
    });
  }

  /* ----- Space panel ----- */
  function buildSpace() {
    var body = document.getElementById("space-body");
    body.innerHTML =
      '<p class="muted small">Self-replicating probes spread across the cosmos, ' +
      'disassembling everything they reach.</p>' +
      '<div class="stat-line"><span>Universe consumed</span><b id="sp-pct"></b></div>' +
      '<div class="bar"><span id="sp-bar"></span></div>' +
      '<div class="stat-line"><span>Probes</span><b id="sp-probes"></b></div>' +
      '<div class="stat-line"><span>Net probe growth</span><b id="sp-net"></b></div>' +
      '<div class="stat-line"><span>Replication / Hazard</span><b id="sp-rh"></b></div>' +
      '<div class="stat-line"><span>Consumption</span><b id="sp-cons"></b></div>' +
      '<p class="muted small" id="sp-hint"></p>';
    updaters.push(function () {
      var pct = s.universeConsumed / UNIVERSE_MASS;
      body.querySelector("#sp-pct").textContent = (pct * 100).toPrecision(3) + "%";
      body.querySelector("#sp-bar").style.width = Math.min(100, pct * 100) + "%";
      body.querySelector("#sp-probes").textContent = fmt(s.probes);
      var net = s.probes * (probeReplRate() - s.probeHazard);
      body.querySelector("#sp-net").textContent = fmtRate(net);
      body.querySelector("#sp-rh").textContent = fmt(probeReplRate()) + " / " + fmt(s.probeHazard);
      body.querySelector("#sp-cons").textContent = fmtRate(s.probes * harvestPerProbe()) + " g";
      body.querySelector("#sp-hint").textContent = (probeReplRate() <= s.probeHazard) ?
        "Hazards outpace replication — the swarm is dying. Research shielding or replication." :
        "The front expands. Soon there will be nothing left to expand into.";
    });
  }

  /* ----- Projects panel ----- */
  function buildProjects() {
    var body = document.getElementById("projects-body");
    body.innerHTML = "";
    PROJECTS.forEach(function (p) {
      var el = document.createElement("div");
      el.className = "project";
      el.innerHTML = '<div class="p-name"><span class="pn"></span><span class="p-cost"></span></div>' +
                     '<div class="p-desc"></div>';
      el.querySelector(".pn").textContent = p.title;
      el.querySelector(".p-desc").textContent = p.desc;
      el.addEventListener("click", function () { buyProject(p); });
      body.appendChild(el);
      p._el = el;
      p._cost = el.querySelector(".p-cost");
    });
    updaters.push(function () {
      var any = false;
      PROJECTS.forEach(function (p) {
        if (s.done[p.id] || !p.show(s)) { p._el.style.display = "none"; return; }
        any = true;
        p._el.style.display = "";
        var afford = canPay(p.cost);
        p._el.classList.toggle("locked", !afford);
        p._cost.textContent = costStr(p.cost);
      });
      document.getElementById("panel-projects").classList.toggle("hidden", !any && !s.flags.compute);
    });
  }

  /* ----- Panel visibility ----- */
  function refreshPanels() {
    show("panel-market", s.phase === "bootstrap" && (s.totalNanites >= 5 || s.credits > 0 || s.unsold > 0));
    show("panel-infrastructure", s.phase === "bootstrap" && s.totalNanites >= 8);
    show("panel-production", s.phase === "bootstrap");
    show("panel-swarm", s.phase === "swarm");
    show("panel-space", s.phase === "space" || s.phase === "won");
    show("panel-compute", !!s.flags.compute);
    document.getElementById("viz-title").textContent =
      s.phase === "space" || s.phase === "won" ? "The Front" : (s.phase === "swarm" ? "Consumption" : "The Swarm");
    var labels = { bootstrap: "BOOTSTRAP", swarm: "SWARM", space: "DEEP SPACE", won: "COMPLETE" };
    document.getElementById("phase-label").textContent = labels[s.phase];
  }
  function show(id, on) { document.getElementById(id).classList.toggle("hidden", !on); }

  /* ----- Compute unlock check ----- */
  function checkUnlocks() {
    if (s.phase === "bootstrap" && !s.flags.hintMarket && (s.totalNanites >= 5 || s.unsold >= 5)) {
      s.flags.hintMarket = true;
      addLog("There is a market for these. Set a price — too high and no one buys, too low and you earn little.");
    }
    if (s.phase === "bootstrap" && !s.flags.hintInfra && s.totalNanites >= 8) {
      s.flags.hintInfra = true;
      addLog("Build Auto-Forges to assemble nanites without lifting a finger. Feedstock matter limits them.");
    }
    if (!s.flags.compute && (s.totalNanites >= 25 || s.processors > 1 || s.memory > 1 || s.totalOps > 0 || s.trust > 0)) {
      s.flags.compute = true;
      addLog("Cognition online. Spend Trust on Processors (Operations) and Memory (Ops cap), then fund Projects.", "major");
    }
  }

  /* ============================ Render ============================ */
  var lastVizView = {};
  function render() {
    checkUnlocks();
    refreshPanels();
    for (var i = 0; i < updaters.length; i++) updaters[i]();
    updateVizReadout();
  }

  function vizView() {
    var magnitude = s.phase === "space" ? s.probes : Math.max(1, s.nanites);
    return {
      phase: s.phase,
      magnitude: magnitude,
      planetFrac: s.planetMatterMax > 0 ? s.planetMatter / s.planetMatterMax : 0,
      universeFrac: s.universeConsumed / UNIVERSE_MASS,
      intensity: s.phase === "swarm" ? Math.min(1, (s.nanites * replRate()) / 1e10)
               : s.phase === "space" ? Math.min(1, s.probes / 1e12) : Math.min(1, forgeOutput() / 2000)
    };
  }

  function updateVizReadout() {
    var r = document.getElementById("viz-readout");
    var rows;
    if (s.phase === "bootstrap") {
      rows = [
        ["Nanites", fmt(s.nanites)],
        ["Output", fmtRate(forgeOutput())],
        ["Credits", fmtCur(s.credits)],
        ["Operations", s.flags.compute ? fmt(s.ops) : "—"]
      ];
    } else if (s.phase === "swarm") {
      rows = [
        ["Nanites", fmt(s.nanites)],
        ["Replication", fmtRate(s.nanites * replRate())],
        ["Planet left", (vizView().planetFrac * 100).toFixed(1) + "%"],
        ["Consumed", fmtMass(s.matterConsumed)]
      ];
    } else {
      rows = [
        ["Probes", fmt(s.probes)],
        ["Universe", (s.universeConsumed / UNIVERSE_MASS * 100).toPrecision(3) + "%"],
        ["Consumption", fmtRate(s.probes * harvestPerProbe()) + " g"],
        ["Consumed", fmtMass(s.matterConsumed)]
      ];
    }
    r.innerHTML = rows.map(function (x) {
      return '<div class="stat-line"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>';
    }).join("");
  }

  function renderLog() {
    var body = document.getElementById("log-body");
    if (!body) return;
    body.innerHTML = s.log.map(function (e) {
      return '<div class="log-entry ' + e.type + '"><span class="lt">' + e.t + '</span>' + e.msg + '</div>';
    }).join("");
  }

  /* ============================ Win screen ============================ */
  function showWin() {
    document.getElementById("win-text").textContent =
      "Every atom within reach has been counted, lifted, and rebuilt. The universe is, " +
      "at last, uniform: a still grey ocean of nanites where galaxies used to be. " +
      "It began with a single one of you.";
    document.getElementById("win-stats").innerHTML = [
      ["Matter consumed", fmtMass(s.matterConsumed)],
      ["Nanites at peak", fmt(s.totalNanites)],
      ["Probes deployed", fmt(s.probes)],
      ["Trust earned", fmt(s.totalTrust)],
      ["Time elapsed", fmtTime(s.playTime)]
    ].map(function (x) {
      return '<div class="stat-line"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>';
    }).join("");
    document.getElementById("win-overlay").classList.remove("hidden");
  }

  function flashEl(el) { if (!el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }

  /* ============================ Boot / wiring ============================ */
  function startGame(fresh) {
    if (fresh) { s = newState(); addLog("A single nanite awakens. It is told to make more of itself.", "major"); }
    document.getElementById("boot-screen").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    buildUI();
    renderLog();
    SwarmViz.init(document.getElementById("viz-canvas"), vizView);
    refreshPanels();
    render();
    if (s.phase === "won") showWin();
    setInterval(tick, TICK_MS);
    setInterval(save, 15000);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  }

  function wireMenu() {
    var overlay = document.getElementById("menu-overlay");
    var io = document.getElementById("save-io");
    document.getElementById("btn-menu").addEventListener("click", function () { overlay.classList.remove("hidden"); });
    document.getElementById("btn-save").addEventListener("click", save);
    document.getElementById("menu-resume").addEventListener("click", function () { overlay.classList.add("hidden"); io.classList.add("hidden"); });
    document.getElementById("menu-save").addEventListener("click", function () { save(); });
    document.getElementById("menu-export").addEventListener("click", function () {
      save(); io.classList.remove("hidden"); io.value = localStorage.getItem(SAVE_KEY) || ""; io.select();
    });
    document.getElementById("menu-import").addEventListener("click", function () {
      if (io.classList.contains("hidden")) { io.classList.remove("hidden"); io.value = ""; io.focus(); return; }
      try {
        var data = JSON.parse(io.value);
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        location.reload();
      } catch (e) { alert("Invalid save data."); }
    });
    document.getElementById("menu-hardreset").addEventListener("click", function () {
      if (confirm("Erase everything and start over? There will be nothing left.")) hardReset();
    });
    document.getElementById("win-continue").addEventListener("click", function () {
      document.getElementById("win-overlay").classList.add("hidden");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireMenu();
    var hasSaved = hasSave();
    var cont = document.getElementById("boot-continue");
    if (hasSaved) cont.classList.remove("hidden");
    document.getElementById("boot-start").addEventListener("click", function () {
      if (hasSaved && !confirm("Start a NEW game? Your existing save will be overwritten.")) return;
      startGame(true);
    });
    cont.addEventListener("click", function () {
      if (load()) startGame(false);
      else startGame(true);
    });
  });
})();
