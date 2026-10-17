import test from "node:test";
import assert from "node:assert/strict";
import {
  IdentifierRegex,
  LinkIdRegex,
  MaxFileIdsPerRequest,
  MaxMessageLength,
  SupportedFileExtensions,
} from "../src/constants.js";

// The API's own file types (KIND_BY_EXTENSION in src/api/files/normalize.js).
const API_EXTENSIONS = [
  "jpeg", "png", "webp", "gif", "heic", "svg", "mp3", "mp4", "pdf",
  "xlsx", "docx", "csv", "txt", "json", "html", "zip", "wasm",
];

test("SupportedFileExtensions lists every type the API accepts", () => {
  for (const extension of API_EXTENSIONS) {
    assert.ok(SupportedFileExtensions.includes(extension), extension);
  }
});

test("id shapes and limits match the API's definitions", () => {
  // app.hex_id and app.link_id (migrations/001_init.sql), LINK_ID_RE in src/api/ids.js
  assert.equal(IdentifierRegex.source, "^[a-f0-9]{24}$");
  assert.equal(LinkIdRegex.source, "^[a-z0-9]{6}$");
  assert.equal(MaxMessageLength, 5000);
  assert.equal(MaxFileIdsPerRequest, 10);
});
