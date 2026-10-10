#!/usr/bin/env node
// Usage: node tools/encode.js "<form action URL>" [key]
// Prints the data-fg-action / data-fg-key pair to paste into your <form>.
const FormGuard = require("../formguard.js");
const crypto = require("crypto");

const url = process.argv[2];
if (!url) {
  console.error('Usage: node tools/encode.js "https://example.com/endpoint" [key]');
  process.exit(1);
}
const key = process.argv[3] || crypto.randomBytes(6).toString("base64url");
const enc = FormGuard.encode(url, key);
if (FormGuard.decode(enc, key) !== url) {
  console.error("Round-trip check failed");
  process.exit(2);
}
console.log(`data-fg-action="${enc}" data-fg-key="${key}"`);
