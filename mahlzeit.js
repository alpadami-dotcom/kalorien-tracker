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
let mzOffen = false; // "heute schon eingetragen" aufgeklappt?
const ZULETZT_ANZAHL = 8;

// Favoriten setzt man selbst mit dem Stern - im Gegensatz zum Gedaechtnis,
// das von allein lernt. Gespeichert mit Menge, damit ein Tipp reicht.
// Praefix "kalorien:", damit sie in der Datensicherung landen.
const SPEICHER_FAVORITEN = "kalorien:favoriten"; // [{ name, quelle, pro100, gramm }]
const favoriten = () => lies(SPEICHER_FAVORITEN, []);
const istFavorit = (name) => favoriten().some((f) => f.name === name);

function schalteFavorit(e) {
  const liste = favoriten();
  const weg = liste.some((f) => f.name === e.name);
  schreib(SPEICHER_FAVORITEN, weg
    ? liste.filter((f) => f.name !== e.name)
    : [...liste, { name: e.name, quelle: e.quelle, pro100: e.pro100, gramm: e.gramm }]);
  meldung(weg ? `${e.name} aus den Favoriten entfernt` : `⭐ ${e.name} ist jetzt Favorit`);
  zeichneMahlzeitSeite();
}

// Stern-Knopf fuer eine Zeile. Eigener Knopf in der Zeile: Der Tipp auf die
// Zeile selbst traegt ein, der auf den Stern nicht.
function sternKnopf(e) {
  const b = document.createElement("button");
  b.type = "button";
  const an = istFavorit(e.name);
  b.className = "stern" + (an ? " an" : "");
  b.textContent = an ? "★" : "☆";
  b.setAttribute("aria-label", an ? `${e.name} aus Favoriten entfernen` : `${e.name} als Favorit merken`);
  b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    schalteFavorit(e);
  });
  return b;
}

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
// "ohne" vor dem Kuerzen rausfiltern: Sonst verschwindet der Abschnitt,
// sobald die ersten sechs schon weiter oben stehen.
function oftGegessen(tage, ohne) {
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
    .filter((x) => x.tage.size >= 2 && !ohne.has(x.letzter.name)) // einmal ist kein Muster
    .sort((a, b) => b.tage.size - a.tage.size || b.letztesDatum.localeCompare(a.letztesDatum))
    .slice(0, OFT_ANZAHL);
}

// Die letzten verschiedenen Lebensmittel ueber alle Tage, ohne die in "ohne".
function zuletztGegessen(ohne) {
  const gesehen = new Set(ohne);
  const ergebnis = [];
  const tage = Object.entries(alleTage()).sort(([a], [b]) => b.localeCompare(a));
  for (const [d, liste] of tage) {
    // Innerhalb eines Tages: zuletzt eingetragen zuerst.
    for (const e of [...liste].sort((a, b) => (b.zeit ?? "").localeCompare(a.zeit ?? ""))) {
      if (gesehen.has(e.name)) continue;
      gesehen.add(e.name);
      ergebnis.push({ ...e, datum: d });
      if (ergebnis.length >= ZULETZT_ANZAHL) return ergebnis;
    }
  }
  return ergebnis;
}

function wannText(d) {
  if (d === heute()) return "heute";
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
  li.querySelector(".kcal").before(sternKnopf(e));
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
  $("mz-aufklappen").hidden = !heuteHier.length;
  $("mz-aufklappen").setAttribute("aria-expanded", mzOffen);
  $("mz-aufklappen").innerHTML = `<span class="aufklappen-text"></span><span class="pfeilchen" aria-hidden="true">${mzOffen ? "▴" : "▾"}</span>`;
  $("mz-aufklappen").querySelector(".aufklappen-text").textContent = mzOffen
    ? "Eingetragen – zuklappen"
    : `Eingetragen: ${heuteHier.length} · ${rund(s.kcal)} kcal`;
  $("mz-eintraege").hidden = !mzOffen || !heuteHier.length;
  $("mz-eintraege").replaceChildren(...heuteHier.map(([e, i]) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal">${rund(werte(e).kcal)}</div>`;
    li.querySelector(".name").textContent = e.name;
    li.querySelector(".detail").textContent = `${rund(e.gramm)} g – antippen zum Ändern`;
    li.querySelector(".kcal").before(sternKnopf(e));
    li.addEventListener("click", () => bearbeite(i));
    return li;
  }));

  // Favoriten zuerst - die hat man bewusst ausgesucht.
  const favs = favoriten();
  $("mz-favoriten").hidden = !favs.length;
  $("mz-favoriten-liste").replaceChildren(...favs.map((f) => vorschlagZeile(f)));
  // Was schon weiter oben steht, nicht nochmal zeigen.
  // Gerade Eingetragenes ebenso - das steht oben schon in der Liste.
  const schonDa = new Set([...favs, ...heuteHier.map(([e]) => e)].map((e) => e.name));

  // Gedaechtnis
  const tage = frueher(k);
  const letztes = tage[0];
  $("mz-letztes").hidden = !letztes;
  if (letztes) {
    const [d, liste] = letztes;
    $("mz-letztes-titel").textContent = `Letztes Mal · ${wannText(d)}`;
    $("mz-letztes-liste").replaceChildren(...liste.map((e) => vorschlagZeile(e)));
    $("mz-alles-nochmal").hidden = liste.length < 2; // bei einem Teil reicht die Zeile
    for (const e of liste) schonDa.add(e.name);
  }

  // Zuletzt gegessen: ueber alle Mahlzeiten und Tage, Neuestes zuerst. Ergaenzt
  // "Letztes Mal", das nur diese Mahlzeit kennt - der Joghurt vom Mittag
  // kann ja auch ein Snack sein.
  const zuletzt = zuletztGegessen(schonDa);
  $("mz-zuletzt").hidden = !zuletzt.length;
  $("mz-zuletzt-liste").replaceChildren(...zuletzt.map((e) => vorschlagZeile(e, wannText(e.datum))));
  for (const e of zuletzt) schonDa.add(e.name);
  const oft = oftGegessen(tage, schonDa);
  $("mz-oft").hidden = !oft.length;
  $("mz-oft-titel").textContent = k === "snack" ? "Oft als Snack" : `Oft zum ${titel}`;
  $("mz-oft-liste").replaceChildren(...oft.map((x) => vorschlagZeile(x.letzter, `${x.tage.size}× gegessen`)));
  $("mz-leer").hidden = Boolean(letztes || favs.length || zuletzt.length);
}

$("mz-aufklappen").addEventListener("click", () => {
  mzOffen = !mzOffen;
  zeichneMahlzeitSeite();
});

$("mz-alles-nochmal").addEventListener("click", () => {
  const letztes = frueher(aktuelleMahlzeit)[0];
  if (letztes) oeffnePruefen(letztes[1].map(alsVorschlag), "", "Wie beim letzten Mal?");
});
