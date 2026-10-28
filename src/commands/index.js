import { createInterface } from "node:readline";
import { ClearCredentials, ReadCredentials } from "../auth/credentials.js";
import { RunDeviceLogin, warnApiKeyOverride } from "../auth/login.js";
import { CreateApiClient } from "../api/http-client.js";
import { BuildStatus, IsBuildActive } from "../build-status.js";
import { CreateSessionClient, SessionUrl } from "../api/session-client.js";
import { CreateWisyLinkClient } from "../node-client.js";
import { CliError } from "../runtime-error.js";
import {
  AssertIdentifier,
  AssertLinkId,
  NormalizeFileIds,
  NormalizeListLimit,
  NormalizeListPage,
  NormalizeMessage,
  ParseChatTimeoutMs,
  ParseGlobalRuntimeOptions,
} from "../validators.js";
import {
  Clean,
  SafeJson,
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
  warn,
  yellow,
} from "../ui/tty.js";

function _userAgent(version) {
  return `wisylink-cli/${version}`;
}

function _writeJson(value) {
  const payload =
    value && typeof value === "object" && !Array.isArray(value) ? value : { value };
  process.stdout.write(`${SafeJson(payload)}\n`);
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
      chatTimeoutMs: ParseChatTimeoutMs(command.global.timeoutMs),
      userAgent: _userAgent(version),
    }),
  };
}

// Polls a link's build until it settles. A queued build keeps the poll going: it has not run yet.
export async function PollBuild({ sessionClient, linkId, json, abortSignal, intervalMs = 2500 }) {
  if (json || !linkId) return null;

  let lastLines = 0;
  let lastFingerprint = "";
  const spinnerLabel = (state) => (state === BuildStatus.Queued ? "Build queued" : "Building preview");
  const spinner = createSpinner(spinnerLabel(BuildStatus.Building));
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
      if (IsBuildActive(status?.status)) spinner.start(spinnerLabel(status.status));
    }
    return status;
  };

  try {
    while (!abortSignal.aborted) {
      const status = await pollOnce();
      const state = status?.status;
      if (state === BuildStatus.Completed) {
        spinner.stop();
        println(success("Build completed"));
        return status;
      }
      if (state === BuildStatus.Aborted) {
        spinner.stop();
        println(failure("Build aborted"));
        return status;
      }
      if (state && !IsBuildActive(state)) {
        spinner.stop();
        return status;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, intervalMs);
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
    if (error?.name === "AbortError") return { status: BuildStatus.Aborted, cancelled: true };
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
  // Files the API left off the link because they would exceed the account's storage quota.
  const rejectedFiles = Array.isArray(result?.rejected_files) ? result.rejected_files.map(String) : [];
  const output = {
    id,
    url: hostedUrl,
    session_url: sessionUrl,
    building: !!result?.building,
    answer: typeof result?.text === "string" ? result.text : "",
    ...(rejectedFiles.length ? { rejected_files: rejectedFiles } : {}),
  };

  if (json) {
    _writeJson(output);
    return { ...output, linkId: id };
  }

  if (output.answer) {
    newline();
    println(`${bold("Wisy")}`);
    println(Clean(output.answer, { multiline: true }));
  }

  if (rejectedFiles.length) {
    println(warn(`Not attached (storage quota exceeded): ${Clean(rejectedFiles.join(", "))}`));
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
      await PollBuild({
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
    println(Clean(result.answer, { multiline: true }));
  }
  printSessionUrls({
    sessionUrl: SessionUrl(result?.id),
    hostedUrl: result?.url,
  });
  if (IsBuildActive(result?.status)) {
    const verb = result.status === BuildStatus.Queued ? "queued" : "started";
    println(yellow(`Build ${verb}. Check its status with: wisylink links get ${Clean(result.id)}`));
  }
  return result;
}

// `readLine` replaces the terminal prompt (tests); it resolves to the next line, or undefined at end of input.
export async function ChatRepl({
  auth,
  json,
  linkId: initialLinkId = "",
  fileIds: initialFileIds = [],
  readLine,
}) {
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

  // --link-id continues that link; --file-id attaches to the first turn only.
  let linkId = initialLinkId;
  let pendingFileIds = initialFileIds;
  if (linkId) println(info(`Continuing link ${bold(linkId)}.`));
  const rl = readLine
    ? null
    : createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const prompt =
    readLine ||
    (() =>
      new Promise((resolve) => {
        rl.question(`${green("›")} `, resolve);
      }));

  try {
    while (true) {
      const line = await prompt();
      const message = String(line || "").trim();
      if (!message) break;

      if (auth.mode === "session") {
        const turn = await _runSessionChatTurn({
          client: auth.client,
          message,
          fileIds: pendingFileIds,
          linkId,
          json: false,
        });
        linkId = turn.linkId || linkId;
      } else {
        const turn = await _runApiChat({
          client: auth.client,
          message,
          fileIds: pendingFileIds,
          linkId,
          json: false,
        });
        linkId = turn?.id || linkId;
      }
      pendingFileIds = [];
      newline();
    }
  } finally {
    rl?.close();
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

// Ends the session on the server first, then removes the local file: a copy of the token left anywhere (a backup,
// another disk) stops working too. A session the API already ended (401) counts as revoked.
export async function ExecuteLogout(command, version) {
  let credentials = null;
  let revoked = null;
  let reason = "";
  try {
    credentials = await ReadCredentials();
  } catch (error) {
    // an unreadable file is still removed below, but its session could not be ended
    revoked = false;
    reason = Clean(error?.message || "unreadable credentials");
  }
  if (credentials?.token) {
    try {
      const client = CreateSessionClient({
        token: credentials.token,
        timeoutMs: command.global.timeoutMs,
        userAgent: _userAgent(version),
      });
      await client.revokeSession();
      revoked = true;
    } catch (error) {
      revoked = error?.details?.status === 401;
      if (!revoked) reason = Clean(error?.message || "unknown error");
    }
  }
  await ClearCredentials();
  if (command.global.json) _writeJson({ ok: true, session_revoked: revoked });
  else if (revoked === false) {
    println(warn(`Logged out on this machine, but the session could not be ended on the server (${reason}).`));
    println(dim("End it under Sessions on wisylink.com."));
  } else println(success("Logged out."));
  return null;
}

export async function ExecuteWhoami(command, version) {
  const auth = await _resolveAuth(command, version);
  if (auth.mode === "apikey") {
    // whoami has no API-key endpoint to ask, so it says what it knows: a key is set, not that the API accepts it.
    const payload = { mode: "api_key", message: "API key set (not verified; any command checks it)." };
    if (command.global.json) _writeJson(payload);
    else println(info(payload.message));
    return null;
  }

  let session = null;
  try {
    session = await auth.client.whoami();
  } catch (error) {
    // An ended session is an answer, not a reason to show the account saved at login. Only a failure to
    // reach the API (network, timeout, a 5xx) falls back to that saved account.
    if (error?.code === "auth_error" || error?.details?.status === 401) throw error;
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
    println(success(`Signed in as ${bold(Clean(payload.user.email || payload.user.name))}`));
  } else {
    println(info("Signed in (session token present)."));
  }
  return null;
}

// The same input rules as the Node client, applied before any request and whatever the auth mode: a login
// session's chat endpoint would otherwise accept an 11th file id by silently dropping it.
function _validateChatArgs(args) {
  return {
    message: args.message === undefined ? undefined : NormalizeMessage(args.message),
    fileIds: NormalizeFileIds(args.fileIds),
    linkId: args.linkId === undefined ? undefined : AssertLinkId(args.linkId, "--link-id"),
  };
}

export async function ExecuteChat(command, version) {
  const { message, fileIds, linkId } = _validateChatArgs(command.args);
  const auth = await _resolveAuth(command, version);

  if (!message) {
    return ChatRepl({
      auth,
      json: command.global.json,
      linkId: linkId || "",
      fileIds,
    });
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
  const id =
    command.name === "files.upload" ? undefined : AssertIdentifier(command.args.id, "file id");
  const auth = await _resolveAuth(command, version);
  let output;

  // Both clients expose the same upload/get/delete methods.
  if (command.name === "files.upload") output = await auth.client.uploadFile(command.args.path);
  else if (command.name === "files.get") output = await auth.client.getFile(id);
  else if (command.name === "files.delete") output = await auth.client.deleteFile(id);

  if (command.global.json || !isInteractive()) _writeJson(output);
  else if (command.name === "files.upload") println(success(`Uploaded ${bold(Clean(output.id))}`));
  else if (command.name === "files.delete") println(success("Deleted."));
  else _writeJson(output);
  return null;
}

export async function ExecuteLinks(command, version) {
  const isList = command.name === "links.list";
  const id = isList ? undefined : AssertLinkId(command.args.id, "link id");
  const list = isList
    ? {
        page: NormalizeListPage(command.args.page),
        limit: NormalizeListLimit(command.args.limit),
      }
    : undefined;
  const auth = await _resolveAuth(command, version);
  let output;

  // Both clients expose the same list/get/delete methods.
  if (isList) output = await auth.client.listLinks(list);
  else if (command.name === "links.get") output = await auth.client.getLink(id);
  else if (command.name === "links.delete") output = await auth.client.deleteLink(id);

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
