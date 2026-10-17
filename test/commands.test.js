import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunCli } from "../src/cli.js";
import { ChatRepl, PollBuild } from "../src/commands/index.js";
import { BuildStatus, IsBuildActive } from "../src/build-status.js";

const LINK_ID = "k3x9a2";
const FILE_ID = "67e6f6e6c5a91e4d2d9b0a11";
const API = "https://api.wisylink.com";

const realFetch = globalThis.fetch;
const realStdoutWrite = process.stdout.write;
const realStderrWrite = process.stderr.write;
const savedEnv = {};

let calls;
let lastTimerMs;
const realSetTimeout = globalThis.setTimeout;
let routes;
let stdout;
let stderr;
let configDir;

function _json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  calls = [];
  routes = [];
  stdout = "";
  stderr = "";
  for (const key of ["XDG_CONFIG_HOME", "WISYLINK_API_KEY"]) savedEnv[key] = process.env[key];
  delete process.env.WISYLINK_API_KEY;

  configDir = await mkdtemp(join(tmpdir(), "wisylink-cli-test-"));
  await mkdir(join(configDir, "wisylink"), { recursive: true });
  await writeFile(
    join(configDir, "wisylink", "credentials.json"),
    JSON.stringify({ token: "session-token", user: { email: "dev@example.com" } }),
  );
  process.env.XDG_CONFIG_HOME = configDir;

  // Each request arms one abort timer just before it calls fetch; remember its delay.
  globalThis.setTimeout = (fn, ms, ...rest) => {
    lastTimerMs = ms;
    return realSetTimeout(fn, ms, ...rest);
  };
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method,
      headers: init.headers || {},
      body: init.body,
      timeoutMs: lastTimerMs,
    };
    calls.push(call);
    for (const [method, path, respond] of routes) {
      if (call.method === method && call.url === `${API}${path}`) return respond(call);
    }
    return _json({ error: "not_found" }, 404);
  };
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
});

afterEach(async () => {
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(configDir, { recursive: true, force: true });
});

function on(method, path, respond) {
  routes.push([method, path, respond]);
}

async function run(...argv) {
  return RunCli(argv);
}

// The REPL only starts on a terminal; pretend to be one (or not to be, so `login` never opens a browser
// when the suite is run by hand in a terminal) while `fn` runs.
async function withTty(fn, isTty = true) {
  const stdinTty = process.stdin.isTTY;
  const stdoutTty = process.stdout.isTTY;
  process.stdin.isTTY = isTty;
  process.stdout.isTTY = isTty;
  try {
    return await fn();
  } finally {
    process.stdin.isTTY = stdinTty;
    process.stdout.isTTY = stdoutTty;
  }
}

test("session: links get/delete take a real 6-character link id", async () => {
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ id: LINK_ID, status: "completed" }));
  on("DELETE", `/internal/links/${LINK_ID}`, () => _json({ ok: true }));

  assert.equal(await run("links", "get", LINK_ID, "--json"), 0);
  assert.equal(JSON.parse(stdout).id, LINK_ID);
  assert.equal(calls[0].headers.authorization, "Bearer session-token");

  assert.equal(await run("links", "delete", LINK_ID, "--json"), 0);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [`GET ${API}/internal/links/${LINK_ID}`, `DELETE ${API}/internal/links/${LINK_ID}`],
  );
});

test("session: garbage link ids are rejected before any request", async () => {
  for (const id of [FILE_ID, "K3X9A2", "k3x9a", "../chat/new", "k3x-a2"]) {
    stderr = "";
    assert.equal(await run("links", "get", id, "--json"), 2, id);
    assert.equal(JSON.parse(stderr).error, "usage_error");
    assert.match(JSON.parse(stderr).message, /6 lowercase letters or digits/);
    assert.equal(await run("links", "delete", id, "--json"), 2, id);
  }
  assert.equal(calls.length, 0);
});

test("session: file ids are checked before any request", async () => {
  on("GET", `/internal/files/${FILE_ID}`, () => _json({ id: FILE_ID }));
  assert.equal(await run("files", "get", FILE_ID.toUpperCase(), "--json"), 0);
  assert.equal(calls[0].url, `${API}/internal/files/${FILE_ID}`);

  for (const id of [LINK_ID, "../x", "nope"]) {
    assert.equal(await run("files", "get", id, "--json"), 2, id);
    assert.equal(await run("files", "delete", id, "--json"), 2, id);
  }
  assert.equal(calls.length, 1);
});

test("session: chat continues a link with its real id and file ids", async () => {
  on("POST", `/internal/chat/${LINK_ID}/message`, () =>
    _json({ link_id: LINK_ID, building: false, text: "Done." }),
  );
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ id: LINK_ID, url: `https://${LINK_ID}.wisylink.com` }));

  const code = await run(
    "chat",
    "--message",
    "Make the hero darker.",
    "--link-id",
    LINK_ID,
    "--file-id",
    FILE_ID,
    "--json",
  );
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(calls[0].body), { content: "Make the hero darker.", file_ids: [FILE_ID] });
  assert.deepEqual(JSON.parse(stdout), {
    id: LINK_ID,
    url: `https://${LINK_ID}.wisylink.com`,
    session_url: `https://wisylink.com/chat/${LINK_ID}`,
    building: false,
    answer: "Done.",
  });
});

test("session: chat enforces link id, file id count and message length up front", async () => {
  const elevenFiles = Array.from({ length: 11 }, (_, i) => ["--file-id", i.toString(16).padStart(24, "0")]).flat();

  assert.equal(await run("chat", "--message", "hi", "--link-id", FILE_ID, "--json"), 2);
  assert.match(JSON.parse(stderr).message, /--link-id must be 6 lowercase/);

  stderr = "";
  assert.equal(await run("chat", "--message", "hi", ...elevenFiles, "--json"), 2);
  assert.match(JSON.parse(stderr).message, /at most 10/);

  stderr = "";
  assert.equal(await run("chat", "--message", "a".repeat(5001), "--json"), 2);
  assert.match(JSON.parse(stderr).message, /max 5000/);

  stderr = "";
  assert.equal(await run("chat", "--message", "   ", "--json"), 2);
  assert.match(JSON.parse(stderr).message, /message is required/);

  assert.equal(calls.length, 0);
});

test("api key: links get/delete and chat use the key plane with real link ids", async () => {
  on("GET", `/links/${LINK_ID}`, () => _json({ id: LINK_ID }));
  on("DELETE", `/links/${LINK_ID}`, () => _json({ ok: true }));
  on("POST", "/chat", () =>
    _json({ id: LINK_ID, url: `https://${LINK_ID}.wisylink.com`, status: "completed", answer: "ok" }, 200),
  );

  assert.equal(await run("--api-key", "key-1", "links", "get", LINK_ID, "--json"), 0);
  assert.equal(await run("--api-key", "key-1", "links", "delete", LINK_ID, "--json"), 0);
  assert.equal(
    await run("--api-key", "key-1", "chat", "--message", "hi", "--link-id", LINK_ID, "--json"),
    0,
  );
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.headers["x-api-key"], "key-1");
  assert.equal(JSON.parse(calls[2].body).id, LINK_ID);
});

test("repl: --link-id continues that link and --file-id rides the first turn only", async () => {
  const sent = [];
  const client = {
    async chatMessage(input) {
      sent.push(input);
      return { link_id: LINK_ID, building: false, text: "ok" };
    },
    async getLink() {
      return { url: `https://${LINK_ID}.wisylink.com` };
    },
  };
  const lines = ["first", "second", ""];
  const result = await withTty(() =>
    ChatRepl({
      auth: { mode: "session", client },
      json: false,
      linkId: LINK_ID,
      fileIds: [FILE_ID],
      readLine: async () => lines.shift(),
    }),
  );
  assert.equal(result.link_id, LINK_ID);
  assert.deepEqual(
    sent.map((turn) => [turn.linkId, turn.content, turn.fileIds]),
    [
      [LINK_ID, "first", [FILE_ID]],
      [LINK_ID, "second", []],
    ],
  );
});

test("repl: without --link-id the first turn starts a new link and later turns continue it", async () => {
  const sent = [];
  const client = {
    async chatMessage(input) {
      sent.push(input);
      return { link_id: LINK_ID, building: false, text: "ok" };
    },
    async getLink() {
      return { url: "" };
    },
  };
  const lines = ["one", "two", ""];
  await withTty(() =>
    ChatRepl({ auth: { mode: "session", client }, json: false, readLine: async () => lines.shift() }),
  );
  assert.deepEqual(
    sent.map((turn) => turn.linkId),
    ["", LINK_ID],
  );
});

test("IsBuildActive covers the API's running and queued states only", () => {
  assert.equal(IsBuildActive("building"), true);
  assert.equal(IsBuildActive("queued"), true);
  for (const status of ["completed", "aborted", "idle", "", undefined, null, "Building"]) {
    assert.equal(IsBuildActive(status), false, String(status));
  }
  assert.deepEqual(Object.values(BuildStatus).sort(), ["aborted", "building", "completed", "idle", "queued"]);
});

function _statusClient(sequence) {
  const seen = [];
  return {
    seen,
    async buildStatus(query) {
      seen.push(query);
      const next = sequence.length > 1 ? sequence.shift() : sequence[0];
      return { status: next, report: { note: `now ${next}`, tasks: [] } };
    },
  };
}

test("PollBuild keeps polling while a build is queued, then follows it to completion", async () => {
  const client = _statusClient(["queued", "queued", "building", "completed"]);
  const result = await PollBuild({
    sessionClient: client,
    linkId: LINK_ID,
    json: false,
    abortSignal: new AbortController().signal,
    intervalMs: 1,
  });
  assert.equal(result.status, "completed");
  assert.equal(client.seen.length, 4);
  assert.deepEqual(client.seen[0], { linkId: LINK_ID });
  assert.match(stdout, /queued/);
  assert.match(stdout, /Build completed/);
});

test("PollBuild stops on aborted and on states that are not active", async () => {
  for (const [state, text] of [
    ["aborted", /Build aborted/],
    ["idle", /^/],
  ]) {
    stdout = "";
    const client = _statusClient([state]);
    const result = await PollBuild({
      sessionClient: client,
      linkId: LINK_ID,
      json: false,
      abortSignal: new AbortController().signal,
      intervalMs: 1,
    });
    assert.equal(result.status, state);
    assert.equal(client.seen.length, 1);
    assert.match(stdout, text);
  }
});

test("PollBuild reports a cancelled poll and does nothing for --json", async () => {
  const controller = new AbortController();
  const client = _statusClient(["queued"]);
  const pending = PollBuild({
    sessionClient: client,
    linkId: LINK_ID,
    json: false,
    abortSignal: controller.signal,
    intervalMs: 60_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  assert.deepEqual(await pending, { status: "aborted", cancelled: true });

  const quiet = _statusClient(["queued"]);
  assert.equal(
    await PollBuild({ sessionClient: quiet, linkId: LINK_ID, json: true, abortSignal: controller.signal }),
    null,
  );
  assert.equal(quiet.seen.length, 0);
});

test("api key chat tells the user when the build is queued or started", async () => {
  const cases = [
    ["queued", /Build queued\. Check its status with: wisylink links get k3x9a2/],
    ["building", /Build started\. Check its status with: wisylink links get k3x9a2/],
    ["completed", /^(?![\s\S]*Build (queued|started))/],
  ];
  for (const [status, expected] of cases) {
    stdout = "";
    routes = [];
    on("POST", "/chat", () =>
      _json({ id: LINK_ID, url: `https://${LINK_ID}.wisylink.com`, status, answer: "On it." }, 201),
    );
    assert.equal(await run("--api-key", "key-1", "chat", "--message", "Build a page."), 0);
    assert.match(stdout, /On it\./);
    assert.match(stdout, expected, status);
  }
});

test("session links list asks for 20 by default and never more than the session cap of 25", async () => {
  const empty = { items: [], page: 1, limit: 20, total: 0, total_pages: 0, has_prev: false, has_next: false };
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return _json(empty);
  };
  assert.equal(await run("links", "list", "--json"), 0);
  assert.equal(await run("links", "list", "--limit", "10", "--page", "3", "--json"), 0);
  assert.equal(await run("links", "list", "--limit", "100", "--json"), 0);
  assert.deepEqual(urls, [
    `${API}/internal/links?limit=20&sort_by=last_message_at&sort_order=desc`,
    `${API}/internal/links?page=3&limit=10&sort_by=last_message_at&sort_order=desc`,
    `${API}/internal/links?limit=25&sort_by=last_message_at&sort_order=desc`,
  ]);
});

test("api key links list passes page and limit through up to 100", async () => {
  on("GET", "/links?page=2&limit=100", () => _json({ items: [], page: 2, limit: 100 }));
  assert.equal(await run("--api-key", "key-1", "links", "list", "--page", "2", "--limit", "100", "--json"), 0);
  assert.equal(await run("--api-key", "key-1", "links", "list", "--limit", "101", "--json"), 2);
  assert.equal(calls.length, 1);
});

test("session 401 tells the user to log in again", async () => {
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ error: "unauthorized" }, 401));
  assert.equal(await run("links", "get", LINK_ID), 1);
  assert.match(stdout, /Session expired or not valid\. Run wisylink login again\./);

  stderr = "";
  assert.equal(await run("links", "get", LINK_ID, "--json"), 1);
  assert.deepEqual(JSON.parse(stderr), { error: "unauthorized" });
});

test("api key 401 keeps the API's own message", async () => {
  on("GET", `/links/${LINK_ID}`, () =>
    _json({ error: "unauthorized", message: "Missing or invalid API key." }, 401),
  );
  assert.equal(await run("--api-key", "bad", "links", "get", LINK_ID), 1);
  assert.match(stdout, /Missing or invalid API key\./);
});

test("whoami reports an ended session instead of the account saved at login", async () => {
  // Better Auth answers 200 with a null body when the session is gone (sign-out, expiry).
  on("GET", "/auth/get-session", () => new Response("null", { status: 200 }));
  assert.equal(await run("whoami"), 1);
  assert.match(stdout, /Session expired or not valid\. Run wisylink login again\./);
  assert.doesNotMatch(stdout, /Signed in/);

  stderr = "";
  assert.equal(await run("whoami", "--json"), 1);
  assert.equal(JSON.parse(stderr).error, "auth_error");
});

test("whoami treats a 401 as an ended session too", async () => {
  on("GET", "/auth/get-session", () => _json({ error: "unauthorized" }, 401));
  assert.equal(await run("whoami"), 1);
  assert.match(stdout, /Run wisylink login again/);
});

test("whoami names the live session's account", async () => {
  on("GET", "/auth/get-session", () =>
    _json({ session: { token: "x" }, user: { id: "u1", email: "grace@example.com", name: "Grace" } }),
  );
  assert.equal(await run("whoami", "--json"), 0);
  assert.deepEqual(JSON.parse(stdout), {
    mode: "session",
    user: { id: "u1", email: "grace@example.com", name: "Grace" },
  });
});

test("whoami falls back to the saved account only when the API cannot be reached", async () => {
  on("GET", "/auth/get-session", () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(await run("whoami"), 0);
  assert.match(stdout, /Signed in as .*dev@example\.com/);

  stdout = "";
  routes = [];
  on("GET", "/auth/get-session", () => _json({ error: "internal" }, 502));
  assert.equal(await run("whoami"), 0);
  assert.match(stdout, /Signed in as .*dev@example\.com/);
});

test("session chat says which files the API did not attach", async () => {
  on("POST", `/internal/chat/${LINK_ID}/message`, () =>
    _json({ link_id: LINK_ID, building: false, text: "Done.", rejected_files: [FILE_ID] }),
  );
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ url: `https://${LINK_ID}.wisylink.com` }));

  const args = ["chat", "--message", "Use this.", "--link-id", LINK_ID, "--file-id", FILE_ID];
  assert.equal(await run(...args), 0);
  assert.match(stdout, new RegExp(`Not attached \\(storage quota exceeded\\): ${FILE_ID}`));

  stdout = "";
  assert.equal(await run(...args, "--json"), 0);
  assert.deepEqual(JSON.parse(stdout).rejected_files, [FILE_ID]);
});

test("session chat output has no rejected_files when every file was attached", async () => {
  on("POST", `/internal/chat/${LINK_ID}/message`, () =>
    _json({ link_id: LINK_ID, building: false, text: "Done.", rejected_files: [] }),
  );
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ url: "" }));
  assert.equal(await run("chat", "--message", "hi", "--link-id", LINK_ID, "--file-id", FILE_ID, "--json"), 0);
  assert.equal("rejected_files" in JSON.parse(stdout), false);
  assert.doesNotMatch(stdout, /Not attached/);
});

test("chat turns get a 120 s timeout by default and --timeout applies to every request", async () => {
  on("POST", `/internal/chat/${LINK_ID}/message`, () => _json({ link_id: LINK_ID, building: false, text: "ok" }));
  on("GET", `/internal/links/${LINK_ID}`, () => _json({ url: "" }));
  on("POST", "/chat", () => _json({ id: LINK_ID, url: "", status: "completed", answer: "ok" }));
  on("GET", `/links/${LINK_ID}`, () => _json({ id: LINK_ID }));
  const chat = ["chat", "--message", "hi", "--link-id", LINK_ID, "--json"];

  // login session
  assert.equal(await run(...chat), 0);
  assert.deepEqual(calls.map((call) => call.timeoutMs), [120000, 30000]);
  calls.length = 0;
  assert.equal(await run("--timeout", "5000", ...chat), 0);
  assert.deepEqual(calls.map((call) => call.timeoutMs), [5000, 5000]);
  calls.length = 0;

  // API key
  assert.equal(await run("--api-key", "k", ...chat), 0);
  assert.equal(await run("--api-key", "k", "links", "get", LINK_ID, "--json"), 0);
  assert.deepEqual(calls.map((call) => call.timeoutMs), [120000, 30000]);
  calls.length = 0;
  assert.equal(await run("--api-key", "k", "--timeout", "5000", ...chat), 0);
  assert.deepEqual(calls.map((call) => call.timeoutMs), [5000]);
});

function _deviceRoutes({ tokenResponse }) {
  on("POST", "/cli/device/code", () =>
    _json({
      device_code: "device-code",
      user_code: "ABCD-2345",
      verification_uri: "https://wisylink.com/cli/authorize",
      verification_uri_complete: "https://wisylink.com/cli/authorize?user_code=ABCD-2345",
      interval: 1,
      expires_in: 900,
    }),
  );
  on("POST", "/cli/device/token", tokenResponse);
}

test("login --json reports the code and URL on stderr, then the result on stdout", async () => {
  _deviceRoutes({
    tokenResponse: () => _json({ token: "new-token", user: { id: "u1", email: "grace@example.com" } }),
  });
  assert.equal(await withTty(() => run("login", "--json"), false), 0);

  const pending = JSON.parse(stderr);
  assert.equal(pending.status, "authorization_pending");
  assert.equal(pending.user_code, "ABCD-2345");
  assert.equal(pending.verification_uri_complete, "https://wisylink.com/cli/authorize?user_code=ABCD-2345");
  assert.equal(pending.expires_in, 900);
  assert.deepEqual(JSON.parse(stdout), { ok: true, user: { id: "u1", email: "grace@example.com" } });
  assert.deepEqual(JSON.parse(calls[1].body), { device_code: "device-code" });
});

test("login without --json prints the code for the user", async () => {
  _deviceRoutes({ tokenResponse: () => _json({ token: "new-token", user: { email: "grace@example.com" } }) });
  assert.equal(await withTty(() => run("login"), false), 0);
  assert.match(stdout, /ABCD-2345/);
  assert.match(stdout, /user_code=ABCD-2345/);
  assert.equal(stderr, "");
});
