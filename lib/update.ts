import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./db";
import { isDeb } from "./version";

// The .deb's root-owned economy-update.path unit installs the latest release when the request file appears,
// and reports in the status file ("running" or "error"; removed on success). See packaging/deb/update.sh.
const request = path.join(dataDir, "update-request");
const status = path.join(dataDir, "update-status");
// A run that never reported back (no updater unit, machine rebooted mid-way) counts as failed.
const STALE = 15 * 60e3;

export type UpdateState = "running" | "error" | null;

export function updateState(): UpdateState {
  try {
    const state = readFileSync(status, "utf8").trim();
    if (state === "running" && Date.now() - statSync(status).mtimeMs > STALE) return "error";
    return state === "running" || state === "error" ? state : null;
  } catch {
    return null;
  }
}

export function requestUpdate() {
  // Only the .deb has an updater: a container cannot replace its own image.
  if (!isDeb) throw new Error("err.noSelfUpdate");
  if (updateState() === "running") return;
  // Shown at once, before the updater (which rewrites it) has started.
  writeFileSync(status, "running\n", { mode: 0o600 });
  writeFileSync(request, "", { mode: 0o600 });
}
