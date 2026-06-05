import { CreateWisyLinkClient } from "./node-client.js";
import { ParseGlobalRuntimeOptions } from "./validators.js";

function _buildClientOptions(command, version) {
  const runtime = ParseGlobalRuntimeOptions({
    apiKey: command.global.apiKey,
    timeoutMs: command.global.timeoutMs,
  });
  return { ...runtime, userAgent: `wisylink-cli/${version}` };
}

function _toChatInput(args) {
  const input = {};
  if (args.prompt !== undefined)   input.prompt = args.prompt;
  if (args.messages !== undefined) input.messages = args.messages;
  if (args.fileIds !== undefined)  input.fileIds = args.fileIds;
  if (args.linkId !== undefined)   input.linkId = args.linkId;
  return input;
}

export async function ExecuteCommand(command, version) {
  const client = CreateWisyLinkClient(_buildClientOptions(command, version));

  if (command.name === "files.upload")  return client.uploadFile(command.args.path);
  if (command.name === "files.get")     return client.getFile(command.args.id);
  if (command.name === "files.delete")  return client.deleteFile(command.args.id);

  if (command.name === "links.chat")    return client.chat(_toChatInput(command.args));
  if (command.name === "links.get")     return client.getLink(command.args.id);
  if (command.name === "links.delete")  return client.deleteLink(command.args.id);

  throw new Error(`Unsupported command: ${command.name}`);
}
