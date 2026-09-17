import { createInterface } from "node:readline";
import { ClearCredentials, ReadCredentials } from "../auth/credentials.js";
import { RunDeviceLogin, warnApiKeyOverride } from "../auth/login.js";
import { CreateApiClient } from "../api/http-client.js";
import { CreateSessionClient, SessionUrl } from "../api/session-client.js";
import { CreateWisyLinkClient } from "../node-client.js";
import { CliError } from "../runtime-error.js";
import { ParseGlobalRuntimeOptions } from "../validators.js";
import {
  bold,
  clearReportLines,
  countReportLines,
  createSpinner,
  dim,
  failure,
  green,
  info,
  isInteractive,
  newline,
  printSessionUrls,
  println,
  renderReport,
  success,
  yellow,
} from "../ui/tty.js";

function _userAgent(version) {
  return `wisylink-cli/${version}`;
}

function _writeJson(value) {
  const payload =
    value && typeof value === "object" && !Array.isArray(value) ? value : { value };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function _resolveAuth(command, version) {
  const apiKey = command.global.apiKey ?? process.env.WISYLINK_API_KEY;
  if (apiKey && String(apiKey).trim()) {
    if (!command.global.json) warnApiKeyOverride();
    const runtime = ParseGlobalRuntimeOptions({
      apiKey,
      timeoutMs: command.global.timeoutMs,
    });
    return {
      mode: "apikey",
      client: CreateWisyLinkClient({ ...runtime, userAgent: _userAgent(version) }),
      api: CreateApiClient({ ...runtime, userAgent: _userAgent(version) }),
    };
  }

  const credentials = await ReadCredentials();
  if (!credentials?.token) {
    throw new CliError({
      code: "auth_error",
      message: "Not logged in. Run wisylink login, or pass --api-key / set WISYLINK_API_KEY.",
      exitCode: 1,
    });
  }

  return {
    mode: "session",
    credentials,
    client: CreateSessionClient({
      token: credentials.token,
      timeoutMs: command.global.timeoutMs,
      userAgent: _userAgent(version),
    }),
  };
}

async function _pollBuild({ sessionClient, linkId, json, abortSignal }) {
  if (json || !linkId) return null;

  let lastLines = 0;
  let lastFingerprint = "";
  const spinner = createSpinner("Building preview");
  spinner.start();

  const pollOnce = async () => {
    const status = await sessionClient.buildStatus({ linkId });
    const fingerprint = JSON.stringify({
      status: status?.status || null,
      note: status?.report?.note || null,
      tasks: status?.report?.tasks || null,
    });
    if (fingerprint !== lastFingerprint) {
      spinner.stop();
      clearReportLines(lastLines);
      renderReport(status?.report, { status: status?.status });
      lastLines = countReportLines(status?.report, { status: status?.status });
      lastFingerprint = fingerprint;
      if (status?.status === "building") spinner.start("Building preview");
    }
    return status;
  };

  try {
    while (!abortSignal.aborted) {
      const status = await pollOnce();
      const state = status?.status;
      if (state === "completed") {
        spinner.stop();
        println(success("Build completed"));
        return status;
      }
      if (state === "aborted") {
        spinner.stop();
        println(failure("Build aborted"));
        return status;
      }
      if (state && state !== "building") {
        spinner.stop();
        return status;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 2500);
        const onAbort = () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener("abort", onAbort, { once: true });
      });
    }
  } catch (error) {
    spinner.stop();
    if (error?.name === "AbortError") return { status: "aborted", cancelled: true };
    throw error;
  }

  return null;
}

async function _runSessionChatTurn({ client, message, fileIds, linkId, json }) {
  const spinner = json ? null : createSpinner("Talking to Wisy");
  spinner?.start();

  let result;
  try {
    result = await client.chatMessage({
      linkId,
      content: message,
      fileIds: fileIds || [],
    });
  } catch (error) {
    spinner?.fail("Chat failed");
    throw error;
  }

  spinner?.succeed("Wisy replied");

  const id = String(result?.link_id || linkId || "").trim();
  let hostedUrl = "";
  if (id) {
    try {
      const link = await client.getLink(id);
      hostedUrl = String(link?.url || link?.item?.url || "").trim();
    } catch {
      hostedUrl = id ? `https://${id}.wisylink.com` : "";
    }
  }

  const sessionUrl = SessionUrl(id);
  const output = {
    id,
    url: hostedUrl,
    session_url: sessionUrl,
    building: !!result?.building,
    answer: typeof result?.text === "string" ? result.text : "",
  };

  if (json) {
    _writeJson(output);
    return { ...output, linkId: id };
  }

  if (output.answer) {
    newline();
    println(`${bold("Wisy")}`);
    println(output.answer);
  }

  printSessionUrls({ sessionUrl, hostedUrl });

  if (result?.building && id) {
    println(dim("Ctrl+C stops the build."));
    const abort = new AbortController();
    const onSigint = async () => {
      abort.abort();
      try {
        await client.stopBuild(id);
      } catch {
        // best-effort
      }
    };
    process.once("SIGINT", onSigint);
    try {
      await _pollBuild({
        sessionClient: client,
        linkId: id,
        json: false,
        abortSignal: abort.signal,
      });
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  }

  return { ...output, linkId: id };
}

async function _runApiChat({ client, message, fileIds, linkId, json }) {
  const result = await client.chat({
    message,
    fileIds,
    linkId,
  });

  if (json) {
    _writeJson({
      ...result,
      session_url: SessionUrl(result?.id),
    });
    return result;
  }

  if (result?.answer) {
    newline();
    println(`${bold("Wisy")}`);
    println(result.answer);
  }
  printSessionUrls({
    sessionUrl: SessionUrl(result?.id),
    hostedUrl: result?.url,
  });
  if (result?.status === "building") {
    println(yellow("Build started. Poll status with: wisylink links get <id>"));
  }
  return result;
}

async function _chatRepl({ auth, json }) {
  if (json) {
    throw new CliError({
      code: "usage_error",
      message: "REPL chat requires an interactive TTY. Pass --message with --json.",
      exitCode: 2,
    });
  }
  if (!isInteractive()) {
    throw new CliError({
      code: "usage_error",
      message: "No TTY. Pass --message <text> for a one-shot chat.",
      exitCode: 2,
    });
  }

  println(info("Interactive chat. Empty line or Ctrl+D to exit. Ctrl+C stops an active build."));
  newline();

  let linkId = "";
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const prompt = () =>
    new Promise((resolve) => {
      rl.question(`${green("›")} `, resolve);
    });

  try {
    while (true) {
      const line = await prompt();
      const message = String(line || "").trim();
      if (!message) break;

      if (auth.mode === "session") {
        const turn = await _runSessionChatTurn({
          client: auth.client,
          message,
          linkId,
          json: false,
        });
        linkId = turn.linkId || linkId;
      } else {
        const turn = await _runApiChat({
          client: auth.client,
          message,
          linkId,
          json: false,
        });
        linkId = turn?.id || linkId;
      }
      newline();
    }
  } finally {
    rl.close();
  }

  return { ok: true, link_id: linkId || null };
}

export async function ExecuteLogin(command, version) {
  const credentials = await RunDeviceLogin({
    userAgent: _userAgent(version),
    json: command.global.json,
    openBrowser: command.global.json !== true,
  });
  if (command.global.json) _writeJson({ ok: true, user: credentials.user || null });
  return null;
}

export async function ExecuteLogout(command) {
  await ClearCredentials();
  if (command.global.json) _writeJson({ ok: true });
  else println(success("Logged out."));
  return null;
}

export async function ExecuteWhoami(command, version) {
  const auth = await _resolveAuth(command, version);
  if (auth.mode === "apikey") {
    const payload = { mode: "api_key", message: "Authenticated with API key." };
    if (command.global.json) _writeJson(payload);
    else println(info("Authenticated with API key."));
    return null;
  }

  let session = null;
  try {
    session = await auth.client.whoami();
  } catch {
    session = null;
  }

  const user = session?.user || auth.credentials?.user || null;
  const payload = {
    mode: "session",
    user: user
      ? {
          id: user.id || user._id || null,
          email: user.email || null,
          name: user.name || null,
        }
      : null,
  };

  if (command.global.json) _writeJson(payload);
  else if (payload.user?.email || payload.user?.name) {
    println(success(`Signed in as ${bold(payload.user.email || payload.user.name)}`));
  } else {
    println(info("Signed in (session token present)."));
  }
  return null;
}

export async function ExecuteChat(command, version) {
  const auth = await _resolveAuth(command, version);
  const message = command.args.message;
  const fileIds = command.args.fileIds || [];
  const linkId = command.args.linkId;

  if (!message) {
    return _chatRepl({ auth, json: command.global.json });
  }

  if (auth.mode === "session") {
    await _runSessionChatTurn({
      client: auth.client,
      message,
      fileIds,
      linkId,
      json: command.global.json,
    });
    return null;
  }

  await _runApiChat({
    client: auth.client,
    message,
    fileIds,
    linkId,
    json: command.global.json,
  });
  return null;
}

export async function ExecuteFiles(command, version) {
  const auth = await _resolveAuth(command, version);
  let output;

  if (auth.mode === "session") {
    if (command.name === "files.upload") output = await auth.client.uploadFile(command.args.path);
    else if (command.name === "files.get") output = await auth.client.getFile(command.args.id);
    else if (command.name === "files.delete") output = await auth.client.deleteFile(command.args.id);
  } else {
    if (command.name === "files.upload") output = await auth.client.uploadFile(command.args.path);
    else if (command.name === "files.get") output = await auth.client.getFile(command.args.id);
    else if (command.name === "files.delete") output = await auth.client.deleteFile(command.args.id);
  }

  if (command.global.json || !isInteractive()) _writeJson(output);
  else if (command.name === "files.upload") println(success(`Uploaded ${bold(output.id)}`));
  else if (command.name === "files.delete") println(success("Deleted."));
  else _writeJson(output);
  return null;
}

export async function ExecuteLinks(command, version) {
  const auth = await _resolveAuth(command, version);
  let output;

  if (auth.mode === "session") {
    if (command.name === "links.list") {
      output = await auth.client.listLinks({
        page: command.args.page,
        limit: command.args.limit,
      });
    } else if (command.name === "links.get") {
      output = await auth.client.getLink(command.args.id);
    } else if (command.name === "links.delete") {
      output = await auth.client.deleteLink(command.args.id);
    }
  } else if (command.name === "links.list") {
    output = await auth.client.listLinks(command.args);
  } else if (command.name === "links.get") {
    output = await auth.client.getLink(command.args.id);
  } else if (command.name === "links.delete") {
    output = await auth.client.deleteLink(command.args.id);
  }

  if (command.global.json || !isInteractive()) _writeJson(output);
  else if (command.name === "links.delete") println(success("Deleted."));
  else if (command.name === "links.get") {
    const item = output?.item || output;
    printSessionUrls({
      sessionUrl: SessionUrl(item?.id),
      hostedUrl: item?.url,
    });
    _writeJson(item);
  } else _writeJson(output);
  return null;
}
