// Opens the database at server start, so the first-run setup code shows in the logs right away.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/db");
}
