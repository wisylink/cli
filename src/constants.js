export const DefaultApiUrl = "https://wisylink.com/api";
export const DefaultTimeoutMs = 30000;
export const MinTimeoutMs = 1000;
export const MaxTimeoutMs = 120000;
export const MaxPromptLength = 5000;
export const MaxFileIdsPerRequest = 10;
export const IdentifierRegex = /^[a-f0-9]{24}$/;

export const LinkTypeValues = [
  "image",
  "audio",
  "video",
  "pdf",
  "page",
];

export const LinkTypeSet = new Set(LinkTypeValues);

export const ContentTypeByExtension = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  html: "text/html",
};

export const SupportedFileExtensions = [
  "jpeg",
  "jpg",
  "png",
  "mp3",
  "mp4",
  "pdf",
  "xlsx",
  "docx",
  "csv",
  "txt",
  "json",
  "html",
];


