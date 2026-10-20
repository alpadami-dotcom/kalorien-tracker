// Schritte (#schritte) und die Schritte-Kachel.
//
// Eine Web-App darf Apples Health-Daten nicht lesen - nur echte Apps duerfen
// das. Der Umweg: ein iPhone-Kurzbefehl liest die heutigen Schritte aus
// Health und kopiert die Zahl; die App holt sie aus der Zwischenablage.
// "Schritte holen" startet den Kurzbefehl per shortcuts://-Adresse, iOS
// zeigt danach oben links "◀ Kalorien" zum Zurueckspringen.
// Nutzt Helfer aus app.js ($, tag, heute, lies, schreib, meldung, zeichne,
// SPEICHER_PROFIL).

const SPEICHER_SCHRITTE = "kalorien:schritte";        // { "2026-10-20": 8432 }
const SPEICHER_SCHRITTZIEL = "kalorien:schrittziel";  // Schritte pro Tag
const KURZBEFEHL = "Schritte kopieren"; // muss exakt so heissen wie in der Kurzbefehle-App

const schritteAlle = () => lies(SPEICHER_SCHRITTE, {});
const schritteAm = (d) => schritteAlle()[d] ?? 0;
const schrittZiel = () => lies(SPEICHER_SCHRITTZIEL, 10000);
const tausender = (x) => Math.round(x).toLocaleString("de-DE");

// Grobe Schaetzung: rund 0,04 kcal pro Schritt bei 70 kg, mit dem Gewicht
// skaliert. Nur zur Info - Schrittlaenge und Tempo machen leicht +-30 %.
function schrittKcal(n) {
  const kg = lies(SPEICHER_PROFIL, {}).gewicht || 70;
  return n * kg * 0.00055;
}

function setzeSchritte(d, n) {
  const alle = schritteAlle();
  if (n > 0) alle[d] = n; else delete alle[d];
  schreib(SPEICHER_SCHRITTE, alle);
  zeichneSchritte();
  if (typeof zeichneWocheKachel === "function") zeichneWocheKachel();
}

// Zahl aus dem Text des Kurzbefehls. Je nach iPhone-Sprache kommt "8432",
// "8.432" (Tausenderpunkt) oder "8432,0" - alles soll 8432 ergeben.
function leseZahl(text) {
  const t = String(text).trim().replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replaceAll(".", ""));
  const zahl = parseFloat(t.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(zahl) ? Math.round(zahl) : NaN;
}

// ---------- Zeichnen ----------

function zeichneSchritte() {
  const n = schritteAm(tag);
  const z = schrittZiel();
  const anteil = Math.min(100, (n / z) * 100) + "%";
  $("kachel-schritte").textContent = n ? tausender(n) : "–";
  $("kachel-schritte-ziel").textContent = tausender(z);
  $("kachel-schritte-balken").style.width = anteil;

  $("schritte-zahl").textContent = tausender(n);
  $("schritte-ziel").textContent = tausender(z);
  $("schritte-balken").style.width = anteil;
  $("schritte-balken").classList.toggle("erreicht", n >= z);
  $("schritte-kcal").textContent = n ? `≈ ${tausender(schrittKcal(n))} kcal verbrannt (grobe Schätzung)` : "Noch keine Schritte für diesen Tag.";
  $("schritte-datum").textContent = $("essen-datum").textContent;
  // Health kennt nur die Schritte von heute - fuer andere Tage nur von Hand.
  $("schritte-holen-bereich").hidden = tag !== heute();

  // Letzte 7 Tage
  const h = new Date(heute() + "T12:00:00");
  $("schritte-liste").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const d = new Date(h.getTime() - i * 86400000).toISOString().slice(0, 10);
    const wert = schritteAm(d);
    const li = document.createElement("li");
    li.innerHTML = `<div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal"></div>`;
    li.querySelector(".name").textContent = i === 0 ? "Heute" : i === 1 ? "Gestern"
      : new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
    li.querySelector(".detail").textContent = wert ? (wert >= schrittZiel() ? "✓ Ziel geschafft" : `${Math.round((wert / schrittZiel()) * 100)} % vom Ziel`) : "nicht eingetragen";
    li.querySelector(".kcal").textContent = wert ? tausender(wert) : "";
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
    return meldung("Einfügen ging nicht – tipp die Zahl unten ein.");
  }
  const n = leseZahl(text);
  if (!(n >= 0 && n <= 150000)) return meldung("In der Zwischenablage stehen keine Schritte – erst „Schritte holen“.");
  setzeSchritte(heute(), n);
  meldung(`👟 ${tausender(n)} Schritte eingetragen`);
}

$("schritte-holen").addEventListener("click", holeSchritte);
$("kachel-schritte-holen").addEventListener("click", holeSchritte);
$("schritte-einfuegen").addEventListener("click", fuegeEin);

$("schritte-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = leseZahl($("schritte-eingabe").value);
  if (!(n >= 0 && n <= 150000)) return meldung("Bitte eine Zahl eingeben, z. B. 8432.");
  setzeSchritte(tag, n);
  $("schritte-eingabe").value = "";
  $("schritte-eingabe").blur();
  meldung(`👟 ${tausender(n)} Schritte eingetragen`);
});

$("schritte-ziel-aendern").addEventListener("click", () => {
  const n = leseZahl(prompt("Schritte pro Tag:", schrittZiel()) ?? "");
  if (n >= 1000 && n <= 50000) { schreib(SPEICHER_SCHRITTZIEL, n); zeichneSchritte(); }
});

zeichneSchritte();
