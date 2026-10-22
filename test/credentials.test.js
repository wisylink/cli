import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialsPath, ReadCredentials, WriteCredentials } from "../src/auth/credentials.js";
import { CreateSessionClient } from "../src/api/session-client.js";
import { CreateApiClient } from "../src/api/http-client.js";
import { Clean, SafeJson } from "../src/ui/tty.js";

const posix = process.platform !== "win32";
let root;
let savedXdg;

beforeEach(async () => {
  savedXdg = process.env.XDG_CONFIG_HOME;
  root = await mkdtemp(join(tmpdir(), "wisylink-cred-test-"));
  process.env.XDG_CONFIG_HOME = root;
});

afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdg;
  await rm(root, { recursive: true, force: true });
});

test("credentials are written 0600 in a 0700 directory", { skip: !posix }, async () => {
  await WriteCredentials({ token: "t1", user: { email: "a@example.com" } });
  assert.equal((await stat(join(root, "wisylink"))).mode & 0o777, 0o700);
  assert.equal((await stat(CredentialsPath())).mode & 0o777, 0o600);
  assert.equal((await ReadCredentials()).token, "t1");
});

test("a symlink at the credentials path is replaced, never written through", { skip: !posix }, async () => {
  await mkdir(join(root, "wisylink"), { mode: 0o700 });
  const victim = join(root, "victim.txt");
  await writeFile(victim, "keep me");
  await symlink(victim, CredentialsPath());
  await WriteCredentials({ token: "t2", user: null });
  assert.equal(await readFile(victim, "utf8"), "keep me");
  assert.equal((await lstat(CredentialsPath())).isSymbolicLink(), false);
  assert.equal((await ReadCredentials()).token, "t2");
});

test("a symlinked config directory is refused", { skip: !posix }, async () => {
  const elsewhere = join(root, "elsewhere");
  await mkdir(elsewhere, { mode: 0o700 });
  await symlink(elsewhere, join(root, "wisylink"));
  await assert.rejects(WriteCredentials({ token: "t3", user: null }), /not a plain directory/);
  assert.equal(await readlink(join(root, "wisylink")), elsewhere);
});

test("an open directory and a readable file are closed again", { skip: !posix }, async () => {
  await mkdir(join(root, "wisylink"), { mode: 0o755 });
  await chmod(join(root, "wisylink"), 0o755);
  await writeFile(CredentialsPath(), JSON.stringify({ token: "t4" }), { mode: 0o644 });
  await chmod(CredentialsPath(), 0o644);
  assert.equal((await ReadCredentials()).token, "t4");
  assert.equal((await stat(CredentialsPath())).mode & 0o777, 0o600);
  await WriteCredentials({ token: "t5", user: null });
  assert.equal((await stat(join(root, "wisylink"))).mode & 0o777, 0o700);
});

test("a relative XDG_CONFIG_HOME is ignored", () => {
  process.env.XDG_CONFIG_HOME = "relative/dir";
  assert.ok(!CredentialsPath().startsWith("relative"));
  assert.match(CredentialsPath(), /\.config[\\/]wisylink[\\/]credentials\.json$/);
});

test("an unreadable credentials file is an error, not 'not logged in'", { skip: !posix || process.getuid?.() === 0 }, async () => {
  await WriteCredentials({ token: "t6", user: null });
  await chmod(CredentialsPath(), 0o000);
  await assert.rejects(ReadCredentials(), /Cannot read/);
});

test("a file over 25 MB is refused before it is read or sent", async () => {
  const big = join(root, "big.bin");
  await writeFile(big, "");
  await truncate(big, 25 * 1024 * 1024 + 1);
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("{}", { status: 200 });
  };
  try {
    await assert.rejects(CreateSessionClient({ token: "t" }).uploadFile(big), /larger than 25 MB/);
    await assert.rejects(CreateApiClient({ apiKey: "k" }).UploadFile(big), /larger than 25 MB/);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(requests, 0);
});

test("Clean strips control sequences; SafeJson escapes what JSON.stringify leaves raw", () => {
  const text = "a\u001b]52;c;eA==\u0007b\u001b[2J\u009b\u202Ec\td\re\nf\u2028g";
  assert.equal(Clean(text), "a]52;c;eA==b[2Jc de fg");
  assert.equal(Clean(text, { multiline: true }), "a]52;c;eA==b[2Jc\tde\nfg");
  const json = SafeJson({ text: "x\u007f\u009b\u202E\u2028y" });
  assert.doesNotMatch(json, /[\u007f-\u009f\u202E\u2028]/);
  assert.equal(JSON.parse(json).text, "x\u007f\u009b\u202E\u2028y");
});
