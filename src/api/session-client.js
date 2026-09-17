import { readFile, stat } from "node:fs/promises";
import { DefaultApiUrl, DefaultTimeoutMs } from "../constants.js";
import { CliError } from "../runtime-error.js";
import { NormalizeApiUrl, ParseTimeoutMs, ResolveFixedApiUrl } from "../validators.js";

const _maxChunkBytes = 4 * 1024 * 1024;
const _WEB_ORIGIN = "https://wisylink.com";

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
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return { error: "invalid_api_response", message: "API returned a non-object JSON payload." };
  } catch {
    return { error: "invalid_api_response", message: "API returned a non-JSON response." };
  }
}

function _extractApiMessage(payload, status) {
  if (payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return `API request failed with status ${status}.`;
}

async function _readUploadSource(filePath) {
  const safePath = typeof filePath === "string" ? filePath.trim() : "";
  if (!safePath) {
    throw new CliError({ code: "usage_error", message: "file path is required.", exitCode: 2 });
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
    throw new CliError({ code: "usage_error", message: "Upload file is empty.", exitCode: 2 });
  }

  return { size: buffer.length, body: buffer };
}

async function _requestJson({ token, userAgent, timeoutMs, ...request }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
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
        exitCode: response.status === 401 ? 1 : 1,
        details: { status: response.status, payload },
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof CliError) throw error;
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

export function SessionUrl(linkId) {
  const id = String(linkId || "").trim();
  return id ? `${_WEB_ORIGIN}/chat/${id}` : "";
}

export function CreateSessionClient(options = {}) {
  const token = typeof options.token === "string" ? options.token.trim() : "";
  if (!token) {
    throw new CliError({
      code: "auth_error",
      message: "Not logged in. Run wisylink login, or pass --api-key for automation.",
      exitCode: 1,
    });
  }

  const apiUrl = ResolveFixedApiUrl(options.apiUrl);
  const timeoutMs = ParseTimeoutMs(options.timeoutMs ?? DefaultTimeoutMs);
  const userAgent =
    typeof options.userAgent === "string" && options.userAgent.trim()
      ? options.userAgent.trim()
      : "wisylink-cli";

  const request = (args) => _requestJson({ token, userAgent, timeoutMs, ...args });

  return {
    async whoami() {
      const payload = await request({
        method: "GET",
        url: _joinApiUrl(apiUrl || DefaultApiUrl, "/auth/get-session"),
      });
      return payload;
    },

    async uploadFile(filePath) {
      const uploadSource = await _readUploadSource(filePath);
      const createPayload = await request({
        method: "POST",
        url: _joinApiUrl(apiUrl, "/internal/files"),
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
        const query = new URLSearchParams({ id: uploadId });
        if (isLast) query.set("last", "true");

        lastResponse = await request({
          method: "POST",
          url: _joinApiUrl(apiUrl, `/internal/files/chunks?${query}`),
          body: chunkBody,
          headers: { "content-type": "application/octet-stream" },
        });
      }

      if (String(lastResponse?.id || "").trim() !== uploadId || lastResponse?.ok !== true) {
        throw new CliError({
          code: "api_error",
          message: "Upload did not complete successfully.",
          exitCode: 1,
        });
      }

      return { id: uploadId, ok: true };
    },

    async getFile(fileId) {
      return request({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/internal/files/${fileId}`),
      });
    },

    async deleteFile(fileId) {
      return request({
        method: "DELETE",
        url: _joinApiUrl(apiUrl, `/internal/files/${fileId}`),
      });
    },

    async chatMessage({ linkId, content, fileIds = [] }) {
      const id = linkId ? String(linkId).trim() : "new";
      const body = { content: String(content || "") };
      if (fileIds.length) body.file_ids = fileIds;

      return request({
        method: "POST",
        url: _joinApiUrl(apiUrl, `/internal/chat/${id}/message`),
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
    },

    async stopBuild(linkId) {
      const id = String(linkId || "").trim();
      if (!id) return { ok: true, aborted: false };
      return request({
        method: "POST",
        url: _joinApiUrl(apiUrl, `/internal/chat/${id}/stop`),
      });
    },

    async buildStatus({ chatId, linkId }) {
      const query = new URLSearchParams();
      if (chatId) query.set("chat_id", String(chatId));
      else if (linkId) query.set("link_id", String(linkId));
      return request({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/internal/build-status?${query}`),
      });
    },

    async getLink(linkId) {
      return request({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/internal/links/${linkId}`),
      });
    },

    async listLinks({ page, limit, sortBy = "last_message_at", sortOrder = "desc" } = {}) {
      const query = new URLSearchParams();
      if (page !== undefined) query.set("page", String(page));
      if (limit !== undefined) query.set("limit", String(limit));
      if (sortBy) query.set("sort_by", String(sortBy));
      if (sortOrder) query.set("sort_order", String(sortOrder));
      const suffix = query.toString() ? `?${query}` : "";
      return request({
        method: "GET",
        url: _joinApiUrl(apiUrl, `/internal/links${suffix}`),
      });
    },

    async deleteLink(linkId) {
      return request({
        method: "DELETE",
        url: _joinApiUrl(apiUrl, `/internal/links/${linkId}`),
      });
    },
  };
}
