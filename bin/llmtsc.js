#!/usr/bin/env node
require("../dist/cli.js").main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  },
);
