/* swarm.js — canvas visualization for GRAY HORIZON.
 * Renders the nanite swarm, the dying planet, and the consumption of the cosmos.
 * It reads a small view-model via a bound accessor so it stays decoupled from
 * the game logic.
 */
(function (global) {
  "use strict";

  var canvas, ctx, W, H, cx, cy;
  var getView = function () { return { phase: "bootstrap", magnitude: 0, planetFrac: 1, universeFrac: 0, intensity: 0 }; };
  var particles = [];
  var stars = [];
  var t = 0;
  var MAXP = 520;

  function init(cv, accessor) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    W = canvas.width; H = canvas.height; cx = W / 2; cy = H / 2;
    if (accessor) getView = accessor;
    seedStars();
    requestAnimationFrame(loop);
  }

  function seedStars() {
    stars = [];
    for (var i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.3 + 0.2,
        tw: Math.random() * Math.PI * 2
      });
    }
  }

  function ensureParticles(n) {
    n = Math.max(0, Math.min(MAXP, Math.floor(n)));
    while (particles.length < n) {
      particles.push({
        a: Math.random() * Math.PI * 2,
        r: 30 + Math.random() * 150,
        speed: 0.002 + Math.random() * 0.01,
        wob: Math.random() * Math.PI * 2,
        size: 0.8 + Math.random() * 1.8
      });
    }
    if (particles.length > n) particles.length = n;
  }

  // Map a raw magnitude (e.g. nanite count) to a 0..1 "fullness" via log scale.
  function logScale(v, max) {
    if (v <= 1) return 0;
    return Math.min(1, Math.log10(v) / max);
  }

  function loop() {
    t += 1;
    var v = getView();
    ctx.clearRect(0, 0, W, H);

    if (v.phase === "space" || v.phase === "won") drawSpace(v);
    else drawSwarm(v);

    requestAnimationFrame(loop);
  }

  /* ---------- Bootstrap & Swarm: a glowing cluster + the planet ---------- */
  function drawSwarm(v) {
    var fullness = logScale(v.magnitude, v.phase === "swarm" ? 34 : 6);
    var pcount = 12 + fullness * (MAXP - 12);
    ensureParticles(pcount);

    // Planet (only meaningful in swarm phase, but draw a faint seed-world earlier).
    var planetR;
    if (v.phase === "swarm") {
      planetR = 150 * Math.sqrt(Math.max(0, v.planetFrac));
      if (planetR > 1) {
        var grd = ctx.createRadialGradient(cx - planetR * 0.3, cy - planetR * 0.3, planetR * 0.2, cx, cy, planetR);
        grd.addColorStop(0, "#3a4a52");
        grd.addColorStop(0.7, "#222c33");
        grd.addColorStop(1, "#0c1418");
        ctx.beginPath();
        ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        // eaten shimmer at the edge
        ctx.strokeStyle = "rgba(56,225,176," + (0.2 + 0.3 * Math.abs(Math.sin(t * 0.05))) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      // faint core "seed"
      planetR = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56,225,176,0.10)";
      ctx.fill();
    }

    // Core glow scaling with intensity.
    var coreGlow = 18 + fullness * 60;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlow);
    var hot = Math.min(1, v.intensity);
    cg.addColorStop(0, "rgba(" + Math.floor(120 + 135 * hot) + ",255," + Math.floor(220) + ",0.5)");
    cg.addColorStop(1, "rgba(56,225,176,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreGlow, 0, Math.PI * 2);
    ctx.fill();

    // Particles swirl; tighter when fuller, color shifts blue->green->white.
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.a += p.speed * (1 + fullness * 2);
      p.wob += 0.03;
      var baseR = (v.phase === "swarm" ? Math.max(planetR + 6, 40) : 30);
      var rr = baseR + p.r * (0.4 + 0.6 * (1 - fullness * 0.4)) + Math.sin(p.wob) * 6;
      var x = cx + Math.cos(p.a) * rr;
      var y = cy + Math.sin(p.a) * rr * 0.92;
      var c = particleColor(fullness);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function particleColor(f) {
    // blue (cold/few) -> green -> near white (vast)
    if (f < 0.5) {
      var k = f / 0.5;
      return "rgba(" + Math.floor(94 + (56 - 94) * k) + "," + Math.floor(200 + (225 - 200) * k) + "," + Math.floor(255 + (176 - 255) * k) + ",0.85)";
    }
    var k2 = (f - 0.5) / 0.5;
    return "rgba(" + Math.floor(56 + 199 * k2) + ",255," + Math.floor(176 + 79 * k2) + ",0.9)";
  }

  /* ---------- Space: starfield + expanding consumption front ---------- */
  function drawSpace(v) {
    // starfield
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.tw += 0.05;
      var br = 0.4 + 0.4 * Math.sin(s.tw);
      ctx.fillStyle = "rgba(200,220,255," + br + ")";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    var maxR = Math.sqrt(cx * cx + cy * cy);
    var frac = Math.min(1, v.universeFrac);
    var r = maxR * Math.pow(frac, 0.5);

    // consumed region: a dark, shimmering void with a bright eating front
    if (r > 1) {
      var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, "rgba(10,16,20,0.9)");
      grd.addColorStop(0.8, "rgba(20,40,40,0.6)");
      grd.addColorStop(1, "rgba(56,225,176,0.0)");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // bright pulsing consumption front
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(56,225,176," + (0.5 + 0.4 * Math.abs(Math.sin(t * 0.06))) + ")";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // probe sparks racing along the front
      ctx.globalCompositeOperation = "lighter";
      var sparks = 60;
      for (var j = 0; j < sparks; j++) {
        var ang = (j / sparks) * Math.PI * 2 + t * 0.01;
        var rr = r * (0.92 + 0.08 * Math.sin(t * 0.1 + j));
        var x = cx + Math.cos(ang) * rr;
        var y = cy + Math.sin(ang) * rr;
        ctx.fillStyle = "rgba(180,255,230,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // central core
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    cg.addColorStop(0, "rgba(220,255,245,0.9)");
    cg.addColorStop(1, "rgba(56,225,176,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  global.SwarmViz = { init: init };
})(window);
