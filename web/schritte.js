// Aktivitaet (#schritte): Bewegen-Ring (aktive Kalorien) und Schritte.
//
// Eine Web-App darf Apples Health-Daten nicht lesen - nur echte Apps duerfen
// das. Der Umweg: ein iPhone-Kurzbefehl liest die heutigen Schritte und die
// aktive Energie (das ist der rote Bewegen-Ring der Fitness-App) aus Health
// und kopiert beides als Text; die App holt ihn aus der Zwischenablage.
// "Holen" startet den Kurzbefehl per shortcuts://-Adresse, iOS zeigt danach
// oben links "◀ Kalorien" zum Zurueckspringen.
//
// Ohne Apple Watch fuellt die Fitness-App nur den Bewegen-Ring - Trainieren
// und Stehen gibt es deshalb hier bewusst nicht.
// Nutzt Helfer aus app.js ($, tag, heute, lies, schreib, meldung, zeichne,
// SPEICHER_PROFIL).

const SPEICHER_SCHRITTE = "kalorien:schritte";        // { "2026-10-20": 8432 }
const SPEICHER_SCHRITTZIEL = "kalorien:schrittziel";  // Schritte pro Tag
const SPEICHER_AKTIV = "kalorien:aktiv";              // { "2026-10-20": 315 } aktive kcal
const SPEICHER_BEWEGZIEL = "kalorien:bewegziel";      // kcal, wie das Bewegen-Ziel der Fitness-App
const KURZBEFEHL = "Schritte kopieren"; // muss exakt so heissen wie in der Kurzbefehle-App

const schritteAlle = () => lies(SPEICHER_SCHRITTE, {});
const schritteAm = (d) => schritteAlle()[d] ?? 0;
const schrittZiel = () => lies(SPEICHER_SCHRITTZIEL, 10000);
const aktivAlle = () => lies(SPEICHER_AKTIV, {});
const aktivAm = (d) => aktivAlle()[d] ?? 0;
const bewegZiel = () => lies(SPEICHER_BEWEGZIEL, 300);
const tausender = (x) => Math.round(x).toLocaleString("de-DE");

// Nur wenn Health keine aktiven kcal geliefert hat: grobe Schaetzung aus den
// Schritten, rund 0,04 kcal pro Schritt bei 70 kg.
function schrittKcal(n) {
  const kg = lies(SPEICHER_PROFIL, {}).gewicht || 70;
  return n * kg * 0.00055;
}

function setzeWert(schluessel, d, n) {
  const alle = lies(schluessel, {});
  if (n > 0) alle[d] = n; else delete alle[d];
  schreib(schluessel, alle);
}

function nachSpeichern() {
  zeichneSchritte();
  if (typeof zeichneWocheKachel === "function") zeichneWocheKachel();
}

// Eine Zahl aus Text. Je nach iPhone-Sprache kommt "8432", "8.432"
// (Tausenderpunkt), "315,2" oder "315,2 kcal" - alles soll die Zahl ergeben.
function leseZahl(text) {
  const t = String(text).trim().replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replaceAll(".", ""));
  const zahl = parseFloat(t.replace(/\.(?=\d{3}(,|$))/g, "").replace(",", "."));
  return Number.isFinite(zahl) ? Math.round(zahl) : NaN;
}

// Der Kurzbefehl kopiert "Schritte;aktive kcal" - z. B. "8.432;315,2". Ein
// aelterer Kurzbefehl kopiert nur die Schritte; dann eben nur die.
function leseAktivitaet(text) {
  const teile = String(text).split(/[;\n|]/).map(leseZahl).filter(Number.isFinite);
  return { schritte: teile[0], kcal: teile[1] };
}

// ---------- Ring ----------

// Ring als SVG: Fortschritt ueber die Strichlaenge des Kreises. Ueber 100 %
// bleibt er voll - die genaue Zahl steht ja daneben.
function ring(anteil, groesse, dicke) {
  const r = (groesse - dicke) / 2;
  const umfang = 2 * Math.PI * r;
  const voll = Math.min(1, anteil);
  return `<svg width="${groesse}" height="${groesse}" viewBox="0 0 ${groesse} ${groesse}" aria-hidden="true">
    <circle cx="${groesse / 2}" cy="${groesse / 2}" r="${r}" class="ring-spur" stroke-width="${dicke}" fill="none"/>
    <circle cx="${groesse / 2}" cy="${groesse / 2}" r="${r}" class="ring-wert" stroke-width="${dicke}" fill="none"
      stroke-linecap="round" stroke-dasharray="${umfang * voll} ${umfang}" transform="rotate(-90 ${groesse / 2} ${groesse / 2})"/>
  </svg>`;
}

// ---------- Zeichnen ----------

function zeichneSchritte() {
  const n = schritteAm(tag);
  const kcal = aktivAm(tag);
  const bz = bewegZiel();
  const sz = schrittZiel();

  // Kachel
  $("kachel-ring").innerHTML = ring(kcal / bz, 46, 7);
  $("kachel-aktiv").textContent = kcal ? tausender(kcal) : "–";
  $("kachel-bewegziel").textContent = tausender(bz);
  $("kachel-schritte").textContent = n ? `${tausender(n)} Schritte` : "Noch keine Schritte";

  // Seite
  $("aktiv-ring").innerHTML = ring(kcal / bz, 168, 18);
  $("aktiv-zahl").textContent = tausender(kcal);
  $("aktiv-ziel").textContent = tausender(bz);
  $("aktiv-status").textContent = !kcal ? "" : kcal >= bz ? "✓ Ring geschlossen" : `noch ${tausender(bz - kcal)} kcal`;
  $("schritte-zahl").textContent = tausender(n);
  $("schritte-ziel").textContent = tausender(sz);
  $("schritte-balken").style.width = Math.min(100, (n / sz) * 100) + "%";
  $("schritte-kcal").textContent = !kcal && n ? `Aktive kcal fehlen noch – geschätzt aus den Schritten ≈ ${tausender(schrittKcal(n))} kcal` : "";
  $("schritte-datum").textContent = $("essen-datum").textContent;
  // Health kennt nur heute - fuer andere Tage nur von Hand.
  $("schritte-holen-bereich").hidden = tag !== heute();

  // Letzte 7 Tage
  const h = new Date(heute() + "T12:00:00");
  $("schritte-liste").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const d = new Date(h.getTime() - i * 86400000).toISOString().slice(0, 10);
    const tk = aktivAm(d), ts = schritteAm(d);
    const li = document.createElement("li");
    li.innerHTML = `<span class="mini-ring"></span><div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal"></div>`;
    li.querySelector(".mini-ring").innerHTML = ring(tk / bz, 28, 5);
    li.querySelector(".name").textContent = i === 0 ? "Heute" : i === 1 ? "Gestern"
      : new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
    li.querySelector(".detail").textContent = ts || tk
      ? `${ts ? tausender(ts) + " Schritte" : "–"}${tk >= bz ? " · ✓ Ring geschlossen" : ""}`
      : "nicht eingetragen";
    li.querySelector(".kcal").textContent = tk ? `${tausender(tk)} kcal` : "";
    return li;
  }));
}

// ---------- Holen und Einfuegen ----------

let wartetAufEinfuegen = false;

function holeSchritte() {
  wartetAufEinfuegen = true;
  location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(KURZBEFEHL);
}

// Nach der Rueckkehr aus der Kurzbefehle-App: Einfuegen hervorheben. Selbst
// lesen darf die App die Zwischenablage erst nach einem Tipp - iOS-Regel.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !wartetAufEinfuegen) return;
  if (location.hash !== "#schritte") location.hash = "schritte";
  $("schritte-einfuegen").classList.add("pulsiert");
  meldung("Jetzt auf „Einfügen“ tippen");
});

async function fuegeEin() {
  wartetAufEinfuegen = false;
  $("schritte-einfuegen").classList.remove("pulsiert");
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return meldung("Einfügen ging nicht – tipp die Zahlen unten ein.");
  }
  const { schritte, kcal } = leseAktivitaet(text);
  if (!(schritte >= 0 && schritte <= 150000)) return meldung("In der Zwischenablage stehen keine Schritte – erst „Holen“.");
  setzeWert(SPEICHER_SCHRITTE, heute(), schritte);
  if (kcal >= 0 && kcal <= 5000) setzeWert(SPEICHER_AKTIV, heute(), kcal);
  nachSpeichern();
  meldung(kcal >= 0 ? `🔥 ${tausender(kcal)} kcal · 👟 ${tausender(schritte)} Schritte` : `👟 ${tausender(schritte)} Schritte eingetragen`);
}

$("schritte-holen").addEventListener("click", holeSchritte);
$("kachel-schritte-holen").addEventListener("click", holeSchritte);
$("schritte-einfuegen").addEventListener("click", fuegeEin);

$("schritte-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = leseZahl($("schritte-eingabe").value);
  const kcal = leseZahl($("aktiv-eingabe").value);
  if (!Number.isFinite(n) && !Number.isFinite(kcal)) return meldung("Bitte Schritte oder aktive kcal eingeben.");
  if (Number.isFinite(n) && n <= 150000) setzeWert(SPEICHER_SCHRITTE, tag, n);
  if (Number.isFinite(kcal) && kcal <= 5000) setzeWert(SPEICHER_AKTIV, tag, kcal);
  $("schritte-eingabe").value = "";
  $("aktiv-eingabe").value = "";
  document.activeElement?.blur();
  nachSpeichern();
  meldung("Eingetragen ✓");
});

$("bewegziel-aendern").addEventListener("click", () => {
  const n = leseZahl(prompt("Bewegen-Ziel in kcal (wie in der Fitness-App):", bewegZiel()) ?? "");
  if (n >= 50 && n <= 3000) { schreib(SPEICHER_BEWEGZIEL, n); zeichneSchritte(); }
});
$("schritte-ziel-aendern").addEventListener("click", () => {
  const n = leseZahl(prompt("Schritte pro Tag:", schrittZiel()) ?? "");
  if (n >= 1000 && n <= 50000) { schreib(SPEICHER_SCHRITTZIEL, n); zeichneSchritte(); }
});

zeichneSchritte();
