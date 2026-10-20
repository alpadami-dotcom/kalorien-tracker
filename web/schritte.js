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

  zeichneSchrittStatistik();
}

// ---------- Statistik ----------

let schrittTage = 7; // Zeitraum der Statistik

// Saeulen je Tag bis heute, eine Ziel-Linie. Eine Reihe, eine Farbe - keine
// Legende; die Ziel-Linie traegt ihr Etikett selbst. Tage ueber der Linie
// sind die geknackten, dafuer braucht es keine zweite Farbe.
function zeichneSchrittStatistik() {
  const box = $("schritt-diagramm");
  if (!box) return;
  const z = schrittZiel();
  const h = new Date(heute() + "T12:00:00");
  const tage = Array.from({ length: schrittTage }, (_, i) => {
    const d = new Date(h.getTime() - (schrittTage - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { d, n: schritteAm(d) };
  });

  const B = box.clientWidth || 320, H = 190;
  const rand = { l: 34, r: 8, o: 14, u: 24 };
  const groesster = Math.max(z, ...tage.map((t) => t.n));
  const schritt = groesster > 20000 ? 10000 : 5000;
  const oben = Math.ceil((groesster * 1.08) / schritt) * schritt;
  const y = (v) => rand.o + (1 - v / oben) * (H - rand.o - rand.u);
  const breite = (B - rand.l - rand.r) / tage.length;
  const mitte = (i) => rand.l + breite * (i + 0.5);
  const saeule = Math.min(24, Math.max(3, breite * 0.6));

  const ns = "http://www.w3.org/2000/svg";
  const el = (n, attr) => { const e = document.createElementNS(ns, n); for (const k in attr) e.setAttribute(k, attr[k]); return e; };
  const svg = el("svg", { width: B, height: H, viewBox: `0 0 ${B} ${H}`, role: "img",
    "aria-label": `Schritte der letzten ${schrittTage} Tage` });

  for (let v = 0; v <= oben; v += schritt) {
    svg.append(el("line", { x1: rand.l, x2: B - rand.r, y1: y(v), y2: y(v), class: "raster" }));
    const t = el("text", { x: rand.l - 6, y: y(v) + 4, class: "achse", "text-anchor": "end" });
    t.textContent = v ? `${v / 1000}k` : "0";
    svg.append(t);
  }

  tage.forEach((t, i) => {
    if (t.n) {
      // Oben gerundet, unten gerade auf der Grundlinie.
      const x = mitte(i) - saeule / 2, y0 = y(0), y1 = Math.min(y(t.n), y0 - 2), r = Math.min(4, saeule / 2, y0 - y1);
      svg.append(el("path", { class: "saeule",
        d: `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + saeule - r}Q${x + saeule},${y1} ${x + saeule},${y1 + r}V${y0}Z` }));
    }
    // Bei 30 Tagen nur jeder 7. Tag beschriftet - sonst ueberlappen die Daten.
    const zeigen = schrittTage <= 7 || (tage.length - 1 - i) % 7 === 0;
    if (zeigen) {
      const datum = new Date(t.d + "T12:00:00");
      const text = el("text", { x: mitte(i), y: H - 7, class: "achse" + (t.d === heute() ? " heute" : ""), "text-anchor": "middle" });
      text.textContent = schrittTage <= 7 ? datum.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "") : `${datum.getDate()}.${datum.getMonth() + 1}.`;
      svg.append(text);
    }
  });

  svg.append(el("line", { x1: rand.l, x2: B - rand.r, y1: y(z), y2: y(z), class: "ziel-linie" }));
  const zt = el("text", { x: B - rand.r, y: y(z) - 5, class: "achse ziel-text", "text-anchor": "end" });
  zt.textContent = `Ziel ${kurz(z)}`;
  svg.append(zt);

  // Antippen: die ganze Tagesspalte ist die Trefferflaeche.
  const tip = $("schritt-tip");
  tage.forEach((t, i) => {
    const flaeche = el("rect", { x: mitte(i) - breite / 2, y: 0, width: breite, height: H, fill: "transparent", tabindex: 0 });
    const zeige = () => {
      tip.querySelector(".tip-datum").textContent = new Date(t.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
      tip.querySelector(".tip-wert").textContent = t.n ? `${tausender(t.n)} Schritte${t.n >= z ? " 🏆" : ""}` : "nicht eingetragen";
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(mitte(i) - tip.offsetWidth / 2, 0), B - tip.offsetWidth) + "px";
    };
    flaeche.addEventListener("pointerdown", zeige);
    flaeche.addEventListener("pointerenter", zeige);
    flaeche.addEventListener("focus", zeige);
    flaeche.addEventListener("pointerleave", () => { tip.hidden = true; });
    flaeche.addEventListener("blur", () => { tip.hidden = true; });
    svg.append(flaeche);
  });
  box.querySelector("svg")?.remove();
  box.prepend(svg);
  tip.hidden = true;

  // Kennzahlen - Durchschnitt nur ueber Tage mit Eintrag, ein vergessener
  // Tag ist kein Tag mit null Schritten.
  const mit = tage.filter((t) => t.n);
  const summe = mit.reduce((a, t) => a + t.n, 0);
  const bester = mit.reduce((a, t) => (t.n > (a?.n ?? -1) ? t : a), null);
  const kennzahlen = [
    ["Ø Schritte", mit.length ? tausender(summe / mit.length) : "–", mit.length ? `an ${mit.length} ${mit.length === 1 ? "Tag" : "Tagen"}` : "noch nichts"],
    ["Bester Tag", bester ? tausender(bester.n) : "–", bester ? new Date(bester.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }) : ""],
    ["Ziel geknackt", mit.length ? `${mit.filter((t) => t.n >= z).length} / ${mit.length}` : "–", `Tage 🏆 ≥ ${kurz(z)}`],
    // 0,7 m pro Schritt ist ein ueblicher Mittelwert fuer Erwachsene.
    ["Zusammen", summe ? tausender(summe) : "–", summe ? `≈ ${(summe * 0.0007).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km` : ""],
  ];
  $("schritt-kennzahlen").replaceChildren(...kennzahlen.map(([titel, wert, unten]) => {
    const div = document.createElement("div");
    div.className = "kennzahl";
    div.innerHTML = `<div class="klein"></div><div class="kennzahl-wert"></div><div class="klein"></div>`;
    div.children[0].textContent = titel;
    div.children[1].textContent = wert;
    div.children[2].textContent = unten;
    return div;
  }));
}

for (const b of $("schritt-zeitraum").children) {
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => {
    schrittTage = Number(b.dataset.wert);
    for (const c of $("schritt-zeitraum").children) c.setAttribute("aria-checked", c === b);
    zeichneSchrittStatistik();
  });
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
