import test from "node:test";
import assert from "node:assert/strict";
import { ParseCliArgs } from "../src/arg-parser.js";

test("ParseCliArgs should parse links create with repeatable file-id", () => {
  const parsed = ParseCliArgs([
    "links",
    "create",
    "--type",
    "video",
    "--prompt",
    "hello",
    "--hosted",
    "true",
    "--private",
    "true",
    "--file-id",
    "67e6f6e6c5a91e4d2d9b0a11",
    "--file-id",
    "67e6f6e6c5a91e4d2d9b0a22",
  ]);

  assert.equal(parsed.kind, "command");
  assert.equal(parsed.name, "links.create");
  assert.equal(parsed.args.type, "video");
  assert.equal(parsed.args.prompt, "hello");
  assert.equal(parsed.args.hosted, "true");
  assert.equal(parsed.args.private, "true");
  assert.equal(parsed.args.fileIds.length, 2);
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
        "links",
        "create",
        "--type",
        "image",
        "--prompt",
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
        "67e6f6e6c5a91e4d2d9b0a11",
      ]),
    /not supported/
  );
});

