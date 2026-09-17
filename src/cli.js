import { createRequire } from "node:module";
import { ParseCliArgs } from "./arg-parser.js";
import {
  ExecuteChat,
  ExecuteFiles,
  ExecuteLinks,
  ExecuteLogin,
  ExecuteLogout,
  ExecuteWhoami,
} from "./commands/index.js";
import { CliError } from "./runtime-error.js";
import { dim, failure, isTty, println } from "./ui/tty.js";

const requireModule = createRequire(import.meta.url);
const packageJson = requireModule("../package.json");
const cliVersion =
  typeof packageJson?.version === "string" ? packageJson.version : "0.0.0";

function _writeJson(value, stream) {
  const target = stream || process.stdout;
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : { value };
  target.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function _renderHelp() {
  return [
    "WisyLink CLI — coding agent for living links",
    "",
    "Usage:",
    "  wisylink <command> [arguments] [flags]",
    "",
    "Auth:",
    "  login                 Sign in with browser device authorization",
    "  logout                Clear saved credentials",
    "  whoami                Show the signed-in account",
    "",
    "Agent:",
    "  chat [--message <text>] [--file-id <id>...] [--link-id <id>]",
    "                        Interactive REPL, or one-shot with --message",
    "",
    "Resources:",
    "  files upload <path>",
    "  files get <id>",
    "  files delete <id>",
    "  links list [--page <n>] [--limit <n>]",
    "  links get <id>",
    "  links delete <id>",
    "",
    "Global flags:",
    "  --api-key <key>       Automation auth (bills to subscription limits)",
    "  --json                Machine-readable JSON output",
    "  --timeout <ms>        Request timeout in milliseconds (1000..120000)",
    "  --help                Show help",
    "  --version             Show version",
    "",
    "Environment:",
    "  WISYLINK_API_KEY      Optional API key for automation / CI",
    "",
    "Session credentials live in ~/.config/wisylink/credentials.json (mode 0600).",
  ].join("\n");
}

function _toErrorPayload(error) {
  if (error instanceof CliError && error.code === "api_error") {
    const payload = error.details?.payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload;
    }
  }

  if (error instanceof CliError) {
    return {
      error: error.code,
      message: error.message,
    };
  }

  return {
    error: "cli_error",
    message: "Unexpected CLI error.",
  };
}

function _toExitCode(error) {
  if (error instanceof CliError) return error.exitCode;
  return 1;
}

function _printHumanError(error) {
  const payload = _toErrorPayload(error);
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : error?.message || "Unexpected CLI error.";
  println(failure(message));
  if (payload.error && isTty()) println(dim(`code: ${payload.error}`));
}

async function _dispatch(parsed) {
  if (parsed.name === "login") return ExecuteLogin(parsed, cliVersion);
  if (parsed.name === "logout") return ExecuteLogout(parsed, cliVersion);
  if (parsed.name === "whoami") return ExecuteWhoami(parsed, cliVersion);
  if (parsed.name === "chat") return ExecuteChat(parsed, cliVersion);
  if (parsed.name.startsWith("files.")) return ExecuteFiles(parsed, cliVersion);
  if (parsed.name.startsWith("links.")) return ExecuteLinks(parsed, cliVersion);
  throw new Error(`Unsupported command: ${parsed.name}`);
}

export async function RunCli(argv = []) {
  let parsed;
  try {
    parsed = ParseCliArgs(argv);
  } catch (error) {
    if (argv.includes("--json")) _writeJson(_toErrorPayload(error), process.stderr);
    else _printHumanError(error);
    return _toExitCode(error);
  }

  if (parsed.kind === "help") {
    process.stdout.write(`${_renderHelp()}\n`);
    return 0;
  }

  if (parsed.kind === "version") {
    process.stdout.write(`${cliVersion}\n`);
    return 0;
  }

  try {
    await _dispatch(parsed);
    return 0;
  } catch (error) {
    if (parsed.global?.json) _writeJson(_toErrorPayload(error), process.stderr);
    else _printHumanError(error);
    return _toExitCode(error);
  }
}
