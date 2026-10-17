import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CreateWisyLinkClient } from "../index.js";

const LINK_ID = "k3x9a2";
const FILE_ID = "67e6f6e6c5a91e4d2d9b0a11";

let calls;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function client() {
  return CreateWisyLinkClient({ apiKey: "test-key" });
}

test("getLink sends GET /links/<id> for a real 6-character link id", async () => {
  await client().getLink(LINK_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, `https://api.wisylink.com/links/${LINK_ID}`);
  assert.equal(calls[0].headers["x-api-key"], "test-key");
});

test("deleteLink sends DELETE /links/<id> for a real 6-character link id", async () => {
  await client().deleteLink(LINK_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "DELETE");
  assert.equal(calls[0].url, `https://api.wisylink.com/links/${LINK_ID}`);
});

test("chat continues a link with the real id in the body's id field", async () => {
  await client().chat({ message: "  Make the hero darker.  ", linkId: LINK_ID, fileIds: [FILE_ID] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://api.wisylink.com/chat");
  assert.deepEqual(JSON.parse(calls[0].body), {
    message: "Make the hero darker.",
    file_ids: [FILE_ID],
    id: LINK_ID,
  });
});

test("chat without linkId starts a new link (no id in the body)", async () => {
  await client().chat({ message: "Build a landing page." });
  assert.deepEqual(JSON.parse(calls[0].body), { message: "Build a landing page." });
});

test("link methods reject garbage ids before any request", async () => {
  const c = client();
  const garbage = ["   ", "k3x9a", "k3x9a22", "K3X9A2", "k3x-a2", "../chat", FILE_ID];
  for (const id of garbage) {
    await assert.rejects(() => c.getLink(id), /6 lowercase letters or digits/, JSON.stringify(id));
    await assert.rejects(() => c.deleteLink(id), /6 lowercase letters or digits/, JSON.stringify(id));
    await assert.rejects(() => c.chat({ message: "hi", linkId: id }), /6 lowercase letters or digits/);
  }
  await assert.rejects(() => c.getLink(""), /6 lowercase letters or digits/);
  await assert.rejects(() => c.deleteLink(undefined), /6 lowercase letters or digits/);
  assert.equal(calls.length, 0);
});

test("chat treats an absent or empty linkId as a new link", async () => {
  for (const linkId of [undefined, null, ""]) {
    await client().chat({ message: "hi", linkId });
  }
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(JSON.parse(call.body), { message: "hi" });
});

test("file methods keep taking 24-character hex ids", async () => {
  const c = client();
  await c.getFile(FILE_ID);
  await c.deleteFile(FILE_ID);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      `GET https://api.wisylink.com/files/${FILE_ID}`,
      `DELETE https://api.wisylink.com/files/${FILE_ID}`,
    ],
  );
  await assert.rejects(() => c.getFile(LINK_ID), /24-character hex/);
  await assert.rejects(() => c.deleteFile(LINK_ID), /24-character hex/);
});

test("chat enforces the 5000-character message cap and 10 file ids", async () => {
  const c = client();
  await assert.rejects(() => c.chat({ message: "a".repeat(5001) }), /max 5000/);
  const ids = Array.from({ length: 11 }, (_, i) => i.toString(16).padStart(24, "0"));
  await assert.rejects(() => c.chat({ message: "hi", fileIds: ids }), /at most 10/);
  assert.equal(calls.length, 0);
  await c.chat({ message: "a".repeat(5000), fileIds: ids.slice(0, 10) });
  assert.equal(calls.length, 1);
});
