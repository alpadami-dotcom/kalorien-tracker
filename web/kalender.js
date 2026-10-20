// Kalender (#kalender): Monat, der angetippte Tag mit Zusammenfassung und
// eigenen Eintraegen (Training, Termin, Notiz), dazu der Wochenstreifen und
// der naechste Eintrag in der Kachel der Uebersicht.
// Nutzt Helfer aus app.js ($, tag, heute, lies, schreib, alleTage, werte,
// ziel, zeichne, meldung) und SPEICHER_GEWICHT aus gewicht.js.
//
// Eintraege: { "2026-10-21": [{ id, art, text, zeit, wiederholung }] } -
// zeit ist "18:00" oder "", wiederholung "", "woche", "monat" oder "jahr".
// Anders als Essen duerfen sie in der Zukunft liegen: geplant wird vorher,
// gegessen erst am Tag.
//
// Wiederholungen werden nicht vervielfaeltigt gespeichert, sondern einmal am
// ersten Tag; eintraegeAm() rechnet aus, an welchen Tagen sie auftauchen. So
// steht ein Geburtstag in jedem kuenftigen Jahr, ohne dass man ihn je neu
// eintraegt, und eine Aenderung gilt fuer die ganze Reihe.

const SPEICHER_KALENDER = "kalorien:kalender";
const ARTEN = {
  training: { zeichen: "🏋️", name: "Training" },
  termin: { zeichen: "📅", name: "Termin" },
  geburtstag: { zeichen: "🎂", name: "Geburtstag" },
  notiz: { zeichen: "📝", name: "Notiz" },
};
const WIEDERHOLUNG = { woche: "jede Woche", monat: "jeden Monat", jahr: "jedes Jahr" };

let kalenderMonat = null; // "2026-10"
let kalAuswahl = null;    // angetippter Tag im Kalender, "2026-10-21"
let notizBearbeitet = null; // { datum, id } beim Aendern, sonst null

const zuDatum = (j, m, t) => `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const kalEintraege = () => lies(SPEICHER_KALENDER, {});
const sortiert = (liste) => [...liste].sort((a, b) => (a.zeit || "99").localeCompare(b.zeit || "99"));
const langesDatum = (d) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const tageImMonat = (j, m) => new Date(j, m, 0).getDate(); // m: 1-12

// Faellt eine Wiederholung, die am Tag "start" begann, auf Tag "d"?
// Monats- und Jahresdaten, die es nicht gibt (31. im April, 29. Februar im
// Nicht-Schaltjahr), rutschen auf den letzten Tag des Monats - sonst fiele
// ein Geburtstag am 29.2. drei von vier Jahren einfach aus.
function trifft(wiederholung, start, d) {
  if (!wiederholung || d <= start) return false;
  const [sj, sm, st] = start.split("-").map(Number);
  const [j, m, t] = d.split("-").map(Number);
  if (wiederholung === "woche") {
    return (Date.UTC(j, m - 1, t) - Date.UTC(sj, sm - 1, st)) % (7 * 86400000) === 0;
  }
  if (wiederholung === "jahr" && m !== sm) return false;
  return t === Math.min(st, tageImMonat(j, m));
}

// Alle Eintraege eines Tages: die direkt dort gespeicherten plus jede
// Wiederholung, die auf ihn faellt. "start" merkt sich den Ursprungstag.
function eintraegeAm(d, alle = kalEintraege()) {
  const liste = (alle[d] ?? []).map((e) => ({ ...e, start: d }));
  for (const [start, eintraege] of Object.entries(alle)) {
    if (start >= d) continue;
    for (const e of eintraege) if (trifft(e.wiederholung, start, d)) liste.push({ ...e, start });
  }
  return sortiert(liste);
}

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
    const n = eintraegeAm(d, notizen).length;
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
  zeichneAlleEintraege();
}

// Alle gespeicherten Eintraege, Kommendes zuerst (naechster oben), dann
// Vergangenes (juengstes oben). Wiederholungen stehen einmal, mit ihrem Rhythmus.
function zeichneAlleEintraege() {
  const h = heute();
  const alle = Object.entries(kalEintraege()).flatMap(([d, liste]) => liste.map((e) => ({ ...e, d })));
  const naechstes = (e) => {
    if (!e.wiederholung || e.d >= h) return e.d;
    // Bei Wiederholungen zaehlt der naechste Termin, nicht der allererste.
    for (let i = 0; i <= 366; i++) {
      const d = new Date(new Date(h + "T12:00:00").getTime() + i * 86400000).toISOString().slice(0, 10);
      if (trifft(e.wiederholung, e.d, d)) return d;
    }
    return e.d;
  };
  const mitDatum = alle.map((e) => ({ ...e, wann: naechstes(e) }));
  const kommend = mitDatum.filter((e) => e.wann >= h).sort((a, b) => a.wann.localeCompare(b.wann));
  const vorbei = mitDatum.filter((e) => e.wann < h).sort((a, b) => b.wann.localeCompare(a.wann));

  $("kal-alle-anzahl").textContent = `(${alle.length})`;
  $("kal-alle-liste").replaceChildren(...[...kommend, ...vorbei].map((e) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="notiz-zeichen" aria-hidden="true"></span>
      <div class="was"><div class="name"></div><div class="detail"></div></div>`;
    li.querySelector(".notiz-zeichen").textContent = ARTEN[e.art]?.zeichen ?? "📝";
    li.querySelector(".name").textContent = e.text;
    // Jahreszahl nur, wenn es nicht dieses Jahr ist - sonst wirkt der naechste
    // Geburtstag im September, als laege er schon hinter einem.
    const jahr = e.wann.slice(0, 4) !== h.slice(0, 4) ? ` ${e.wann.slice(0, 4)}` : "";
    li.querySelector(".detail").textContent = langesDatum(e.wann) + jahr + (e.zeit ? `, ${e.zeit} Uhr` : "")
      + (e.wiederholung ? ` · 🔁 ${WIEDERHOLUNG[e.wiederholung]}` : "") + (e.wann < h ? " · vorbei" : "");
    li.addEventListener("click", () => {
      kalAuswahl = e.wann;
      kalenderMonat = e.wann.slice(0, 7);
      zeichneKalender();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return li;
  }));
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

  const liste = eintraegeAm(d);
  $("kal-eintraege-leer").hidden = liste.length > 0;
  $("kal-eintraege").replaceChildren(...liste.map((e) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="notiz-zeichen" aria-hidden="true"></span>
      <div class="was"><div class="name"></div><div class="detail"></div></div>
      <div class="kcal notiz-zeit"></div>`;
    li.querySelector(".notiz-zeichen").textContent = ARTEN[e.art]?.zeichen ?? "📝";
    li.querySelector(".name").textContent = e.text;
    li.querySelector(".detail").textContent = (ARTEN[e.art]?.name ?? "Notiz")
      + (e.wiederholung ? ` · 🔁 ${WIEDERHOLUNG[e.wiederholung]}` : "");
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
  // Bei Wiederholungen wird die Reihe bearbeitet - also am Ursprungstag.
  const ursprung = eintrag?.start ?? datum;
  notizBearbeitet = eintrag ? { datum: ursprung, id: eintrag.id } : null;
  $("notiz-titel").textContent = eintrag ? "Eintrag ändern" : "Neuer Eintrag";
  setzeArt(eintrag?.art ?? "training");
  $("notiz-text").value = eintrag?.text ?? "";
  $("notiz-datum").value = ursprung;
  $("notiz-zeit").value = eintrag?.zeit ?? "";
  $("notiz-wiederholung").value = eintrag?.wiederholung ?? "";
  $("notiz-serie-hinweis").hidden = !eintrag?.wiederholung;
  $("notiz-loeschen").hidden = !eintrag;
  $("notiz-loeschen").textContent = eintrag?.wiederholung ? "Ganze Reihe löschen" : "Eintrag löschen";
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
  (alle[datum] ??= []).push({ id, art: gewaehlteArt(), text, zeit: $("notiz-zeit").value,
    wiederholung: $("notiz-wiederholung").value });
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
  b.addEventListener("click", () => {
    setzeArt(b.dataset.wert);
    // Geburtstage kommen jedes Jahr wieder - das soll man nicht extra waehlen muessen.
    if (b.dataset.wert === "geburtstag" && !$("notiz-wiederholung").value) $("notiz-wiederholung").value = "jahr";
  });
}

// ---------- Kachel in der Uebersicht ----------

// Kachel: heutiges Datum gross, darunter der naechste Eintrag. Den
// Wochenverlauf zeigt seit der Wochenuebersicht deren eigene Kachel.
function zeichneKalenderKachel() {
  const h = new Date(heute() + "T12:00:00");
  $("kachel-kal-tag").textContent = h.getDate();
  $("kachel-kal-monat").textContent = h.toLocaleDateString("de-DE", { month: "long" });
  zeichneNaechsten();
}

// Der naechste anstehende Eintrag ab jetzt - damit die Uebersicht zeigt,
// was heute noch ansteht. Vergangene Uhrzeiten von heute zaehlen nicht mehr.
function zeichneNaechsten() {
  const h = heute();
  const jetzt = new Date();
  const uhr = `${String(jetzt.getHours()).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}`;
  const alle = kalEintraege();
  // Tag fuer Tag ab heute suchen: Wiederholungen stehen ja nicht einzeln im
  // Speicher. Ein Jahr reicht - danach kaeme jeder Jahrestermin ohnehin wieder.
  let kandidat = null;
  const d0 = new Date(h + "T12:00:00");
  for (let i = 0; i <= 366 && !kandidat && Object.keys(alle).length; i++) {
    const d = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    const e = eintraegeAm(d, alle).find((x) => i > 0 || !x.zeit || x.zeit >= uhr);
    if (e) kandidat = { ...e, datum: d };
  }

  const feld = $("kachel-naechster");
  if (!kandidat) { feld.textContent = "Keine Einträge"; return; }
  const wann = kandidat.datum === h ? "Heute"
    : new Date(kandidat.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  feld.textContent = `${ARTEN[kandidat.art]?.zeichen ?? "📝"} ${wann}${kandidat.zeit ? " " + kandidat.zeit : ""} · ${kandidat.text}`;
}

// ---------- Knoepfe ----------

// Wischen ueber dem Monat: Finger nach rechts = voriger Monat, nach links =
// naechster - dieselbe Richtung wie beim Tageswechsel in der Uebersicht.
let kalWisch = null;
const monatKarte = $("kal-raster").closest(".kalender-karte");
monatKarte.addEventListener("touchstart", (ev) => {
  const t = ev.touches[0];
  kalWisch = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, zeit: Date.now() } : null;
}, { passive: true });
monatKarte.addEventListener("touchend", (ev) => {
  if (!kalWisch) return;
  const t = ev.changedTouches[0];
  const dx = t.clientX - kalWisch.x, dy = t.clientY - kalWisch.y;
  const schnell = Date.now() - kalWisch.zeit < 700;
  kalWisch = null;
  if (!schnell || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0 && $("kal-vor").disabled) return;
  blaettereMonat(dx > 0 ? -1 : 1);
  const r = $("kal-raster");
  r.classList.remove("rein-rechts", "rein-links");
  void r.offsetWidth; // Animation neu starten
  r.classList.add(dx > 0 ? "rein-links" : "rein-rechts");
}, { passive: true });

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

zeichneKalenderKachel();

// Der "naechste Eintrag" haengt an der Uhrzeit - jede Minute nachziehen,
// sonst stuende um 19 Uhr noch das Training von 18 Uhr in der Kachel.
setInterval(zeichneNaechsten, 60 * 1000);
