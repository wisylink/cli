import test from "node:test";
import assert from "node:assert/strict";
import { ParseCliArgs } from "../src/arg-parser.js";

test("ParseCliArgs should parse chat with repeatable file-id and link-id", () => {
  const parsed = ParseCliArgs([
    "chat",
    "--message",
    "hello",
    "--link-id",
    "k3x9a2",
    "--file-id",
    "67e6f6e6c5a91e4d2d9b0a11",
    "--file-id",
    "67e6f6e6c5a91e4d2d9b0a22",
  ]);

  assert.equal(parsed.kind, "command");
  assert.equal(parsed.name, "chat");
  assert.equal(parsed.args.message, "hello");
  assert.equal(parsed.args.linkId, "k3x9a2");
  assert.equal(parsed.args.fileIds.length, 2);
});

test("ParseCliArgs should parse links list with page and limit", () => {
  const parsed = ParseCliArgs(["links", "list", "--page", "2", "--limit", "50"]);

  assert.equal(parsed.kind, "command");
  assert.equal(parsed.name, "links.list");
  assert.equal(parsed.args.page, "2");
  assert.equal(parsed.args.limit, "50");
});

test("ParseCliArgs should parse global options", () => {
  const parsed = ParseCliArgs([
    "--api-key",
    "abc",
    "--timeout",
    "5000",
    "files",
    "get",
    "67e6f6e6c5a91e4d2d9b0a11",
  ]);

  assert.equal(parsed.kind, "command");
  assert.equal(parsed.global.apiKey, "abc");
  assert.equal(parsed.global.timeoutMs, "5000");
});

test("ParseCliArgs should reject unknown flags", () => {
  assert.throws(
    () =>
      ParseCliArgs([
        "chat",
        "--message",
        "hi",
        "--unknown",
        "value",
      ]),
    /Unknown flag/
  );
});

test("ParseCliArgs should reject missing flag value", () => {
  assert.throws(
    () => ParseCliArgs(["--api-key", "--timeout", "--help"]),
    /requires a value/
  );
});

test("ParseCliArgs should reject deprecated api-url flag", () => {
  assert.throws(
    () =>
      ParseCliArgs([
        "--api-url",
        "https://example.com/api",
        "links",
        "get",
        "k3x9a2",
      ]),
    /not supported/
  );
});

test("ParseCliArgs should parse chat with optional message for REPL", () => {
  const parsed = ParseCliArgs(["chat"]);
  assert.equal(parsed.kind, "command");
  assert.equal(parsed.name, "chat");
  assert.equal(parsed.args.message, undefined);
});

test("ParseCliArgs should parse login / logout / whoami", () => {
  assert.equal(ParseCliArgs(["login"]).name, "login");
  assert.equal(ParseCliArgs(["logout"]).name, "logout");
  assert.equal(ParseCliArgs(["whoami"]).name, "whoami");
});

test("ParseCliArgs should parse --json global flag", () => {
  const parsed = ParseCliArgs(["--json", "whoami"]);
  assert.equal(parsed.global.json, true);
  assert.equal(parsed.name, "whoami");
});


test("ParseCliArgs should accept --json anywhere among the arguments", () => {
  for (const argv of [
    ["--json", "links", "get", "k3x9a2"],
    ["links", "--json", "get", "k3x9a2"],
    ["links", "get", "k3x9a2", "--json"],
  ]) {
    const parsed = ParseCliArgs(argv);
    assert.equal(parsed.global.json, true, argv.join(" "));
    assert.equal(parsed.name, "links.get");
    assert.equal(parsed.args.id, "k3x9a2");
  }
  assert.equal(ParseCliArgs(["links", "get", "k3x9a2"]).global.json, false);
});

test("ParseCliArgs should reject a value on --json", () => {
  assert.throws(() => ParseCliArgs(["links", "list", "--json=false"]), /--json does not take a value/);
  assert.throws(() => ParseCliArgs(["--json=true", "whoami"]), /--json does not take a value/);
});

test("ParseCliArgs should parse links get/delete with a real link id", () => {
  assert.equal(ParseCliArgs(["links", "get", "k3x9a2"]).args.id, "k3x9a2");
  assert.equal(ParseCliArgs(["links", "delete", "k3x9a2"]).args.id, "k3x9a2");
});
