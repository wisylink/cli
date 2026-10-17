export const DefaultApiUrl = "https://api.wisylink.com";
export const DefaultTimeoutMs = 30000;
export const MinTimeoutMs = 1000;
export const MaxTimeoutMs = 120000;
export const MaxMessageLength = 5000;
export const MaxFileIdsPerRequest = 10;
export const MaxListLimit = 100;
export const DefaultListLimit = 20;
// A login session lists at most 25 links per page (GET /internal/links); the API-key plane allows MaxListLimit.
export const MaxSessionListLimit = 25;

// File ids are 24 lowercase hex characters (app.hex_id); the API reads them case-insensitively.
export const IdentifierRegex = /^[a-f0-9]{24}$/;
// Link ids are exactly 6 lowercase alphanumerics (app.link_id in the API): the link's hostname label.
// The API matches them as stored, with no case folding, so neither do we.
export const LinkIdRegex = /^[a-z0-9]{6}$/;


export const SupportedFileExtensions = [
  "jpeg",
  "jpg",
  "png",
  "webp",
  "gif",
  "heic",
  "svg",
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
