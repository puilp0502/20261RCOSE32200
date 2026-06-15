/* Mock-DOM smoke test for GRAY HORIZON.
 * Loads the real browser scripts under a stub DOM and runs the game through
 * every phase, asserting nothing throws. Run: node test/smoke.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const idRegistry = {};
function reg(id) { return idRegistry[id] || (idRegistry[id] = new El(id)); }

class ClassList {
  constructor() { this.set = new Set(); }
  add() { for (const a of arguments) this.set.add(a); }
  remove() { for (const a of arguments) this.set.delete(a); }
  toggle(c, on) { if (on === undefined) on = !this.set.has(c); on ? this.set.add(c) : this.set.delete(c); return on; }
  contains(c) { return this.set.has(c); }
}
class El {
  constructor(id) {
    this.id = id || "";
    this.classList = new ClassList();
    this.style = {};
    this.children = [];
    this._html = "";
    this._text = "";
    this.value = "";
    this.disabled = false;
    this._listeners = {};
    this._qsCache = {};
    this.offsetWidth = 0;
  }
  set innerHTML(v) {
    this._html = String(v);
    // Register any ids declared in the markup so getElementById finds them.
    const re = /id="([^"]+)"/g; let m;
    while ((m = re.exec(this._html))) reg(m[1]);
  }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  removeEventListener() {}
  dispatch(ev) { (this._listeners[ev] || []).forEach(fn => fn({})); }
  querySelector(sel) {
    if (sel && sel[0] === "#") return reg(sel.slice(1));
    if (this._qsCache[sel]) return this._qsCache[sel];
    return (this._qsCache[sel] = new El());
  }
  querySelectorAll() { return []; }
  getContext() { return ctx2d; }
  select() {}
  focus() {}
}

const ctx2d = new Proxy({}, {
  get(_t, p) {
    if (p === "createRadialGradient" || p === "createLinearGradient")
      return () => ({ addColorStop() {} });
    if (typeof p === "string") return () => {};
    return () => {};
  },
  set() { return true; }
});

// Controllable clock so tick() sees real elapsed time.
const RealDate = Date;
let fakeNow = 1.7e12;
function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(fakeNow); }
FakeDate.now = () => fakeNow;

let intervalCbs = [];
const documentEl = {
  _ls: [],
  getElementById: (id) => reg(id),
  querySelector: (sel) => (sel && sel[0] === "#") ? reg(sel.slice(1)) : new El(),
  createElement: () => new El(),
  addEventListener(ev, fn) { (this._ls = this._ls || []); this._ls.push([ev, fn]); documentEl._handlers = documentEl._handlers || {}; (documentEl._handlers[ev] = documentEl._handlers[ev] || []).push(fn); },
  hidden: false,
  activeElement: null
};

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
})();

const sandbox = {
  window: {}, document: documentEl, localStorage: localStorageMock,
  requestAnimationFrame: () => 0,         // don't actually animate
  setInterval: (fn) => { intervalCbs.push(fn); return intervalCbs.length; },
  clearInterval: () => {},
  setTimeout: () => 0,
  console, Math, Date: FakeDate, JSON, isNaN, isFinite, parseInt, parseFloat,
  alert: () => {}, confirm: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  Set, Object, Array, String, Number
};
sandbox.window = sandbox;       // window === global
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function loadScript(rel) {
  const code = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  vm.runInContext(code, sandbox, { filename: rel });
}

["js/format.js", "js/projects.js", "js/swarm.js", "js/game.js"].forEach(loadScript);

// Fire DOMContentLoaded so the game wires up.
(documentEl._handlers.DOMContentLoaded || []).forEach(fn => fn({}));

// Click "INITIALIZE" to start a fresh game.
reg("boot-start").dispatch("click");

const G = sandbox.window.G;
if (!G) throw new Error("G not exposed");
console.log("Game started. phase =", G.state.phase);

// Drive the loop manually. intervalCbs[0] is tick (100ms), [1] is save.
const tick = intervalCbs[0];
function runTicks(n) { for (let i = 0; i < n; i++) { fakeNow += 200; tick(); } }

// Helper: force-advance via direct state pokes + projects to exercise all phases.
const s = G.state;

// 1) Bootstrap: run some ticks with manual production.
for (let i = 0; i < 50; i++) { s.matter += 50; s.unsold += 50; s.nanites += 50; s.totalNanites += 50; fakeNow += 200; tick(); }
console.log("After bootstrap ticks: nanites=", s.nanites.toExponential(2), "ops=", s.ops.toFixed(0), "phase=", s.phase);

// 2) Trigger the swarm switch.
s.totalNanites = 1e6; s.nanites = 1e6; s.ops = 5000; s.creativity = 100; s.done.litho1 = true; s.done.litho2 = true; s.flags.creativity = true;
G.beginSwarm();
runTicks(30);
console.log("Swarm running: planetFrac=", (s.planetMatter / s.planetMatterMax).toFixed(3), "nanites=", s.nanites.toExponential(2));

// 3) Consume planet, go to space.
s.planetMatter = 0;
G.beginSpace();
runTicks(30);
console.log("Space running: probes=", s.probes.toExponential(2), "universe%=", (s.universeConsumed / 1e53 * 100).toExponential(2));

// 4) Force win.
s.mult.probeRepl = 100; s.mult.harvest = 100; s.probes = 1e20;
let guard = 0;
while (s.phase !== "won" && guard++ < 2000) { fakeNow += 400; tick(); }
console.log("Final phase:", s.phase, "(guard", guard + ")");

// 5) Exercise save/load + render once more.
intervalCbs[1]();   // save
reg("btn-menu").dispatch("click");
reg("win-continue").dispatch("click");

if (s.phase !== "won") { console.error("FAILED: did not reach won state"); process.exit(1); }
console.log("\nSMOKE TEST PASSED — no exceptions across all phases.");
