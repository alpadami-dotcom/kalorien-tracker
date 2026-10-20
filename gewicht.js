// Gewichtsverlauf: Eintraege, Kurve, Liste.
// Nutzt die Helfer aus app.js ($, lies, schreib, heute, tag, meldung).
//
// Gespeichert als { "2026-10-20": 72.5 } - ein Wert pro Tag. Wer zweimal am
// Tag wiegt, ueberschreibt; mehr Genauigkeit gibt die Waage nicht her.

const SPEICHER_GEWICHT = "kalorien:gewicht";
const TAG_MS = 86400000;
let zeitraum = 30; // Tage, oder 0 fuer alles

const gewichte = () => lies(SPEICHER_GEWICHT, {});
const kg = (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const alsZeit = (datum) => new Date(datum + "T12:00:00").getTime();
const kurzDatum = (t, mitTag) => new Date(t).toLocaleDateString("de-DE",
  mitTag ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });

// Taegliche Werte schwanken um 1-2 kg (Wasser, Salz, Verdauung). Der
// 7-Tage-Schnitt zeigt, wohin es wirklich geht - deshalb ist er die Linie
// und die einzelnen Messungen nur Punkte. Nach Zeit statt nach Anzahl
// gemittelt, damit Luecken (Urlaub, vergessen) nichts verzerren.
function mitSchnitt(punkte) {
  return punkte.map((p) => {
    const fenster = punkte.filter((q) => q.t <= p.t && q.t > p.t - 7 * TAG_MS);
    return { ...p, schnitt: fenster.reduce((a, q) => a + q.kg, 0) / fenster.length };
  });
}

function zeichneGewicht() {
  const alle = mitSchnitt(Object.entries(gewichte())
    .map(([datum, wert]) => ({ datum, t: alsZeit(datum), kg: wert }))
    .sort((a, b) => a.t - b.t));

  const jetzt = alsZeit(heute());
  const ab = zeitraum ? jetzt - (zeitraum - 1) * TAG_MS : -Infinity;
  const sichtbar = alle.filter((p) => p.t >= ab);

  const letzter = alle.at(-1);
  $("gewicht-aktuell").textContent = letzter ? kg(letzter.kg) : "–";
  $("kachel-gewicht").textContent = letzter ? kg(letzter.kg) : "–";
  if (sichtbar.length >= 2) {
    const d = sichtbar.at(-1).kg - sichtbar[0].kg;
    const richtung = Math.abs(d) < 0.05 ? "gleich geblieben" : `${d > 0 ? "+" : "−"}${kg(Math.abs(d))} kg`;
    $("gewicht-delta").textContent = `${richtung} seit ${kurzDatum(sichtbar[0].t)}`;
  } else {
    $("gewicht-delta").textContent = letzter ? `zuletzt ${kurzDatum(letzter.t, true)}` : "";
  }

  // Kachel in der Uebersicht: immer die letzten 30 Tage, unabhaengig vom
  // Zeitraum, den man auf der Gewicht-Seite gewaehlt hat.
  const monat = alle.filter((p) => p.t > jetzt - 30 * TAG_MS);
  $("kachel-gewicht-delta").textContent = monat.length >= 2
    ? `${monat.at(-1).kg - monat[0].kg > 0 ? "+" : "−"}${kg(Math.abs(monat.at(-1).kg - monat[0].kg))} kg in 30 Tagen`
    : letzter ? `zuletzt ${kurzDatum(letzter.t)}` : "Noch nichts eingetragen";

  const genug = sichtbar.length >= 2;
  $("gewicht-diagramm").hidden = !genug;
  $("gewicht-legende").hidden = !genug;
  $("gewicht-leer").hidden = genug;
  $("gewicht-leer").textContent = !alle.length
    ? "Trag dein Gewicht ein – ab zwei Werten erscheint hier der Verlauf."
    : sichtbar.length < 2 && alle.length >= 2
      ? "In diesem Zeitraum gibt es weniger als zwei Werte – wähle „Alles“."
      : "Noch ein Wert, dann gibt es eine Kurve.";
  if (genug) zeichneKurve(sichtbar, Math.max(ab, sichtbar[0].t), jetzt);

  zeichneGewichtsliste(alle);
}

// Runde Achsenschritte: 0,5 / 1 / 2 / 5 kg, so dass etwa vier Linien entstehen.
function achsenSchritt(spanne) {
  return [0.5, 1, 2, 5, 10].find((s) => spanne / s <= 4) ?? 10;
}

function zeichneKurve(punkte, von, bis) {
  const box = $("gewicht-diagramm");
  const B = box.clientWidth || 320, H = 180;
  const rand = { l: 34, r: 10, o: 10, u: 22 };

  const werte = punkte.flatMap((p) => [p.kg, p.schnitt]);
  const schritt = achsenSchritt(Math.max(...werte) - Math.min(...werte) || 1);
  const yMin = Math.floor((Math.min(...werte) - 0.2) / schritt) * schritt;
  const yMax = Math.ceil((Math.max(...werte) + 0.2) / schritt) * schritt;
  const x = (t) => rand.l + ((t - von) / Math.max(bis - von, TAG_MS)) * (B - rand.l - rand.r);
  const y = (v) => rand.o + (1 - (v - yMin) / (yMax - yMin)) * (H - rand.o - rand.u);

  const ns = "http://www.w3.org/2000/svg";
  const el = (name, attr) => {
    const e = document.createElementNS(ns, name);
    for (const k in attr) e.setAttribute(k, attr[k]);
    return e;
  };
  const svg = el("svg", { width: B, height: H, viewBox: `0 0 ${B} ${H}`, role: "img",
    "aria-label": "Gewichtsverlauf – die Werte stehen auch in der Liste darunter" });

  // Raster und y-Achse: Haarlinien, leise.
  for (let v = yMin; v <= yMax + 1e-9; v += schritt) {
    svg.append(el("line", { x1: rand.l, x2: B - rand.r, y1: y(v), y2: y(v), class: "raster" }));
    const t = el("text", { x: rand.l - 6, y: y(v) + 4, class: "achse", "text-anchor": "end" });
    t.textContent = v.toLocaleString("de-DE");
    svg.append(t);
  }
  // x-Achse: nur Anfang und Ende - mehr Daten passen auf 320 px nicht lesbar.
  for (const [t, anker] of [[von, "start"], [bis, "end"]]) {
    const e = el("text", { x: x(t), y: H - 6, class: "achse", "text-anchor": anker });
    e.textContent = kurzDatum(t);
    svg.append(e);
  }

  svg.append(el("path", {
    class: "schnitt",
    d: punkte.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.schnitt).toFixed(1)}`).join(""),
  }));
  for (const p of punkte) svg.append(el("circle", { class: "gewogen", cx: x(p.t), cy: y(p.kg), r: 4 }));

  // Fadenkreuz: Finger irgendwo auf die Flaeche, der naechste Tag gewinnt.
  const kreuz = el("line", { class: "kreuz", y1: rand.o, y2: H - rand.u, visibility: "hidden" });
  const fokus = el("circle", { class: "fokus", r: 6, visibility: "hidden" });
  const flaeche = el("rect", { x: 0, y: 0, width: B, height: H, fill: "transparent", tabindex: 0 });
  svg.append(kreuz, fokus, flaeche);

  const tip = $("gewicht-tip");
  let index = punkte.length - 1;
  const zeige = (i) => {
    index = Math.max(0, Math.min(punkte.length - 1, i));
    const p = punkte[index];
    kreuz.setAttribute("x1", x(p.t)); kreuz.setAttribute("x2", x(p.t));
    fokus.setAttribute("cx", x(p.t)); fokus.setAttribute("cy", y(p.kg));
    kreuz.setAttribute("visibility", "visible"); fokus.setAttribute("visibility", "visible");
    tip.querySelector(".tip-datum").textContent = kurzDatum(p.t, true);
    tip.querySelector(".tip-gewogen").textContent = `${kg(p.kg)} kg`;
    tip.querySelector(".tip-schnitt").textContent = `${kg(p.schnitt)} kg`;
    tip.hidden = false;
    const links = Math.min(Math.max(x(p.t) - tip.offsetWidth / 2, 0), B - tip.offsetWidth);
    tip.style.left = links + "px";
  };
  const verstecke = () => {
    tip.hidden = true;
    kreuz.setAttribute("visibility", "hidden"); fokus.setAttribute("visibility", "hidden");
  };
  const naechster = (ev) => {
    const px = ev.clientX - svg.getBoundingClientRect().left;
    let best = 0;
    punkte.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(punkte[best].t) - px)) best = i; });
    zeige(best);
  };
  flaeche.addEventListener("pointerdown", naechster);
  flaeche.addEventListener("pointermove", naechster);
  flaeche.addEventListener("pointerleave", verstecke);
  flaeche.addEventListener("focus", () => zeige(index));
  flaeche.addEventListener("blur", verstecke);
  flaeche.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") zeige(index - 1);
    if (ev.key === "ArrowRight") zeige(index + 1);
  });

  box.querySelector("svg")?.remove();
  box.prepend(svg);
  verstecke();
}

function zeichneGewichtsliste(alle) {
  $("gewicht-anzahl").textContent = alle.length ? `(${alle.length})` : "";
  $("gewicht-liste").replaceChildren(...[...alle].reverse().map((p) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="was"><div class="name"></div></div><div class="kcal"></div>`;
    li.querySelector(".name").textContent = kurzDatum(p.t, true);
    li.querySelector(".kcal").textContent = `${kg(p.kg)} kg`;
    li.addEventListener("click", () => oeffneGewicht(p.datum));
    return li;
  }));
}

// ---------- Eintragen ----------

let gewichtTag = null; // im Dialog gewaehlter Tag, "2026-10-20"

// Die waehlbaren Tage: heute und die drei davor. Wird ein aelterer Wert
// bearbeitet, kommt sein Tag vorne dazu - sonst liesse er sich nicht aendern.
function gewichtTage(extra) {
  const h = new Date(heute() + "T12:00:00");
  const tage = Array.from({ length: 4 }, (_, i) => new Date(h.getTime() - i * TAG_MS).toISOString().slice(0, 10)).reverse();
  if (extra && !tage.includes(extra) && extra < tage[0]) tage.unshift(extra);
  return tage;
}

function tagEtikett(d) {
  const abstand = Math.round((alsZeit(heute()) - alsZeit(d)) / TAG_MS);
  if (abstand === 0) return "Heute";
  if (abstand === 1) return "Gestern";
  const datum = new Date(d + "T12:00:00");
  return abstand <= 6
    ? `${datum.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")} ${datum.getDate()}.`
    : `${datum.getDate()}.${datum.getMonth() + 1}.`;
}

function waehleGewichtTag(d) {
  gewichtTag = d;
  for (const b of $("g-tage").children) b.setAttribute("aria-checked", b.dataset.wert === d);
  const w = gewichte()[d];
  $("g-wert").value = w != null ? w.toLocaleString("de-DE") : "";
  $("g-loeschen").hidden = w == null;
}

function oeffneGewicht(datum) {
  // Ohne Angabe: der angezeigte Tag, falls er in den letzten 4 Tagen liegt, sonst heute.
  const vorschlag = datum ?? tag;
  const tage = gewichtTage(datum);
  const d = tage.includes(vorschlag) ? vorschlag : heute();
  const g = gewichte();
  $("g-tage").replaceChildren(...tage.map((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "radio";
    b.dataset.wert = t;
    b.textContent = tagEtikett(t);
    // Kleiner Punkt: an diesem Tag ist schon ein Gewicht eingetragen.
    if (g[t] != null) b.classList.add("hat-wert");
    b.addEventListener("click", () => waehleGewichtTag(t));
    return b;
  }));
  waehleGewichtTag(d);
  $("gewicht-dialog").showModal();
}

// Speichern beim Antippen - siehe "eintragen" in app.js.
$("g-speichern").addEventListener("click", (ev) => {
  const wert = parseFloat($("g-wert").value.replace(",", "."));
  const datum = gewichtTag;
  if (!(wert >= 20 && wert <= 400) || !datum) {
    ev.preventDefault();
    return meldung("Bitte ein Gewicht in kg eingeben, z. B. 72,5.");
  }
  const g = gewichte();
  g[datum] = Math.round(wert * 10) / 10;
  schreib(SPEICHER_GEWICHT, g);

  uebernimmNeuestes(g);
  zeichneGewicht();
});

// Der neueste Wert ist das aktuelle Gewicht - der Kalorienrechner im
// Profil soll damit rechnen, statt mit dem vom ersten Einrichten.
function uebernimmNeuestes(g) {
  const neuestes = Object.keys(g).sort().at(-1);
  if (neuestes) schreib(SPEICHER_PROFIL, { ...lies(SPEICHER_PROFIL, {}), gewicht: g[neuestes] });
}

$("g-loeschen").addEventListener("click", () => {
  const g = gewichte();
  delete g[gewichtTag];
  schreib(SPEICHER_GEWICHT, g);
  uebernimmNeuestes(g);
  zeichneGewicht();
});

$("gewicht-plus").addEventListener("click", () => oeffneGewicht());
$("kachel-gewicht-plus").addEventListener("click", () => oeffneGewicht(heute()));
$("g-abbrechen").addEventListener("click", () => $("gewicht-dialog").close());

for (const b of $("gewicht-zeitraum").children) {
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => {
    zeitraum = Number(b.dataset.wert);
    for (const c of $("gewicht-zeitraum").children) c.setAttribute("aria-checked", c === b);
    zeichneGewicht();
  });
}

// Die Kurve ist in Pixeln gerechnet - beim Drehen des Handys neu zeichnen.
let groessenUhr;
window.addEventListener("resize", () => {
  clearTimeout(groessenUhr);
  groessenUhr = setTimeout(zeichneGewicht, 150);
});

zeichneGewicht();
