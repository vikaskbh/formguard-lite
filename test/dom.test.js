// End-to-end guard test in jsdom (canvas + native submit stubbed).
// Setup: npm i --no-save jsdom   Run: node test/dom.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FGsrc = fs.readFileSync(path.join(__dirname, "..", process.env.FG_FILE || "formguard.js"), "utf8");
const FGnode = require("../formguard.js");

const URL_ = "https://api.example.com/forms/82/subscribe/abc";
const KEY = "t3st";
const ENC = FGnode.encode(URL_, KEY);

function page(attrs, noCanvas) {
  const html = `<!doctype html><body>
    <form id="f" data-formguard data-fg-action="${ENC}" data-fg-key="${KEY}" ${attrs || ""}>
      <input name="email" type="email" required>
      <input type="hidden" name="ref" value="999">
      <button type="submit">Go</button>
    </form><div id="ok" style="display:none">thanks</div></body>`;
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  // Canvas stub that records drawn glyphs so the test can "read" the puzzle.
  let glyphs = "";
  w.HTMLCanvasElement.prototype.getContext = noCanvas ? () => null : () => new Proxy({}, {
    get: (_, p) => p === "clearRect" ? () => { glyphs = ""; }
      : p === "fillText" ? (ch) => { glyphs += ch; }
      : () => {},
    set: () => true
  });
  const posts = [];
  w.HTMLFormElement.prototype.submit = function () {
    posts.push({ action: this.getAttribute("action"), data: [...new w.FormData(this).entries()] });
  };
  w.eval(FGsrc);
  w.FormGuard.init(); // DOMContentLoaded is async in jsdom; init is idempotent
  const solve = () => {
    if (noCanvas) glyphs = w.document.querySelector(".fg-text").textContent.replace(/ /g, "");
    const m = glyphs.match(/^(\d+)([+-])(\d+)$/);
    return m[2] === "+" ? +m[1] + +m[3] : +m[1] - +m[3];
  };
  const $ = (s) => w.document.querySelector(s);
  const interact = (n) => { for (let i = 0; i < n; i++) w.document.dispatchEvent(new w.KeyboardEvent("keydown")); };
  const submit = () => $("#f").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  return { w, $, posts, solve, interact, submit, blocked: [] };
}
function track(p) { p.w.document.addEventListener("formguard:blocked", (e) => p.blocked.push(e.detail.reason)); return p; }

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("action attribute stripped from markup", () => {
  const p = page('action="https://leak.example"');
  assert.strictEqual(p.$("#f").getAttribute("action"), null);
  assert.ok(!p.w.document.documentElement.outerHTML.includes("api.example.com"));
});

t("honeypot blocks silently and shows success", () => {
  const p = track(page('data-fg-min-time="0" data-fg-success="#ok"'));
  p.interact(5); p.$("[name=email]").value = "a@b.co"; p.$("[name=website]").value = "spam";
  p.submit();
  assert.deepStrictEqual(p.blocked, ["honeypot"]);
  assert.strictEqual(p.posts.length, 0);
  assert.notStrictEqual(p.$("#ok").style.display, "none");
});

t("too-fast submit blocked", () => {
  const p = track(page());
  p.interact(5); p.$("[name=email]").value = "a@b.co"; p.$(".fg-cap input").value = String(p.solve());
  p.submit();
  assert.deepStrictEqual(p.blocked, ["too-fast"]);
  assert.strictEqual(p.posts.length, 0);
});

t("no interaction blocked", () => {
  const p = track(page('data-fg-min-time="0"'));
  p.$("[name=email]").value = "a@b.co";
  p.submit();
  assert.deepStrictEqual(p.blocked, ["no-interaction"]);
});

t("wrong answer shows error, redraws, locks after maxTries", () => {
  const p = page('data-fg-min-time="0" data-fg-max-tries="2"');
  p.interact(5); p.$("[name=email]").value = "a@b.co";
  p.$(".fg-cap input").value = "-1"; p.submit();
  assert.match(p.$(".fg-err").textContent, /isn't right/);
  p.$(".fg-cap input").value = "-1"; p.submit();
  assert.match(p.$(".fg-err").textContent, /Too many/);
  assert.ok(p.$("button[type=submit]").disabled);
  assert.strictEqual(p.posts.length, 0);
});

t("correct answer posts decoded action with original payload only", () => {
  const p = page('data-fg-min-time="0" data-fg-success="#ok"');
  let passed = 0; p.w.document.addEventListener("formguard:pass", () => passed++);
  p.interact(5); p.$("[name=email]").value = "a@b.co"; p.$(".fg-cap input").value = String(p.solve());
  p.submit();
  assert.strictEqual(p.posts.length, 1);
  assert.strictEqual(p.posts[0].action, URL_);
  assert.deepStrictEqual(p.posts[0].data, [["email", "a@b.co"], ["ref", "999"]]);
  assert.strictEqual(passed, 1);
  assert.strictEqual(p.$("#f").getAttribute("action"), null, "action removed again after submit");
  assert.ok(p.$(".fg-cap") && p.$(".fg-hp"), "guard UI restored");
  p.submit();
  assert.strictEqual(p.posts.length, 1, "no double submit");
});

t("data-fg-captcha=false still runs the other checks", () => {
  const p = page('data-fg-min-time="0" data-fg-captcha="false"');
  assert.strictEqual(p.$(".fg-cap"), null);
  p.interact(5); p.$("[name=email]").value = "a@b.co"; p.submit();
  assert.strictEqual(p.posts.length, 1);
});

t("no canvas support falls back to a text puzzle", () => {
  const p = page('data-fg-min-time="0"', true);
  assert.notStrictEqual(p.$(".fg-text").style.display, "none");
  p.interact(5); p.$("[name=email]").value = "a@b.co"; p.$(".fg-cap input").value = String(p.solve());
  p.submit();
  assert.strictEqual(p.posts.length, 1);
});

console.log(`dom: all ${n} tests passed`);
