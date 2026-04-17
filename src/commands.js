import { CreateWisyLinkClient } from "./node-client.js";
import { ParseGlobalRuntimeOptions, ParseBooleanValue } from "./validators.js";

function _buildClientOptions(command, version) {
  const runtime = ParseGlobalRuntimeOptions({
    apiKey: command.global.apiKey,
    timeoutMs: command.global.timeoutMs,
  });

  return {
    ...runtime,
    userAgent: `wisylink-cli/${version}`,
  };
}

function _toCreateInput(args) {
  const input = {
    type: args.type,
    prompt: args.prompt,
    fileIds: args.fileIds || [],
  };

  if (args.hosted !== undefined) {
    input.hosted = ParseBooleanValue(args.hosted, "hosted");
  }
  if (args.private !== undefined) {
    input.private = ParseBooleanValue(args.private, "private");
  }

  return input;
}

function _toUpdateInput(args) {
  const input = {};
  if (args.prompt !== undefined) {
    input.prompt = args.prompt;
  }
  if (args.hosted !== undefined) {
    input.hosted = ParseBooleanValue(args.hosted, "hosted");
  }
  if (args.private !== undefined) {
    input.private = ParseBooleanValue(args.private, "private");
  }
  if (args.fileIds !== undefined) {
    input.fileIds = args.fileIds;
  }
  return input;
}

export async function ExecuteCommand(command, version) {
  const client = CreateWisyLinkClient(_buildClientOptions(command, version));

  if (command.name === "files.upload") {
    return client.uploadFile(command.args.path);
  }
  if (command.name === "files.get") {
    return client.getFile(command.args.id);
  }
  if (command.name === "files.delete") {
    return client.deleteFile(command.args.id);
  }

  if (command.name === "links.create") {
    return client.createLink(_toCreateInput(command.args));
  }
  if (command.name === "links.get") {
    return client.getLink(command.args.id);
  }
  if (command.name === "links.update") {
    return client.updateLink(command.args.id, _toUpdateInput(command.args));
  }
  if (command.name === "links.delete") {
    return client.deleteLink(command.args.id);
  }

  throw new Error(`Unsupported command: ${command.name}`);
}
