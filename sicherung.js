// Datensicherung: alles als JSON-Datei raus, und wieder rein.
//
// Warum ueberhaupt: Die App hat keinen Server, alles liegt im localStorage
// des iPhones. Safari-Daten loeschen, Handy zuruecksetzen oder ein neues
// iPhone - und ohne Sicherung waeren Gewichtsverlauf und Kalender weg.
// Nutzt Helfer aus app.js ($, lies, schreib, heute, meldung, zeichne) und
// die Zeichenfunktionen aus gewicht.js / kalender.js.

const PRAEFIX = "kalorien:";
const SPEICHER_LETZTE_SICHERUNG = "kalorien:letzte-sicherung"; // ISO-Zeit
const SPEICHER_ERINNERT = "kalorien:erinnert"; // wann zuletzt erinnert wurde
// Verwaltungswerte gehoeren nicht in die Sicherung: Eine alte Datei wuerde
// sonst behaupten, man haette gerade erst gesichert.
const NICHT_SICHERN = [SPEICHER_LETZTE_SICHERUNG, SPEICHER_ERINNERT];
// Bewusst OHNE das Praefix: Der Vorher-Stand soll nicht in die naechste
// Sicherung wandern, sonst wuerde jede Datei die vorige mitschleppen.
const SPEICHER_VOR_IMPORT = "kalorien-vor-import";
const ERINNERN_NACH_TAGEN = 14;
// Rueckgaengig nur kurz anbieten: Monate spaeter wuerde es alles seitdem
// Eingetragene wegwerfen.
const RUECKGAENGIG_TAGE = 7;

let wartendeSicherung = null; // gelesene Datei, bis der Nutzer bestaetigt

// Alle App-Daten als ein Objekt - die Werte schon als JSON entpackt, damit
// die Datei lesbar ist und nicht aus doppelt verpackten Strings besteht.
function sammleDaten() {
  const daten = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(PRAEFIX) || NICHT_SICHERN.includes(k)) continue;
    try { daten[k] = JSON.parse(localStorage.getItem(k)); } catch { /* kaputter Eintrag: auslassen */ }
  }
  return daten;
}

function zusammenfassung(daten) {
  const tage = Object.values(daten["kalorien:tage"] ?? {});
  const punkte = [
    [tage.length, "Tage mit Essen"],
    [tage.reduce((a, l) => a + l.length, 0), "Einträge Essen"],
    [Object.keys(daten["kalorien:gewicht"] ?? {}).length, "Gewichtswerte"],
    [Object.values(daten["kalorien:kalender"] ?? {}).reduce((a, l) => a + l.length, 0), "Kalender-Einträge"],
    [Object.keys(daten["kalorien:wasser"] ?? {}).length, "Tage mit Wasser"],
  ];
  return punkte.filter(([n]) => n > 0).map(([n, was]) => `${n} ${was}`);
}

// ---------- Sichern ----------

async function sichere() {
  const daten = sammleDaten();
  if (!Object.keys(daten).length) return meldung("Noch nichts zu sichern.");
  const inhalt = JSON.stringify({ app: "kalorien-tracker", version: 1, erstellt: new Date().toISOString(), daten }, null, 1);
  const name = `kalorien-sicherung-${heute()}.json`;
  const datei = new File([inhalt], name, { type: "application/json" });

  // iPhone: Teilen-Menue -> "In Dateien sichern" landet in iCloud Drive.
  // Ein normaler Download ist in der Home-Bildschirm-App kaum auffindbar.
  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: "Kalorien-Sicherung" });
    } catch (e) {
      if (e.name === "AbortError") return; // abgebrochen: nicht als gesichert zaehlen
      return meldung("Teilen hat nicht geklappt – versuch es nochmal.");
    }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(datei);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  schreib(SPEICHER_LETZTE_SICHERUNG, new Date().toISOString());
  zeigeSicherungsStand();
  meldung("Gesichert ✓");
}

function zeigeSicherungsStand() {
  const zuletzt = lies(SPEICHER_LETZTE_SICHERUNG, null);
  if (!zuletzt) {
    $("sicherung-stand").textContent = "Noch nie gesichert.";
  } else {
    // Kalendertage, nicht 24-h-Bloecke: Sonntag 23 Uhr ist Montag frueh "gestern".
    const tage = Math.round((new Date(heute() + "T12:00") - new Date(datumVon(zuletzt) + "T12:00")) / 86400000);
    const wann = tage === 0 ? "heute" : tage === 1 ? "gestern" : `vor ${tage} Tagen`;
    $("sicherung-stand").textContent = `Letzte Sicherung: ${wann}.`;
  }
  $("import-rueckgaengig").hidden = !vorImport();
}

// Lokales Datum (YYYY-MM-DD) eines ISO-Zeitpunkts.
function datumVon(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Der gemerkte Stand von vor der Wiederherstellung, solange er noch gilt.
function vorImport() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER_VOR_IMPORT));
    if (!s?.zeit || Date.now() - new Date(s.zeit) > RUECKGAENGIG_TAGE * 86400000) return null;
    return s;
  } catch {
    return null;
  }
}

// ---------- Wiederherstellen ----------

async function leseDatei(datei) {
  let paket;
  try {
    paket = JSON.parse(await datei.text());
  } catch {
    return meldung("Das ist keine Sicherungsdatei dieser App.");
  }
  // Nur fremde oder kaputte Dateien abweisen - sonst landet Unsinn im Speicher.
  // Eine leere Datei wuerde beim Einspielen alles loeschen; ein kaputter Tag
  // die App beim naechsten Zeichnen abstuerzen lassen.
  const tage = paket?.daten?.["kalorien:tage"];
  const gueltig = paket?.app === "kalorien-tracker" && paket.daten && typeof paket.daten === "object"
    && Object.keys(paket.daten).every((k) => k.startsWith(PRAEFIX))
    && tage && typeof tage === "object" && Object.values(tage).every(Array.isArray);
  if (!gueltig) return meldung("Das ist keine Sicherungsdatei dieser App.");

  let zeilen;
  try {
    const datum = new Date(paket.erstellt);
    zeilen = [
      isNaN(datum) ? "Sicherung ohne Datum" : `Gesichert am ${datum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`,
      ...zusammenfassung(paket.daten),
    ];
  } catch {
    return meldung("Die Sicherungsdatei ist beschädigt.");
  }
  wartendeSicherung = paket;
  $("import-inhalt").replaceChildren(...zeilen.map((z) => {
    const li = document.createElement("li");
    li.textContent = z;
    return li;
  }));
  $("import-dialog").showModal();
}

function ersetzeDaten(daten) {
  for (const k of Object.keys(localStorage).filter((k) => k.startsWith(PRAEFIX) && !NICHT_SICHERN.includes(k))) {
    localStorage.removeItem(k);
  }
  for (const [k, wert] of Object.entries(daten)) schreib(k, wert);
}

// "Fertig"/Schliessen von ⚙ speichert die Formularwerte. Nach dem Einspielen
// stehen dort noch die alten Ziele - ohne Auffrischen wuerden sie die eben
// wiederhergestellten ueberschreiben.
function schliesseEinstellungen() {
  $("z-kcal").value = ziel();
  $("z-wasser").value = (wasserZiel() / 1000).toLocaleString("de-DE");
  zeigeMakroFelder();
  $("einstellungen").close();
}

function zeichneAlles() {
  zeichne();
  if (typeof zeichneGewicht === "function") zeichneGewicht();
  if (typeof zeichneKalenderKachel === "function") zeichneKalenderKachel();
  if (typeof zeichneWocheKachel === "function") zeichneWocheKachel();
  zeigeSicherungsStand();
}

// Speichern beim Antippen - siehe "eintragen" in app.js.
$("import-ok").addEventListener("click", () => {
  if (!wartendeSicherung) return;
  // Vorher-Stand merken, damit ein Versehen (alte Datei erwischt) nicht
  // Wochen an Eintraegen kostet.
  // Zwei falsche Dateien hintereinander: Der erste Vorher-Stand ist der echte,
  // ihn also einen Tag lang nicht ueberschreiben.
  const gemerkt = vorImport();
  if (!gemerkt || Date.now() - new Date(gemerkt.zeit) > 86400000) {
    try {
      localStorage.setItem(SPEICHER_VOR_IMPORT, JSON.stringify({ zeit: new Date().toISOString(), daten: sammleDaten() }));
    } catch {
      // Speicher voll: lieber ohne Rueckgaengig weitermachen als gar nicht -
      // aber kein aelterer Stand darf stattdessen stehen bleiben.
      localStorage.removeItem(SPEICHER_VOR_IMPORT);
    }
  }
  ersetzeDaten(wartendeSicherung.daten);
  wartendeSicherung = null;
  schliesseEinstellungen();
  zeichneAlles();
  meldung("Wiederhergestellt ✓");
});

$("import-rueckgaengig").addEventListener("click", () => {
  const vorher = vorImport();
  const wann = new Date(vorher?.zeit).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
  if (!vorher || !confirm(`Den Stand vom ${wann} zurückholen? Was du seitdem eingetragen hast, geht verloren.`)) return;
  ersetzeDaten(vorher.daten);
  localStorage.removeItem(SPEICHER_VOR_IMPORT);
  schliesseEinstellungen();
  zeichneAlles();
  meldung("Rückgängig gemacht ✓");
});

$("sichern").addEventListener("click", sichere);
$("sicherung-datei").addEventListener("change", (ev) => {
  const datei = ev.target.files[0];
  ev.target.value = ""; // dieselbe Datei soll ein zweites Mal waehlbar sein
  if (datei) leseDatei(datei);
});
$("import-abbrechen").addEventListener("click", () => {
  wartendeSicherung = null;
  $("import-dialog").close();
});

// ---------- Erinnerung ----------

// Einmal beim Oeffnen, wenn es Daten gibt und die letzte Sicherung lange her
// ist. Nicht oefter als alle 14 Tage - sonst nervt es und wird weggewischt.
(function erinnere() {
  const daten = sammleDaten();
  const hatDaten = Object.keys(daten["kalorien:tage"] ?? {}).length + Object.keys(daten["kalorien:gewicht"] ?? {}).length > 3;
  const lange = (iso) => !iso || Date.now() - new Date(iso) > ERINNERN_NACH_TAGEN * 86400000;
  if (hatDaten && lange(lies(SPEICHER_LETZTE_SICHERUNG, null)) && lange(lies(SPEICHER_ERINNERT, null))) {
    schreib(SPEICHER_ERINNERT, new Date().toISOString());
    setTimeout(() => meldung("💾 Zeit für eine Sicherung – im ⚙ Menü unter „Datensicherung“."), 1500);
  }
})();
