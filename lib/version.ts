import pkg from "../package.json";
import { isNewer } from "./semver";

/** Set by CI when the image is built (APP_VERSION); local builds show the package version as a dev build. */
export const VERSION = process.env.APP_VERSION || `${pkg.version}-dev`;
/** GitHub repository the image was built from ("owner/name"), also set by CI. */
const REPOSITORY = process.env.APP_REPOSITORY;
// Self-hosted, so opt-out: UPDATE_CHECK=false stops the daily call to the GitHub API.
const ENABLED = !!REPOSITORY && !VERSION.endsWith("-dev") && process.env.UPDATE_CHECK !== "false";
const TTL = 6 * 3600e3;

export type Release = { version: string; url: string };
type State = { at: number; latest: Release | null; pending: Promise<void> | null };
const g = globalThis as unknown as { updateCheck?: State };
const state = (g.updateCheck ??= { at: 0, latest: null, pending: null });

async function refresh() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.ok) {
      const { tag_name, html_url } = (await res.json()) as { tag_name: string; html_url: string };
      state.latest = { version: tag_name.replace(/^v/, ""), url: html_url };
    }
  } catch {
    // Offline or GitHub down: keep the last known answer and retry after the TTL.
  } finally {
    state.at = Date.now();
  }
}

/**
 * Latest published release, from a cache refreshed in the background every 6 hours, so pages never wait
 * on GitHub. `wait` lets the admin panel wait for a refresh already under way.
 */
export async function latestRelease({ wait = false } = {}): Promise<Release | null> {
  if (!ENABLED) return null;
  if (Date.now() - state.at > TTL && !state.pending) state.pending = refresh().finally(() => (state.pending = null));
  if (wait && state.pending) await state.pending;
  return state.latest;
}

/** The newer release when there is one; updates are applied by pulling the new image, not from the app. */
export async function availableUpdate(opts?: { wait?: boolean }): Promise<Release | null> {
  const latest = await latestRelease(opts);
  return latest && isNewer(latest.version, VERSION) ? latest : null;
}

export const updateCheckEnabled = ENABLED;
