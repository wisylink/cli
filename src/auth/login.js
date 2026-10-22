import { spawn } from "node:child_process";
import { platform } from "node:os";
import { join } from "node:path";
import { DefaultApiUrl, DefaultTimeoutMs, DeviceAuthorizeUrl } from "../constants.js";
import { CliError } from "../runtime-error.js";
import { CredentialsPath, PrepareCredentialsDir, WriteCredentials } from "./credentials.js";
import {
  Clean,
  dim,
  info,
  success,
  warn,
  bold,
  cyan,
  createSpinner,
  isInteractive,
  newline,
  printBanner,
  println,
} from "../ui/tty.js";

const _MIN_INTERVAL_MS = 1000;
const _MAX_INTERVAL_MS = 10_000;
// The API's codes: two groups of four from an alphabet without 0, O, 1, I and L.
const _USER_CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
// The API's device codes live 15 minutes; a longer expires_in is not waited for.
const _MAX_EXPIRES_S = 900;

async function _requestJson(url, { method = "GET", body, timeoutMs = DefaultTimeoutMs, userAgent } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": userAgent || "wisylink-cli",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // The API never redirects these calls; following one would take the device code elsewhere.
      redirect: "error",
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new CliError({
        code: "timeout_error",
        message: `Request timed out after ${timeoutMs} ms.`,
        exitCode: 1,
      });
    }
    throw new CliError({
      code: "network_error",
      message: "Network error while connecting to WisyLink API.",
      exitCode: 1,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Only ever called with AuthorizeUrl's result: a fixed https origin and a validated code, so no character of it can
// be read as an option or (on Windows) as a shell operator. Windows starts it through rundll32 by its full path,
// never through cmd, which would also be looked up in the current directory first.
function _openBrowser(url) {
  const target = String(url || "").trim();
  if (!target.startsWith(`${DeviceAuthorizeUrl}?`)) return;
  const os = platform();
  try {
    let child;
    if (os === "darwin") child = spawn("/usr/bin/open", [target], { detached: true, stdio: "ignore" });
    else if (os === "win32") {
      const rundll32 = join(process.env.SystemRoot || "C:\\Windows", "System32", "rundll32.exe");
      child = spawn(rundll32, ["url.dll,FileProtocolHandler", target], { detached: true, stdio: "ignore" });
    } else child = spawn("xdg-open", [target], { detached: true, stdio: "ignore" });
    // No opener (a server over SSH, a container): the URL is on screen already.
    child.on("error", () => {});
    child.unref();
  } catch {
    // User can open the URL manually.
  }
}

function _sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function AuthorizeUrl(userCode) {
  return `${DeviceAuthorizeUrl}?user_code=${encodeURIComponent(userCode)}`;
}

function _expiresSeconds(expiresIn) {
  return Math.min(Math.max(30, Number(expiresIn) || _MAX_EXPIRES_S), _MAX_EXPIRES_S);
}

export async function RunDeviceLogin({ userAgent, json = false, openBrowser = true } = {}) {
  // The device code is single-use: a config directory that cannot take the token fails here, before the browser
  // approval, not after it.
  await PrepareCredentialsDir();
  const started = await _requestJson(`${DefaultApiUrl}/cli/device/code`, {
    method: "POST",
    body: {},
    userAgent,
  });

  if (!started.ok) {
    throw new CliError({
      code: "auth_error",
      message: started.payload?.message || "Could not start device login.",
      exitCode: 1,
      details: { status: started.status, payload: started.payload },
    });
  }

  const {
    device_code: deviceCode,
    user_code: userCode,
    interval = 5,
    expires_in: expiresIn = 900,
  } = started.payload || {};

  if (!deviceCode || typeof deviceCode !== "string" || typeof userCode !== "string" || !_USER_CODE.test(userCode)) {
    throw new CliError({
      code: "auth_error",
      message: "Device login response was incomplete.",
      exitCode: 1,
    });
  }

  // The approval page is the CLI's own constant, whatever verification_uri the API sent.
  const authorizeUrl = AuthorizeUrl(userCode);

  if (json) {
    // The code and URL are the only way to finish the login, and the polling below blocks until it is done, so a
    // --json run reports them on stderr and keeps stdout for the single result object.
    process.stderr.write(
      `${JSON.stringify(
        {
          status: "authorization_pending",
          user_code: userCode,
          verification_uri: DeviceAuthorizeUrl,
          verification_uri_complete: authorizeUrl,
          expires_in: _expiresSeconds(expiresIn),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    printBanner("WisyLink login");
    println(`${info("Confirm this code in your browser:")}`);
    newline();
    println(`  ${bold(cyan(userCode))}`);
    newline();
    println(`${dim("Open")} ${cyan(authorizeUrl)}`);
    newline();
    if (openBrowser && isInteractive()) {
      println(dim("Opening browser…"));
      _openBrowser(authorizeUrl);
    }
  }

  const deadline = Date.now() + _expiresSeconds(expiresIn) * 1000;
  let waitMs = Math.min(Math.max((Number(interval) || 5) * 1000, _MIN_INTERVAL_MS), _MAX_INTERVAL_MS);
  const spinner = json ? null : createSpinner("Waiting for authorization");
  spinner?.start();

  const abort = new AbortController();
  const onSigint = () => abort.abort();
  process.once("SIGINT", onSigint);

  try {
    while (Date.now() < deadline) {
      await _sleep(waitMs, abort.signal);
      const poll = await _requestJson(`${DefaultApiUrl}/cli/device/token`, {
        method: "POST",
        body: { device_code: deviceCode },
        userAgent,
      });

      if (poll.status === 429) {
        waitMs = Math.min(waitMs * 2, _MAX_INTERVAL_MS);
        spinner?.update("Rate limited — slowing poll");
        continue;
      }

      if (!poll.ok) {
        spinner?.fail("Login failed");
        throw new CliError({
          code: "auth_error",
          message: poll.payload?.message || "Device login failed.",
          exitCode: 1,
          details: { status: poll.status, payload: poll.payload },
        });
      }

      if (poll.payload?.status === "pending") {
        spinner?.update("Waiting for authorization");
        continue;
      }

      if (poll.payload?.status === "expired") {
        spinner?.fail("Code expired");
        throw new CliError({
          code: "auth_error",
          message: "Device code expired. Run wisylink login again.",
          exitCode: 1,
        });
      }

      const token = typeof poll.payload?.token === "string" ? poll.payload.token.trim() : "";
      if (!token) {
        spinner?.fail("Login failed");
        throw new CliError({
          code: "auth_error",
          message: "No session token returned.",
          exitCode: 1,
        });
      }

      const credentials = await WriteCredentials({
        token,
        user: poll.payload.user || null,
      });
      spinner?.succeed("Signed in");
      if (!json) {
        const email = Clean(credentials.user?.email || credentials.user?.name || "account");
        println(success(`Logged in as ${bold(email)}`));
        println(dim(`Credentials saved to ${CredentialsPath()}`));
      }
      return credentials;
    }

    spinner?.fail("Timed out");
    throw new CliError({
      code: "auth_error",
      message: "Timed out waiting for authorization.",
      exitCode: 1,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      spinner?.fail("Cancelled");
      throw new CliError({
        code: "cancelled",
        message: "Login cancelled.",
        exitCode: 130,
      });
    }
    throw error;
  } finally {
    spinner?.stop();
    process.removeListener("SIGINT", onSigint);
  }
}

export function warnApiKeyOverride() {
  if (!isInteractive()) return;
  println(warn("Using API key auth (--api-key / WISYLINK_API_KEY). Prefer wisylink login for interactive use."));
}
