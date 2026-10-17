// Build states the API reports for a link (src/api/build/build-status.js in the API repo). `idle` means no build
// has run yet; it is an answer, never stored. A queued build is waiting behind a running one for the same link.
export const BuildStatus = Object.freeze({
  Building: "building",
  Queued: "queued",
  Completed: "completed",
  Aborted: "aborted",
  Idle: "idle",
});

// A build that is still going to produce a result: running now, or queued to start.
export function IsBuildActive(status) {
  return status === BuildStatus.Building || status === BuildStatus.Queued;
}
