/*!
 * FormGuard v1.1.0 — stateless, client-side spam guard for plain HTML forms.
 * Honeypot + time trap + interaction gate + canvas arithmetic captcha
 * + obfuscated form action (never present in the HTML).
 * No server, no cookies, no third-party calls. MIT License.
 */
(function (root) {
  "use strict";

  var DEFAULTS = {
    minTime: 3000,        // ms the form must exist before a submit is believed
    minInteractions: 2,   // pointer/key/scroll/focus events before a submit is believed
    maxTries: 4,          // wrong captcha answers before the form locks
    silent: true,         // bots get the success UI instead of an error
    captcha: true,        // render the canvas captcha
    honeypot: "website",  // honeypot field name ("" to disable)
    success: "",          // CSS selector to show on success
    hide: "",             // CSS selector to hide on success (default: the form)
    reset: true,          // clear the form after submit
    label: "Solve the sum",
    errWrong: "That answer isn't right. Try the new one.",
    errLocked: "Too many attempts. Reload the page to try again."
  };

  // ---------- codec: reverse -> XOR(key) -> base64 (UTF-8 safe) ----------
  function utf8Bytes(s) {
    return typeof TextEncoder !== "undefined"
      ? Array.from(new TextEncoder().encode(s))
      : unescape(encodeURIComponent(s)).split("").map(function (c) { return c.charCodeAt(0); });
  }
  function bytesToUtf8(b) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(new Uint8Array(b));
    return decodeURIComponent(escape(String.fromCharCode.apply(null, b)));
  }
  function xor(bytes, key) {
    var k = utf8Bytes(key);
    return bytes.map(function (v, i) { return v ^ k[i % k.length]; });
  }
  function encode(url, key) {
    if (!key) throw new Error("FormGuard.encode: key required");
    var rev = Array.from(url).reverse().join("");
    var bin = xor(utf8Bytes(rev), key).map(function (c) { return String.fromCharCode(c); }).join("");
    return btoa(bin);
  }
  function decode(enc, key) {
    var bin = atob(enc), bytes = [];
    for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
    return Array.from(bytesToUtf8(xor(bytes, key))).reverse().join("");
  }

  // ---------- styles (injected once, overridable via .fg-* classes) ----------
  var CSS =
    ".fg-hp{position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important}" +
    ".fg-cap{display:flex;align-items:center;gap:8px;margin:8px 0 2px;flex-wrap:wrap}" +
    ".fg-cap canvas{border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;vertical-align:middle}" +
    ".fg-cap input{width:4.5em}" +
    ".fg-cap button{font-size:12px;cursor:pointer}" +
    ".fg-hint{display:block;font-size:12px;color:#666}" +
    ".fg-err{color:#b00020;font-size:13px;min-height:1em;margin-top:4px}";
  function injectCss() {
    if (document.getElementById("fg-style")) return;
    var s = document.createElement("style");
    s.id = "fg-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- global human-interaction counter (shared by all forms) ----------
  var interactions = 0;
  if (typeof document !== "undefined") {
    ["pointermove", "pointerdown", "touchstart", "keydown", "scroll", "focusin", "input"].forEach(function (ev) {
      document.addEventListener(ev, function () { interactions++; }, { passive: true, capture: true });
    });
  }

  function rnd(n) { return Math.floor(Math.random() * n); }

  function readOpts(form, opts) {
    var o = {}, k, d = form.dataset;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    var map = {
      minTime: "fgMinTime", minInteractions: "fgMinInteractions", maxTries: "fgMaxTries",
      silent: "fgSilent", captcha: "fgCaptcha", honeypot: "fgHoneypot",
      success: "fgSuccess", hide: "fgHide", reset: "fgReset", label: "fgLabel"
    };
    for (k in map) {
      if (d[map[k]] === undefined) continue;
      var v = d[map[k]];
      if (typeof DEFAULTS[k] === "number") v = parseInt(v, 10);
      else if (typeof DEFAULTS[k] === "boolean") v = v !== "false" && v !== "0";
      o[k] = v;
    }
    if (opts) for (k in opts) o[k] = opts[k];
    return o;
  }

  // ---------- per-form guard ----------
  function guard(form, opts) {
    if (form.__fg) return form.__fg;
    var o = readOpts(form, opts);
    var encAction = o.action || form.dataset.fgAction;
    var key = o.key || form.dataset.fgKey;
    var plainAction = o.plainAction || form.dataset.fgPlainAction;
    if (!encAction && !plainAction) {
      console.warn("FormGuard: form has no data-fg-action / data-fg-plain-action", form);
    }
    // Neutralise any action left in markup so a no-JS bot posts nowhere useful.
    form.removeAttribute("action");
    if (!form.getAttribute("method")) form.setAttribute("method", "post");

    injectCss();
    var bornAt = Date.now(), tries = 0, answer = null, sent = false, cv, ans, err;

    // Honeypot
    var hp = null;
    if (o.honeypot) {
      var wrap = document.createElement("div");
      wrap.className = "fg-hp";
      wrap.setAttribute("aria-hidden", "true");
      hp = document.createElement("input");
      hp.type = "text"; hp.name = o.honeypot; hp.tabIndex = -1; hp.autocomplete = "off";
      var hpl = document.createElement("label");
      hpl.textContent = "Leave this empty";
      hpl.appendChild(hp);
      wrap.appendChild(hpl);
      form.insertBefore(wrap, form.firstChild);
    }

    // Error line
    err = form.querySelector("[data-fg-error]");
    if (!err) {
      err = document.createElement("div");
      err.className = "fg-err";
      err.setAttribute("role", "alert");
      err.setAttribute("aria-live", "polite");
    }

    // Captcha
    function draw() {
      var a = 2 + rnd(18), b = 1 + rnd(9), plus = Math.random() > 0.35;
      var txt = plus ? a + " + " + b : (a + b) + " - " + b;
      answer = plus ? a + b : a;
      ans.value = "";
      var c = null, w = cv.width, h = cv.height, i;
      try { c = cv.getContext("2d"); } catch (e) {}
      if (!c) { // no canvas support: degrade to a plain-text puzzle
        cv.style.display = "none";
        fallback.textContent = txt;
        fallback.style.display = "";
        return;
      }
      c.clearRect(0, 0, w, h);
      for (i = 0; i < 6; i++) {
        c.strokeStyle = "hsl(" + rnd(360) + ",50%,70%)";
        c.lineWidth = 1 + Math.random();
        c.beginPath(); c.moveTo(rnd(w), rnd(h));
        c.bezierCurveTo(rnd(w), rnd(h), rnd(w), rnd(h), rnd(w), rnd(h));
        c.stroke();
      }
      for (i = 0; i < 45; i++) {
        c.fillStyle = "rgba(0,0,0," + (Math.random() * 0.3) + ")";
        c.fillRect(rnd(w), rnd(h), 1.5, 1.5);
      }
      var x = 8;
      for (i = 0; i < txt.length; i++) {
        var ch = txt[i];
        if (ch === " ") { x += 6; continue; }
        c.save();
        c.translate(x, 26 + (Math.random() * 6 - 3));
        c.rotate((Math.random() - 0.5) * 0.6);
        c.font = "bold " + (18 + rnd(5)) + "px Georgia, serif";
        c.fillStyle = "hsl(" + rnd(360) + ",60%,30%)";
        c.fillText(ch, 0, 0);
        c.restore();
        x += 14;
      }
    }
    var fallback = null;

    if (o.captcha) {
      var box = form.querySelector("[data-fg-captcha]") || document.createElement("div");
      box.classList.add("fg-cap");
      cv = document.createElement("canvas");
      cv.width = 130; cv.height = 40;
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", "Arithmetic puzzle. Click for a new one.");
      cv.title = "Click for a new puzzle";
      ans = document.createElement("input");
      ans.type = "text"; ans.inputMode = "numeric"; ans.autocomplete = "off";
      ans.placeholder = "?"; ans.setAttribute("aria-label", "Answer to the sum");
      // no name attribute -> never submitted
      fallback = document.createElement("strong");
      fallback.className = "fg-text"; fallback.style.display = "none";
      var eq = document.createElement("span"); eq.textContent = "=";
      var re = document.createElement("button");
      re.type = "button"; re.textContent = "↻"; re.setAttribute("aria-label", "New puzzle");
      var hint = document.createElement("small");
      hint.className = "fg-hint"; hint.textContent = o.label;
      box.appendChild(cv); box.appendChild(fallback); box.appendChild(eq); box.appendChild(ans); box.appendChild(re); box.appendChild(hint);
      if (!box.parentNode) {
        var submitBtn = form.querySelector('[type="submit"], button:not([type])');
        if (submitBtn) submitBtn.parentNode.insertBefore(box, submitBtn);
        else form.appendChild(box);
      }
      cv.addEventListener("click", draw);
      re.addEventListener("click", draw);
      // Draw only when visible: scrapers that never scroll get a blank canvas.
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es, ob) {
          if (es[0].isIntersecting) { draw(); ob.disconnect(); }
        }).observe(cv);
      } else draw();
    }
    if (!err.parentNode) form.appendChild(err);

    function fail(m) { err.textContent = m || ""; }
    function emit(name, detail) {
      try { form.dispatchEvent(new CustomEvent("formguard:" + name, { detail: detail || {}, bubbles: true })); } catch (e) {}
    }
    function showDone() {
      sent = true;
      var hideEl = o.hide ? document.querySelector(o.hide) : (o.success ? form : null);
      if (hideEl) hideEl.style.display = "none";
      if (o.success) {
        var s = document.querySelector(o.success);
        if (s) s.style.display = "";
        if (s && getComputedStyle(s).display === "none") s.style.display = "block";
      }
    }
    function block(reason) {
      emit("blocked", { reason: reason });
      if (o.silent) showDone(); else fail("Submission blocked.");
    }

    function realSubmit() {
      var url = plainAction || decode(encAction, key);
      // Strip guard-only fields so the backend gets exactly the original payload.
      var stash = [];
      form.querySelectorAll(".fg-hp, .fg-cap").forEach(function (el) {
        stash.push([el, el.parentNode, el.nextSibling]); el.parentNode.removeChild(el);
      });
      form.setAttribute("action", url);
      HTMLFormElement.prototype.submit.call(form); // native submit: no event, no recursion
      form.removeAttribute("action");
      stash.forEach(function (s) { s[1].insertBefore(s[0], s[2]); });
      emit("pass");
      if (o.reset) setTimeout(function () { form.reset(); }, 50);
      showDone();
    }

    function onSubmit(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (sent) return;
      fail("");
      if (hp && hp.value) return block("honeypot");
      if (Date.now() - bornAt < o.minTime) return block("too-fast");
      if (interactions < o.minInteractions) return block("no-interaction");
      if (navigator.webdriver) return block("webdriver");
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (o.captcha) {
        if (answer === null) { draw(); return fail(o.label); }
        if (parseInt(ans.value, 10) !== answer) {
          if (++tries >= o.maxTries) {
            form.querySelectorAll("[type=submit],button").forEach(function (b) { b.disabled = true; });
            emit("locked");
            return fail(o.errLocked);
          }
          draw();
          ans.focus();
          return fail(o.errWrong);
        }
      }
      realSubmit();
    }
    form.addEventListener("submit", onSubmit, true);

    var api = { form: form, refresh: function () { if (o.captcha) draw(); }, options: o };
    form.__fg = api;
    return api;
  }

  function init(selectorOrEl, opts) {
    if (!selectorOrEl) selectorOrEl = "form[data-formguard]";
    if (selectorOrEl.nodeType === 1) return guard(selectorOrEl, opts);
    return Array.prototype.map.call(document.querySelectorAll(selectorOrEl), function (f) { return guard(f, opts); });
  }

  var FormGuard = { init: init, encode: encode, decode: decode, version: "1.1.0" };

  if (typeof module === "object" && module.exports) module.exports = FormGuard;
  if (root && root.document) {
    root.FormGuard = FormGuard;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
    else init();
  }
})(typeof window !== "undefined" ? window : this);
