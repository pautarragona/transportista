/* Service worker: la web funciona sin conexión (estudiar en el tren, el metro...). */
const VERSION = "tp-v2";
const SHELL = ["./", "index.html", "css/styles.css", "js/app.js", "js/config.js", "js/vendor/supabase.min.js", "favicon.svg", "manifest.webmanifest", "icons/icon-192.png"];
const DATA = ["data/questions.json", "data/casos.json", "data/normas.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // Supabase y demás: siempre a la red
  // red primero (para tener siempre la última versión) y caché si no hay conexión
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
