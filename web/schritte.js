// Schritte (#schritte): ein Ring, der sich bis zum Ziel (10.000) fuellt.
//
// Eine Web-App darf Apples Health-Daten nicht lesen - nur echte Apps duerfen
// das. Der Umweg: der iPhone-Kurzbefehl "Schritte kopieren" summiert die
// heutigen Schritte aus Health und kopiert die Zahl; die App holt sie aus
// der Zwischenablage. "Holen" startet ihn per shortcuts://-Adresse, iOS
// zeigt danach oben links "◀ Kalorien" zum Zurueckspringen.
//
// Aktive Kalorien (Bewegen-Ring) gab es kurz - der Nutzer wollte nur
// Schritte. Liefert ein Kurzbefehl trotzdem "Schritte;kcal", zaehlt die
// erste Zahl.
// Nutzt Helfer aus app.js ($, tag, heute, lies, schreib, meldung, zeichne).

const SPEICHER_SCHRITTE = "kalorien:schritte";        // { "2026-10-20": 8432 }
const SPEICHER_SCHRITTZIEL = "kalorien:schrittziel";  // Schritte pro Tag
const KURZBEFEHL = "Schritte kopieren"; // muss exakt so heissen wie in der Kurzbefehle-App

const schritteAlle = () => lies(SPEICHER_SCHRITTE, {});
const schritteAm = (d) => schritteAlle()[d] ?? 0;
const schrittZiel = () => lies(SPEICHER_SCHRITTZIEL, 10000);
const tausender = (x) => Math.round(x).toLocaleString("de-DE");
const kurz = (x) => (x >= 1000 ? `${(x / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k` : String(x));

function setzeSchritte(d, n) {
  const vorher = schritteAm(d);
  const alle = schritteAlle();
  if (n > 0) alle[d] = n; else delete alle[d];
  schreib(SPEICHER_SCHRITTE, alle);
  zeichneSchritte();
  if (typeof zeichneWocheKachel === "function") zeichneWocheKachel();
  // Feier nur beim Ueberschreiten - nicht bei jedem Neuladen eines Tages,
  // an dem das Ziel schon stand.
  if (vorher < schrittZiel() && n >= schrittZiel()) feiere();
}

// Eine Zahl aus Text. Je nach iPhone-Sprache kommt "8432", "8.432"
// (Tausenderpunkt) oder "8432,0" - alles soll 8432 ergeben.
function leseZahl(text) {
  const t = String(text).trim().replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replaceAll(".", ""));
  const zahl = parseFloat(t.replace(/\.(?=\d{3}(,|$))/g, "").replace(",", "."));
  return Number.isFinite(zahl) ? Math.round(zahl) : NaN;
}
// Erste Zahl im Text - auch wenn ein alter Kurzbefehl "Schritte;kcal" liefert.
const ersteZahl = (text) => String(text).split(/[;\n|]/).map(leseZahl).find(Number.isFinite);

// ---------- Ring ----------

// Ein Verlauf fuer alle Ringe, einmal im Dokument - SVG-Verlaeufe muessen
// per id erreichbar sein, und jeder Ring einen eigenen anzulegen waere doppelt.
document.body.insertAdjacentHTML("afterbegin", `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs><linearGradient id="ring-verlauf" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4fa8"/>
  </linearGradient></defs></svg>`);

// Fortschritt ueber die Strichlaenge des Kreises; ueber 100 % bleibt er voll.
function ring(anteil, groesse, dicke) {
  const r = (groesse - dicke) / 2, m = groesse / 2;
  const umfang = 2 * Math.PI * r;
  const voll = Math.max(0, Math.min(1, anteil));
  return `<svg width="${groesse}" height="${groesse}" viewBox="0 0 ${groesse} ${groesse}" aria-hidden="true">
    <circle cx="${m}" cy="${m}" r="${r}" class="ring-spur" stroke-width="${dicke}" fill="none"/>
    <circle cx="${m}" cy="${m}" r="${r}" class="ring-wert" stroke-width="${dicke}" fill="none"
      stroke-linecap="round" stroke-dasharray="${umfang * voll} ${umfang}" transform="rotate(-90 ${m} ${m})"/>
  </svg>`;
}

function feiere() {
  meldung(`🏆 ${kurz(schrittZiel())} geknackt!`);
  for (const el of [$("ring-gross"), $("kachel-ring")]) {
    el.classList.remove("feiert");
    void el.offsetWidth; // Animation neu starten
    el.classList.add("feiert");
  }
}

// ---------- Zeichnen ----------

function zeichneSchritte() {
  const n = schritteAm(tag);
  const z = schrittZiel();
  const geschafft = n >= z;

  // Kachel
  $("kachel-ring").innerHTML = ring(n / z, 48, 7) + (geschafft ? '<span class="mini-pokal">🏆</span>' : "");
  $("kachel-ring").classList.toggle("geknackt", geschafft);
  $("kachel-schritte").textContent = n ? tausender(n) : "–";
  $("kachel-schritte-unten").textContent = geschafft ? `${kurz(z)} geknackt!` : `von ${tausender(z)}`;

  // Seite
  $("schritt-ring").innerHTML = ring(n / z, 190, 20);
  $("ring-gross").classList.toggle("geknackt", geschafft);
  $("schritte-zahl").textContent = tausender(n);
  $("schritte-ziel").textContent = tausender(z);
  $("schritte-status").textContent = geschafft ? `🏆 ${kurz(z)} geknackt!` : n ? `noch ${tausender(z - n)} Schritte` : "";
  $("schritte-datum").textContent = $("essen-datum").textContent;
  // Health kennt nur heute - fuer andere Tage nur von Hand.
  $("schritte-holen-bereich").hidden = tag !== heute();

  // Letzte 7 Tage
  const h = new Date(heute() + "T12:00:00");
  $("schritte-liste").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const d = new Date(h.getTime() - i * 86400000).toISOString().slice(0, 10);
    const w = schritteAm(d);
    const li = document.createElement("li");
    li.innerHTML = `<span class="schritt-ring"></span><div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal"></div>`;
    const r = li.querySelector(".schritt-ring");
    r.innerHTML = ring(w / z, 30, 5);
    r.classList.toggle("geknackt", w >= z);
    li.querySelector(".name").textContent = i === 0 ? "Heute" : i === 1 ? "Gestern"
      : new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
    li.querySelector(".detail").textContent = !w ? "nicht eingetragen" : w >= z ? `🏆 ${kurz(z)} geknackt` : `${Math.round((w / z) * 100)} % vom Ziel`;
    li.querySelector(".kcal").textContent = w ? tausender(w) : "";
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
  const n = ersteZahl(text);
  if (!(n >= 0 && n <= 150000)) return meldung("In der Zwischenablage stehen keine Schritte – erst „Holen“.");
  const vorherGeschafft = schritteAm(heute()) >= schrittZiel();
  setzeSchritte(heute(), n);
  if (vorherGeschafft || n < schrittZiel()) meldung(`👟 ${tausender(n)} Schritte`);
}

$("schritte-holen").addEventListener("click", holeSchritte);
$("kachel-schritte-holen").addEventListener("click", holeSchritte);
$("schritte-einfuegen").addEventListener("click", fuegeEin);

$("schritte-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = leseZahl($("schritte-eingabe").value);
  if (!(n >= 0 && n <= 150000)) return meldung("Bitte eine Zahl eingeben, z. B. 8432.");
  $("schritte-eingabe").value = "";
  $("schritte-eingabe").blur();
  const meldet = schritteAm(tag) >= schrittZiel() || n < schrittZiel();
  setzeSchritte(tag, n);
  if (meldet) meldung(`👟 ${tausender(n)} Schritte eingetragen`);
});

$("schritte-ziel-aendern").addEventListener("click", () => {
  const n = leseZahl(prompt("Schritte pro Tag:", schrittZiel()) ?? "");
  if (n >= 1000 && n <= 50000) { schreib(SPEICHER_SCHRITTZIEL, n); zeichneSchritte(); }
});

zeichneSchritte();
