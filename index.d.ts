export interface ClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface ChatInput {
  /** The message to send to Wisy */
  message?: string;
  /** Reference files to attach */
  fileIds?: string[];
  /** Continue an existing link (optional) */
  linkId?: string;
}

export interface ChatResult {
  id: string;
  url: string;
  /** Link build status: building | completed | aborted | idle */
  status: string;
  answer: string;
  created_at: number;
  updated_at: number;
}

export interface WisyLinkClient {
  uploadFile(filePath: string): Promise<Record<string, unknown>>;
  getFile(fileId: string): Promise<Record<string, unknown>>;
  deleteFile(fileId: string): Promise<Record<string, unknown>>;
  /** Create or continue a link via conversation (POST /links) */
  chat(input: ChatInput): Promise<ChatResult>;
  getLink(linkId: string): Promise<Record<string, unknown>>;
  deleteLink(linkId: string): Promise<Record<string, unknown>>;
}

export declare function CreateWisyLinkClient(options?: ClientOptions): WisyLinkClient;

export declare const DefaultApiUrl: string;
export declare const DefaultTimeoutMs: number;
export declare const MaxFileIdsPerRequest: number;
export declare const SupportedFileExtensions: string[];
