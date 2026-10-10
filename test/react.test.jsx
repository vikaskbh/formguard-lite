// React adapter test: real React 18 render in jsdom.
// Bundled by test/run-react.js with esbuild, then executed in Node.
import { JSDOM } from "jsdom";
import assert from "assert";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const w = dom.window;
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLFormElement", "HTMLInputElement",
  "HTMLCanvasElement", "Event", "KeyboardEvent", "FormData", "Node"]) {
  Object.defineProperty(globalThis, k, { value: k === "window" ? w : w[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let glyphs = "";
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: (_, p) => p === "clearRect" ? () => { glyphs = ""; } : p === "fillText" ? (ch) => { glyphs += ch; } : () => {},
  set: () => true,
});
const posts = [];
w.HTMLFormElement.prototype.submit = function () {
  posts.push({ action: this.getAttribute("action"), data: [...new w.FormData(this).entries()] });
};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToString } = await import("react-dom/server");
const FG = await import("../react/FormGuard.jsx");
const { GuardedForm, Captcha, Honeypot, useFormGuard, encode, decode } = FG;

const URL_ = "https://api.example.com/forms/82/subscribe/abc";
const KEY = "t3st";
const ENC = encode(URL_, KEY);

const solve = () => {
  const m = glyphs.match(/^(\d+)([+-])(\d+)$/);
  return m[2] === "+" ? +m[1] + +m[3] : +m[1] - +m[3];
};
const setInput = (el, v) => {
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const interact = () => { for (let i = 0; i < 5; i++) document.dispatchEvent(new w.KeyboardEvent("keydown")); };

async function mount(el) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(el));
  const $ = (s) => host.querySelector(s);
  const submit = async () => act(async () => {
    $("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  });
  const answer = async (v) => act(async () => setInput($(".fg-cap input"), String(v)));
  return { host, $, submit, answer, unmount: () => act(async () => root.unmount()) };
}

let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }

const Basic = (props) => (
  <GuardedForm action={ENC} actionKey={KEY} guard={{ minTime: 0 }} success={<p id="ok">thanks</p>} {...props}>
    <input name="email" defaultValue="a@b.co" />
    <input type="hidden" name="ref" value="999" />
    <Captcha />
    <button type="submit">Go</button>
  </GuardedForm>
);

await t("no interaction is blocked (runs before any interaction)", async () => {
  const blocked = [];
  const m = await mount(<Basic onBlocked={(r) => blocked.push(r)} />);
  await m.answer(solve());
  await m.submit();
  assert.deepStrictEqual(blocked, ["no-interaction"]);
  assert.ok(m.$("#ok"), "silent success shown");
  assert.strictEqual(posts.length, 0);
  await m.unmount();
});

interact();

await t("SSR renders without touching canvas or window timing", async () => {
  const html = renderToString(<Basic />);
  assert.match(html, /<form/);
  assert.match(html, /name="website"/);
  assert.ok(!html.includes("api.example.com"), "endpoint not in SSR markup");
});

await t("native post: decoded action, original payload only, success swapped in", async () => {
  const m = await mount(<Basic />);
  assert.strictEqual(m.$("form").getAttribute("action"), null);
  assert.ok(!m.host.innerHTML.includes("api.example.com"));
  await m.answer(solve());
  await m.submit();
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].action, URL_);
  assert.deepStrictEqual(posts[0].data, [["email", "a@b.co"], ["ref", "999"]]);
  assert.ok(m.$("#ok"));
  await m.unmount();
  posts.length = 0;
});

await t("honeypot blocks silently", async () => {
  const blocked = [];
  const m = await mount(<Basic onBlocked={(r) => blocked.push(r)} />);
  await act(async () => setInput(m.$('[name="website"]'), "spam"));
  await m.answer(solve());
  await m.submit();
  assert.deepStrictEqual(blocked, ["honeypot"]);
  assert.strictEqual(posts.length, 0);
  assert.ok(m.$("#ok"));
  await m.unmount();
});

await t("silent=false shows an error instead of fake success", async () => {
  const m = await mount(<Basic silent={false} guard={{ minTime: 60000 }} />);
  await m.answer(solve());
  await m.submit();
  assert.ok(!m.$("#ok"));
  assert.match(m.$(".fg-err").textContent, /blocked/);
  await m.unmount();
});

await t("wrong answers redraw, then lock", async () => {
  const m = await mount(<Basic guard={{ minTime: 0, maxTries: 2 }} />);
  const first = glyphs;
  await m.answer(-1); await m.submit();
  assert.match(m.$(".fg-err").textContent, /isn't right/);
  assert.strictEqual(m.$(".fg-cap input").value, "", "input cleared");
  await m.answer(-1); await m.submit();
  assert.match(m.$(".fg-err").textContent, /Too many/);
  assert.ok(m.$(".fg-cap input").disabled);
  assert.strictEqual(posts.length, 0);
  void first;
  await m.unmount();
});

await t("onPass (fetch mode): gets url + FormData without honeypot; throw allows retry", async () => {
  const calls = [];
  let fail = true;
  const onPass = async ({ url, formData }) => {
    calls.push([url, [...formData.entries()]]);
    if (fail) { fail = false; throw new Error("Network down"); }
  };
  const m = await mount(<Basic onPass={onPass} />);
  await m.answer(solve()); await m.submit();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], URL_);
  assert.deepStrictEqual(calls[0][1], [["email", "a@b.co"], ["ref", "999"]]);
  assert.match(m.$(".fg-err").textContent, /Network down/);
  assert.ok(!m.$("#ok"));
  await m.answer(solve()); await m.submit();
  assert.strictEqual(calls.length, 2);
  assert.ok(m.$("#ok"));
  assert.strictEqual(posts.length, 0, "no native post in onPass mode");
  await m.unmount();
});

await t("render-prop children receive pending/locked state", async () => {
  let seen = null;
  const m = await mount(
    <GuardedForm plainAction="/same-origin" guard={{ minTime: 0 }}>
      {(s) => { seen = s; return (<><Captcha /><button type="submit" disabled={s.locked}>Go</button></>); }}
    </GuardedForm>
  );
  assert.strictEqual(seen.pending, false);
  assert.strictEqual(seen.locked, false);
  await m.answer(solve()); await m.submit();
  assert.strictEqual(posts.at(-1).action, "/same-origin");
  posts.length = 0;
  await m.unmount();
});

await t("headless hook works with a custom form", async () => {
  let sent = 0;
  function Custom() {
    const g = useFormGuard({ minTime: 0 });
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (g.verify().ok) sent++; }}>
        <Honeypot guard={g} />
        <Captcha guard={g} />
        <button type="submit">Go</button>
      </form>
    );
  }
  const m = await mount(<Custom />);
  await m.answer(-1); await m.submit();
  assert.strictEqual(sent, 0);
  await m.answer(solve()); await m.submit();
  assert.strictEqual(sent, 1);
  await m.unmount();
});

await t("no canvas: falls back to text puzzle", async () => {
  const orig = w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  const m = await mount(<Basic />);
  const txt = m.$(".fg-text").textContent.replace(/ /g, "");
  glyphs = txt;
  await m.answer(solve()); await m.submit();
  assert.strictEqual(posts.length, 1);
  posts.length = 0;
  w.HTMLCanvasElement.prototype.getContext = orig;
  await m.unmount();
});

await t("codec is interchangeable with formguard.js", async () => {
  const legacy = "WwwABQcMBQVWXQBUBwkCU1NcU1cFXVcAVQwDVQILV1QBWQUCU10BUkwPUF8RCUFUFhkdBFtFQVsRBVQZU1MdRRcER1kACVMZDgVRGBcZXUYMGFNbTQNCV0xFCEUTHkZe";
  assert.strictEqual(decode(legacy, "cj26"), "https://api.maropost.com/accounts/90/forms/82/subscribe/d370473bbeaac1f66e7faa60e0cdb27537fd32f8");
  const core = (await import("../formguard.js")).default;
  for (const [u, k] of [[URL_, KEY], ["https://example.com/ñandú/お問い合わせ", "ключ"]]) {
    assert.strictEqual(encode(u, k), core.encode(u, k));
    assert.strictEqual(core.decode(encode(u, k), k), u);
  }
});

console.log(`react: all ${n} tests passed`);
