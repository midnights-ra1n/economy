// Service worker: push notifications only (no offline cache). Messages are { title, body, url } (lib/push.ts).
self.addEventListener("push", (event) => {
  const { title = "Economy", body = "", url = "/" } = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon-192.png", data: { url } }));
});

// Take control of open pages right away, so a tap can reuse them.
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A tap opens the app on the message's page, reusing an open window when there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (!open) return self.clients.openWindow(url);
      return open.navigate(url).then((w) => (w ?? open).focus(), () => self.clients.openWindow(url));
    }),
  );
});
