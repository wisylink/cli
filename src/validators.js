import {
  DefaultApiUrl,
  DefaultTimeoutMs,
  IdentifierRegex,
  LinkTypeSet,
  MaxFileIdsPerRequest,
  MaxPromptLength,
  MaxTimeoutMs,
  MinTimeoutMs,
} from "./constants.js";
import { CliError } from "./runtime-error.js";

function _asString(value) {
  return typeof value === "string" ? value : "";
}

function _toInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const raw = _asString(value).trim();
  if (!raw) return NaN;
  return Number.parseInt(raw, 10);
}

function _usageError(message) {
  return new CliError({
    code: "usage_error",
    message,
    exitCode: 2,
  });
}

export function AssertApiKey(value) {
  const apiKey = _asString(value).trim();
  if (!apiKey) {
    throw _usageError(
      "API key is required. Set WISYLINK_API_KEY or pass --api-key.",
    );
  }
  return apiKey;
}

export function NormalizeApiUrl(value) {
  const raw = _asString(value).trim() || DefaultApiUrl;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw _usageError("Invalid API URL. Use a valid http(s) URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw _usageError("API URL must start with http:// or https://.");
  }
  if (parsed.search || parsed.hash) {
    throw _usageError(
      "API URL must not include query params or hash fragments.",
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (!parsed.pathname) parsed.pathname = "/";

  return parsed.toString().replace(/\/+$/, "");
}

export function ResolveFixedApiUrl(value) {
  if (value === undefined || value === null || value === "") {
    return DefaultApiUrl;
  }

  const normalized = NormalizeApiUrl(value);
  if (normalized !== DefaultApiUrl) {
    throw _usageError(`API URL is fixed to ${DefaultApiUrl}.`);
  }

  return DefaultApiUrl;
}

export function ParseTimeoutMs(value) {
  if (value === undefined || value === null || value === "") {
    return DefaultTimeoutMs;
  }

  const timeoutMs = _toInteger(value);
  if (!Number.isInteger(timeoutMs)) {
    throw _usageError("--timeout must be an integer in milliseconds.");
  }
  if (timeoutMs < MinTimeoutMs || timeoutMs > MaxTimeoutMs) {
    throw _usageError(
      `--timeout must be between ${MinTimeoutMs} and ${MaxTimeoutMs} ms.`,
    );
  }

  return timeoutMs;
}

export function AssertIdentifier(value, label = "id") {
  const normalized = _asString(value).trim().toLowerCase();
  if (!IdentifierRegex.test(normalized)) {
    throw _usageError(`${label} must be a 24-character hex string.`);
  }
  return normalized;
}

export function AssertLinkType(value) {
  const type = _asString(value).trim().toLowerCase().replace(/-/g, "_");
  if (!LinkTypeSet.has(type)) {
    throw _usageError("type must be one of: image, audio, video, pdf, page.");
  }
  return type;
}

export function NormalizePrompt(value, options = {}) {
  const { optional = false } = options;
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw _usageError("prompt is required.");
  }

  const prompt = _asString(value).trim();
  if (!prompt) {
    throw _usageError(
      optional
        ? "prompt cannot be empty when provided."
        : "prompt is required.",
    );
  }
  if (prompt.length > MaxPromptLength) {
    throw _usageError(`prompt is too long (max ${MaxPromptLength} chars).`);
  }

  return prompt;
}

export function ParseBooleanValue(value, label = "value") {
  if (typeof value === "boolean") return value;

  const raw = _asString(value).trim().toLowerCase();
  if (!raw) {
    throw _usageError(`${label} must be true or false.`);
  }

  if (["true", "1", "yes", "y"].includes(raw)) return true;
  if (["false", "0", "no", "n"].includes(raw)) return false;
  throw _usageError(`${label} must be true or false.`);
}

export function NormalizeFileIds(values, options = {}) {
  const { optional = true } = options;
  if (values === undefined || values === null) {
    return optional ? [] : undefined;
  }

  const list = Array.isArray(values) ? values : [values];
  const unique = new Set();

  for (const value of list) {
    const normalized = AssertIdentifier(value, "file-id");
    unique.add(normalized);
  }

  if (unique.size > MaxFileIdsPerRequest) {
    throw _usageError(
      `file-id supports at most ${MaxFileIdsPerRequest} items per request.`,
    );
  }

  return Array.from(unique);
}

export function ParseGlobalRuntimeOptions(options = {}) {
  const apiKeySource = options.apiKey ?? process.env.WISYLINK_API_KEY;
  const timeoutSource = options.timeoutMs;

  return {
    apiKey: AssertApiKey(apiKeySource),
    apiUrl: ResolveFixedApiUrl(options.apiUrl),
    timeoutMs: ParseTimeoutMs(timeoutSource),
  };
}
