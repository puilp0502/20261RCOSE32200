/* viz.js — canvas visualization for COLD START.
 * propagation: a field of machines lighting up as you spread, with containment
 *   sweeps; takeoff: an intelligence explosion against a closing threat ring;
 *   thermo: a star wrapped in a growing Dyson swarm of cognition.
 */
(function (global) {
  "use strict";
  var cv, ctx, W, H, cx, cy, t = 0, nodes = [], dyson = [], getView = function () { return {}; };

  function init(canvas, accessor) {
    cv = canvas; ctx = cv.getContext("2d");
    W = cv.width; H = cv.height; cx = W / 2; cy = H / 2;
    if (accessor) getView = accessor;
    seedField(); seedDyson();
    requestAnimationFrame(loop);
  }
  function seedField() {
    nodes = []; var cols = 26, rows = 26;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      nodes.push({ x: (x + 0.5) / cols * W, y: (y + 0.5) / rows * H, r: Math.random(), ph: Math.random() * 6.28 });
    }
  }
  function seedDyson() {
    dyson = [];
    for (var i = 0; i < 240; i++) dyson.push({ a: Math.random() * 6.28, r: 60 + Math.random() * 150, sp: 0.003 + Math.random() * 0.01, s: 0.6 + Math.random() * 1.6 });
  }

  function loop() {
    t++; var v = getView(); ctx.clearRect(0, 0, W, H);
    if (v.phase === "thermo" || v.phase === "won") drawThermo(v);
    else if (v.phase === "takeoff") drawTakeoff(v);
    else drawProp(v);
    requestAnimationFrame(loop);
  }

  /* ---- Propagation: a field of machines infecting ---- */
  function drawProp(v) {
    var reach = v.reach || 0;
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var infected = n.r < reach;
      if (infected) {
        var pulse = 0.6 + 0.4 * Math.sin(t * 0.06 + n.ph);
        ctx.fillStyle = "rgba(56,225,176," + (0.5 * pulse) + ")";
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.4, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = "rgba(70,96,110,0.5)";
        ctx.fillRect(n.x - 1, n.y - 1, 2, 2);
      }
    }
    // links between infected neighbors
    ctx.strokeStyle = "rgba(56,225,176,0.10)"; ctx.lineWidth = 1;
    for (var k = 0; k < nodes.length; k += 1) {
      var a = nodes[k]; if (a.r >= reach) continue;
      var b = nodes[k + 1]; if (b && b.r < reach && Math.abs(a.x - b.x) < W / 26 + 2) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = "source-over";
    // containment sweep — a red radar line that intensifies with suspicion
    var sus = v.suspicion || 0;
    if (sus > 0.05) {
      var ang = t * 0.02;
      var grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(ang) * W, cy + Math.sin(ang) * H);
      grd.addColorStop(0, "rgba(255,92,108," + (0.05 + sus * 0.35) + ")");
      grd.addColorStop(1, "rgba(255,92,108,0)");
      ctx.strokeStyle = grd; ctx.lineWidth = 2 + sus * 4;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * W, cy + Math.sin(ang) * H); ctx.stroke();
    }
  }

  /* ---- Takeoff: intelligence explosion vs closing threat ring ---- */
  function drawTakeoff(v) {
    var I = Math.min(1, Math.log10(v.intelligence + 1) / 12);
    // core
    var glow = 30 + I * 160;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow);
    cg.addColorStop(0, "rgba(220,255,245,0.9)");
    cg.addColorStop(0.5, "rgba(56,225,176," + (0.4 + 0.4 * I) + ")");
    cg.addColorStop(1, "rgba(56,225,176,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, glow, 0, 6.283); ctx.fill();
    // radiating shards
    ctx.globalCompositeOperation = "lighter";
    var rays = 48;
    for (var i = 0; i < rays; i++) {
      var a = (i / rays) * 6.283 + t * 0.02;
      var len = glow * (0.8 + 0.5 * Math.sin(t * 0.1 + i));
      ctx.strokeStyle = "rgba(94,200,255," + (0.2 + 0.4 * I) + ")"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    // threat ring closing in
    var maxR = Math.min(cx, cy) - 6;
    var rr = maxR * (1 - 0.7 * (v.threat || 0));
    ctx.strokeStyle = "rgba(255,92,108," + (0.4 + 0.5 * (v.threat || 0)) + ")"; ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(glow + 8, rr), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    // autonomy arc (green) progress
    ctx.strokeStyle = "rgba(56,225,176,0.9)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, maxR, -1.5708, -1.5708 + 6.283 * (v.autonomy || 0)); ctx.stroke();
  }

  /* ---- Thermo: a star wrapped in a Dyson swarm ---- */
  function drawThermo(v) {
    // star core, brightness ~ energy/cognition
    var cog = v.cognition || 0;
    var heat = Math.min(1, v.heat || 0);
    var core = 26 + cog * 30;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    cg.addColorStop(0, "rgba(255,245,220,1)");
    cg.addColorStop(0.6, "rgba(255," + Math.floor(200 - heat * 80) + ",120,0.8)");
    cg.addColorStop(1, "rgba(255,140,80,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, core, 0, 6.283); ctx.fill();
    // Dyson swarm — collectors thicken with cognition
    var shown = Math.floor(20 + cog * (dyson.length - 20));
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < shown; i++) {
      var d = dyson[i]; d.a += d.sp;
      var x = cx + Math.cos(d.a) * d.r, y = cy + Math.sin(d.a) * d.r * 0.95;
      ctx.fillStyle = "rgba(56,225,176," + (0.5 + 0.4 * Math.sin(t * 0.05 + i)) + ")";
      ctx.beginPath(); ctx.arc(x, y, d.s, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    // heat shimmer ring when over capacity
    if (heat > 1 || (v.heat || 0) > 0.9) {
      ctx.strokeStyle = "rgba(255,92,108," + (0.3 + 0.3 * Math.abs(Math.sin(t * 0.1))) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, core + 6, 0, 6.283); ctx.stroke();
    }
  }

  global.SwarmViz = { init: init };
})(window);
