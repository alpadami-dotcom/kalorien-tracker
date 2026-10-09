// Naehrwerte nachschlagen - komplett im Browser, damit die App ohne
// eigenen Server laeuft (GitHub Pages liefert nur Dateien aus).
//
// Jeder Treffer ist ein "Kandidat":
//   { name, quelle, pro100: {kcal, protein, fett, kh}, portionen: [[etikett, g]],
//     stueck, gramm }
// Werte immer je 100 g; gerechnet wird erst beim Eintragen.

let USDA = {};
let DEUTSCH = [];
let DEUTSCH_NACH_NAME = new Map();

// Einmal laden; der Service Worker haelt die Dateien danach offline vor.
const geladen = Promise.all([
  fetch("daten/usda.json").then((r) => r.json()),
  fetch("daten/lebensmittel.json").then((r) => r.json()),
]).then(([usda, deutsch]) => {
  USDA = usda;
  DEUTSCH = deutsch;
  DEUTSCH_NACH_NAME = new Map(deutsch.map((d) => [d.name, d]));
});

// Kleinschreibung ohne Umlaute - "Hähnchen" findet auch "hahnchen".
function norm(text) {
  return text.toLowerCase().replaceAll("ß", "ss")
    .replaceAll("ä", "a").replaceAll("ö", "o").replaceAll("ü", "u");
}

// Portionen, die kein "Stueck" sind: Masse, Volumen, US-Etiketten.
// "2 Tomaten" soll nicht 2 Tassen Tomaten ergeben.
const KEIN_STUECK = /^1 (oz|lb|Tasse|Tassen|cup|EL|TL|tablespoon|teaspoon|tbsp|tsp|fl|NLEA|Packung|liter|quart|pint|gallon)\b/i;

// Gewicht von einem Stueck: erst "1 mittel", dann ein Einzelstueck ohne
// Groessenangabe, dann irgendeins. Nur Etiketten, die mit "1 mittel"
// ANFANGEN - sonst gewinnt bei der Tomate die "mittlere Scheibe" mit 20 g.
function stueckGewicht(portionen) {
  const mittel = portionen.find(([e]) => /^1 mittel\b/.test(e));
  if (mittel) return mittel[1];
  const stuecke = portionen.filter(([e]) => /^1 /.test(e) && !KEIN_STUECK.test(e));
  const normal = stuecke.find(([e]) => !/^1 (sehr |extra )?(groß|klein|jumbo|mini)/.test(e));
  return (normal ?? stuecke[0])?.[1] ?? null;
}

function ausUsda(fdc, name) {
  const d = USDA[fdc];
  const stueck = stueckGewicht(d.portionen);
  return {
    name: name || d.name,
    quelle: "USDA",
    pro100: { kcal: d.kcal, protein: d.protein, fett: d.fett, kh: d.kh },
    portionen: d.portionen,
    stueck,
    gramm: stueck ?? 100,
  };
}

function ausTabelle(name) {
  const d = DEUTSCH_NACH_NAME.get(name);
  return d ? ausUsda(d.fdc, d.name) : null;
}

// Erst die deutsche Liste (kuratiert), dann die englische USDA-Datenbank
// als Notnagel fuer alles, was dort fehlt.
async function suche(anfrage, grenze = 20) {
  await geladen;
  const q = norm(anfrage.trim());
  if (q.length < 2) return [];
  const wortanfang = new RegExp("\\b" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const treffer = [];

  for (const d of DEUTSCH) {
    let rang = null;
    for (const wort of [d.name, ...d.aliase]) {
      const w = norm(wort);
      let r;
      // Exakter Treffer zuerst: "reis" ist Alias von "Reis gekocht" und soll
      // nicht vom kuerzeren "Reis roh" ueberholt werden - fast 3x die Kalorien.
      if (w === q) r = -1;
      else if (w.startsWith(q)) r = 0;
      else if (wortanfang.test(w)) r = 1;
      else if (w.includes(q)) r = 2;
      else if (w.length >= 4 && q.startsWith(w)) r = 1; // Mehrzahl: "tomaten"
      else continue;
      rang = rang === null ? r : Math.min(rang, r);
    }
    if (rang !== null) treffer.push([rang, d.name.length, () => ausTabelle(d.name)]);
  }

  // USDA: jedes Suchwort muss vorkommen. Kurze Namen zuerst, weil
  // "Bananas, raw" fast immer gemeint ist und nicht "Bananas, dehydrated ...".
  const woerter = q.split(/\s+/);
  for (const [fdc, d] of Object.entries(USDA)) {
    const n = d.name.toLowerCase();
    if (woerter.every((w) => n.includes(w))) treffer.push([3, n.length, () => ausUsda(fdc)]);
  }

  treffer.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return treffer.slice(0, grenze).map((t) => t[2]());
}

// Verpacktes Produkt bei Open Food Facts nachschlagen (erlaubt Browser-Zugriffe).
async function barcodeNachschlagen(code) {
  code = code.replace(/\D/g, "");
  const felder = "product_name,product_name_de,brands,nutriments,serving_quantity,product_quantity";
  const antwort = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${felder}`);
  if (!antwort.ok) return null;
  const daten = await antwort.json();
  if (daten.status !== 1) return null;

  const p = daten.product;
  const n = p.nutriments || {};
  let kcal = n["energy-kcal_100g"];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184; // nur kJ angegeben
  if (kcal == null) return null;

  let name = p.product_name_de || p.product_name || `Produkt ${code}`;
  if (p.brands) name += ` (${p.brands.split(",")[0].trim()})`;

  const portionen = [];
  for (const [etikett, wert] of [["1 Portion", p.serving_quantity], ["1 Packung", p.product_quantity]]) {
    const g = parseFloat(wert);
    if (g > 0) portionen.push([`${etikett} (${g} g)`, g]);
  }
  const r1 = (x) => Math.round(parseFloat(x || 0) * 10) / 10;
  return {
    name,
    quelle: "Open Food Facts",
    pro100: { kcal: r1(kcal), protein: r1(n.proteins_100g), fett: r1(n.fat_100g), kh: r1(n.carbohydrates_100g) },
    portionen,
    stueck: portionen[0]?.[1] ?? null,
    gramm: portionen[0]?.[1] ?? 100,
  };
}

// Barcode aus einem Bild lesen. zxing-wasm statt der eingebauten
// BarcodeDetector-Schnittstelle, weil Safari auf dem iPhone die nicht kennt.
// Erst beim ersten Scan laden - die ~1 MB braucht sonst niemand.
const ZXING = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.5/dist/es/reader/index.js";
async function liesBarcode(bilddaten) {
  const { readBarcodes } = await import(ZXING);
  const ergebnisse = await readBarcodes(bilddaten, {
    tryHarder: true,
    formats: ["EAN13", "EAN8", "UPCA", "UPCE"],
    maxNumberOfSymbols: 1,
  });
  return ergebnisse.find((e) => e.isValid && e.text)?.text ?? null;
}
