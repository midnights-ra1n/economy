import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./db.ts";

// Secrets the app must read back (the SMTP password) are encrypted with a key kept outside the database,
// in DATA_DIR/secret.key (mode 600): a copy or export of economy.db alone does not reveal them.
function key(): Buffer {
  const file = path.join(dataDir, "secret.key");
  if (!existsSync(/*turbopackIgnore: true*/ file)) {
    try {
      writeFileSync(/*turbopackIgnore: true*/ file, randomBytes(32), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; // another process created it first
    }
  }
  return readFileSync(/*turbopackIgnore: true*/ file);
}

/** AES-256-GCM: "v1:iv:tag:data" in base64. */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

/** Null when the value cannot be decrypted (key file replaced or lost): the secret must be entered again. */
export function unseal(sealed: string): string | null {
  try {
    const [, iv, tag, data] = sealed.split(":").map((p, i) => (i ? Buffer.from(p, "base64") : p)) as [string, Buffer, Buffer, Buffer];
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
