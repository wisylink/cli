import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { CliError } from "../runtime-error.js";

const _DIR_MODE = 0o700;
const _FILE_MODE = 0o600;
// Windows has no POSIX modes or uids; the file is private through the user profile's ACL there.
const _POSIX = process.platform !== "win32";

function _configDir() {
  const xdg = typeof process.env.XDG_CONFIG_HOME === "string" ? process.env.XDG_CONFIG_HOME.trim() : "";
  // The XDG base directory spec ignores a relative XDG_CONFIG_HOME, so a working directory never holds the token.
  if (xdg && isAbsolute(xdg)) return join(xdg, "wisylink");
  return join(homedir(), ".config", "wisylink");
}

export function CredentialsPath() {
  return join(_configDir(), "credentials.json");
}

function _credentialsError(message) {
  return new CliError({ code: "auth_error", message, exitCode: 1 });
}

// The directory must be a real directory of this user, not a symlink, and closed to group and others.
async function _assertPrivateDir(dir) {
  const info = await lstat(dir);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw _credentialsError(`${dir} is not a plain directory; remove it and run wisylink login again.`);
  }
  if (!_POSIX) return;
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw _credentialsError(`${dir} belongs to another user; remove it and run wisylink login again.`);
  }
  if (info.mode & 0o077) await chmod(dir, _DIR_MODE);
}

export async function ReadCredentials() {
  const path = CredentialsPath();
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw _credentialsError(`Cannot read ${path} (${error?.code || "error"}).`);
  }
  if (_POSIX) {
    // A file left readable by group or others (an older version, a copy) is closed again before it is used.
    try {
      const info = await lstat(path);
      if (!info.isSymbolicLink() && info.mode & 0o077) await chmod(path, _FILE_MODE);
    } catch {
      // the token is still read; tightening is best-effort
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (!token) return null;
    return {
      token,
      user:
        parsed.user && typeof parsed.user === "object" && !Array.isArray(parsed.user)
          ? parsed.user
          : null,
      created_at: typeof parsed.created_at === "string" ? parsed.created_at : null,
    };
  } catch {
    return null;
  }
}

// Written to a new file created exclusively with mode 0600 next to the target, synced, then renamed over it: the
// token is never in a file with wider permissions, never written through a symlink, and never half-written.
export async function WriteCredentials({ token, user }) {
  const path = CredentialsPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: _DIR_MODE });
  await _assertPrivateDir(dir);

  const payload = {
    token: String(token || "").trim(),
    user: user && typeof user === "object" ? user : null,
    created_at: new Date().toISOString(),
  };

  const temp = join(dir, `.credentials-${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(temp, "wx", _FILE_MODE);
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return payload;
}

export async function ClearCredentials() {
  const path = CredentialsPath();
  try {
    await rm(path, { force: true });
  } catch (error) {
    throw _credentialsError(`Cannot remove ${path} (${error?.code || "error"}).`);
  }
}
