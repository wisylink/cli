export const DefaultApiUrl = "https://api.wisylink.com";
// The page that approves a device login. The CLI builds its address itself and never opens one the API sends.
export const DeviceAuthorizeUrl = "https://wisylink.com/cli/authorize";
export const DefaultTimeoutMs = 30000;
// A chat turn can take up to two minutes on the server, so without an
// explicit --timeout / timeoutMs a chat request gets the maximum instead of the 30 s every other request gets.
export const DefaultChatTimeoutMs = 120000;
export const MinTimeoutMs = 1000;
export const MaxTimeoutMs = 120000;
export const MaxMessageLength = 5000;
// The API's per-file ceiling (MAX_UPLOAD_BYTES); a larger file is refused before it is read into memory.
export const MaxUploadBytes = 25 * 1024 * 1024;
export const MaxFileIdsPerRequest = 10;
export const MaxListLimit = 100;
export const DefaultListLimit = 20;
// A login session lists at most 25 links per page; the API-key plane allows MaxListLimit.
export const MaxSessionListLimit = 25;

// File ids are 24 lowercase hex characters; the API reads them case-insensitively.
export const IdentifierRegex = /^[a-f0-9]{24}$/;
// Link ids are exactly 6 lowercase alphanumerics: the link's hostname label.
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
  "zip",
  "wasm",
];
