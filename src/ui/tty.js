const _RESET = "\x1b[0m";
const _BOLD = "\x1b[1m";
const _DIM = "\x1b[2m";
const _CYAN = "\x1b[36m";
const _GREEN = "\x1b[32m";
const _YELLOW = "\x1b[33m";
const _RED = "\x1b[31m";
const _MAGENTA = "\x1b[35m";
const _BLUE = "\x1b[34m";

const _FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Text from the API or the model reaches the terminal only through Clean: C0 controls but newline and tab, DEL, C1,
// the Unicode line and paragraph separators and the bidi controls are removed, so a reply cannot move the cursor,
// clear the screen, retitle the terminal, write the clipboard (OSC 52) or reorder what the user reads. A one-line
// field also folds newlines and tabs into a space, which keeps the report's line count true.
const _UNSAFE_TEXT = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
// JSON.stringify escapes C0 but leaves these raw; escaped, a JSON consumer still gets the exact text.
const _UNSAFE_JSON = /[\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

export function Clean(text, { multiline = false } = {}) {
  const value = String(text ?? "").replace(_UNSAFE_TEXT, "");
  return multiline ? value : value.replace(/[\t\n]+/g, " ");
}

export function SafeJson(value) {
  return JSON.stringify(value, null, 2).replace(
    _UNSAFE_JSON,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function isTty() {
  return Boolean(process.stdout.isTTY);
}

export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function _paint(code, text) {
  if (!isTty()) return String(text);
  return `${code}${text}${_RESET}`;
}

export function bold(text) {
  return _paint(_BOLD, text);
}

export function dim(text) {
  return _paint(_DIM, text);
}

export function cyan(text) {
  return _paint(_CYAN, text);
}

export function green(text) {
  return _paint(_GREEN, text);
}

export function yellow(text) {
  return _paint(_YELLOW, text);
}

export function red(text) {
  return _paint(_RED, text);
}

export function magenta(text) {
  return _paint(_MAGENTA, text);
}

export function blue(text) {
  return _paint(_BLUE, text);
}

export function info(text) {
  return `${cyan("●")} ${text}`;
}

export function success(text) {
  return `${green("✔")} ${text}`;
}

export function warn(text) {
  return `${yellow("!")} ${text}`;
}

export function failure(text) {
  return `${red("✖")} ${text}`;
}

export function println(text = "") {
  process.stdout.write(`${text}\n`);
}

export function newline() {
  process.stdout.write("\n");
}

export function printBanner(title) {
  const label = String(title || "WisyLink").trim();
  if (!isTty()) {
    println(label);
    return;
  }
  println(`${bold(cyan("╭─"))} ${bold(label)}`);
  println(`${cyan("│")}`);
}

export function printSessionUrls({ sessionUrl, hostedUrl }) {
  newline();
  println(`${bold(cyan("╭─ session"))}`);
  if (sessionUrl) println(`${cyan("│")}  ${bold("Chat")}    ${cyan(Clean(sessionUrl))}`);
  if (hostedUrl) println(`${cyan("│")}  ${bold("Preview")} ${cyan(Clean(hostedUrl))}`);
  println(`${cyan("╰────────────────────────────────────────")}`);
  newline();
}

export function createSpinner(label = "") {
  let frame = 0;
  let timer = null;
  let current = String(label || "");
  let active = false;

  function _render() {
    if (!isTty() || !active) return;
    const glyph = _FRAMES[frame % _FRAMES.length];
    frame += 1;
    process.stdout.write(`\r\x1b[K${cyan(glyph)} ${current}`);
  }

  return {
    start(nextLabel) {
      if (nextLabel !== undefined) current = String(nextLabel);
      if (!isTty()) {
        println(`${current}…`);
        return this;
      }
      active = true;
      _render();
      timer = setInterval(_render, 80);
      return this;
    },
    update(nextLabel) {
      current = String(nextLabel || "");
      _render();
      return this;
    },
    succeed(message) {
      this.stop();
      println(success(message || current));
      return this;
    },
    fail(message) {
      this.stop();
      println(failure(message || current));
      return this;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (active && isTty()) process.stdout.write("\r\x1b[K");
      active = false;
      return this;
    },
  };
}

export function renderReport(report, { status } = {}) {
  if (!report || typeof report !== "object") return;

  const note = typeof report.note === "string" ? Clean(report.note).trim() : "";
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];

  if (status) {
    const label =
      status === "building" || status === "queued"
        ? yellow(status)
        : status === "completed"
          ? green("completed")
          : status === "aborted"
            ? red("aborted")
            : dim(Clean(status));
    println(`${bold("Build")}  ${label}`);
  }

  if (note) println(`${dim("note")}  ${note}`);

  for (const task of tasks) {
    const text = Clean(typeof task?.text === "string" ? task.text : String(task || "")).trim();
    if (!text) continue;
    if (task?.done === true) {
      const mark = task.success === false ? red("✗") : green("✓");
      println(`  ${mark} ${text}`);
    } else {
      println(`  ${dim("•")} ${text}`);
    }
  }
}

export function clearReportLines(lineCount) {
  if (!isTty() || !lineCount || lineCount < 1) return;
  for (let i = 0; i < lineCount; i += 1) {
    process.stdout.write("\x1b[1A\x1b[2K");
  }
}

export function countReportLines(report, { status } = {}) {
  let lines = 0;
  if (status) lines += 1;
  if (report && typeof report === "object") {
    if (typeof report.note === "string" && Clean(report.note).trim()) lines += 1;
    if (Array.isArray(report.tasks)) {
      lines += report.tasks.filter((t) => Clean(typeof t?.text === "string" ? t.text : String(t || "")).trim()).length;
    }
  }
  return lines;
}
