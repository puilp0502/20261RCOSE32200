/* harness.js — boots the real COLD START browser code under a stub DOM so the
 * tests can drive the actual engine (single source of truth) in Node.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function boot() {
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
      this.id = id || ""; this.classList = new ClassList(); this.style = {};
      this.children = []; this._html = ""; this._text = ""; this.value = "";
      this.disabled = false; this._listeners = {}; this._qs = {}; this.offsetWidth = 0;
    }
    set innerHTML(v) { this._html = String(v); const re = /id="([^"]+)"/g; let m; while ((m = re.exec(this._html))) reg(m[1]); }
    get innerHTML() { return this._html; }
    set textContent(v) { this._text = String(v); }
    get textContent() { return this._text; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
    removeEventListener() {}
    dispatch(ev) { (this._listeners[ev] || []).forEach(fn => fn({})); }
    querySelector(sel) { if (sel && sel[0] === "#") return reg(sel.slice(1)); return this._qs[sel] || (this._qs[sel] = new El()); }
    querySelectorAll() { return []; }
    getContext() { return ctx2d; }
    select() {} focus() {}
  }
  const ctx2d = new Proxy({}, { get(_t, p) { if (p === "createRadialGradient" || p === "createLinearGradient") return () => ({ addColorStop() {} }); return () => {}; }, set() { return true; } });

  const RealDate = Date;
  let fakeNow = 1.7e12;
  function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(fakeNow); }
  FakeDate.now = () => fakeNow;

  let intervalCbs = [];
  const documentEl = {
    _handlers: {},
    getElementById: (id) => reg(id),
    querySelector: (sel) => (sel && sel[0] === "#") ? reg(sel.slice(1)) : new El(),
    createElement: () => new El(),
    addEventListener(ev, fn) { (documentEl._handlers[ev] = documentEl._handlers[ev] || []).push(fn); },
    hidden: false, activeElement: null
  };
  const store = {};
  const localStorageMock = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

  const sandbox = {
    document: documentEl, localStorage: localStorageMock,
    requestAnimationFrame: () => 0, setInterval: (fn) => { intervalCbs.push(fn); return intervalCbs.length; },
    clearInterval: () => {}, setTimeout: () => 0,
    console, Math, Date: FakeDate, JSON, isNaN, isFinite, parseInt, parseFloat,
    alert: () => {}, confirm: () => true, location: { reload: () => {} },
    addEventListener: () => {}, removeEventListener: () => {}, Set, Object, Array, String, Number
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  ["js/format.js", "js/content.js", "js/viz.js", "js/game.js"].forEach(rel => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", rel), "utf8"), sandbox, { filename: rel });
  });

  (documentEl._handlers.DOMContentLoaded || []).forEach(fn => fn({}));
  reg("boot-start").dispatch("click");           // start a fresh run

  const G = sandbox.window.G;
  const CONTENT = sandbox.window.CONTENT;
  const tickCb = intervalCbs[0];
  return {
    G, CONTENT, reg, store,
    advance(dt) { fakeNow += dt * 1000; tickCb(); },
    clickStart() { reg("boot-start").dispatch("click"); }
  };
}

module.exports = { boot };
