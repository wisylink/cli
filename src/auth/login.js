import { spawn } from "node:child_process";
import { platform } from "node:os";
import { DefaultApiUrl, DefaultTimeoutMs } from "../constants.js";
import { CliError } from "../runtime-error.js";
import { WriteCredentials } from "./credentials.js";
import {
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

function _openBrowser(url) {
  const target = String(url || "").trim();
  if (!target) return;
  const os = platform();
  try {
    if (os === "darwin") spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    else if (os === "win32") spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
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

export async function RunDeviceLogin({ userAgent, json = false, openBrowser = true } = {}) {
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
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    interval = 5,
    expires_in: expiresIn = 900,
  } = started.payload || {};

  if (!deviceCode || !userCode || !verificationUri) {
    throw new CliError({
      code: "auth_error",
      message: "Device login response was incomplete.",
      exitCode: 1,
    });
  }

  const authorizeUrl = verificationUriComplete || `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;

  if (json) {
    // Machine-readable bootstrap; caller still polls via this process.
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

  const deadline = Date.now() + Math.max(30, Number(expiresIn) || 900) * 1000;
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
        const email = credentials.user?.email || credentials.user?.name || "account";
        println(success(`Logged in as ${bold(email)}`));
        println(dim("Credentials saved to ~/.config/wisylink/credentials.json"));
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
    process.removeListener("SIGINT", onSigint);
  }
}

export function warnApiKeyOverride() {
  if (!isInteractive()) return;
  println(warn("Using API key auth (--api-key / WISYLINK_API_KEY). Prefer wisylink login for interactive use."));
}
