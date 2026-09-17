import { homedir } from "node:os";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const _DIR_MODE = 0o700;
const _FILE_MODE = 0o600;

function _configDir() {
  const xdg = typeof process.env.XDG_CONFIG_HOME === "string" ? process.env.XDG_CONFIG_HOME.trim() : "";
  if (xdg) return join(xdg, "wisylink");
  return join(homedir(), ".config", "wisylink");
}

export function CredentialsPath() {
  return join(_configDir(), "credentials.json");
}

export async function ReadCredentials() {
  try {
    const raw = await readFile(CredentialsPath(), "utf8");
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
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

export async function WriteCredentials({ token, user }) {
  const path = CredentialsPath();
  await mkdir(dirname(path), { recursive: true, mode: _DIR_MODE });
  try {
    await chmod(dirname(path), _DIR_MODE);
  } catch {
    // best-effort on platforms that ignore mode
  }

  const payload = {
    token: String(token || "").trim(),
    user: user && typeof user === "object" ? user : null,
    created_at: new Date().toISOString(),
  };

  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: _FILE_MODE });
  try {
    await chmod(path, _FILE_MODE);
  } catch {
    // best-effort
  }
  return payload;
}

export async function ClearCredentials() {
  try {
    await rm(CredentialsPath(), { force: true });
  } catch {
    // ignore
  }
}
