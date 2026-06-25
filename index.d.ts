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

export interface ListLinksInput {
  /** 1-based page number (default 1) */
  page?: number;
  /** Items per page, 1..100 (default 20) */
  limit?: number;
}

export interface LinkSummary {
  id: string;
  url: string;
  /** Link build status: building | completed | aborted | idle */
  status: string;
  meta: { title?: string; description?: string } | null;
  file_ids: string[];
  created_at: number;
  updated_at: number;
}

export interface ListLinksResult {
  items: LinkSummary[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
}

export interface WisyLinkClient {
  uploadFile(filePath: string): Promise<Record<string, unknown>>;
  getFile(fileId: string): Promise<Record<string, unknown>>;
  deleteFile(fileId: string): Promise<Record<string, unknown>>;
  /** Create or continue a link via conversation (POST /chat) */
  chat(input: ChatInput): Promise<ChatResult>;
  /** Page through your links, newest first (GET /links) */
  listLinks(input?: ListLinksInput): Promise<ListLinksResult>;
  getLink(linkId: string): Promise<Record<string, unknown>>;
  deleteLink(linkId: string): Promise<Record<string, unknown>>;
}

export declare function CreateWisyLinkClient(options?: ClientOptions): WisyLinkClient;

export declare const DefaultApiUrl: string;
export declare const DefaultTimeoutMs: number;
export declare const MaxFileIdsPerRequest: number;
export declare const MaxListLimit: number;
export declare const SupportedFileExtensions: string[];
