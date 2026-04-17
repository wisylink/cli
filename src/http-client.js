import { readFile, stat } from "node:fs/promises";
import { CliError } from "./runtime-error.js";
import { NormalizeApiUrl, ParseTimeoutMs, ResolveFixedApiUrl } from "./validators.js";
const _maxChunkBytes = 4 * 1024 * 1024;

function _joinApiUrl(baseUrl, path) {
  const normalizedBase = NormalizeApiUrl(baseUrl);
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}

async function _readResponseJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {
      error: "invalid_api_response",
      message: "API returned a non-object JSON payload.",
    };
  } catch {
    return {
      error: "invalid_api_response",
      message: "API returned a non-JSON response.",
    };
  }
}

function _extractApiMessage(payload, status) {
  if (payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return `API request failed with status ${status}.`;
}

function _toChunkUploadUrl(baseUrl, fileId, last = false) {
  const query = new URLSearchParams();
  query.set("id", String(fileId || "").trim());
  if (last === true) query.set("last", "true");
  return _joinApiUrl(baseUrl, `/files/chunks?${query.toString()}`);
}

async function _readUploadSource(filePath) {
  const safePath = typeof filePath === "string" ? filePath.trim() : "";
  if (!safePath) {
    throw new CliError({
      code: "usage_error",
      message: "file path is required.",
      exitCode: 2,
    });
  }

  let fileStats;
  try {
    fileStats = await stat(safePath);
  } catch {
    throw new CliError({
      code: "usage_error",
      message: `File was not found: ${safePath}`,
      exitCode: 2,
    });
  }

  if (!fileStats.isFile()) {
    throw new CliError({
      code: "usage_error",
      message: `Path is not a file: ${safePath}`,
      exitCode: 2,
    });
  }

  const buffer = await readFile(safePath);
  if (!buffer.length) {
    throw new CliError({
      code: "usage_error",
      message: "Upload file is empty.",
      exitCode: 2,
    });
  }

  return {
    size: buffer.length,
    body: buffer,
  };
}

async function _requestJson({ apiKey, userAgent, timeoutMs, ...request }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      accept: "application/json",
      "x-api-key": apiKey,
      "user-agent": userAgent,
      ...(request.headers || {}),
    };

    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body,
      signal: controller.signal,
    });

    const payload = await _readResponseJson(response);
    if (!response.ok) {
      throw new CliError({
        code: "api_error",
        message: _extractApiMessage(payload, response.status),
        exitCode: 1,
        details: {
          status: response.status,
          payload,
        },
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

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

export function CreateApiClient(options = {}) {
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!apiKey) {
    throw new CliError({
      code: "usage_error",
      message: "API key is required.",
      exitCode: 2,
    });
  }

  const apiUrl = ResolveFixedApiUrl(options.apiUrl);
  const timeoutMs = ParseTimeoutMs(options.timeoutMs);
  const userAgent =
    typeof options.userAgent === "string" && options.userAgent.trim()
      ? options.userAgent.trim()
      : "wisylink-cli";

  return {
    async UploadFile(filePath) {
      const uploadSource = await _readUploadSource(filePath);
      const createPayload = await _requestJson({
        method: "POST",
        url: _joinApiUrl(apiUrl, "/files"),
        apiKey,
        userAgent,
        timeoutMs,
      });

      const uploadId = String(createPayload?.id || "").trim();
      if (!uploadId) {
        throw new CliError({
          code: "api_error",
          message: "File id was not returned by API.",
          exitCode: 1,
        });
      }

      const chunkCount = Math.max(Math.ceil(uploadSource.size / _maxChunkBytes), 1);
      let lastResponse = null;
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * _maxChunkBytes;
        const end = Math.min(start + _maxChunkBytes, uploadSource.size);
        const chunkBody = uploadSource.body.subarray(start, end);
        const isLast = chunkIndex === chunkCount - 1;

        lastResponse = await _requestJson({
          method: "POST",
          url: _toChunkUploadUrl(apiUrl, uploadId, isLast),
          body: chunkBody,
          headers: {
            "content-type": "application/octet-stream",
          },
          apiKey,
          userAgent,
          timeoutMs,
        });
      }

      const responseId = String(lastResponse?.id || "").trim();
      const responseOk = lastResponse?.ok === true;
      if (responseId !== uploadId || !responseOk) {
        throw new CliError({
          code: "api_error",
          message: "Upload did not complete successfully.",
          exitCode: 1,
        });
      }

      return {
        id: uploadId,
        ok: true,
      };
    },

    async GetFile(fileId) {
      return _requestJson({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/files/${fileId}`),
        apiKey,
        userAgent,
        timeoutMs,
      });
    },

    async DeleteFile(fileId) {
      return _requestJson({
        method: "DELETE",
        url: _joinApiUrl(apiUrl, `/files/${fileId}`),
        apiKey,
        userAgent,
        timeoutMs,
      });
    },

    async CreateLink(payload) {
      return _requestJson({
        method: "POST",
        url: _joinApiUrl(apiUrl, "/links"),
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
        apiKey,
        userAgent,
        timeoutMs,
      });
    },

    async GetLink(linkId) {
      return _requestJson({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/links/${linkId}`),
        apiKey,
        userAgent,
        timeoutMs,
      });
    },

    async UpdateLink(linkId, payload) {
      return _requestJson({
        method: "PATCH",
        url: _joinApiUrl(apiUrl, `/links/${linkId}`),
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
        apiKey,
        userAgent,
        timeoutMs,
      });
    },

    async DeleteLink(linkId) {
      return _requestJson({
        method: "DELETE",
        url: _joinApiUrl(apiUrl, `/links/${linkId}`),
        apiKey,
        userAgent,
        timeoutMs,
      });
    },
  };
}
