import { DefaultTimeoutMs } from "./constants.js";
import { CreateApiClient } from "./http-client.js";
import {
  AssertApiKey,
  AssertIdentifier,
  NormalizeFileIds,
  NormalizeMessage,
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

function _buildChatPayload(input) {
  const data = _asObject(input);

  const payload = { message: NormalizeMessage(data.message) };

  const fileIds = NormalizeFileIds(data.fileIds);
  if (fileIds.length) payload.file_ids = fileIds;

  // Optional: `id` in body = continue an existing link
  if (data.linkId) {
    payload.id = AssertIdentifier(data.linkId, "link id");
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

    // chat: create a new link or continue an existing one from a message.
    // input: { message, fileIds?, linkId? }
    async chat(input) {
      const payload = _buildChatPayload(input);
      return apiClient.Chat(payload);
    },

    async getLink(linkId) {
      const id = AssertIdentifier(linkId, "link id");
      return apiClient.GetLink(id);
    },

    async deleteLink(linkId) {
      const id = AssertIdentifier(linkId, "link id");
      return apiClient.DeleteLink(id);
    },
  };
}
