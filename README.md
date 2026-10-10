# FormGuard Lite

**Copy-paste spam protection for plain HTML forms on servers you can't touch.**

Built for stateless CMSs, static hosts and landing-page builders where you can paste HTML/JS but can't run server code, add reCAPTCHA keys, or verify anything on the backend. It's typical for forms that post straight to a third-party endpoint (Maropost, Mailchimp, Formspree, Google Forms, a legacy PHP script).

One script tag, one attribute on your `<form>`. No dependencies, no cookies, no third-party calls. 7.5 KB minified, 3.3 KB gzipped.

```html
<form data-formguard data-fg-action="EBYCHx5VQQtLAwZTQkcQDUJAC0FDEBEF" data-fg-key="demo123">
  <input type="email" name="email" required>
  <button type="submit">Subscribe</button>
</form>
<script src="https://cdn.jsdelivr.net/gh/vikaskbh/formguard-lite@v1.0.0/dist/formguard.min.js"></script>
```

## What it does

| Layer | Stops |
|---|---|
| **Obfuscated action.** The real endpoint is stored reversed + XOR'd + base64 in `data-fg-action` and only decoded at the instant of a valid submit. Any `action=""` in the markup is removed. | Scrapers that harvest `<form action>` URLs or grep HTML for known endpoints |
| **Honeypot.** An off-screen field humans never see. | Autofill bots that fill every input |
| **Time trap.** Submits within 3 s of page load are ignored. | Scripted instant posts |
| **Interaction gate.** Requires real pointer/key/scroll/focus events; rejects `navigator.webdriver`. | Naive headless runs |
| **Canvas captcha.** Noisy, rotated arithmetic drawn on `<canvas>`. The answer lives in a closure, not the DOM, and is drawn only once scrolled into view. Locks after 4 wrong answers. | Bots that read DOM text; casual automation |
| **Silent drop.** Blocked bots see the normal success state. | Bots learning which check caught them |

Guard-only fields (honeypot, captcha answer) are stripped before posting, so **your endpoint receives exactly the payload it did before**.

## Quick start

1. **Encode your endpoint.** Pick one:
   - Open `tools/encode.html` in a browser. It works offline and sends nothing anywhere.
   - Or run: `node tools/encode.js "https://api.example.com/your/endpoint"`

   Either one prints:
   ```
   data-formguard data-fg-action="…" data-fg-key="…"
   ```

2. **Paste those attributes onto your `<form>`** and delete its `action="…"`. Keep your fields, hidden inputs, `method` and `target` as they are. Use a real `type="submit"` button. An `onclick` that bypasses form submission bypasses the guard too.

3. **Include the script once** per page, anywhere. Every `form[data-formguard]` is guarded automatically.

Self-hosting? Copy `dist/formguard.min.js` to your site, or inline its contents in a `<script>` tag when the CMS won't take external files.

## Options (data attributes)

| Attribute | Default | Meaning |
|---|---|---|
| `data-fg-action` | — | Encoded endpoint (required unless `data-fg-plain-action`) |
| `data-fg-key` | — | Key used when encoding |
| `data-fg-plain-action` | — | Unencoded endpoint, for same-origin or non-secret URLs |
| `data-fg-success` | — | Selector to show after submit (`#thanks`) |
| `data-fg-hide` | the form, when `success` is set | Selector to hide after submit |
| `data-fg-min-time` | `3000` | ms before a submit is believed |
| `data-fg-min-interactions` | `2` | Human events required |
| `data-fg-max-tries` | `4` | Wrong answers before lock |
| `data-fg-captcha` | `true` | `false` keeps the invisible checks only |
| `data-fg-honeypot` | `website` | Honeypot field name; `""` disables |
| `data-fg-silent` | `true` | `false` shows "Submission blocked." instead of faking success |
| `data-fg-reset` | `true` | Clear fields after submit |
| `data-fg-label` | `Solve the sum` | Hint under the puzzle |

Place the captcha yourself with `<div data-fg-captcha></div>`, or put your own error element in with `<div data-fg-error></div>`. Otherwise both are inserted before the submit button.

## JavaScript API

```js
FormGuard.init("#myForm", { minTime: 5000, success: "#ok" }); // forms added after load
FormGuard.encode(url, key);   // same as the encoder tool
FormGuard.decode(enc, key);

document.addEventListener("formguard:pass",    e => {/* sent */});
document.addEventListener("formguard:blocked", e => console.log(e.detail.reason));
// reasons: honeypot | too-fast | no-interaction | webdriver
document.addEventListener("formguard:locked",  e => {/* too many wrong answers */});
```

## Patterns

- **Newsletter that stays on the page:** add a hidden `<iframe name="sink">` and `target="sink"` on the form, plus `data-fg-success`. See `examples/maropost-newsletter.html`.
- **Normal post/redirect:** leave `target` off. The browser navigates to the endpoint's response.
- **Several forms on one page:** each gets its own puzzle and state.

Try `demo/index.html`. It posts to httpbin.org, which echoes the payload back.

## Honest limits

FormGuard is a **client-side filter**. With no server to verify a token, nothing here is cryptographically enforced:

- **Anyone who already has your endpoint URL can POST to it directly**, skipping the page entirely. If an endpoint was ever in your public HTML, assume spam lists have it: **rotate it** (regenerate the form token or create a new form), then encode the new one.
- The XOR encoding is obfuscation, not encryption. It defeats harvesters and grep, not a person reading the JS.
- A determined attacker scripting a real browser can solve the arithmetic.

In practice almost all form spam is harvested-URL posting and dumb autofill bots, and those are what this stops. Pair it with what your endpoint offers: **double opt-in** for mailing lists, rate limits or keyword filters for contact backends.

**Accessibility:** the puzzle is visual. The canvas has an ARIA label and a refresh button, and the library falls back to a plain-text puzzle when canvas isn't available. For audiences that depend on screen readers, consider `data-fg-captcha="false"`: the invisible layers still apply.

## Development

```bash
npm i            # jsdom for tests
npm test         # codec + DOM tests (source and minified build)
npm run build    # regenerate dist/formguard.min.js
```

## License

MIT © Vikas Bhagwagar · a [CloudJugaad](https://cloudjugaad.com) utility
