// Service Worker: macht die App offline nutzbar.
//
// Eigene Dateien "Netz zuerst": So kommt ein Update beim naechsten Oeffnen
// sofort an, und nur ohne Empfang springt der Zwischenspeicher ein. "Cache
// zuerst" waere schneller, zeigt nach einem Update aber noch einmal die alte
// Version - fuer eine App, die sich gerade oft aendert, die falsche Wahl.

const SPEICHER = "kalorien-v1";
const KERN = [
  "./", "index.html", "stil.css", "app.js", "naehrwerte.js",
  "daten/usda.json", "daten/lebensmittel.json",
  "manifest.webmanifest", "icon-180.png", "icon-192.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(SPEICHER).then((c) => c.addAll(KERN)));
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== SPEICHER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET") return;

  // Barcode-Bibliothek vom CDN: versioniert, aendert sich nie - Cache zuerst.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fastly.jsdelivr.net") {
    ev.respondWith(caches.match(ev.request).then((treffer) => treffer || holeUndMerke(ev.request)));
    return;
  }
  // Open Food Facts und /api: immer live, nie zwischenspeichern.
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  ev.respondWith(holeUndMerke(ev.request).catch(() => caches.match(ev.request, { ignoreSearch: true })));
});

async function holeUndMerke(anfrage) {
  const antwort = await fetch(anfrage);
  if (antwort.ok) {
    const kopie = antwort.clone();
    caches.open(SPEICHER).then((c) => c.put(anfrage, kopie));
  }
  return antwort;
}
