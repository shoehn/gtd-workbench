// Minimal service worker: it only makes the app installable (and so a share target). No caching,
// no offline copy — every request goes to the server as before.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
