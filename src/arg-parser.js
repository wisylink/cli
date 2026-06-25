import { CliError } from "./runtime-error.js";

function _usageError(message) {
  return new CliError({
    code: "usage_error",
    message,
    exitCode: 2,
  });
}

function _splitLongFlag(token) {
  if (!token.startsWith("--")) return null;
  const body = token.slice(2);
  if (!body) return null;

  const equalIndex = body.indexOf("=");
  if (equalIndex === -1) {
    return {
      name: body,
      value: undefined,
      hasInlineValue: false,
    };
  }

  return {
    name: body.slice(0, equalIndex),
    value: body.slice(equalIndex + 1),
    hasInlineValue: true,
  };
}

function _readFlagValue(tokens, index, parsedFlag, label) {
  if (parsedFlag.hasInlineValue) return { value: parsedFlag.value, next: index };

  const nextIndex = index + 1;
  if (nextIndex >= tokens.length) {
    throw _usageError(`${label} requires a value.`);
  }
  if (tokens[nextIndex].startsWith("--")) {
    throw _usageError(`${label} requires a value.`);
  }

  return { value: tokens[nextIndex], next: nextIndex };
}

function _parseGlobalOptions(argv) {
  const global = {
    help: false,
    version: false,
    apiKey: undefined,
    timeoutMs: undefined,
  };

  const commandTokens = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      global.help = true;
      continue;
    }
    if (token === "--version" || token === "-v") {
      global.version = true;
      continue;
    }

    const parsedFlag = _splitLongFlag(token);
    if (!parsedFlag) {
      commandTokens.push(token);
      continue;
    }

    if (parsedFlag.name === "api-key") {
      const { value, next } = _readFlagValue(argv, i, parsedFlag, "--api-key");
      global.apiKey = value;
      i = next;
      continue;
    }

    if (parsedFlag.name === "api-url") {
      throw _usageError(
        "--api-url is not supported. API URL is fixed to https://wisylink.com/api."
      );
    }

    if (parsedFlag.name === "timeout") {
      const { value, next } = _readFlagValue(argv, i, parsedFlag, "--timeout");
      global.timeoutMs = value;
      i = next;
      continue;
    }

    commandTokens.push(token);
  }

  return { global, commandTokens };
}

function _parseFlags(tokens, allowedMap) {
  const positionals = [];
  const values = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const parsedFlag = _splitLongFlag(token);
    if (!parsedFlag) {
      positionals.push(token);
      continue;
    }

    const rule = allowedMap[parsedFlag.name];
    if (!rule) {
      throw _usageError(`Unknown flag: --${parsedFlag.name}`);
    }

    const { value, next } = _readFlagValue(
      tokens,
      i,
      parsedFlag,
      `--${parsedFlag.name}`
    );
    i = next;

    if (rule.repeatable) {
      values[parsedFlag.name] = values[parsedFlag.name] || [];
      values[parsedFlag.name].push(value);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(values, parsedFlag.name)) {
      throw _usageError(`Duplicate flag: --${parsedFlag.name}`);
    }
    values[parsedFlag.name] = value;
  }

  return { positionals, values };
}

function _parseFilesCommand(tokens) {
  const action = tokens[0];
  if (!action) {
    throw _usageError("files command requires an action: upload, get, delete.");
  }

  if (action === "upload") {
    const parsed = _parseFlags(tokens.slice(1), {});
    if (parsed.positionals.length !== 1) {
      throw _usageError("Usage: wisylink files upload <path>");
    }
    return {
      kind: "command",
      name: "files.upload",
      args: {
        path: parsed.positionals[0],
      },
    };
  }

  if (action === "get") {
    const parsed = _parseFlags(tokens.slice(1), {});
    if (parsed.positionals.length !== 1) {
      throw _usageError("Usage: wisylink files get <id>");
    }
    return {
      kind: "command",
      name: "files.get",
      args: {
        id: parsed.positionals[0],
      },
    };
  }

  if (action === "delete") {
    const parsed = _parseFlags(tokens.slice(1), {});
    if (parsed.positionals.length !== 1) {
      throw _usageError("Usage: wisylink files delete <id>");
    }
    return {
      kind: "command",
      name: "files.delete",
      args: {
        id: parsed.positionals[0],
      },
    };
  }

  throw _usageError(`Unknown files action: ${action}`);
}

function _parseChatCommand(tokens) {
  const parsed = _parseFlags(tokens, {
    message: { repeatable: false },
    "file-id": { repeatable: true },
    "link-id": { repeatable: false },
  });

  if (!parsed.values.message) {
    throw _usageError("Usage: wisylink chat --message <text> [--file-id <id>...] [--link-id <id>]");
  }

  return {
    kind: "command",
    name: "chat",
    args: {
      message: parsed.values.message,
      fileIds: parsed.values["file-id"] || [],
      linkId: parsed.values["link-id"],
    },
  };
}

function _parseLinksCommand(tokens) {
  const action = tokens[0];
  if (!action) {
    throw _usageError("links command requires an action: list, get, delete.");
  }

  if (action === "list") {
    const parsed = _parseFlags(tokens.slice(1), {
      page: { repeatable: false },
      limit: { repeatable: false },
    });

    if (parsed.positionals.length) {
      throw _usageError("Usage: wisylink links list [--page <n>] [--limit <n>]");
    }

    return {
      kind: "command",
      name: "links.list",
      args: {
        page: parsed.values.page,
        limit: parsed.values.limit,
      },
    };
  }

  if (action === "get") {
    const parsed = _parseFlags(tokens.slice(1), {});
    if (parsed.positionals.length !== 1) {
      throw _usageError("Usage: wisylink links get <id>");
    }
    return {
      kind: "command",
      name: "links.get",
      args: {
        id: parsed.positionals[0],
      },
    };
  }

  if (action === "delete") {
    const parsed = _parseFlags(tokens.slice(1), {});
    if (parsed.positionals.length !== 1) {
      throw _usageError("Usage: wisylink links delete <id>");
    }
    return {
      kind: "command",
      name: "links.delete",
      args: {
        id: parsed.positionals[0],
      },
    };
  }

  throw _usageError(`Unknown links action: ${action}`);
}

export function ParseCliArgs(argv = []) {
  const safeArgv = Array.isArray(argv) ? argv : [];
  const parsed = _parseGlobalOptions(safeArgv);

  if (parsed.global.help) {
    return {
      kind: "help",
      global: parsed.global,
    };
  }

  if (parsed.commandTokens.length === 0) {
    if (parsed.global.version) {
      return {
        kind: "version",
        global: parsed.global,
      };
    }
    return {
      kind: "help",
      global: parsed.global,
    };
  }

  const group = parsed.commandTokens[0];
  if (group === "help") {
    return {
      kind: "help",
      global: parsed.global,
    };
  }

  const commandTokens = parsed.commandTokens.slice(1);
  const command =
    group === "files"
      ? _parseFilesCommand(commandTokens)
      : group === "chat"
      ? _parseChatCommand(commandTokens)
      : group === "links"
      ? _parseLinksCommand(commandTokens)
      : null;

  if (!command) {
    throw _usageError(`Unknown command group: ${group}`);
  }

  return {
    ...command,
    global: parsed.global,
  };
}
