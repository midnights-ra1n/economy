// Opens the database at server start, so the first-account deadline shows in the logs right away,
// and starts the first update check so the admin sees its result without waiting.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./lib/db");
  const { VERSION, latestRelease } = await import("./lib/version");
  log(`Version ${VERSION}`);
  void latestRelease();
}
