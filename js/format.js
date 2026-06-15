/* format.js — number formatting helpers for GRAY HORIZON */
(function (global) {
  "use strict";

  // Short suffixes for the human-scale range.
  var SUFFIXES = [
    "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc",
    "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"
  ];

  /**
   * Format a number compactly. Small numbers show decimals; large numbers use
   * short suffixes; astronomically large numbers fall back to scientific.
   */
  function fmt(n, opts) {
    opts = opts || {};
    if (n === Infinity) return "∞";
    if (n === null || n === undefined || isNaN(n)) return "0";
    var neg = n < 0;
    n = Math.abs(n);

    var out;
    if (n < 1000) {
      if (n === 0) out = "0";
      else if (n < 1 && !opts.int) out = trimDec(n, n < 0.01 ? 3 : 2);
      else if (n < 10 && !opts.int) out = trimDec(n, 1);
      else out = String(Math.floor(n));
    } else {
      var tier = Math.floor(Math.log10(n) / 3);
      if (tier < SUFFIXES.length) {
        var scaled = n / Math.pow(10, tier * 3);
        out = trimDec(scaled, scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIXES[tier];
      } else {
        // Scientific notation for huge magnitudes.
        var exp = Math.floor(Math.log10(n));
        var mant = n / Math.pow(10, exp);
        out = trimDec(mant, 2) + "e" + exp;
      }
    }
    return (neg ? "-" : "") + out;
  }

  // Format a per-second rate.
  function fmtRate(n) {
    if (!isFinite(n)) return "∞/s";
    if (n === 0) return "0/s";
    if (Math.abs(n) < 1 && Math.abs(n) > 0) return trimDec(n, 2) + "/s";
    return fmt(n) + "/s";
  }

  // Format currency.
  function fmtCur(n) {
    return "$" + fmt(n);
  }

  // Format a mass in grams up into cosmic units.
  function fmtMass(g) {
    return fmt(g) + " g";
  }

  function trimDec(n, places) {
    var s = n.toFixed(places);
    if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
    return s;
  }

  // Format seconds into a friendly duration.
  function fmtTime(sec) {
    if (!isFinite(sec)) return "∞";
    if (sec < 1) return "<1s";
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + s + "s";
    return s + "s";
  }

  global.NF = { fmt: fmt, fmtRate: fmtRate, fmtCur: fmtCur, fmtMass: fmtMass, fmtTime: fmtTime };
})(window);
