export type LinkType = "image" | "audio" | "video" | "pdf" | "page";

export interface ClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface CreateLinkInput {
  type: LinkType;
  prompt: string;
  hosted?: boolean;
  private?: boolean;
  fileIds?: string[];
}

export interface UpdateLinkInput {
  prompt?: string;
  hosted?: boolean;
  private?: boolean;
  fileIds?: string[];
}

export interface WisyLinkClient {
  uploadFile(filePath: string): Promise<Record<string, unknown>>;
  getFile(fileId: string): Promise<Record<string, unknown>>;
  deleteFile(fileId: string): Promise<Record<string, unknown>>;
  createLink(input: CreateLinkInput): Promise<Record<string, unknown>>;
  getLink(linkId: string): Promise<Record<string, unknown>>;
  updateLink(linkId: string, input: UpdateLinkInput): Promise<Record<string, unknown>>;
  deleteLink(linkId: string): Promise<Record<string, unknown>>;
}

export declare function CreateWisyLinkClient(options?: ClientOptions): WisyLinkClient;

export declare const DefaultApiUrl: string;
export declare const DefaultTimeoutMs: number;
export declare const MaxPromptLength: number;
export declare const MaxFileIdsPerRequest: number;
export declare const LinkTypeValues: LinkType[];
export declare const SupportedFileExtensions: string[];


