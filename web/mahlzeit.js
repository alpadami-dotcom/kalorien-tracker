// Eine Mahlzeit (#mahlzeit-fruehstueck usw.): eintragen und das Gedaechtnis.
//
// Das Gedaechtnis braucht keinen eigenen Speicher: Es liest die bisherigen
// Eintraege (kalorien:tage) und zeigt pro Mahlzeit, was zuletzt und was oft
// gegessen wurde - mit der Menge, die man ueblicherweise nimmt. Wer jeden
// Morgen Haferflocken isst, tippt sie so mit zwei Tipps statt neu zu suchen.
// Nutzt Helfer aus app.js ($, tag, aktuelleMahlzeit, alleTage, eintraege,
// werte, summen, rund, mahlzeitVon, bearbeite, oeffnePruefen, MAHLZEITEN)
// und ausTabelle() aus naehrwerte.js.

const OFT_ANZAHL = 6;

const mahlzeitTitel = (k) => MAHLZEITEN.find(([s]) => s === k)?.[1] ?? "";

// Ein frueherer Eintrag als neuer Vorschlag fuer den Pruefen-Dialog.
// Portionen kommen frisch aus der Tabelle - im Eintrag selbst stehen sie
// nicht, und ohne sie gaebe es im Dialog keine "1 mittel"-Auswahl.
function alsVorschlag(e) {
  const tabelle = typeof ausTabelle === "function" ? ausTabelle(e.name) : null;
  return {
    name: e.name, quelle: e.quelle, pro100: e.pro100,
    portionen: tabelle?.portionen ?? [], stueck: tabelle?.stueck ?? null,
    gramm: e.gramm,
  };
}

// Was es bei dieser Mahlzeit gab - neueste Tage zuerst, der offene Tag nicht
// (der steht ja schon oben).
function frueher(schluessel) {
  return Object.entries(alleTage())
    .filter(([d]) => d !== tag)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([d, liste]) => [d, liste.filter((e) => mahlzeitVon(e) === schluessel)])
    .filter(([, liste]) => liste.length);
}

// Haeufigste Lebensmittel: zaehlt Tage, nicht Eintraege - zweimal Banane am
// selben Morgen ist kein Lieblingsessen. Menge = die zuletzt gegessene,
// weil man meist bei seiner Portion bleibt.
function oftGegessen(tage) {
  const nachName = new Map();
  for (const [d, liste] of tage) {
    for (const e of liste) {
      const x = nachName.get(e.name) ?? { tage: new Set(), letzter: null, letztesDatum: "" };
      x.tage.add(d);
      if (d >= x.letztesDatum) { x.letzter = e; x.letztesDatum = d; }
      nachName.set(e.name, x);
    }
  }
  return [...nachName.values()]
    .filter((x) => x.tage.size >= 2) // einmal ist kein Muster
    .sort((a, b) => b.tage.size - a.tage.size || b.letztesDatum.localeCompare(a.letztesDatum))
    .slice(0, OFT_ANZAHL);
}

function wannText(d) {
  const gestern = new Date(heute() + "T12:00:00");
  gestern.setDate(gestern.getDate() - 1);
  if (d === gestern.toISOString().slice(0, 10)) return "gestern";
  return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
}

function vorschlagZeile(e, zusatz) {
  const li = document.createElement("li");
  const w = werte(e);
  li.className = "vorschlag-zeile";
  li.innerHTML = `
    <div class="was"><div class="name"></div><div class="detail"></div></div>
    <div class="kcal">${rund(w.kcal)}</div>
    <span class="plus" aria-hidden="true">+</span>`;
  li.querySelector(".name").textContent = e.name;
  li.querySelector(".detail").textContent = `${rund(e.gramm)} g${zusatz ? " · " + zusatz : ""}`;
  li.addEventListener("click", () => oeffnePruefen([alsVorschlag(e)], "", "Nochmal eintragen?"));
  return li;
}

function zeichneMahlzeitSeite() {
  const k = aktuelleMahlzeit;
  if (!k) return;
  const titel = mahlzeitTitel(k);
  $("mz-titel").textContent = titel;
  $("mz-datum").textContent = $("essen-datum").textContent;
  $("text").placeholder = k === "snack" ? "Welcher Snack?" : `Was gab es zum ${titel}?`;

  // Was heute schon in dieser Mahlzeit steht - Index fuer bearbeite() mitnehmen.
  const heuteHier = eintraege().map((e, i) => [e, i]).filter(([e]) => mahlzeitVon(e) === k);
  const s = summen(heuteHier.map(([e]) => e));
  $("mz-kcal").textContent = rund(s.kcal);
  $("mz-makros").textContent = heuteHier.length ? `${rund(s.protein)} P · ${rund(s.kh)} K · ${rund(s.fett)} F` : "";
  $("mz-eintraege").replaceChildren(...heuteHier.map(([e, i]) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal">${rund(werte(e).kcal)}</div>`;
    li.querySelector(".name").textContent = e.name;
    li.querySelector(".detail").textContent = `${rund(e.gramm)} g – antippen zum Ändern`;
    li.addEventListener("click", () => bearbeite(i));
    return li;
  }));

  // Gedaechtnis
  const tage = frueher(k);
  const letztes = tage[0];
  $("mz-letztes").hidden = !letztes;
  if (letztes) {
    const [d, liste] = letztes;
    $("mz-letztes-titel").textContent = `Letztes Mal · ${wannText(d)}`;
    $("mz-letztes-liste").replaceChildren(...liste.map((e) => vorschlagZeile(e)));
    $("mz-alles-nochmal").hidden = liste.length < 2; // bei einem Teil reicht die Zeile
  }
  const oft = oftGegessen(tage);
  $("mz-oft").hidden = !oft.length;
  $("mz-oft-titel").textContent = k === "snack" ? "Oft als Snack" : `Oft zum ${titel}`;
  $("mz-oft-liste").replaceChildren(...oft.map((x) => vorschlagZeile(x.letzter, `${x.tage.size}× gegessen`)));
  $("mz-leer").hidden = Boolean(letztes);
}

$("mz-alles-nochmal").addEventListener("click", () => {
  const letztes = frueher(aktuelleMahlzeit)[0];
  if (letztes) oeffnePruefen(letztes[1].map(alsVorschlag), "", "Wie beim letzten Mal?");
});
