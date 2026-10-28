import webpush from "web-push";
import { ORIGIN } from "./auth";
import { db, getSetting, log, setSetting, tx } from "./db";
import { seal, unseal } from "./secret";

// Web push (PWA notifications). The VAPID keys are made on first use and kept in settings, the private one
// encrypted like the SMTP password: nothing to configure, with or without Docker.

/** Push services of the browsers: the server only ever posts to these (the endpoint comes from the client). */
export const PUSH_SERVICE = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;

function vapid() {
  const publicKey = getSetting("vapid_public");
  const sealed = getSetting("vapid_private");
  const privateKey = sealed && unseal(sealed);
  if (publicKey && privateKey) return { publicKey, privateKey };
  // First use, or secret.key lost: new keys, and the subscriptions made with the old ones are useless.
  const keys = webpush.generateVAPIDKeys();
  tx(() => {
    setSetting("vapid_public", keys.publicKey);
    setSetting("vapid_private", seal(keys.privateKey));
    db.prepare("DELETE FROM push_subscriptions").run();
  });
  return keys;
}

export const vapidPublicKey = () => vapid().publicKey;

export type PushMessage = { title: string; body: string; url: string };

/** Sends to every device of the user and returns how many got it. Subscriptions the push service says are gone are dropped. */
export async function sendPush(uid: number, message: PushMessage): Promise<number> {
  const subs = db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(uid) as { endpoint: string; p256dh: string; auth: string }[];
  if (!subs.length) return 0;
  const { publicKey, privateKey } = vapid();
  // The push services want a contact: the instance's https address, else a placeholder.
  const subject = ORIGIN.startsWith("https://") ? ORIGIN : "mailto:economy@localhost";
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
        vapidDetails: { subject, publicKey, privateKey }, TTL: 86400, timeout: 15e3,
      });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(s.endpoint);
      else log(`Push to user ${uid} failed: ${status ?? ""} ${e instanceof Error ? e.message : e}`);
    }
  }
  return sent;
}
