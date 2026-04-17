import { createRequire } from "node:module";
import { ParseCliArgs } from "./arg-parser.js";
import { ExecuteCommand } from "./commands.js";
import { CliError } from "./runtime-error.js";

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
    "WisyLink CLI",
    "",
    "Usage:",
    "  wisylink <group> <command> [arguments] [flags]",
    "",
    "Groups:",
    "  files upload <path>",
    "  files get <id>",
    "  files delete <id>",
    "  links create --type <type> --prompt <prompt> [--hosted true|false] [--private true|false] [--file-id <id> ...]",
    "  links get <id>",
    "  links update <id> [--prompt <prompt>] [--hosted true|false] [--private true|false] [--file-id <id> ...]",
    "  links delete <id>",
    "",
    "Global flags:",
    "  --api-key <key>      Override WISYLINK_API_KEY",
    "  --timeout <ms>       Request timeout in milliseconds (1000..120000)",
    "  --help               Show help",
    "  --version            Show version",
    "",
    "Environment:",
    "  WISYLINK_API_KEY     Required if --api-key is not provided",
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

export async function RunCli(argv = []) {
  let parsed;
  try {
    parsed = ParseCliArgs(argv);
  } catch (error) {
    _writeJson(_toErrorPayload(error), process.stderr);
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
    const output = await ExecuteCommand(parsed, cliVersion);
    _writeJson(output, process.stdout);
    return 0;
  } catch (error) {
    _writeJson(_toErrorPayload(error), process.stderr);
    return _toExitCode(error);
  }
}
