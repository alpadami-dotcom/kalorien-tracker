// Kalender (#kalender): Monat, der angetippte Tag mit Zusammenfassung und
// eigenen Eintraegen (Training, Termin, Notiz), dazu der Wochenstreifen und
// der naechste Eintrag in der Kachel der Uebersicht.
// Nutzt Helfer aus app.js ($, tag, heute, lies, schreib, alleTage, werte,
// ziel, zeichne, meldung) und SPEICHER_GEWICHT aus gewicht.js.
//
// Eintraege: { "2026-10-21": [{ id, art, text, zeit }] } - zeit ist "18:00"
// oder "". Anders als Essen duerfen sie in der Zukunft liegen: geplant wird
// vorher, gegessen erst am Tag.

const SPEICHER_KALENDER = "kalorien:kalender";
const ARTEN = {
  training: { zeichen: "🏋️", name: "Training" },
  termin: { zeichen: "📅", name: "Termin" },
  notiz: { zeichen: "📝", name: "Notiz" },
};

let kalenderMonat = null; // "2026-10"
let kalAuswahl = null;    // angetippter Tag im Kalender, "2026-10-21"
let notizBearbeitet = null; // { datum, id } beim Aendern, sonst null

const zuDatum = (j, m, t) => `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const kalEintraege = () => lies(SPEICHER_KALENDER, {});
const sortiert = (liste) => [...liste].sort((a, b) => (a.zeit || "99").localeCompare(b.zeit || "99"));
const langesDatum = (d) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

// 10 % Spielraum: Wer 2050 statt 2000 isst, hat sein Ziel nicht verfehlt.
// Makros gegen die heutigen Ziele - alte Ziele werden nicht gespeichert.
function tagStatus(tage, d, z, mz = makroZiele()) {
  const liste = tage[d] ?? [];
  if (!liste.length) return null;
  const s = summen(liste);
  return { kcal: s.kcal, klasse: s.kcal > z * 1.1 ? "drueber" : "im-ziel", makro: makroGeschafft(s, mz) };
}

// ---------- Monat ----------

function zeichneKalender() {
  const [j, m] = kalenderMonat.split("-").map(Number);
  $("kal-titel").textContent = new Date(j, m - 1, 15).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const h = heute();
  // Planen ja, aber nicht endlos: ein Jahr nach vorn reicht.
  const grenze = new Date(h + "T12:00:00"); grenze.setFullYear(grenze.getFullYear() + 1);
  $("kal-vor").disabled = kalenderMonat >= grenze.toISOString().slice(0, 7);

  const tage = alleTage();
  const notizen = kalEintraege();
  const z = ziel();
  const mz = makroZiele();

  // Wochen beginnen am Montag (deutsche Gewohnheit, nicht US-Sonntag).
  const versatz = (new Date(j, m - 1, 1).getDay() + 6) % 7;
  const anzahl = new Date(j, m, 0).getDate();
  const zellen = [];
  for (let i = 0; i < versatz; i++) zellen.push(document.createElement("span"));

  for (let t = 1; t <= anzahl; t++) {
    const d = zuDatum(j, m, t);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kal-tag";
    b.textContent = t;
    if (d === h) b.classList.add("heute");
    if (d === kalAuswahl) b.classList.add("gewaehlt");
    if (d > h) b.classList.add("zukunft");

    const status = tagStatus(tage, d, z, mz);
    if (status) b.classList.add(status.klasse);
    if (status?.makro) b.classList.add("makro");
    const n = notizen[d]?.length ?? 0;
    if (n) b.classList.add("mit-notiz");
    const teile = [];
    if (status) teile.push(`${Math.round(status.kcal)} kcal${status.klasse === "drueber" ? ", über dem Ziel" : ""}`);
    if (status?.makro) teile.push("Makroziel geschafft");
    if (n) teile.push(n === 1 ? "1 Eintrag" : `${n} Einträge`);
    b.setAttribute("aria-label", `${t}. ${$("kal-titel").textContent}${teile.length ? ": " + teile.join(", ") : ""}`);

    b.addEventListener("click", () => {
      kalAuswahl = d;
      zeichneKalender();
    });
    zellen.push(b);
  }
  $("kal-raster").replaceChildren(...zellen);
  zeichneTagDetail();
}

function blaettereMonat(schritt) {
  const [j, m] = kalenderMonat.split("-").map(Number);
  const d = new Date(j, m - 1 + schritt, 1);
  kalenderMonat = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  zeichneKalender();
}

// Aufgerufen von zeigeAnsicht(), wenn #kalender geoeffnet wird.
function zeigeKalender() {
  kalAuswahl = tag;
  kalenderMonat = tag.slice(0, 7);
  zeichneKalender();
}

// ---------- Der angetippte Tag ----------

function zeichneTagDetail() {
  const d = kalAuswahl;
  const zukunft = d > heute();
  $("kal-tag-titel").textContent = d === heute() ? `Heute, ${langesDatum(d).split(", ")[1]}` : langesDatum(d);

  // Was an dem Tag schon passiert ist - in der Zukunft gibt es das noch nicht.
  if (zukunft) {
    $("kal-tag-summe").textContent = "Geplant";
  } else {
    const liste = alleTage()[d] ?? [];
    const kcal = liste.reduce((a, e) => a + werte(e).kcal, 0);
    const ml = lies(SPEICHER_WASSER, {})[d];
    const kg = lies(SPEICHER_GEWICHT, {})[d];
    const teile = [liste.length ? `${Math.round(kcal)} kcal gegessen` : "Nichts gegessen eingetragen"];
    if (liste.length && makroGeschafft(summen(liste))) teile.push("✓ Makroziel geschafft");
    if (ml) teile.push(`${(ml / 1000).toLocaleString("de-DE")} L Wasser`);
    if (kg != null) teile.push(`${kg.toLocaleString("de-DE")} kg`);
    $("kal-tag-summe").textContent = teile.join(" · ");
  }
  // Essen fuer die Zukunft eintragen ergibt keinen Sinn - nur planen.
  $("kal-tag-oeffnen").hidden = zukunft;

  const liste = sortiert(kalEintraege()[d] ?? []);
  $("kal-eintraege-leer").hidden = liste.length > 0;
  $("kal-eintraege").replaceChildren(...liste.map((e) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="notiz-zeichen" aria-hidden="true"></span>
      <div class="was"><div class="name"></div><div class="detail"></div></div>
      <div class="kcal notiz-zeit"></div>`;
    li.querySelector(".notiz-zeichen").textContent = ARTEN[e.art]?.zeichen ?? "📝";
    li.querySelector(".name").textContent = e.text;
    li.querySelector(".detail").textContent = ARTEN[e.art]?.name ?? "Notiz";
    li.querySelector(".notiz-zeit").textContent = e.zeit ? `${e.zeit} Uhr` : "";
    li.addEventListener("click", () => oeffneNotiz(d, e));
    return li;
  }));
}

// ---------- Eintrag anlegen / aendern ----------

function setzeArt(art) {
  for (const b of $("notiz-art").children) b.setAttribute("aria-checked", b.dataset.wert === art);
}
const gewaehlteArt = () => $("notiz-art").querySelector("[aria-checked=true]")?.dataset.wert ?? "notiz";

function oeffneNotiz(datum, eintrag) {
  notizBearbeitet = eintrag ? { datum, id: eintrag.id } : null;
  $("notiz-titel").textContent = eintrag ? "Eintrag ändern" : "Neuer Eintrag";
  setzeArt(eintrag?.art ?? "training");
  $("notiz-text").value = eintrag?.text ?? "";
  $("notiz-datum").value = datum;
  $("notiz-zeit").value = eintrag?.zeit ?? "";
  $("notiz-loeschen").hidden = !eintrag;
  $("notiz-dialog").showModal();
}

function entferneNotiz(alle, datum, id) {
  alle[datum] = (alle[datum] ?? []).filter((e) => e.id !== id);
  if (!alle[datum].length) delete alle[datum];
}

// Speichern beim Antippen - siehe "eintragen" in app.js.
$("notiz-speichern").addEventListener("click", (ev) => {
  const text = $("notiz-text").value.trim();
  const datum = $("notiz-datum").value;
  if (!text || !datum) {
    ev.preventDefault();
    return meldung("Bitte kurz eintragen, was ansteht.");
  }
  const alle = kalEintraege();
  // Beim Aendern alten Eintrag entfernen - er kann auf einen anderen Tag gewandert sein.
  const id = notizBearbeitet?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (notizBearbeitet) entferneNotiz(alle, notizBearbeitet.datum, id);
  (alle[datum] ??= []).push({ id, art: gewaehlteArt(), text, zeit: $("notiz-zeit").value });
  schreib(SPEICHER_KALENDER, alle);

  kalAuswahl = datum;
  kalenderMonat = datum.slice(0, 7);
  zeichneKalender();
  zeichneNaechsten();
});

$("notiz-loeschen").addEventListener("click", () => {
  const alle = kalEintraege();
  entferneNotiz(alle, notizBearbeitet.datum, notizBearbeitet.id);
  schreib(SPEICHER_KALENDER, alle);
  $("notiz-dialog").close();
  zeichneKalender();
  zeichneNaechsten();
});

$("notiz-abbrechen").addEventListener("click", () => $("notiz-dialog").close());
for (const b of $("notiz-art").children) {
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => setzeArt(b.dataset.wert));
}

// ---------- Kachel in der Uebersicht ----------

// Die letzten sieben Tage bis heute, je Tag ein Punkt.
function zeichneWoche() {
  const tage = alleTage();
  const z = ziel();
  const h = new Date(heute() + "T12:00:00");
  $("kachel-woche").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const datum = new Date(h.getTime() - (6 - i) * 86400000);
    const d = datum.toISOString().slice(0, 10);
    const zelle = document.createElement("span");
    const status = tagStatus(tage, d, z);
    zelle.className = "woche-tag" + (d === tag ? " gewaehlt" : "") + (status?.makro ? " makro" : "");
    zelle.innerHTML = `<span class="woche-name"></span><span class="woche-punkt ${status?.klasse ?? ""}"></span>`;
    zelle.querySelector(".woche-name").textContent = datum.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
    return zelle;
  }));
  zeichneNaechsten();
}

// Der naechste anstehende Eintrag ab jetzt - damit die Uebersicht zeigt,
// was heute noch ansteht. Vergangene Uhrzeiten von heute zaehlen nicht mehr.
function zeichneNaechsten() {
  const h = heute();
  const jetzt = new Date();
  const uhr = `${String(jetzt.getHours()).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}`;
  const alle = kalEintraege();
  const kandidat = Object.keys(alle).filter((d) => d >= h).sort()
    .flatMap((d) => sortiert(alle[d]).map((e) => ({ ...e, datum: d })))
    .find((e) => e.datum > h || !e.zeit || e.zeit >= uhr);

  const feld = $("kachel-naechster");
  feld.hidden = !kandidat;
  if (!kandidat) return;
  const wann = kandidat.datum === h ? "Heute"
    : new Date(kandidat.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  feld.textContent = `${ARTEN[kandidat.art]?.zeichen ?? "📝"} ${wann}${kandidat.zeit ? " " + kandidat.zeit : ""} · ${kandidat.text}`;
}

// ---------- Knoepfe ----------

$("kal-zurueck").addEventListener("click", () => blaettereMonat(-1));
$("kal-vor").addEventListener("click", () => blaettereMonat(1));
$("kal-eintrag-plus").addEventListener("click", () => oeffneNotiz(kalAuswahl));
$("kal-tag-oeffnen").addEventListener("click", () => {
  tag = kalAuswahl;
  zeichne();
  location.hash = "";
});
$("kal-heute").addEventListener("click", () => {
  kalAuswahl = heute();
  kalenderMonat = kalAuswahl.slice(0, 7);
  zeichneKalender();
});

zeichneWoche();

// Der "naechste Eintrag" haengt an der Uhrzeit - jede Minute nachziehen,
// sonst stuende um 19 Uhr noch das Training von 18 Uhr in der Kachel.
setInterval(zeichneNaechsten, 60 * 1000);
