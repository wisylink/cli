import test from "node:test";
import assert from "node:assert/strict";
import {
  AssertIdentifier,
  AssertLinkId,
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

test("AssertLinkId accepts the API's 6-character [a-z0-9] ids", () => {
  for (const id of ["k3x9a2", "abcdef", "012345", "a1b2c3", "000000", "zzzzzz"]) {
    assert.equal(AssertLinkId(id), id);
  }
});

test("AssertLinkId trims surrounding whitespace only", () => {
  assert.equal(AssertLinkId("  k3x9a2\n"), "k3x9a2");
});

test("AssertLinkId rejects anything but exactly 6 lowercase alphanumerics", () => {
  const garbage = [
    "",
    "   ",
    "k3x9a",
    "k3x9a22",
    "K3X9A2",
    "k3x-a2",
    "k3x 9a",
    "k3x9a_",
    "k3x9a\u00e9",
    "../x9a2",
    "k3x9a2/../",
    "67e6f6e6c5a91e4d2d9b0a77",
    "bad-id",
  ];
  for (const id of garbage) {
    assert.throws(() => AssertLinkId(id), /6 lowercase letters or digits/, JSON.stringify(id));
  }
  for (const id of [undefined, null, 123456, {}, ["k3x9a2"]]) {
    assert.throws(() => AssertLinkId(id), /6 lowercase letters or digits/);
  }
});

test("AssertLinkId uses the given label", () => {
  assert.throws(() => AssertLinkId("nope", "--link-id"), /^.*--link-id must be 6/);
});

test("AssertIdentifier (file ids) still takes 24 hex and not link ids", () => {
  assert.equal(AssertIdentifier("67E6F6E6C5A91E4D2D9B0A11", "file id"), "67e6f6e6c5a91e4d2d9b0a11");
  assert.throws(() => AssertIdentifier("k3x9a2", "file id"), /file id must be a 24-character hex/);
});

test("NormalizeMessage validates required and max length", () => {
  assert.throws(() => NormalizeMessage(" ".repeat(2)), /message is required/);
  assert.throws(() => NormalizeMessage(undefined), /message is required/);
  assert.equal(NormalizeMessage("a".repeat(5000)).length, 5000);
  assert.equal(NormalizeMessage(`  ${"a".repeat(5000)}  `).length, 5000);
  assert.throws(() => NormalizeMessage("a".repeat(5001)), /max 5000/);
});

test("NormalizeFileIds allows 10 distinct ids and rejects 11", () => {
  const ids = Array.from({ length: 11 }, (_, i) => i.toString(16).padStart(24, "0"));
  assert.equal(NormalizeFileIds(ids.slice(0, 10)).length, 10);
  assert.throws(() => NormalizeFileIds(ids), /at most 10/);
  // duplicates collapse before the cap, as the API de-duplicates too
  assert.equal(NormalizeFileIds([...ids.slice(0, 10), ids[0]]).length, 10);
});

test("NormalizeFileIds rejects link-id shaped values", () => {
  assert.throws(() => NormalizeFileIds(["k3x9a2"]), /file-id must be a 24-character hex/);
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

