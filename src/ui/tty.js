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
  if (sessionUrl) println(`${cyan("│")}  ${bold("Chat")}    ${cyan(sessionUrl)}`);
  if (hostedUrl) println(`${cyan("│")}  ${bold("Preview")} ${cyan(hostedUrl)}`);
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

  const note = typeof report.note === "string" ? report.note.trim() : "";
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];

  if (status) {
    const label =
      status === "building"
        ? yellow("building")
        : status === "completed"
          ? green("completed")
          : status === "aborted"
            ? red("aborted")
            : dim(status);
    println(`${bold("Build")}  ${label}`);
  }

  if (note) println(`${dim("note")}  ${note}`);

  for (const task of tasks) {
    const text = typeof task?.text === "string" ? task.text : String(task || "");
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
    if (typeof report.note === "string" && report.note.trim()) lines += 1;
    if (Array.isArray(report.tasks)) lines += report.tasks.filter((t) => t?.text).length;
  }
  return lines;
}
