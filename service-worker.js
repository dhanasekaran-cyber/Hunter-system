// ═══════════════════════════════════════════════════════════════
//  HUNTER SYSTEM — SERVICE WORKER
//  Handles: caching, scheduled notifications, push events
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = "hunter-system-v4";
const ASSETS = ["index.html", "manifest.json", "icon.png", "icon-192.png", "icon-512.png"];

// ── INSTALL ──────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.filter(a => !a.includes("icon") || a === "icon.png"));
    }).catch(() => {}) // don't fail install if icons missing
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH (cache-first) ───────────────────────────────────────────
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});

// ── PUSH (from server or self-triggered) ─────────────────────────
self.addEventListener("push", event => {
  let data = { title: "⚔ HUNTER SYSTEM", body: "The System awaits.", tag: "hunter-push" };
  try { data = { ...data, ...event.data.json(); } } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icon.png",
      badge: "icon.png",
      tag: data.tag || "hunter-push",
      renotify: true,
      requireInteraction: false,
      data: { url: self.registration.scope },
    })
  );
});

// ── SCHEDULED NOTIFICATIONS (triggered from app via postMessage) ──
// The app sends { type: "SCHEDULE_NOTIFICATIONS", schedule: [...] }
// We store them and fire them using setTimeout chains kept alive by
// the periodic sync / message loop trick.
//
// NOTE: iOS PWA doesn't support true background wakeup for setTimeout,
// but these will fire correctly when the app is open or recently
// backgrounded (within ~30s). For locked screen delivery, a real
// push server is needed — see README.

let scheduledTimers = [];

self.addEventListener("message", event => {
  const msg = event.data;

  if (msg?.type === "SCHEDULE_NOTIFICATIONS") {
    // Clear old timers
    scheduledTimers.forEach(t => clearTimeout(t));
    scheduledTimers = [];

    const now = Date.now();
    (msg.schedule || []).forEach(item => {
      const delay = item.fireAt - now;
      if (delay > 0 && delay < 86400000) { // only schedule within 24h
        const tid = setTimeout(() => {
          self.registration.showNotification(item.title, {
            body: item.body,
            icon: "icon.png",
            badge: "icon.png",
            tag: item.tag,
            renotify: true,
            requireInteraction: item.requireInteraction || false,
            vibrate: [200, 100, 200, 100, 400],
            data: { url: self.registration.scope },
          });
        }, delay);
        scheduledTimers.push(tid);
      }
    });
    // Respond to confirm
    event.source?.postMessage({ type: "SCHEDULED_OK", count: scheduledTimers.length });
  }

  if (msg?.type === "PING") {
    event.source?.postMessage({ type: "PONG" });
  }

  if (msg?.type === "TEST_NOTIFICATION") {
    self.registration.showNotification("⚔ HUNTER SYSTEM — TEST", {
      body: "Notification system is working. The System sees you.",
      icon: "icon.png",
      tag: "test",
      requireInteraction: false,
    });
  }
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});

// ── PERIODIC KEEP-ALIVE (re-schedules from stored data) ───────────
// iOS may kill SW — when app reopens it re-sends schedule
self.addEventListener("periodicsync", event => {
  if (event.tag === "hunter-keepalive") {
    event.waitUntil(Promise.resolve());
  }
});
