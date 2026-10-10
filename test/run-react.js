// Bundles test/react.test.jsx with esbuild and runs it.
// Setup: npm i   Run: node test/run-react.js
const path = require("path");
const { execFileSync } = require("child_process");
const esbuild = require("esbuild");

const out = path.join(__dirname, ".react.test.bundle.mjs");
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "react.test.jsx")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  external: ["jsdom", "react", "react-dom", "react/*", "react-dom/*"],
  logLevel: "warning",
});
execFileSync(process.execPath, [out], { stdio: "inherit", cwd: __dirname });
