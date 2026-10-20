// Wochenuebersicht (#woche) und die Woche-Kachel der Uebersicht.
//
// Eine Woche ist Montag bis Sonntag (Kalenderwoche), nicht "die letzten 7
// Tage": So bleibt eine Woche dieselbe Woche, egal an welchem Tag man
// nachschaut, und man kann Woche gegen Woche vergleichen.
// Nutzt Helfer aus app.js ($, tag, heute, lies, alleTage, summen, ziel,
// makroZiele, makroGeschafft, rund, zeichne, meldung, SPEICHER_WASSER) und
// SPEICHER_GEWICHT aus gewicht.js.

const TAG = 86400000;
let wocheStart = null; // Montag der angezeigten Woche, "2026-10-19"

function montagVon(d) {
  const datum = new Date(d + "T12:00:00");
  datum.setDate(datum.getDate() - ((datum.getDay() + 6) % 7));
  return datum.toISOString().slice(0, 10);
}
const plusTage = (d, n) => new Date(new Date(d + "T12:00:00").getTime() + n * TAG).toISOString().slice(0, 10);
const zahl = (x) => Math.round(x).toLocaleString("de-DE");

// ISO-Kalenderwoche - die Zahl, die auch im Schulkalender steht.
// Tage gerundet: Zwischen Januar und Oktober liegt die Zeitumstellung, ein
// Tag hat dort nur 23 Stunden - ohne Runden war ab Ende Maerz jede KW um
// eins zu klein.
function kalenderwoche(montag) {
  const donnerstag = new Date(plusTage(montag, 3) + "T12:00:00");
  const jahresanfang = new Date(donnerstag.getFullYear(), 0, 1, 12);
  return 1 + Math.floor(Math.round((donnerstag - jahresanfang) / TAG) / 7);
}

// Die sieben Tage einer Woche mit allem, was die Seite braucht.
function wochenDaten(montag) {
  const tage = alleTage();
  const wasser = lies(SPEICHER_WASSER, {});
  const gewicht = lies(SPEICHER_GEWICHT, {});
  const mz = makroZiele();
  const h = heute();
  return Array.from({ length: 7 }, (_, i) => {
    const d = plusTage(montag, i);
    const liste = tage[d] ?? [];
    const s = summen(liste);
    return {
      d, s, zukunft: d > h, gegessen: liste.length > 0,
      makro: liste.length > 0 && makroGeschafft(s, mz),
      wasser: wasser[d] ?? 0, gewicht: gewicht[d] ?? null,
      schritte: typeof schritteAlle === "function" ? (schritteAlle()[d] ?? 0) : 0,
    };
  });
}

// Durchschnitt nur ueber Tage mit Eintraegen - ein vergessener Tag ist kein
// Fastentag und wuerde den Schnitt sonst kuenstlich druecken.
function schnitt(werte) {
  return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
}

// ---------- Kachel ----------

function zeichneWocheKachel() {
  const woche = wochenDaten(montagVon(heute()));
  const mitEssen = woche.filter((t) => t.gegessen);
  const avg = schnitt(mitEssen.map((t) => t.s.kcal));
  $("kachel-woche-schnitt").textContent = avg == null ? "–" : zahl(avg);

  // Mini-Balken: Hoehe relativ zum Ziel (+30 % Luft), damit "am Ziel" immer
  // gleich hoch aussieht und nicht vom staerksten Tag abhaengt.
  const oben = Math.max(ziel() * 1.3, ...woche.map((t) => t.s.kcal));
  $("kachel-woche-balken").replaceChildren(...woche.map((t) => {
    const spalte = document.createElement("span");
    spalte.className = "mini-spalte" + (t.d === heute() ? " heute" : "") + (t.zukunft ? " zukunft" : "");
    const balken = document.createElement("span");
    balken.className = "mini-balken" + (t.gegessen ? "" : " ohne-wert"); // nicht "leer": die Klasse hat schon Polster
    balken.style.height = t.gegessen ? Math.max(6, (t.s.kcal / oben) * 100) + "%" : "";
    const name = document.createElement("span");
    name.className = "mini-name";
    name.textContent = new Date(t.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "narrow" });
    spalte.append(balken, name);
    return spalte;
  }));
}

// ---------- Seite ----------

function zeigeWoche() {
  wocheStart = montagVon(tag);
  zeichneWocheSeite();
}

function zeichneWocheSeite() {
  const woche = wochenDaten(wocheStart);
  const sonntag = plusTage(wocheStart, 6);
  const von = new Date(wocheStart + "T12:00:00"), bis = new Date(sonntag + "T12:00:00");
  const gleicherMonat = von.getMonth() === bis.getMonth();
  $("woche-titel").textContent = `KW ${kalenderwoche(wocheStart)}`;
  $("woche-zeitraum").textContent = `${von.getDate()}.${gleicherMonat ? "" : " " + von.toLocaleDateString("de-DE", { month: "short" })} – ${bis.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}`;
  $("woche-vor").disabled = sonntag >= heute();

  zeichneWochenDiagramm(woche);
  zeichneKennzahlen(woche);
  zeichneWochenListe(woche);
}

function blaettereWoche(schritt) {
  if (schritt > 0 && $("woche-vor").disabled) return;
  wocheStart = plusTage(wocheStart, 7 * schritt);
  zeichneWocheSeite();
}

// Saeulen je Tag, eine Ziel-Linie. Eine Reihe, eine Farbe - also keine
// Legende; die Ziel-Linie traegt ihr Etikett selbst.
function zeichneWochenDiagramm(woche) {
  const box = $("woche-diagramm");
  const B = box.clientWidth || 320, H = 200;
  const rand = { l: 40, r: 8, o: 14, u: 26 };
  const z = ziel();
  const groesster = Math.max(z, ...woche.map((t) => t.s.kcal));
  const schritt = groesster > 3200 ? 1000 : 500;
  const oben = Math.ceil((groesster * 1.08) / schritt) * schritt;
  const y = (v) => rand.o + (1 - v / oben) * (H - rand.o - rand.u);
  const breite = (B - rand.l - rand.r) / 7;
  const mitte = (i) => rand.l + breite * (i + 0.5);
  const saeule = Math.min(24, breite * 0.55);

  const ns = "http://www.w3.org/2000/svg";
  const el = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el("svg", { width: B, height: H, viewBox: `0 0 ${B} ${H}`, role: "img",
    "aria-label": "Kalorien pro Tag – die Werte stehen auch in der Liste darunter" });

  for (let v = 0; v <= oben; v += schritt) {
    svg.append(el("line", { x1: rand.l, x2: B - rand.r, y1: y(v), y2: y(v), class: "raster" }));
    const t = el("text", { x: rand.l - 6, y: y(v) + 4, class: "achse", "text-anchor": "end" });
    t.textContent = v >= 1000 ? `${v / 1000}k` : v;
    svg.append(t);
  }

  woche.forEach((t, i) => {
    if (t.gegessen) {
      // Oben 4 px gerundet, unten gerade auf der Grundlinie.
      const x = mitte(i) - saeule / 2, y0 = y(0), y1 = Math.min(y(t.s.kcal), y0 - 2), r = Math.min(4, y0 - y1);
      svg.append(el("path", {
        class: "saeule",
        d: `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + saeule - r}Q${x + saeule},${y1} ${x + saeule},${y1 + r}V${y0}Z`,
      }));
    }
    const name = el("text", { x: mitte(i), y: H - 8, class: "achse" + (t.d === heute() ? " heute" : ""), "text-anchor": "middle" });
    name.textContent = new Date(t.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
    svg.append(name);
  });

  // Ziel-Linie mit eigenem Etikett statt Legende
  svg.append(el("line", { x1: rand.l, x2: B - rand.r, y1: y(z), y2: y(z), class: "ziel-linie" }));
  const zt = el("text", { x: B - rand.r, y: y(z) - 5, class: "achse ziel-text", "text-anchor": "end" });
  zt.textContent = `Ziel ${zahl(z)}`;
  svg.append(zt);

  // Antippen: die ganze Tagesspalte ist die Trefferflaeche, nicht nur die Saeule.
  const tip = $("woche-tip");
  woche.forEach((t, i) => {
    const flaeche = el("rect", { x: mitte(i) - breite / 2, y: 0, width: breite, height: H, fill: "transparent", tabindex: 0 });
    const zeige = () => {
      tip.querySelector(".tip-datum").textContent = new Date(t.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
      tip.querySelector(".tip-wert").textContent = t.gegessen ? `${zahl(t.s.kcal)} kcal` : t.zukunft ? "kommt noch" : "nichts eingetragen";
      tip.querySelector(".tip-makros").textContent = t.gegessen ? `${rund(t.s.protein)} P · ${rund(t.s.kh)} K · ${rund(t.s.fett)} F${t.makro ? " · ✓ Makros" : ""}` : "";
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
}

function zeichneKennzahlen(woche) {
  const mitEssen = woche.filter((t) => t.gegessen);
  const z = ziel();
  const mitWasser = woche.filter((t) => t.wasser > 0);
  const gewogen = woche.filter((t) => t.gewicht != null);
  const imZiel = mitEssen.filter((t) => t.s.kcal <= z * 1.1).length;
  const avg = (k) => schnitt(mitEssen.map((t) => t.s[k]));

  const kennzahlen = [
    ["Ø Kalorien", mitEssen.length ? `${zahl(avg("kcal"))} kcal` : "–", mitEssen.length ? `an ${mitEssen.length} ${mitEssen.length === 1 ? "Tag" : "Tagen"}` : "noch nichts"],
    ["Im Kalorienziel", mitEssen.length ? `${imZiel} / ${mitEssen.length}` : "–", "Tage, höchstens 10 % drüber"],
    ["Makroziel geschafft", `${mitEssen.filter((t) => t.makro).length} ${mitEssen.filter((t) => t.makro).length === 1 ? "Tag" : "Tage"}`, "✓ Protein, KH und Fett"],
    ["Ø Protein", mitEssen.length ? `${zahl(avg("protein"))} g` : "–", `Ziel ${makroZiele().protein} g`],
    ["Ø Wasser", mitWasser.length ? `${(schnitt(mitWasser.map((t) => t.wasser)) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} L` : "–", `Ziel ${(wasserZiel() / 1000).toLocaleString("de-DE")} L`],
    ["Ø Schritte", woche.some((t) => t.schritte) ? zahl(schnitt(woche.filter((t) => t.schritte).map((t) => t.schritte))) : "–",
      typeof schrittZiel === "function" ? `Ziel ${zahl(schrittZiel())}` : ""],
    ["Gewicht", gewogen.length >= 2
      ? `${gewogen.at(-1).gewicht - gewogen[0].gewicht > 0 ? "+" : "−"}${Math.abs(gewogen.at(-1).gewicht - gewogen[0].gewicht).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`
      : gewogen.length ? `${gewogen[0].gewicht.toLocaleString("de-DE")} kg` : "–",
      gewogen.length >= 2 ? "in dieser Woche" : gewogen.length ? "einmal gewogen" : "nicht gewogen"],
  ];
  $("woche-kennzahlen").replaceChildren(...kennzahlen.map(([titel, wert, unten]) => {
    const div = document.createElement("div");
    div.className = "kennzahl";
    div.innerHTML = `<div class="klein"></div><div class="kennzahl-wert"></div><div class="klein"></div>`;
    div.children[0].textContent = titel;
    div.children[1].textContent = wert;
    div.children[2].textContent = unten;
    return div;
  }));
}

function zeichneWochenListe(woche) {
  $("woche-liste").replaceChildren(...woche.filter((t) => !t.zukunft).reverse().map((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="was"><div class="name"></div><div class="detail"></div></div><div class="kcal"></div>`;
    li.querySelector(".name").textContent = new Date(t.d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" })
      + (t.makro ? " ✓" : "");
    li.querySelector(".detail").textContent = t.gegessen
      ? `${rund(t.s.protein)} P · ${rund(t.s.kh)} K · ${rund(t.s.fett)} F${t.wasser ? ` · ${(t.wasser / 1000).toLocaleString("de-DE")} L` : ""}`
      : "nichts eingetragen";
    li.querySelector(".kcal").textContent = t.gegessen ? zahl(t.s.kcal) : "";
    li.addEventListener("click", () => {
      tag = t.d;
      zeichne();
      location.hash = "";
    });
    return li;
  }));
}

// ---------- Knoepfe, Wischen ----------

$("woche-zurueck").addEventListener("click", () => blaettereWoche(-1));
$("woche-vor").addEventListener("click", () => blaettereWoche(1));

// Finger nach rechts = vorige Woche, nach links = naechste - wie ueberall.
let wocheWisch = null;
const wocheKarte = $("woche-diagramm").closest("section");
wocheKarte.addEventListener("touchstart", (ev) => {
  const t = ev.touches[0];
  wocheWisch = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, zeit: Date.now() } : null;
}, { passive: true });
wocheKarte.addEventListener("touchend", (ev) => {
  if (!wocheWisch) return;
  const t = ev.changedTouches[0];
  const dx = t.clientX - wocheWisch.x, dy = t.clientY - wocheWisch.y;
  const schnell = Date.now() - wocheWisch.zeit < 700;
  wocheWisch = null;
  if (!schnell || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  blaettereWoche(dx > 0 ? -1 : 1);
}, { passive: true });

zeichneWocheKachel();
