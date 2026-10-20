// Kalorien-Tracker – Oberflaeche.
// Daten liegen nur auf diesem Geraet (localStorage). Suche und Barcode laufen
// im Browser (naehrwerte.js); nur Foto und Freitext brauchen den lokalen
// Server mit API-Schluessel - auf GitHub Pages sind sie einfach aus.

const SPEICHER_TAGE = "kalorien:tage";
const SPEICHER_ZIEL = "kalorien:ziel";
const SPEICHER_WASSER = "kalorien:wasser";        // { "2026-10-09": 750 } in ml
const SPEICHER_WASSERZIEL = "kalorien:wasserziel"; // ml
const SPEICHER_PROFIL = "kalorien:profil";
const SPEICHER_MAKRO = "kalorien:makroziele"; // { protein, kh, fett } in g; fehlt = automatisch

const GLAS_ML = 250;
const MAHLZEITEN = [
  ["fruehstueck", "Frühstück"], ["mittag", "Mittagessen"],
  ["abend", "Abendessen"], ["snack", "Snacks"],
];

const $ = (id) => document.getElementById(id);
let tag = heute();
let kiAn = false;
let kandidaten = [];
let aktuelleMahlzeit = null; // offene Mahlzeit-Seite (#mahlzeit-...), sonst null
let gewaehlteMahlzeit = null;

// ---------- Speicher ----------

function lies(schluessel, standard) {
  try { return JSON.parse(localStorage.getItem(schluessel)) ?? standard; }
  catch { return standard; }
}
function schreib(schluessel, wert) {
  try { localStorage.setItem(schluessel, JSON.stringify(wert)); }
  catch { meldung("Speichern fehlgeschlagen – privates Surfen aus?"); }
}
const alleTage = () => lies(SPEICHER_TAGE, {});
const eintraege = () => alleTage()[tag] ?? [];
function setzeEintraege(liste) {
  const tage = alleTage();
  if (liste.length) tage[tag] = liste; else delete tage[tag];
  schreib(SPEICHER_TAGE, tage);
}
const ziel = () => lies(SPEICHER_ZIEL, 2000);

// Makro-Ziele automatisch aus Kalorienziel und Gewicht: 1,8 g Protein je kg
// (gaengige Empfehlung, wer Muskeln halten will), 30 % der kcal aus Fett,
// der Rest Kohlenhydrate. Ohne Gewicht: 25 % der kcal aus Protein.
function autoMakros() {
  const z = ziel();
  const kg = lies(SPEICHER_PROFIL, {}).gewicht;
  const protein = Math.round(kg ? 1.8 * kg : (z * 0.25) / 4);
  const fett = Math.round((z * 0.3) / 9);
  const kh = Math.max(0, Math.round((z - protein * 4 - fett * 9) / 4));
  return { protein, kh, fett };
}
const makroZiele = () => ({ ...autoMakros(), ...lies(SPEICHER_MAKRO, {}) });

function summen(liste) {
  const s = { kcal: 0, protein: 0, fett: 0, kh: 0 };
  for (const e of liste) {
    const w = werte(e);
    for (const k in s) s[k] += w[k];
  }
  return s;
}

// "Geschafft": genug Protein, bei Kohlenhydraten und Fett nicht drueber.
// Unter dem KH- oder Fett-Ziel zu bleiben ist kein Fehlschlag - deshalb
// nur eine Obergrenze dort, und 10 % Spielraum, weil niemand aufs Gramm isst.
function makroGeschafft(s, mz = makroZiele()) {
  return s.kcal > 0 && s.protein >= mz.protein * 0.9 && s.kh <= mz.kh * 1.1 && s.fett <= mz.fett * 1.1;
}
const wasserZiel = () => lies(SPEICHER_WASSERZIEL, 3000);
const wasser = () => lies(SPEICHER_WASSER, {})[tag] ?? 0;
function setzeWasser(ml) {
  const alle = lies(SPEICHER_WASSER, {});
  if (ml > 0) alle[tag] = ml; else delete alle[tag];
  schreib(SPEICHER_WASSER, alle);
}

// Mahlzeit nach Uhrzeit raten - so stimmt sie meistens, ohne dass man tippt.
// Eintraege von vor dieser Funktion haben kein Feld und werden ueber ihre
// Uhrzeit einsortiert.
function mahlzeitNachZeit(datum = new Date()) {
  const h = datum.getHours() + datum.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return "fruehstueck";
  if (h >= 10.5 && h < 15) return "mittag";
  if (h >= 17 && h < 22) return "abend";
  return "snack";
}
const mahlzeitVon = (e) => e.mahlzeit ?? mahlzeitNachZeit(new Date(e.zeit ?? Date.now()));

// ---------- Rechnen ----------

// Gespeichert wird je 100 g plus Gramm – so bleibt ein Eintrag korrigierbar.
function werte(e) {
  const f = e.gramm / 100;
  return {
    kcal: e.pro100.kcal * f, protein: e.pro100.protein * f,
    fett: e.pro100.fett * f, kh: e.pro100.kh * f,
  };
}
const rund = (x) => Math.round(x);

// ---------- Datum ----------

function heute() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function verschiebe(tage) {
  const d = new Date(tag + "T12:00:00");
  d.setDate(d.getDate() + tage);
  tag = d.toISOString().slice(0, 10);
  zeichne();
}
function datumText() {
  const h = heute();
  const gestern = new Date(h + "T12:00:00"); gestern.setDate(gestern.getDate() - 1);
  if (tag === h) return "Heute";
  if (tag === gestern.toISOString().slice(0, 10)) return "Gestern";
  return new Date(tag + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long" });
}

// ---------- Zeichnen ----------

function zeichne() {
  $("datum-titel").textContent = datumText();
  // Bei "Heute"/"Gestern" gehoert der Wochentag in die Zeile darunter,
  // sonst steht er schon oben und wuerde doppelt erscheinen.
  const relativ = tag >= heute() || datumText() === "Gestern";
  $("datum-voll").textContent = new Date(tag + "T12:00:00").toLocaleDateString("de-DE",
    relativ ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  $("tag-vor").style.visibility = tag >= heute() ? "hidden" : "visible";

  const liste = eintraege();
  const s = summen(liste);

  const z = ziel();
  const rest = z - s.kcal;
  $("kcal-gegessen").textContent = rund(s.kcal);
  $("kcal-rest").textContent = rund(Math.abs(rest));
  $("rest-text").textContent = rest >= 0 ? `übrig von ${z}` : `über ${z}`;
  $("ziel-knopf").classList.toggle("drueber", rest < 0);
  const balken = $("kcal-balken");
  balken.style.width = Math.min(100, (s.kcal / z) * 100) + "%";
  balken.classList.toggle("drueber", rest < 0);
  $("m-protein").textContent = rund(s.protein);
  $("m-kh").textContent = rund(s.kh);
  $("m-fett").textContent = rund(s.fett);
  const mz = makroZiele();
  for (const k of ["protein", "kh", "fett"]) {
    $(`m-${k}-ziel`).textContent = mz[k];
    $(`m-${k}-balken`).style.width = Math.min(100, mz[k] ? (s[k] / mz[k]) * 100 : 0) + "%";
    // Bei KH/Fett ist "ueber dem Ziel" das Problem, bei Protein nicht.
    $(`m-${k}-balken`).classList.toggle("drueber", k !== "protein" && s[k] > mz[k] * 1.1);
  }
  $("makro-status").hidden = !makroGeschafft(s, mz);

  // Unterseiten zeigen den gewaehlten Tag mit Datum, damit klar ist,
  // wohin ein Eintrag geht, wenn man vorher in der Uebersicht geblaettert hat.
  const tagText = datumText() + ", " + new Date(tag + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long" });
  $("essen-datum").textContent = tagText;
  $("wasser-datum").textContent = tagText;
  $("essen-kcal").textContent = rund(s.kcal);
  $("essen-rest").textContent = rest >= 0 ? `noch ${rund(rest)} übrig` : `${rund(-rest)} über dem Ziel`;

  zeichneMahlzeiten(liste);
  zeichneWasser();
  if (typeof zeichneKalenderKachel === "function") zeichneKalenderKachel(); // kalender.js
  if (typeof zeichneWocheKachel === "function") zeichneWocheKachel(); // woche.js
  if (aktuelleMahlzeit && typeof zeichneMahlzeitSeite === "function") zeichneMahlzeitSeite();
}

function zeichneMahlzeiten(liste) {
  $("mahlzeiten").replaceChildren(...MAHLZEITEN.map(([schluessel, titel]) => {
    // Index mitnehmen: bearbeite() braucht die Stelle in der ganzen Tagesliste.
    const teil = liste.map((e, i) => [e, i]).filter(([e]) => mahlzeitVon(e) === schluessel);
    const kcal = teil.reduce((a, [e]) => a + werte(e).kcal, 0);

    const block = document.createElement("div");
    block.className = "mahlzeit";
    // Der ganze Kopf ist der Weg zum Eintragen - ein kleines Plus allein
    // trifft man am Handy schlecht.
    block.innerHTML = `
      <a class="mahlzeit-kopf" href="#mahlzeit-${schluessel}" aria-label="${titel}: eintragen">
        <h2>${titel}</h2>
        <span class="klein">${teil.length ? rund(kcal) + " kcal" : ""}</span>
        <span class="plus" aria-hidden="true">+</span>
      </a>
      <ul class="liste"></ul>`;
    block.querySelector("ul").replaceChildren(...teil.map(([e, i]) => {
      const li = document.createElement("li");
      const w = werte(e);
      li.innerHTML = `
        <div class="was">
          <div class="name"></div>
          <div class="detail">${rund(e.gramm)} g · ${rund(w.protein)} P · ${rund(w.kh)} K · ${rund(w.fett)} F</div>
        </div>
        <div class="kcal">${rund(w.kcal)}</div>`;
      li.querySelector(".name").textContent = e.name;
      if (e.quelle === "KI-Schätzung") li.querySelector(".name").insertAdjacentHTML("beforeend", ' <span class="marke ki">geschätzt</span>');
      li.addEventListener("click", () => bearbeite(i));
      return li;
    }));
    return block;
  }));
}

// ---------- Wasser ----------

function zeichneWasser() {
  const ml = wasser();
  const zielMl = wasserZiel();
  const voll = Math.round(ml / GLAS_ML);
  // Immer ein leeres Glas mehr zeigen als gefuellt - auch ueber dem Ziel
  // will man noch eins antippen koennen.
  const anzahl = Math.max(Math.ceil(zielMl / GLAS_ML), voll + 1);
  $("wasser-stand").textContent = (ml / 1000).toLocaleString("de-DE");
  $("wasser-ziel").textContent = (zielMl / 1000).toLocaleString("de-DE");
  $("kachel-wasser").textContent = (ml / 1000).toLocaleString("de-DE");
  $("kachel-wasser-ziel").textContent = (zielMl / 1000).toLocaleString("de-DE");
  $("kachel-wasser-balken").style.width = Math.min(100, (ml / zielMl) * 100) + "%";
  $("glaeser").classList.toggle("erreicht", ml >= zielMl);
  $("glaeser").replaceChildren(...Array.from({ length: anzahl }, (_, i) => {
    const b = document.createElement("button");
    b.className = "glas" + (i < voll ? " voll" : "");
    b.setAttribute("aria-label", i < voll ? `Glas ${i + 1} leeren` : `Glas ${i + 1} trinken`);
    // Das letzte volle Glas antippen nimmt es zurueck, jedes andere fuellt bis dorthin.
    b.addEventListener("click", () => {
      setzeWasser((i + 1 === voll ? i : i + 1) * GLAS_ML);
      zeichneWasser();
    });
    return b;
  }));
}

function bearbeite(i) {
  const liste = eintraege();
  const e = liste[i];
  const antwort = prompt(`${e.name}\nGramm ändern (0 = löschen):`, rund(e.gramm));
  if (antwort === null) return;
  const g = parseFloat(antwort.replace(",", "."));
  if (isNaN(g)) return;
  if (g <= 0) liste.splice(i, 1); else e.gramm = g;
  setzeEintraege(liste);
  zeichne();
}

// ---------- Hilfen ----------

let meldungsUhr;
function meldung(text) {
  const m = $("meldung");
  m.textContent = text;
  m.hidden = false;
  clearTimeout(meldungsUhr);
  meldungsUhr = setTimeout(() => (m.hidden = true), 4500);
}
function laden(text) {
  $("laden-text").textContent = text || "";
  $("laden").hidden = !text;
}

async function api(pfad, daten) {
  const antwort = await fetch(pfad, daten === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(daten),
  });
  const json = await antwort.json().catch(() => ({ fehler: "Ungültige Antwort vom Server." }));
  if (!antwort.ok) throw new Error(json.fehler || `Fehler ${antwort.status}`);
  return json;
}

// iPhone-Fotos haben 12+ Megapixel. Fuer Claude reichen ~1500 px an der
// langen Kante (mehr wird ohnehin herunterskaliert und kostet nur Upload).
async function aufLeinwand(datei, maxKante) {
  const url = URL.createObjectURL(datei);
  try {
    // img.decode() beachtet die EXIF-Drehung - iPhone-Fotos stehen danach richtig.
    const img = new Image();
    img.src = url;
    await img.decode();
    const f = Math.min(1, maxKante / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function verkleinere(datei, maxKante) {
  return (await aufLeinwand(datei, maxKante)).toDataURL("image/jpeg", 0.85);
}

// ---------- Suche beim Tippen ----------

// Ohne KI muss die App einfache Mengen selbst verstehen:
// "2 bananen", "200g hähnchen", "eine kleine banane", "1,5 brötchen".
const ZAHLWOERTER = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, halbe: 0.5, halber: 0.5 };

// Einheit -> Anfang des USDA-Portionsetiketts. Glas und Flasche gibt es dort
// nicht; die bekommen feste Mengen (200 ml bzw. 500 ml, Dichte ~1).
// EL/TL/Tasse nur als Notnagel, falls die USDA keine Angabe hat - ohne ihn
// wurde "1 EL Olivenoel" zu 100 g und damit 884 statt ~120 kcal.
const EINHEITEN = [
  [/^scheibe/, "Scheibe"], [/^(stück|stk)/, "Stück"], [/^portion/, "Portion"],
  [/^(glas|gläser)/, "Glas"], [/^becher/, "Becher"], [/^tasse/, "Tasse"],
  [/^(el|esslöffel)$/, "EL"], [/^(tl|teelöffel)$/, "TL"], [/^dose/, "Dose"],
  [/^flasche/, "Flasche"],
];
const FESTE_MENGE = { Glas: 200, Flasche: 500, EL: 15, TL: 5, Tasse: 240 };
const EINHEIT_MUSTER = /^(scheiben?|stücke?|stk\.?|portionen?|gläser|glas|becher|tassen?|el|tl|esslöffel|teelöffel|dosen?|flaschen?)\s+/;

function zerlege(text) {
  let rest = text.trim().toLowerCase();
  let anzahl = null, gramm = null, groesse = null, einheit = null;

  let m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|gramm|ml)?\b\s*/);
  if (m) {
    const zahl = parseFloat(m[1].replace(",", "."));
    if (m[2]) gramm = zahl; else anzahl = zahl;
    rest = rest.slice(m[0].length);
  } else if ((m = rest.match(/^(\S+)\s+/)) && m[1] in ZAHLWOERTER) {
    anzahl = ZAHLWOERTER[m[1]];
    rest = rest.slice(m[0].length);
  }
  m = rest.match(EINHEIT_MUSTER);
  if (m) {
    einheit = EINHEITEN.find(([muster]) => muster.test(m[1]))[1];
    if (anzahl === null && gramm === null) anzahl = 1;
    rest = rest.slice(m[0].length);
  }
  m = rest.match(/^(klein|mittel|groß|gross)\S*\s+/);
  if (m) {
    groesse = m[1] === "gross" ? "groß" : m[1];
    rest = rest.slice(m[0].length);
  }
  return { suche: rest, anzahl, gramm, groesse, einheit };
}

// Passt die Grammzahl eines Treffers an die erkannte Menge an.
function mitMenge(k, z) {
  k = { ...k };
  if (z.gramm) {
    k.gramm = z.gramm;
  } else {
    // Ein Stueck: die passende Groesse, sonst das Normalmass vom Server.
    // Nur Etiketten, die mit "1 klein" anfangen - "1 sehr klein" ist nicht gemeint.
    let stueck = k.stueck;
    if (z.einheit && z.einheit !== "Stück") {
      // Auch "2 EL" oder "0.5 Tasse" taugen - dann auf eine Einheit umrechnen.
      const muster = new RegExp("^(\\d+(?:\\.\\d+)?) " + z.einheit + "\\b");
      const p = (k.portionen || []).map(([e, g]) => [e.match(muster), g]).find(([m]) => m);
      stueck = p ? p[1] / parseFloat(p[0][1]) : (FESTE_MENGE[z.einheit] ?? stueck);
    }
    if (z.groesse) {
      const p = (k.portionen || []).find(([etikett]) => etikett.startsWith("1 " + z.groesse));
      if (p) stueck = p[1];
    }
    if (stueck && (z.anzahl || z.groesse || z.einheit)) k.gramm = stueck * (z.anzahl || 1);
    else if (z.anzahl) k.gramm = 100 * z.anzahl; // kein Stueckgewicht bekannt
  }
  return k;
}

let suchUhr, suchNummer = 0, letzteTreffer = [];
$("text").addEventListener("input", () => {
  clearTimeout(suchUhr);
  const z = zerlege($("text").value);
  if (z.suche.length < 2) { letzteTreffer = []; return $("vorschlaege").replaceChildren(); }
  suchUhr = setTimeout(async () => {
    const nummer = ++suchNummer;
    const treffer = await suche(z.suche).catch(() => []);
    if (nummer !== suchNummer) return; // aeltere Antwort kam zu spaet
    letzteTreffer = treffer.slice(0, 8).map((k) => mitMenge(k, z));
    zeigeVorschlaege(letzteTreffer);
  }, 200);
});

function zeigeVorschlaege(treffer) {
  $("vorschlaege").replaceChildren(...treffer.map((k) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="n"></span><span class="wert">${rund(k.pro100.kcal)} kcal/100 g</span>`;
    const n = li.querySelector(".n");
    n.textContent = k.name;
    if (/^[A-Z][a-z]+,/.test(k.name)) n.classList.add("en"); // englischer USDA-Name
    // Tippfehler-Treffer kenntlich machen - sonst wundert man sich, warum
    // auf "Banne" eine Banane kommt.
    if (k.aehnlich) n.insertAdjacentHTML("afterbegin", '<span class="meintest">Meintest du</span> ');
    li.addEventListener("click", () => {
      $("vorschlaege").replaceChildren();
      oeffnePruefen([k], "", "Menge wählen");
    });
    return li;
  }));
}

// ---------- Freitext, Foto, Barcode ----------

$("text-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  if (!kiAn) {
    // Ohne KI nimmt Enter einfach den obersten Treffer. Frisch suchen statt
    // letzteTreffer: wer schnell tippt, drueckt Enter vor dem Suchtakt.
    const z = zerlege(text);
    letzteTreffer = (await suche(z.suche)).slice(0, 8).map((k) => mitMenge(k, z));
    if (!letzteTreffer.length) return meldung("Nichts gefunden – versuch ein anderes Wort.");
    $("text").blur();
    $("vorschlaege").replaceChildren();
    const k = letzteTreffer[0];
    return oeffnePruefen([k], "", k.aehnlich ? `Meintest du „${k.name}“?` : "Menge prüfen");
  }
  $("text").blur();
  laden("Claude liest mit …");
  try {
    const r = await api("/api/text", { text });
    $("vorschlaege").replaceChildren();
    oeffnePruefen(await kiZuKandidaten(r), r.rueckfrage, "Stimmt das so?");
  } catch (e) { meldung(e.message); }
  finally { laden(); }
});

$("foto").addEventListener("change", async (ev) => {
  const datei = ev.target.files[0];
  ev.target.value = "";
  if (!datei) return;
  if (!kiAn) return meldung("Foto-Erkennung braucht den API-Schlüssel.");
  laden("Claude schaut aufs Essen …");
  try {
    const bild = await verkleinere(datei, 1568);
    const r = await api("/api/foto", { bild, hinweis: $("text").value.trim() });
    oeffnePruefen(await kiZuKandidaten(r), r.rueckfrage, "Erkannt – stimmt das?");
  } catch (e) { meldung(e.message); }
  finally { laden(); }
});

$("barcode-foto").addEventListener("change", async (ev) => {
  const datei = ev.target.files[0];
  ev.target.value = "";
  if (!datei) return;
  laden("Lese Barcode …");
  try {
    // Strichcodes brauchen mehr Aufloesung als Essensfotos.
    const c = await aufLeinwand(datei, 2400);
    const code = await liesBarcode(c.getContext("2d").getImageData(0, 0, c.width, c.height));
    if (!code) throw new Error("Kein Barcode erkannt – näher ran, scharf, gut beleuchtet.");
    laden("Suche Produkt …");
    const k = await barcodeNachschlagen(code);
    if (!k) throw new Error(`Barcode ${code} ist bei Open Food Facts unbekannt.`);
    oeffnePruefen([k], "", "Produkt gefunden");
  } catch (e) { meldung(e.message); }
  finally { laden(); }
});

// Claude liefert nur Name, Gramm und den Namen aus der deutschen Liste.
// Die Naehrwerte kommen von hier - nur was nicht in der Liste steht,
// behaelt Claudes Schaetzung und wird als solche markiert.
async function kiZuKandidaten(r) {
  await geladen;
  return r.lebensmittel.map((l) => {
    let k = l.tabelle ? ausTabelle(l.tabelle) : null;
    if (!k) {
      k = { name: l.name, quelle: "KI-Schätzung", pro100: l.schaetzung_pro100, portionen: [] };
    } else if (l.name.toLowerCase() !== k.name.toLowerCase()) {
      k.name = `${k.name} (${l.name})`; // Tabellenname nennt roh/gekocht
    }
    return { ...k, gramm: l.gramm, menge: l.menge, sicherheit: l.sicherheit, hinweis: l.hinweis };
  });
}

// ---------- Pruefen-Dialog ----------

function oeffnePruefen(liste, rueckfrage, titel) {
  if (!liste.length) return meldung(rueckfrage || "Nichts erkannt.");
  kandidaten = liste.map((k) => ({ ...k, an: true }));
  $("pruefen-titel").textContent = titel;
  $("rueckfrage").hidden = !rueckfrage;
  $("rueckfrage").textContent = rueckfrage || "";

  $("kandidaten").replaceChildren(...kandidaten.map((k) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="k-kopf">
        <input type="checkbox" checked>
        <div class="k-name"></div>
        <div class="k-kcal"></div>
      </div>
      <div class="k-info"></div>
      <div class="k-menge">
        <input type="number" inputmode="decimal" min="0" step="any">
        <select><option value="">g</option></select>
      </div>`;
    li.querySelector(".k-name").textContent = k.name;

    const info = [];
    if (k.menge) info.push(k.menge);
    info.push(k.quelle === "KI-Schätzung" ? '<span class="warn">Nährwerte geschätzt</span>' : k.quelle);
    if (k.sicherheit === "niedrig") info.push('<span class="warn">Menge unsicher</span>');
    li.querySelector(".k-info").innerHTML = info.join(" · ");
    if (k.hinweis) li.querySelector(".k-info").append(" · " + k.hinweis);

    const gramm = li.querySelector("input[type=number]");
    const auswahl = li.querySelector("select");
    gramm.value = rund(k.gramm);
    for (const [etikett, g] of k.portionen || []) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = `${etikett} – ${rund(g)} g`;
      auswahl.append(o);
      if (Math.abs(g - k.gramm) < 0.5) o.selected = true;
    }
    const aktualisiere = () => {
      k.gramm = parseFloat(gramm.value.replace(",", ".")) || 0;
      li.querySelector(".k-kcal").textContent = rund(werte(k).kcal) + " kcal";
      summe();
    };
    gramm.addEventListener("input", aktualisiere);
    auswahl.addEventListener("change", () => {
      if (auswahl.value) gramm.value = rund(parseFloat(auswahl.value));
      aktualisiere();
    });
    li.querySelector("input[type=checkbox]").addEventListener("change", (ev) => {
      k.an = ev.target.checked;
      summe();
    });
    aktualisiere();
    return li;
  }));
  summe();
  // Auf einer Mahlzeit-Seite gehoert alles zu dieser Mahlzeit, sonst nach Uhrzeit raten.
  waehleMahlzeit(aktuelleMahlzeit ?? mahlzeitNachZeit());
  $("pruefen").showModal();
}

function waehleMahlzeit(schluessel) {
  gewaehlteMahlzeit = schluessel;
  for (const b of $("mahlzeit-wahl").children) {
    b.setAttribute("aria-checked", b.dataset.wert === schluessel);
  }
}
$("mahlzeit-wahl").replaceChildren(...MAHLZEITEN.map(([schluessel, titel]) => {
  const b = document.createElement("button");
  b.type = "button";
  b.role = "radio";
  b.dataset.wert = schluessel;
  b.textContent = titel === "Mittagessen" ? "Mittag" : titel === "Abendessen" ? "Abend" : titel;
  b.addEventListener("click", () => waehleMahlzeit(schluessel));
  return b;
}));

function summe() {
  const s = kandidaten.filter((k) => k.an).reduce((a, k) => a + werte(k).kcal, 0);
  $("pruefen-summe").textContent = `Zusammen ${rund(s)} kcal`;
}

// Beim Antippen speichern, nicht erst im "close"-Ereignis: Das kommt nur
// verzoegert, wenn die Seite gerade im Hintergrund ist - dann ging der
// Eintrag verloren, wenn man die App direkt danach wegwischte.
$("eintragen").addEventListener("click", () => {
  const neu = kandidaten.filter((k) => k.an && k.gramm > 0).map((k) => ({
    name: k.name, gramm: k.gramm, pro100: k.pro100, quelle: k.quelle,
    mahlzeit: gewaehlteMahlzeit, zeit: new Date().toISOString(),
  }));
  setzeEintraege([...eintraege(), ...neu]);
  $("text").value = "";
  zeichne();
});

// ---------- Profil & Ziele ----------

// Mifflin-St Jeor: die Formel, die die meisten Online-Rechner nutzen und die
// in Studien am genauesten lag. Gibt den Grundumsatz in kcal/Tag zurueck.
function grundumsatz(p) {
  return 10 * p.gewicht + 6.25 * p.groesse - 5 * p.alter + (p.geschlecht === "w" ? -161 : 5);
}

function lieseProfil() {
  return {
    geschlecht: $("geschlecht").querySelector("[aria-checked=true]")?.dataset.wert ?? "m",
    alter: parseFloat($("p-alter").value),
    groesse: parseFloat($("p-groesse").value),
    gewicht: parseFloat($("p-gewicht").value.replace(",", ".")),
    aktivitaet: parseFloat($("p-aktivitaet").value),
    ziel: parseInt($("p-ziel").value, 10),
  };
}

let empfehlung = null;
function berechne() {
  const p = lieseProfil();
  schreib(SPEICHER_PROFIL, p);
  const vollstaendig = p.alter >= 10 && p.groesse >= 100 && p.gewicht >= 30;
  $("uebernehmen").hidden = !vollstaendig;
  if (!vollstaendig) {
    empfehlung = null;
    $("ergebnis").textContent = "Gib Alter, Größe und Gewicht ein.";
    return;
  }
  const gu = grundumsatz(p);
  const gesamt = gu * p.aktivitaet;
  // Nie unter den Grundumsatz: Darunter fehlt dem Koerper Energie fuer die
  // Grundfunktionen, und das Abnehmen kippt in Muskelabbau.
  const roh = gesamt + p.ziel;
  empfehlung = Math.round(Math.max(roh, gu) / 10) * 10;

  const hinweise = [];
  if (roh < gu) hinweise.push("Auf deinen Grundumsatz angehoben – weniger wäre ungesund.");
  if (p.alter < 18) hinweise.push("Die Formel ist für Erwachsene gemacht. Unter 18 bitte nicht gezielt abnehmen, ohne das mit einem Arzt zu besprechen.");
  $("ergebnis").innerHTML = `
    <div class="ergebnis-zeile"><span>Grundumsatz</span><span>${rund(gu)} kcal</span></div>
    <div class="ergebnis-zeile"><span>Mit Aktivität</span><span>${rund(gesamt)} kcal</span></div>
    <div class="ergebnis-zeile gross"><span>Dein Tagesziel</span><span>${empfehlung} kcal</span></div>
    ${hinweise.map((h) => `<p class="warn">${h}</p>`).join("")}`;
}

function setzeGeschlecht(wert) {
  for (const b of $("geschlecht").children) b.setAttribute("aria-checked", b.dataset.wert === wert);
}

function oeffneEinstellungen() {
  const p = lies(SPEICHER_PROFIL, {});
  setzeGeschlecht(p.geschlecht ?? "m");
  $("p-alter").value = p.alter || "";
  $("p-groesse").value = p.groesse || "";
  $("p-gewicht").value = p.gewicht ? p.gewicht.toLocaleString("de-DE") : "";
  $("p-aktivitaet").value = String(p.aktivitaet ?? 1.375);
  $("p-ziel").value = String(p.ziel ?? 0);
  $("z-kcal").value = ziel();
  $("z-wasser").value = (wasserZiel() / 1000).toLocaleString("de-DE");
  zeigeMakroFelder();
  berechne();
  $("einstellungen").showModal();
}

for (const b of $("geschlecht").children) {
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => { setzeGeschlecht(b.dataset.wert); berechne(); });
}
for (const id of ["p-alter", "p-groesse", "p-gewicht", "p-aktivitaet", "p-ziel"]) {
  $(id).addEventListener("input", berechne);
}
$("uebernehmen").addEventListener("click", () => {
  if (empfehlung) {
    $("z-kcal").value = empfehlung;
    $("z-kcal").dispatchEvent(new Event("input")); // Makro-Platzhalter mitziehen
  }
});

// Bei "Fertig" sofort speichern (siehe "eintragen"), zusaetzlich beim
// Schliessen per Escape/Zurueck - doppelt schadet nicht.
function speichereZiele() {
  const kcal = parseInt($("z-kcal").value, 10);
  const liter = parseFloat($("z-wasser").value.replace(",", "."));
  if (kcal >= 800 && kcal <= 6000) schreib(SPEICHER_ZIEL, kcal);
  if (liter >= 0.5 && liter <= 8) schreib(SPEICHER_WASSERZIEL, Math.round(liter * 1000));

  // Nur abweichende Werte speichern: Was dem Automatik-Wert entspricht oder
  // leer ist, bleibt automatisch - und zieht mit, wenn sich Gewicht oder
  // Kalorienziel aendern.
  const auto = autoMakros();
  const eigene = {};
  for (const k of ["protein", "kh", "fett"]) {
    const v = parseInt($(`z-${k}`).value, 10);
    if (v >= 0 && v !== auto[k]) eigene[k] = v;
  }
  if (Object.keys(eigene).length) schreib(SPEICHER_MAKRO, eigene);
  else localStorage.removeItem(SPEICHER_MAKRO);
  zeichne();
}
$("fertig").addEventListener("click", speichereZiele);
$("einstellungen").addEventListener("close", speichereZiele);

// ---------- Rest ----------

$("tag-zurueck").addEventListener("click", () => verschiebe(-1));
$("tag-vor").addEventListener("click", () => verschiebe(1));
// Datum antippen oeffnet den Kalender (kalender.js); "Heute" sitzt dort.
$("datum").addEventListener("click", () => { location.hash = "kalender"; });

// Immer den Tag zeigen, der gerade ist. iOS laesst die App im Hintergrund
// weiterlaufen, statt sie neu zu laden - "tag" blieb so ueber Nacht auf
// gestern stehen, und das Fruehstueck landete beim Vortag.
// Regeln: Um Mitternacht springt "Heute" mit. Wer die App nach mehr als
// 10 Minuten wieder oeffnet, landet immer auf heute - auch wenn er vorher
// in einem alten Tag geblaettert hat.
let letztesHeute = heute();
let verstecktSeit = null;
function pruefeTag() {
  const h = heute();
  const lange = verstecktSeit && Date.now() - verstecktSeit > 10 * 60 * 1000;
  if (h === letztesHeute && !lange) return;
  if (tag === letztesHeute || lange) tag = h;
  // Wer die App nach einer Weile wieder oeffnet, startet in der Uebersicht.
  if (lange && location.hash) location.hash = "";
  letztesHeute = h;
  zeichne();
  if (typeof zeichneGewicht === "function") zeichneGewicht(); // Zeitraum haengt an heute
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { verstecktSeit = Date.now(); return; }
  pruefeTag();
  verstecktSeit = null;
});
window.addEventListener("pageshow", pruefeTag);
setInterval(pruefeTag, 60 * 1000);
$("wasser-ziel-aendern").addEventListener("click", oeffneEinstellungen);

// Ein Glas direkt aus der Uebersicht, ohne die Wasser-Seite zu oeffnen.
$("kachel-wasser-plus").addEventListener("click", () => {
  setzeWasser(wasser() + GLAS_ML);
  zeichneWasser();
  meldung(`+250 ml – ${(wasser() / 1000).toLocaleString("de-DE")} L heute`);
});

// Makro-Felder: eigene Werte zeigen, sonst leer mit dem Automatik-Wert als Platzhalter.
function zeigeMakroFelder() {
  const eigene = lies(SPEICHER_MAKRO, {});
  const auto = autoMakros();
  for (const k of ["protein", "kh", "fett"]) {
    $(`z-${k}`).value = eigene[k] ?? "";
    $(`z-${k}`).placeholder = auto[k];
  }
}
$("makro-auto").addEventListener("click", () => {
  localStorage.removeItem(SPEICHER_MAKRO);
  zeigeMakroFelder();
});
// Neues Kalorienziel -> Platzhalter der Makros sofort mitrechnen lassen.
$("z-kcal").addEventListener("input", () => {
  const kcal = parseInt($("z-kcal").value, 10);
  if (kcal >= 800 && kcal <= 6000) { schreib(SPEICHER_ZIEL, kcal); zeigeMakroFelder(); }
});

// ---------- Wischen: Tag wechseln ----------

// Auf der Uebersicht: Finger nach rechts ziehen = Vortag, nach links = naechster
// Tag (hoechstens bis heute) - wie Fotos blaettern, das Aeltere liegt links.
// Erst andersherum gebaut; der Nutzer empfand das als "nach rechts scrollen".
// Nur klar waagrechte, zuegige Wischer zaehlen -
// sonst wuerde schon leichtes Schraegscrollen den Tag wechseln.
let wischStart = null;
$("ansicht-start").addEventListener("touchstart", (ev) => {
  if (ev.touches.length !== 1) return (wischStart = null);
  const t = ev.touches[0];
  wischStart = { x: t.clientX, y: t.clientY, zeit: Date.now() };
}, { passive: true });
$("ansicht-start").addEventListener("touchend", (ev) => {
  if (!wischStart) return;
  const t = ev.changedTouches[0];
  const dx = t.clientX - wischStart.x, dy = t.clientY - wischStart.y;
  const schnell = Date.now() - wischStart.zeit < 700;
  wischStart = null;
  if (!schnell || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0 && tag >= heute()) return; // keine Zukunft
  verschiebe(dx > 0 ? -1 : 1);
  const k = document.querySelector("#ansicht-start .kacheln");
  k.classList.remove("rein-rechts", "rein-links");
  void k.offsetWidth; // Animation neu starten
  k.classList.add(dx > 0 ? "rein-links" : "rein-rechts"); // Vortag kommt von links
}, { passive: true });

// ---------- Ansichten ----------

// Die Adresse waehlt die Ansicht: "" = Uebersicht, sonst #essen usw.
// Ueber die Adresse statt eigenem Zustand, damit "Zurueck" einfach geht.
function zeigeAnsicht() {
  let name = location.hash.slice(1) || "start";
  // "#mahlzeit-fruehstueck": eine Ansicht fuer alle vier Mahlzeiten.
  aktuelleMahlzeit = null;
  if (name.startsWith("mahlzeit-")) {
    const schluessel = name.slice("mahlzeit-".length);
    if (MAHLZEITEN.some(([k]) => k === schluessel)) aktuelleMahlzeit = schluessel;
    name = "mahlzeit";
  }
  const ansicht = document.getElementById("ansicht-" + name) && (name !== "mahlzeit" || aktuelleMahlzeit) ? name : "start";
  for (const a of document.querySelectorAll(".ansicht")) a.hidden = a.id !== "ansicht-" + ansicht;
  // Erst sichtbar gezeichnet kennen Kurve und Kalender ihre Breite.
  if (ansicht === "gewicht" && typeof zeichneGewicht === "function") zeichneGewicht();
  if (ansicht === "kalender" && typeof zeigeKalender === "function") zeigeKalender();
  if (ansicht === "woche" && typeof zeigeWoche === "function") zeigeWoche();
  if (ansicht === "mahlzeit" && typeof zeichneMahlzeitSeite === "function") zeichneMahlzeitSeite();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", zeigeAnsicht);
$("einstellungen-knopf").addEventListener("click", oeffneEinstellungen);

// Auf GitHub Pages gibt es /api nicht - dann laeuft die App einfach ohne KI.
fetch("api/status").then((r) => r.ok ? r.json() : { ki: false })
  .catch(() => ({ ki: false }))
  .then((s) => {
    kiAn = s.ki;
    $("foto-knopf").hidden = !kiAn;
  });

// ---------- iPhone-Eigenheiten ----------

// Tastatur: Die Blaetter haengen unten am Bildschirm, die iPhone-Tastatur
// schiebt sich darueber. visualViewport kennt den noch sichtbaren Teil -
// um dessen Abstand zum unteren Rand ruecken die Blaetter nach oben.
if (window.visualViewport) {
  const passeAn = () => {
    const vv = window.visualViewport;
    const verdeckt = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--tastatur", verdeckt + "px");
  };
  visualViewport.addEventListener("resize", passeAn);
  visualViewport.addEventListener("scroll", passeAn);
}

// Die Zahlentastatur hat keinen "Fertig"-Knopf. Tippen auf eine leere
// Stelle im Blatt schliesst sie deshalb.
document.addEventListener("pointerdown", (ev) => {
  const feld = document.activeElement;
  if (feld?.matches?.("input, select") && !ev.target.closest("input, select, label, button")) feld.blur();
});

// Zoom sperren. iOS-Safari ignoriert "user-scalable=no" seit Jahren
// absichtlich; das Zusammenziehen mit zwei Fingern laesst sich nur ueber
// die Safari-eigenen gesture-Ereignisse abfangen.
for (const art of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(art, (ev) => ev.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (ev) => {
  if (ev.touches.length > 1) ev.preventDefault();
}, { passive: false });

// Offline-Faehigkeit und "Zum Home-Bildschirm". Fehler hier sind egal:
// Die App laeuft auch ohne Service Worker, nur nicht offline.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

zeichne();
// Erst wenn auch gewicht.js und kalender.js geladen sind.
document.addEventListener("DOMContentLoaded", zeigeAnsicht);
