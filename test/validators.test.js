import test from "node:test";
import assert from "node:assert/strict";
import {
  AssertIdentifier,
  NormalizeFileIds,
  NormalizeApiUrl,
  NormalizeListLimit,
  NormalizeListPage,
  NormalizeMessage,
  ParseTimeoutMs,
  ResolveFixedApiUrl,
} from "../src/validators.js";

test("AssertIdentifier accepts 24-char hex", () => {
  const id = AssertIdentifier("67e6f6e6c5a91e4d2d9b0a11", "id");
  assert.equal(id, "67e6f6e6c5a91e4d2d9b0a11");
});

test("AssertIdentifier rejects invalid id", () => {
  assert.throws(() => AssertIdentifier("bad-id", "id"), /24-character hex/);
});

test("NormalizeMessage validates max length", () => {
  assert.throws(() => NormalizeMessage(" ".repeat(2)), /message is required/);
});

test("NormalizeFileIds de-duplicates", () => {
  const ids = NormalizeFileIds([
    "67e6f6e6c5a91e4d2d9b0a11",
    "67e6f6e6c5a91e4d2d9b0a11",
  ]);
  assert.equal(ids.length, 1);
});

test("ParseTimeoutMs uses default when empty", () => {
  const timeout = ParseTimeoutMs(undefined);
  assert.equal(timeout, 30000);
});

test("NormalizeApiUrl rejects query params", () => {
  assert.throws(
    () => NormalizeApiUrl("https://example.com/api?x=1"),
    /must not include query params/
  );
});

test("ResolveFixedApiUrl should return default when empty", () => {
  assert.equal(ResolveFixedApiUrl(undefined), "https://api.wisylink.com");
});

test("ResolveFixedApiUrl should reject custom URL", () => {
  assert.throws(
    () => ResolveFixedApiUrl("https://example.com/api"),
    /API URL is fixed/
  );
});

test("NormalizeListLimit clamps are enforced", () => {
  assert.equal(NormalizeListLimit(undefined), undefined);
  assert.equal(NormalizeListLimit("50"), 50);
  assert.throws(() => NormalizeListLimit("0"), /between 1 and 100/);
  assert.throws(() => NormalizeListLimit("101"), /between 1 and 100/);
});

test("NormalizeListPage requires a positive integer", () => {
  assert.equal(NormalizeListPage(undefined), undefined);
  assert.equal(NormalizeListPage("3"), 3);
  assert.throws(() => NormalizeListPage("0"), />= 1/);
});

