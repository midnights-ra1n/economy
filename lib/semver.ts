// Plain x.y.z versions (no pre-release tags): enough for this app's releases. Pure: tested with `node --test`.

const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);

/** True when `a` is a strictly higher version than `b`. */
export function isNewer(a: string, b: string): boolean {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/**
 * Version of the next release: the last release's patch + 1, or package.json's version when it is ahead
 * (bump the minor or major there by hand; patches count up on their own).
 */
export function nextVersion(base: string, last: string | null): string {
  if (!last || isNewer(base, last)) return base.replace(/^v/, "");
  const [major, minor, patch] = parse(last);
  return `${major}.${minor}.${patch + 1}`;
}
