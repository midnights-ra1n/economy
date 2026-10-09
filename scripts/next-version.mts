// Prints the version of the next release (used by .github/workflows/release.yml).
// Usage: node scripts/next-version.mts   (needs the git tags: actions/checkout with fetch-depth 0)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isNewer, nextVersion } from "../lib/semver.ts";

const base = JSON.parse(readFileSync("package.json", "utf8")).version as string;
const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
const last = tags.reduce<string | null>((max, t) => (!max || isNewer(t, max) ? t : max), null);
console.log(nextVersion(base, last));
