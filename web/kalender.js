// Kalender: Monatsansicht (#kalender) und der Wochenstreifen in der Kachel.
// Ein Tag im Kalender ist derselbe Tag wie in der Uebersicht - wer ihn
// antippt, landet dort und kann wie gewohnt Essen, Wasser und Gewicht
// eintragen. Nutzt Helfer aus app.js ($, tag, heute, alleTage, werte, ziel, zeichne).

let kalenderMonat = null; // "2026-10"

const zuDatum = (j, m, t) => `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;

function zeichneKalender() {
  const [j, m] = kalenderMonat.split("-").map(Number);
  $("kal-titel").textContent = new Date(j, m - 1, 15).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const h = heute();
  // Kein Blick in die Zukunft: Dort gibt es nichts einzutragen.
  $("kal-vor").disabled = kalenderMonat >= h.slice(0, 7);

  const tage = alleTage();
  const wasserTage = lies(SPEICHER_WASSER, {});
  const gewichtTage = lies(SPEICHER_GEWICHT, {});
  const z = ziel();

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
    if (d === tag) b.classList.add("gewaehlt");
    if (d > h) b.disabled = true;

    const status = tagStatus(tage, d, z);
    const teile = [];
    if (status) {
      b.classList.add(status.klasse);
      teile.push(`${Math.round(status.kcal)} kcal${status.klasse === "drueber" ? ", über dem Ziel" : ""}`);
    }
    if (wasserTage[d]) teile.push(`${(wasserTage[d] / 1000).toLocaleString("de-DE")} L Wasser`);
    if (gewichtTage[d] != null) teile.push(`${gewichtTage[d].toLocaleString("de-DE")} kg`);
    b.setAttribute("aria-label", `${t}. ${$("kal-titel").textContent}${teile.length ? ": " + teile.join(", ") : ""}`);

    b.addEventListener("click", () => {
      tag = d;
      zeichne();
      location.hash = "";
    });
    zellen.push(b);
  }
  $("kal-raster").replaceChildren(...zellen);
}

function blaettereMonat(schritt) {
  const [j, m] = kalenderMonat.split("-").map(Number);
  const d = new Date(j, m - 1 + schritt, 1);
  kalenderMonat = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  zeichneKalender();
}

// 10 % Spielraum: Wer 2050 statt 2000 isst, hat sein Ziel nicht verfehlt.
function tagStatus(tage, d, z) {
  const liste = tage[d] ?? [];
  if (!liste.length) return null;
  const kcal = liste.reduce((a, e) => a + werte(e).kcal, 0);
  return { kcal, klasse: kcal > z * 1.1 ? "drueber" : "im-ziel" };
}

// Aufgerufen von zeigeAnsicht(), wenn #kalender geoeffnet wird.
function zeigeKalender() {
  kalenderMonat = tag.slice(0, 7);
  zeichneKalender();
}

// Kachel: die letzten sieben Tage bis heute, je Tag ein Punkt.
function zeichneWoche() {
  const tage = alleTage();
  const z = ziel();
  const h = new Date(heute() + "T12:00:00");
  $("kachel-woche").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const datum = new Date(h.getTime() - (6 - i) * 86400000);
    const d = datum.toISOString().slice(0, 10);
    const zelle = document.createElement("span");
    zelle.className = "woche-tag" + (d === tag ? " gewaehlt" : "");
    const status = tagStatus(tage, d, z);
    zelle.innerHTML = `<span class="woche-name"></span><span class="woche-punkt ${status?.klasse ?? ""}"></span>`;
    zelle.querySelector(".woche-name").textContent = datum.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
    return zelle;
  }));
}

$("kal-zurueck").addEventListener("click", () => blaettereMonat(-1));
$("kal-vor").addEventListener("click", () => blaettereMonat(1));
$("kal-heute").addEventListener("click", () => {
  tag = heute();
  zeichne();
  location.hash = "";
});

zeichneWoche();
