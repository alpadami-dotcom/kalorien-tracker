// Service Worker: macht die App offline nutzbar - und schnell beim Start.
//
// Programmcode (Seite, Skripte, Stil) "Netz zuerst": So kommt ein Update beim
// naechsten Oeffnen sofort an, und nur ohne Empfang springt der
// Zwischenspeicher ein. "Cache zuerst" waere schneller, zeigt nach einem
// Update aber noch einmal die alte Version - fuer eine App, die sich gerade
// oft aendert, die falsche Wahl.
//
// Daten und Bilder dagegen "Speicher zuerst", im Hintergrund aufgefrischt:
// usda.json allein sind 1,6 MB, wurden bei jedem Start neu angefragt und neu
// abgelegt - und aendern sich fast nie. Einen Start lang eine Fassung alt zu
// sein, schadet bei ihnen nicht.

// GitHub Pages schickt "max-age=600": Ohne Gegenmassnahme liefert der
// Browser bis zu 10 Minuten lang die alte Datei aus seinem HTTP-Cache, und
// ein Update kommt nicht an. "no-cache" fragt jedes Mal nach - dank ETag
// kostet das bei unveraenderten Dateien nur eine kurze "304"-Antwort.
const SPEICHER = "kalorien-v26";
// Die Barcode-Bibliothek vom CDN ist versioniert und aendert sich nie. Eigener
// Speicher, der App-Updates ueberlebt: Sonst lud der erste Scan nach jedem
// Update ~1 MB neu und hing so lange.
const CDN_SPEICHER = "kalorien-cdn";
// Bei schwachem Empfang (Keller, Supermarkt) haengt eine Anfrage, statt zu
// scheitern - die App bliebe weiss. Nach so vielen ms antwortet der Speicher.
const GEDULD_MS = 1500;
// War eine Anfrage zu langsam, kommen die naechsten gleich aus dem Speicher.
// Sonst wartete jede Datei einzeln: erst die Seite, dann jedes Skript.
const LANGSAM_MS = 20000;
let langsamBis = 0;
const KERN = [
  "./", "index.html", "stil.css", "app.js", "mahlzeit.js", "scanner.js", "naehrwerte.js", "gewicht.js", "kalender.js", "woche.js", "schritte.js", "sicherung.js",
  "daten/usda.json", "daten/lebensmittel.json", "daten/gerichte.json",
  "manifest.webmanifest", "icon-flamme-180.png", "icon-flamme-192.png", "marmor-hell.jpg", "marmor-dunkel.jpg",
];
const DATEN = /\/daten\/|\.(jpg|png|webmanifest)$/;

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(SPEICHER).then((c) =>
    c.addAll(KERN.map((pfad) => new Request(pfad, { cache: "no-cache" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== SPEICHER && n !== CDN_SPEICHER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET") return;

  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fastly.jsdelivr.net") {
    ev.respondWith(ausCdn(ev));
    return;
  }
  // Open Food Facts und /api: immer live, nie zwischenspeichern.
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  ev.respondWith(DATEN.test(url.pathname) ? speicherZuerst(ev) : netzOderSpeicher(ev));
});

// Cache zuerst: Die Adressen enthalten die Version, ihr Inhalt aendert sich nie.
async function ausCdn(ev) {
  const c = await caches.open(CDN_SPEICHER);
  const treffer = await c.match(ev.request);
  if (treffer) return treffer;
  const antwort = await fetch(ev.request);
  if (antwort.ok) ev.waitUntil(c.put(ev.request, antwort.clone()));
  return antwort;
}

// Speicher zuerst, das Netz frischt im Hintergrund fuer den naechsten Start
// auf - fuer Daten und Bilder, und fuer alles, solange das Netz lahmt.
async function speicherZuerst(ev, gemerkt) {
  gemerkt ??= await caches.match(ev.request, { ignoreSearch: true });
  const frisch = holeUndMerke(ev, gemerkt);
  ev.waitUntil(frisch.catch(() => {}));
  return gemerkt ?? frisch;
}

// Netz zuerst, aber mit Geduldsgrenze. Laeuft die Zeit ab, antwortet der
// Speicher - die Anfrage laeuft trotzdem weiter und frischt ihn auf.
async function netzOderSpeicher(ev) {
  const gemerkt = await caches.match(ev.request, { ignoreSearch: true });
  if (gemerkt && Date.now() < langsamBis) return speicherZuerst(ev, gemerkt);
  const netz = holeUndMerke(ev, gemerkt);
  ev.waitUntil(netz.catch(() => {}));
  const abgelaufen = new Promise((fertig) => setTimeout(fertig, GEDULD_MS, null));
  try {
    const antwort = await Promise.race([netz, abgelaufen]);
    if (antwort) return antwort;
    langsamBis = Date.now() + LANGSAM_MS;
  } catch {
    // kein Netz: weiter zum Speicher
  }
  return gemerkt ?? netz;
}

async function holeUndMerke(ev, gemerkt) {
  const anfrage = ev.request;
  // Seitenaufrufe (mode "navigate") lassen sich nicht mit eigenen Optionen
  // kopieren - fetch() wirft sonst. Dann ueber die blanke Adresse holen.
  const ziel = anfrage.mode === "navigate" ? anfrage.url : anfrage;
  const antwort = await fetch(ziel, { cache: "no-cache" });
  // Unveraendert (gleiche ETag): nicht neu ablegen. Sonst schrieb jeder
  // Start die 1,6 MB von usda.json erneut auf den Speicher.
  const etag = antwort.headers.get("etag");
  const gleich = etag && etag === gemerkt?.headers.get("etag");
  if (antwort.ok && !gleich) {
    const kopie = antwort.clone();
    // waitUntil: Sonst darf iOS den Worker beenden, bevor der Speicher geschrieben ist.
    ev.waitUntil(caches.open(SPEICHER).then((c) => c.put(anfrage, kopie)));
  }
  return antwort;
}
