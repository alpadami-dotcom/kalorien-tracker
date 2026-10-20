// Kalender: Monatsansicht zum Springen auf einen Tag.
// Ein Tag im Kalender ist derselbe Tag wie in der Hauptansicht - wer ihn
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

    const liste = tage[d] ?? [];
    const kcal = liste.reduce((a, e) => a + werte(e).kcal, 0);
    const teile = [];
    if (liste.length) {
      // 10 % Spielraum: Wer 2050 statt 2000 isst, hat sein Ziel nicht verfehlt.
      const drueber = kcal > z * 1.1;
      b.classList.add(drueber ? "drueber" : "im-ziel");
      teile.push(`${Math.round(kcal)} kcal${drueber ? ", über dem Ziel" : ""}`);
    }
    if (wasserTage[d]) teile.push(`${(wasserTage[d] / 1000).toLocaleString("de-DE")} L Wasser`);
    if (gewichtTage[d] != null) teile.push(`${gewichtTage[d].toLocaleString("de-DE")} kg`);
    b.setAttribute("aria-label", `${t}. ${$("kal-titel").textContent}${teile.length ? ": " + teile.join(", ") : ""}`);

    b.addEventListener("click", () => {
      tag = d;
      $("kalender").close();
      zeichne();
      scrollTo({ top: 0, behavior: "smooth" });
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

function oeffneKalender() {
  kalenderMonat = tag.slice(0, 7);
  zeichneKalender();
  $("kalender").showModal();
}

$("kal-zurueck").addEventListener("click", () => blaettereMonat(-1));
$("kal-vor").addEventListener("click", () => blaettereMonat(1));
$("kal-heute").addEventListener("click", () => {
  tag = heute();
  $("kalender").close();
  zeichne();
});
