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
// Gerichte und Klassiker, die der USDA fehlen (Doener, Quark ...), mit
// Durchschnittswerten - siehe daten/baue_gerichte.py.
let GERICHTE = [];
let GERICHT_NACH_NAME = new Map();
// Alles, was die Suche auf Deutsch kennt: USDA-Zuordnungen und Gerichte.
let KURATIERT = [];

// Einmal laden; der Service Worker haelt die Dateien danach offline vor.
// Scheitert es (kein Netz beim allerersten Start, Datei gerade im Upload),
// versucht die naechste Suche es neu - sonst ginge bis zum Neustart nichts.
let geladen = null;
function datenGeladen() {
  geladen ??= Promise.all([
    fetch("daten/usda.json").then((r) => r.json()),
    fetch("daten/lebensmittel.json").then((r) => r.json()),
    fetch("daten/gerichte.json").then((r) => r.json()).catch(() => []),
  ]).then(verarbeiteDaten).catch((e) => { geladen = null; throw e; });
  return geladen;
}
datenGeladen().catch(() => {});

function verarbeiteDaten([usda, deutsch, gerichte]) {
  USDA = usda;
  DEUTSCH = deutsch;
  DEUTSCH_NACH_NAME = new Map(deutsch.map((d) => [d.name, d]));
  GERICHTE = gerichte;
  GERICHT_NACH_NAME = new Map(gerichte.map((g) => [g.name, g]));
  KURATIERT = [...deutsch, ...gerichte];
}

// Kleinschreibung ohne Umlaute - "Hähnchen" findet auch "hahnchen".
function norm(text) {
  return text.toLowerCase().replaceAll("ß", "ss")
    .replaceAll("ä", "a").replaceAll("ö", "o").replaceAll("ü", "u");
}

// Portionen, die kein "Stueck" sind: Masse, Volumen, US-Etiketten.
// "2 Tomaten" soll nicht 2 Tassen Tomaten ergeben.
const KEIN_STUECK = /^1 (oz|lb|Tasse|Tassen|cup|EL|TL|tablespoon|teaspoon|tbsp|tsp|fl|NLEA|Packung|bag|liter|quart|pint|gallon)\b/i;

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

// Startmenge, wenn man ein Lebensmittel ohne Zahl antippt. Ein Stueck nur,
// wenn es ein sinnvolles Mass ist (Banane, Ei, Scheibe Brot) - sonst starteten
// Pistazien bei 0,7 g (eine Nuss) und Rosenkohl bei 19 g (ein Roeschen).
// Kleinkram: Energiereiches (Nuesse, Chips) eine Handvoll, der Rest 100 g.
function startMenge(portionen, stueck, kcal) {
  // Fett und Oel: ein Essloeffel. 100 g Olivenoel waeren 884 kcal.
  if (kcal >= 550) {
    const el = portionen.map(([e, g]) => [e.match(/^(\d+(?:\.\d+)?) EL\b/), g]).find(([m]) => m);
    if (el) return Math.round((el[1] / parseFloat(el[0][1])) * 10) / 10;
  }
  // Ganze Ananas (905 g), Melone, Kohlkopf: als Stueck zaehlbar, aber als
  // Startmenge viel zu viel.
  if (stueck > 350) return 100;
  if (stueck >= 25) return stueck;
  const scheibe = portionen.find(([e, g]) => g === stueck && /Scheibe|slice|wafer|cracker/i.test(e));
  if (scheibe) return stueck;
  // Kleinkram (Nuesse, Kekse) oder ohne Stueckangabe energiereich (Chips):
  // eine Handvoll. Getreide wie Haferflocken (~380 kcal) bleibt bei 100 g.
  if (kcal > 400) return 30;
  return 100;
}

function ausUsda(fdc, name, stueckFest) {
  const d = USDA[fdc];
  const stueck = stueckFest ?? stueckGewicht(d.portionen);
  return {
    name: name || d.name,
    quelle: "USDA",
    fdc,
    pro100: { kcal: d.kcal, protein: d.protein, fett: d.fett, kh: d.kh },
    portionen: d.portionen,
    stueck,
    gramm: startMenge(d.portionen, stueck, d.kcal),
  };
}

// Gerichte haben genau eine Portion ("1 Döner = 400 g") - die ist zugleich
// das Stueckgewicht, damit "2 Döner" 800 g ergibt.
function ausGericht(g) {
  return {
    name: g.name,
    quelle: g.quelle,
    pro100: { kcal: g.kcal, protein: g.protein, fett: g.fett, kh: g.kh },
    portionen: g.portionen,
    stueck: g.portionen[0]?.[1] ?? null,
    gramm: g.portionen[0]?.[1] ?? 100,
  };
}

function ausTabelle(name) {
  const d = DEUTSCH_NACH_NAME.get(name);
  if (d) return ausUsda(d.fdc, d.name, d.stueck);
  const g = GERICHT_NACH_NAME.get(name);
  return g ? ausGericht(g) : null;
}

// Abstand zweier Woerter in Tippfehlern: einfuegen, loeschen, ersetzen und
// zwei Nachbarbuchstaben vertauschen kosten je 1 ("bnaane" -> "banane" = 1).
// Bricht ab, sobald "grenze" sicher ueberschritten ist - die Suche laeuft
// bei jedem Tastendruck ueber ~500 Woerter.
function tippAbstand(a, b, grenze) {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1;
  let vorvorige = null;
  let vorige = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const zeile = [i];
    let kleinste = i;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(vorige[j] + 1, zeile[j - 1] + 1, vorige[j - 1] + kosten);
      if (vorvorige && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, vorvorige[j - 2] + 1);
      }
      zeile.push(v);
      kleinste = Math.min(kleinste, v);
    }
    if (kleinste > grenze) return grenze + 1;
    vorvorige = vorige;
    vorige = zeile;
  }
  return vorige[b.length];
}

// Wie viele Tippfehler bei dieser Laenge noch als "gemeint" gelten.
// Kurze Woerter vertragen wenig: Bei "eier" waere sonst auch "Bier" ein Treffer.
const erlaubteFehler = (laenge) => (laenge < 4 ? 0 : laenge < 6 ? 1 : 2);

// Bester Tippabstand von q zu einem Wort - auch zu dessen Anfang, weil man
// meist noch tippt: "banan" soll "Banane" finden, "hänchn" "Hähnchenbrust".
function unscharf(q, w, grenze) {
  let best = tippAbstand(q, w, grenze);
  for (let laenge = q.length - 1; laenge <= q.length + 1; laenge++) {
    if (laenge >= 3 && laenge < w.length) best = Math.min(best, tippAbstand(q, w.slice(0, laenge), grenze));
  }
  return best;
}

// Erst die deutschen Listen (USDA-Zuordnungen und Gerichte), dann die
// englische USDA-Datenbank als Notnagel fuer alles, was dort fehlt.
async function suche(anfrage, grenze = 20) {
  await datenGeladen();
  const q = norm(anfrage.trim());
  if (q.length < 2) return [];
  const wortanfang = new RegExp("\\b" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const treffer = [];
  const gefunden = new Set(); // USDA-Nummern, die schon deutsch in der Liste stehen

  for (const d of KURATIERT) {
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
      // Mehrzahl: "tomaten" findet "Tomate" - aber nur bis 2 Buchstaben mehr,
      // sonst fing "hafer" auch "hafermilsch" ab und die Tippfehler-Suche kam
      // nie zum Zug.
      else if (w.length >= 4 && q.startsWith(w) && q.length - w.length <= 2) r = 1;
      else continue;
      rang = rang === null ? r : Math.min(rang, r);
    }
    if (rang !== null) {
      treffer.push([rang, d.name.length, () => ausTabelle(d.name)]);
      if (d.fdc) gefunden.add(d.fdc);
    }
  }

  // Tippfehler: nur wenn die deutsche Liste sonst nichts findet. Sonst
  // mischten sich bei richtig geschriebenen Woertern aehnliche darunter.
  const grenzeFehler = erlaubteFehler(q.replace(/\s/g, "").length);
  if (!treffer.length && grenzeFehler) {
    const ohneLeer = q.replace(/\s/g, "");
    for (const d of KURATIERT) {
      let best = grenzeFehler + 1;
      let ganz = grenzeFehler + 1; // nur ganze Woerter, ohne Wortanfaenge
      for (const wort of [d.name, ...d.aliase]) {
        const w = norm(wort);
        best = Math.min(best, unscharf(q, w, grenzeFehler), unscharf(ohneLeer, w.replace(/\s/g, ""), grenzeFehler));
        ganz = Math.min(ganz, tippAbstand(q, w, grenzeFehler));
        for (const teil of w.split(/[\s()-]+/)) {
          if (teil.length < 3) continue;
          best = Math.min(best, unscharf(q, teil, grenzeFehler));
          ganz = Math.min(ganz, tippAbstand(q, teil, grenzeFehler));
        }
      }
      if (best <= grenzeFehler) {
        // Bei gleichem Abstand gewinnt das ganze Wort: "dönr" ist "Döner"
        // (1 Fehler im ganzen Wort), nicht "Donut" (nur der Anfang "donu" passt).
        // Und Grundnahrungsmittel vor Gerichten: "hänchen" meint eher die
        // Hähnchenbrust als die "Hähnchen Nuggets".
        const rang = 2.5 + best / 10 + (ganz > best ? 0.05 : 0) + (GERICHT_NACH_NAME.has(d.name) ? 0.02 : 0);
        treffer.push([rang, d.name.length, () => ({ ...ausTabelle(d.name), aehnlich: true })]);
        if (d.fdc) gefunden.add(d.fdc);
      }
    }
  }

  // USDA: jedes Suchwort muss vorkommen. Kurze Namen zuerst, weil
  // "Bananas, raw" fast immer gemeint ist und nicht "Bananas, dehydrated ...".
  // Was diese Suche schon mit deutschem Namen gefunden hat, nicht noch einmal
  // englisch zeigen ("Sauerkraut" und "Sauerkraut, canned ...").
  const woerter = q.split(/\s+/);
  for (const [fdc, d] of Object.entries(USDA)) {
    if (gefunden.has(fdc)) continue;
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

// Schon beim Oeffnen des Scanners anwerfen, parallel zum Kamerastart: Sonst
// laedt und uebersetzt der Leser erst beim ersten Bild, und der Scan hing.
function bereiteBarcodeVor() {
  import(ZXING).then((m) => m.prepareZXingModule({ fireImmediately: true })).catch(() => {});
}

async function liesBarcode(bilddaten) {
  const { readBarcodes } = await import(ZXING);
  // tryRotate: Viele Packungen tragen den Code hochkant. tryDownscale hilft,
  // wenn das Bild sehr gross und der Code darin klein ist.
  const ergebnisse = await readBarcodes(bilddaten, {
    tryHarder: true,
    tryRotate: true,
    tryDownscale: true,
    formats: ["EAN13", "EAN8", "UPCA", "UPCE"],
    maxNumberOfSymbols: 1,
  });
  return ergebnisse.find((e) => e.isValid && e.text)?.text ?? null;
}
