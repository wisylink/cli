export class CliError extends Error {
  constructor({ code, message, exitCode = 1, details = null }) {
    super(message);
    this.name = "CliError";
    this.code = typeof code === "string" && code ? code : "cli_error";
    this.exitCode = Number.isInteger(exitCode) ? exitCode : 1;
    this.details = details;
  }
}
