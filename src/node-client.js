import { DefaultTimeoutMs } from "./constants.js";
import { CreateApiClient } from "./http-client.js";
import { CliError } from "./runtime-error.js";
import {
  AssertApiKey,
  AssertIdentifier,
  AssertLinkType,
  NormalizeFileIds,
  NormalizePrompt,
  ParseBooleanValue,
  ResolveFixedApiUrl,
} from "./validators.js";

function _asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function _resolveClientOptions(options = {}) {
  const apiKey = AssertApiKey(options.apiKey ?? process.env.WISYLINK_API_KEY);
  const apiUrl = ResolveFixedApiUrl(options.apiUrl);

  return {
    apiKey,
    apiUrl,
    timeoutMs: options.timeoutMs ?? DefaultTimeoutMs,
    userAgent: options.userAgent,
  };
}

function _buildCreatePayload(input) {
  const data = _asObject(input);
  const payload = {
    type: AssertLinkType(data.type),
    prompt: NormalizePrompt(data.prompt),
  };

  if (data.hosted !== undefined) {
    payload.hosted = ParseBooleanValue(data.hosted, "hosted");
  }
  if (data.private !== undefined) {
    payload.private = ParseBooleanValue(data.private, "private");
  }

  const fileIds = NormalizeFileIds(data.fileIds);
  if (fileIds.length) {
    payload.file_ids = fileIds;
  }

  return payload;
}

function _buildUpdatePayload(input) {
  const data = _asObject(input);
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(data, "prompt")) {
    payload.prompt = NormalizePrompt(data.prompt, { optional: true });
  }
  if (Object.prototype.hasOwnProperty.call(data, "hosted")) {
    payload.hosted = ParseBooleanValue(data.hosted, "hosted");
  }
  if (Object.prototype.hasOwnProperty.call(data, "private")) {
    payload.private = ParseBooleanValue(data.private, "private");
  }
  if (Object.prototype.hasOwnProperty.call(data, "fileIds")) {
    payload.file_ids = NormalizeFileIds(data.fileIds);
  }

  const hasAnyField = Object.values(payload).some(
    (fieldValue) => fieldValue !== undefined
  );
  if (!hasAnyField) {
    throw new CliError({
      code: "usage_error",
      message:
        "At least one update field is required: prompt, hosted, private, or fileIds.",
      exitCode: 2,
    });
  }

  return payload;
}

export function CreateWisyLinkClient(options = {}) {
  const clientOptions = _resolveClientOptions(options);
  const apiClient = CreateApiClient(clientOptions);

  return {
    async uploadFile(filePath) {
      return apiClient.UploadFile(filePath);
    },

    async getFile(fileId) {
      const id = AssertIdentifier(fileId, "file id");
      return apiClient.GetFile(id);
    },

    async deleteFile(fileId) {
      const id = AssertIdentifier(fileId, "file id");
      return apiClient.DeleteFile(id);
    },

    async createLink(input) {
      const payload = _buildCreatePayload(input);
      return apiClient.CreateLink(payload);
    },

    async getLink(linkId) {
      const id = AssertIdentifier(linkId, "link id");
      return apiClient.GetLink(id);
    },

    async updateLink(linkId, input) {
      const id = AssertIdentifier(linkId, "link id");
      const payload = _buildUpdatePayload(input);
      return apiClient.UpdateLink(id, payload);
    },

    async deleteLink(linkId) {
      const id = AssertIdentifier(linkId, "link id");
      return apiClient.DeleteLink(id);
    },
  };
}
