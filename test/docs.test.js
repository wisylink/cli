import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ParseCliArgs } from "../src/arg-parser.js";
import { RunCli } from "../src/cli.js";

// Every flag the parser takes, with an argv that uses it. The docs may only name flags from this table.
const ACCEPTED = {
  "--help": ["--help"],
  "--version": ["--version"],
  "--json": ["--json", "whoami"],
  "--api-key": ["--api-key", "key", "whoami"],
  "--timeout": ["--timeout", "5000", "whoami"],
  "--message": ["chat", "--message", "hi"],
  "--file-id": ["chat", "--message", "hi", "--file-id", "67e6f6e6c5a91e4d2d9b0a11"],
  "--link-id": ["chat", "--message", "hi", "--link-id", "k3x9a2"],
  "--page": ["links", "list", "--page", "2"],
  "--limit": ["links", "list", "--limit", "20"],
};

async function _help() {
  let out = "";
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    out += String(chunk);
    return true;
  };
  try {
    assert.equal(await RunCli(["--help"]), 0);
  } finally {
    process.stdout.write = write;
  }
  return out;
}

function _flagsIn(text) {
  return new Set(text.match(/--[a-z][a-z-]*/g) || []);
}

test("every documented flag is accepted by the parser", () => {
  for (const [flag, argv] of Object.entries(ACCEPTED)) {
    assert.doesNotThrow(() => ParseCliArgs(argv), flag);
  }
});

test("README and --help only name flags the CLI accepts", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const [label, text] of [["README", readme], ["--help", await _help()]]) {
    for (const flag of _flagsIn(text)) {
      assert.ok(flag in ACCEPTED, `${label} mentions ${flag}, which the CLI does not accept`);
    }
  }
});

test("--help documents --json and both id formats", async () => {
  const help = await _help();
  assert.match(help, /--json/);
  assert.match(help, /6 characters, lowercase a-z0-9/);
  assert.match(help, /24 hex characters/);
});

test("--version prints the package version", async () => {
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  let out = "";
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    out += String(chunk);
    return true;
  };
  try {
    assert.equal(await RunCli(["--version"]), 0);
  } finally {
    process.stdout.write = write;
  }
  assert.equal(out.trim(), version);
});
