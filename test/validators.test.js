import test from "node:test";
import assert from "node:assert/strict";
import {
  AssertIdentifier,
  AssertLinkType,
  NormalizeFileIds,
  NormalizeApiUrl,
  NormalizePrompt,
  ParseBooleanValue,
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

test("AssertLinkType normalizes dash format", () => {
  const value = AssertLinkType("page");
  assert.equal(value, "page");
});

test("NormalizePrompt validates max length", () => {
  assert.throws(() => NormalizePrompt(" ".repeat(2)), /prompt is required/);
});

test("ParseBooleanValue parses true and false", () => {
  assert.equal(ParseBooleanValue("true", "hosted"), true);
  assert.equal(ParseBooleanValue("false", "hosted"), false);
  assert.equal(ParseBooleanValue("true", "private"), true);
  assert.equal(ParseBooleanValue("false", "private"), false);
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
  assert.equal(ResolveFixedApiUrl(undefined), "https://wisylink.com/api");
});

test("ResolveFixedApiUrl should reject custom URL", () => {
  assert.throws(
    () => ResolveFixedApiUrl("https://example.com/api"),
    /API URL is fixed/
  );
});

