"use client";
import { jsx, jsxs } from "react/jsx-runtime";
/*!
 * FormGuard Lite — React adapter v1.1.0 (MIT)
 * Same guard as formguard.js (honeypot, time trap, interaction gate, canvas
 * captcha, obfuscated action) implemented natively in React, so it never
 * mutates React-owned DOM. Self-contained: copy this one file, or import
 * from "formguard-lite/react". Requires React 17+. SSR-safe.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
const te = (s) => Array.from(new TextEncoder().encode(s));
const xor = (bytes, key) => {
  const k = te(key);
  return bytes.map((v, i) => v ^ k[i % k.length]);
};
function encode(url, key) {
  if (!key) throw new Error("FormGuard.encode: key required");
  const rev = Array.from(url).reverse().join("");
  return btoa(xor(te(rev), key).map((c) => String.fromCharCode(c)).join(""));
}
function decode(enc, key) {
  const bin = atob(enc);
  const bytes = Array.from(bin, (c) => c.charCodeAt(0));
  return Array.from(new TextDecoder().decode(new Uint8Array(xor(bytes, key)))).reverse().join("");
}
let interactions = 0;
let listening = false;
function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  ["pointermove", "pointerdown", "touchstart", "keydown", "scroll", "focusin", "input"].forEach(
    (ev) => document.addEventListener(ev, () => {
      interactions++;
    }, { passive: true, capture: true })
  );
}
if (typeof document !== "undefined") listen();
const rnd = (n) => Math.floor(Math.random() * n);
function makePuzzle() {
  const a = 2 + rnd(18), b = 1 + rnd(9), plus = Math.random() > 0.35;
  return plus ? { text: `${a} + ${b}`, answer: a + b } : { text: `${a + b} - ${b}`, answer: a };
}
function paint(cv, txt) {
  let c = null;
  try {
    c = cv.getContext("2d");
  } catch (e) {
  }
  if (!c) return false;
  const w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    c.strokeStyle = `hsl(${rnd(360)},50%,70%)`;
    c.lineWidth = 1 + Math.random();
    c.beginPath();
    c.moveTo(rnd(w), rnd(h));
    c.bezierCurveTo(rnd(w), rnd(h), rnd(w), rnd(h), rnd(w), rnd(h));
    c.stroke();
  }
  for (let i = 0; i < 45; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
    c.fillRect(rnd(w), rnd(h), 1.5, 1.5);
  }
  let x = 8;
  for (const ch of txt) {
    if (ch === " ") {
      x += 6;
      continue;
    }
    c.save();
    c.translate(x, 26 + (Math.random() * 6 - 3));
    c.rotate((Math.random() - 0.5) * 0.6);
    c.font = `bold ${18 + rnd(5)}px Georgia, serif`;
    c.fillStyle = `hsl(${rnd(360)},60%,30%)`;
    c.fillText(ch, 0, 0);
    c.restore();
    x += 14;
  }
  return true;
}
const DEFAULTS = {
  minTime: 3e3,
  minInteractions: 2,
  maxTries: 4,
  captcha: true,
  honeypot: "website",
  label: "Solve the sum",
  errWrong: "That answer isn't right. Try the new one.",
  errLocked: "Too many attempts. Reload the page to try again."
};
function useFormGuard(options) {
  const o = { ...DEFAULTS, ...options };
  const bornAt = useRef(0);
  const answerRef = useRef(null);
  const canvasRef = useRef(null);
  const honeypotRef = useRef(null);
  const mounted = useRef(false);
  const [text, setText] = useState("");
  const [value, setValue] = useState("");
  const [tries, setTries] = useState(0);
  const [error, setError] = useState("");
  const locked = o.captcha && tries >= o.maxTries;
  useEffect(() => {
    listen();
    bornAt.current = Date.now();
  }, []);
  const refresh = useCallback(() => {
    const p = makePuzzle();
    answerRef.current = p.answer;
    setValue("");
    const drawn = canvasRef.current ? paint(canvasRef.current, p.text) : false;
    setText(drawn ? "" : p.text);
  }, []);
  const verify = useCallback(() => {
    const hp = honeypotRef.current;
    if (hp && hp.value) return { ok: false, bot: true, reason: "honeypot" };
    if (!bornAt.current || Date.now() - bornAt.current < o.minTime) return { ok: false, bot: true, reason: "too-fast" };
    if (interactions < o.minInteractions) return { ok: false, bot: true, reason: "no-interaction" };
    if (typeof navigator !== "undefined" && navigator.webdriver) return { ok: false, bot: true, reason: "webdriver" };
    if (o.captcha) {
      if (!mounted.current) {
        console.warn("FormGuard: captcha is enabled but <Captcha/> is not rendered; skipping puzzle check.");
      } else {
        if (locked) {
          setError(o.errLocked);
          return { ok: false, reason: "locked" };
        }
        if (answerRef.current === null) {
          refresh();
          setError(o.label);
          return { ok: false, reason: "unsolved" };
        }
        if (parseInt(value, 10) !== answerRef.current) {
          const n = tries + 1;
          setTries(n);
          if (n >= o.maxTries) {
            setError(o.errLocked);
            return { ok: false, reason: "locked" };
          }
          refresh();
          setError(o.errWrong);
          return { ok: false, reason: "wrong" };
        }
      }
    }
    setError("");
    return { ok: true };
  }, [o.minTime, o.minInteractions, o.captcha, o.maxTries, o.label, o.errWrong, o.errLocked, locked, value, tries, refresh]);
  return {
    verify,
    refresh,
    error,
    setError,
    locked,
    options: o,
    honeypotName: o.honeypot,
    _: { canvasRef, honeypotRef, mounted, text, value, setValue }
  };
}
const Ctx = createContext(null);
const useGuard = (g) => {
  const ctx = useContext(Ctx);
  const guard = g || ctx;
  if (!guard) throw new Error("FormGuard: pass guard={useFormGuard()} or render inside <GuardedForm>");
  return guard;
};
const HP_STYLE = { position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" };
function Honeypot({ guard }) {
  const g = useGuard(guard);
  if (!g.options.honeypot) return null;
  return /* @__PURE__ */ jsx("div", { className: "fg-hp", "aria-hidden": "true", style: HP_STYLE, children: /* @__PURE__ */ jsxs("label", { children: [
    "Leave this empty",
    /* @__PURE__ */ jsx("input", { ref: g._.honeypotRef, type: "text", name: g.options.honeypot, tabIndex: -1, autoComplete: "off", defaultValue: "" })
  ] }) });
}
function Captcha({ guard, className = "", style }) {
  const g = useGuard(guard);
  const { canvasRef, mounted, text, value, setValue } = g._;
  const { refresh } = g;
  useEffect(() => {
    if (!g.options.captcha) return void 0;
    mounted.current = true;
    const cv = canvasRef.current;
    let ob;
    if (cv && typeof IntersectionObserver !== "undefined") {
      ob = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) {
          refresh();
          ob.disconnect();
        }
      });
      ob.observe(cv);
    } else refresh();
    return () => {
      mounted.current = false;
      if (ob) ob.disconnect();
    };
  }, [g.options.captcha, refresh, canvasRef, mounted]);
  if (!g.options.captcha) return g.error ? /* @__PURE__ */ jsx("div", { className: "fg-err", role: "alert", style: { color: "#b00020", fontSize: 13 }, children: g.error }) : null;
  return /* @__PURE__ */ jsxs("div", { className: `fg-cap ${className}`.trim(), style, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0 2px" }, children: [
      /* @__PURE__ */ jsx(
        "canvas",
        {
          ref: canvasRef,
          width: 130,
          height: 40,
          role: "img",
          title: "Click for a new puzzle",
          "aria-label": "Arithmetic puzzle. Click for a new one.",
          onClick: refresh,
          style: { display: text ? "none" : void 0, border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }
        }
      ),
      text && /* @__PURE__ */ jsx("strong", { className: "fg-text", children: text }),
      /* @__PURE__ */ jsx("span", { children: "=" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          inputMode: "numeric",
          autoComplete: "off",
          placeholder: "?",
          "aria-label": "Answer to the sum",
          value,
          onChange: (e) => setValue(e.target.value),
          disabled: g.locked,
          style: { width: "4.5em" }
        }
      ),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: refresh, "aria-label": "New puzzle", disabled: g.locked, style: { fontSize: 12, cursor: "pointer" }, children: "\u21BB" })
    ] }),
    /* @__PURE__ */ jsx("small", { className: "fg-hint", style: { display: "block", fontSize: 12, color: "#666" }, children: g.options.label }),
    /* @__PURE__ */ jsx("div", { className: "fg-err", role: "alert", "aria-live": "polite", style: { color: "#b00020", fontSize: 13, minHeight: "1em", marginTop: 4 }, children: g.error })
  ] });
}
function GuardedForm({
  action,
  actionKey,
  plainAction,
  onPass,
  onBlocked,
  onSuccess,
  success = null,
  silent = true,
  guard: guardOptions,
  children,
  method = "post",
  ...formProps
}) {
  const g = useFormGuard(guardOptions);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const finish = () => {
    setDone(true);
    if (onSuccess) onSuccess();
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (done || pending) return;
    const r = g.verify();
    if (!r.ok) {
      if (r.bot) {
        if (onBlocked) onBlocked(r.reason);
        if (silent) finish();
        else g.setError("Submission blocked.");
      }
      return;
    }
    const form = e.currentTarget;
    const url = plainAction || (action ? decode(action, actionKey) : "");
    if (!url && !onPass) {
      console.warn("FormGuard: no action / plainAction");
      return;
    }
    if (onPass) {
      const formData = new FormData(form);
      if (g.honeypotName) formData.delete(g.honeypotName);
      setPending(true);
      try {
        await onPass({ url, formData, form });
      } catch (err) {
        setPending(false);
        g.setError(err && err.message || "Submission failed. Please try again.");
        return;
      }
      setPending(false);
    } else {
      const hp = g._.honeypotRef.current;
      if (hp) hp.disabled = true;
      form.setAttribute("action", url);
      HTMLFormElement.prototype.submit.call(form);
      form.removeAttribute("action");
      if (hp) hp.disabled = false;
    }
    finish();
  };
  if (done && success) return success;
  return /* @__PURE__ */ jsx(Ctx.Provider, { value: g, children: /* @__PURE__ */ jsxs("form", { ...formProps, method, onSubmit: handleSubmit, "aria-busy": pending || void 0, children: [
    /* @__PURE__ */ jsx(Honeypot, {}),
    typeof children === "function" ? children({ pending, error: g.error, locked: g.locked, guard: g }) : children
  ] }) });
}
const FormGuard = { GuardedForm, useFormGuard, Captcha, Honeypot, encode, decode, version: "1.1.0" };
var FormGuard_default = FormGuard;
export {
  Captcha,
  GuardedForm,
  Honeypot,
  decode,
  FormGuard_default as default,
  encode,
  useFormGuard
};
