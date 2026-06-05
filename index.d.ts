export interface ClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatInput {
  /** Shorthand: auto-wrapped as a single user message */
  prompt?: string;
  /** Full conversation history */
  messages?: ChatMessage[];
  /** Reference files to attach */
  fileIds?: string[];
  /** Continue an existing link (optional) */
  linkId?: string;
}

export interface WisyLinkClient {
  uploadFile(filePath: string): Promise<Record<string, unknown>>;
  getFile(fileId: string): Promise<Record<string, unknown>>;
  deleteFile(fileId: string): Promise<Record<string, unknown>>;
  /** Create or continue a link via conversation (POST /links) */
  chat(input: ChatInput): Promise<Record<string, unknown>>;
  getLink(linkId: string): Promise<Record<string, unknown>>;
  deleteLink(linkId: string): Promise<Record<string, unknown>>;
}

export declare function CreateWisyLinkClient(options?: ClientOptions): WisyLinkClient;

export declare const DefaultApiUrl: string;
export declare const DefaultTimeoutMs: number;
export declare const MaxPromptLength: number;
export declare const MaxFileIdsPerRequest: number;
export declare const SupportedFileExtensions: string[];
