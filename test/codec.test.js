// node test/codec.test.js
const assert = require("assert");
const FG = require("../formguard.js");

const cases = [
  ["https://api.maropost.com/accounts/90/forms/82/subscribe/d370473bbeaac1f66e7faa60e0cdb27537fd32f8", "cj26"],
  ["https://formspree.io/f/abc123?x=1&y=2", "k3y"],
  ["https://example.com/ñandú/お問い合わせ", "ключ"],
  ["/relative/path.php", "a"]
];
for (const [url, key] of cases) {
  const enc = FG.encode(url, key);
  assert.strictEqual(FG.decode(enc, key), url, "round trip: " + url);
  assert.ok(!enc.includes("http") && !enc.includes(url.slice(8, 20)), "plaintext leaked: " + url);
}

// Backward compatible with the hand-rolled encoding used on truthaboutabs.com
const legacy = "WwwABQcMBQVWXQBUBwkCU1NcU1cFXVcAVQwDVQILV1QBWQUCU10BUkwPUF8RCUFUFhkdBFtFQVsRBVQZU1MdRRcER1kACVMZDgVRGBcZXUYMGFNbTQNCV0xFCEUTHkZe";
assert.strictEqual(FG.decode(legacy, "cj26"), cases[0][0]);

assert.throws(() => FG.encode("x", ""));
console.log("codec: all " + (cases.length + 2) + " checks passed");
