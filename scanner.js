// Barcode-Scanner mit Live-Kamera.
//
// Vorher musste man ein Foto machen - das war oft unscharf, zu weit weg oder
// schief, und der Code wurde nicht erkannt. Jetzt laeuft die Kamera im
// Fenster, und alle ~150 ms wird ein Bild geprueft, bis ein Code gefunden
// ist. Geht nur ueber https (GitHub Pages) - auf http bietet Safari die
// Kamera gar nicht an; dann bleiben Foto und Nummer-Eintippen.
// Nutzt liesBarcode()/barcodeNachschlagen() aus naehrwerte.js und
// oeffnePruefen(), meldung(), laden(), aufLeinwand() aus app.js.

let scanStrom = null;   // MediaStream der Kamera
let scanLaeuft = false;
// Zaehlt jedes Oeffnen mit. Wer schliesst, waehrend die Kamera noch startet,
// soll keinen verwaisten Strom samt Pruefschleife hinter sich lassen.
let scanLauf = 0;
let scanFehler = 0; // Fehlversuche in Folge
const scanBild = document.createElement("canvas"); // einmal, nicht alle 150 ms neu

async function oeffneScanner() {
  const lauf = ++scanLauf;
  scanFehler = 0;
  $("scanner").showModal();
  $("scanner-hinweis").textContent = "Halte den Barcode in den Rahmen.";
  if (!navigator.mediaDevices?.getUserMedia) {
    $("scanner-hinweis").textContent = "Live-Kamera geht hier nicht – nimm „Foto“ oder tipp die Nummer ein.";
    return;
  }
  let strom;
  try {
    strom = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch {
    $("scanner-hinweis").textContent = "Kein Zugriff auf die Kamera – in den iPhone-Einstellungen erlauben, oder „Foto“ nehmen.";
    return;
  }
  if (lauf !== scanLauf || !$("scanner").open) return strom.getTracks().forEach((t) => t.stop());
  scanStrom = strom;
  const video = $("scanner-video");
  video.srcObject = strom;
  await video.play().catch(() => {});
  if (lauf !== scanLauf || !$("scanner").open) return;
  scanLaeuft = true;
  pruefeBild(lauf);
}

function schliesseScanner() {
  scanLaeuft = false;
  scanLauf++;
  scanStrom?.getTracks().forEach((t) => t.stop()); // Kamera wirklich aus, sonst bleibt der gruene Punkt an
  scanStrom = null;
  $("scanner-video").srcObject = null;
  if ($("scanner").open) $("scanner").close();
}

// Nur den Rahmen in der Mitte pruefen und auf ~1000 px verkleinern: Das ist
// schneller und meist genauer als das ganze Kamerabild.
async function pruefeBild(lauf) {
  const video = $("scanner-video");
  if (!scanLaeuft || lauf !== scanLauf) return;
  try {
    if (video.videoWidth) {
      const bw = video.videoWidth * 0.8, bh = video.videoHeight * 0.45;
      const x = (video.videoWidth - bw) / 2, y = (video.videoHeight - bh) / 2;
      const f = Math.min(1, 1000 / bw);
      const c = scanBild;
      c.width = Math.round(bw * f);
      c.height = Math.round(bh * f);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, x, y, bw, bh, 0, 0, c.width, c.height);
      const code = await liesBarcode(ctx.getImageData(0, 0, c.width, c.height));
      scanFehler = 0;
      if (code && scanLaeuft && lauf === scanLauf) return gefunden(code);
    }
  } catch {
    // Bibliothek laedt noch oder Bild unbrauchbar - einfach naechstes Bild.
    // Scheitert es dauerhaft (offline, Bibliothek fehlt), das auch sagen.
    if (++scanFehler === 20) $("scanner-hinweis").textContent = "Scanner lädt nicht – tipp die Nummer ein.";
  }
  setTimeout(() => pruefeBild(lauf), 150);
}

async function gefunden(code) {
  schliesseScanner();
  laden("Suche Produkt …");
  try {
    const k = await barcodeNachschlagen(code);
    if (!k) return meldung(`Barcode ${code} kennt Open Food Facts nicht – such das Produkt über den Namen.`);
    oeffnePruefen([k], "", "Produkt gefunden");
  } catch {
    meldung("Keine Verbindung – Barcodes brauchen Internet.");
  } finally {
    laden();
  }
}

$("barcode-knopf").addEventListener("click", oeffneScanner);
$("scanner-abbrechen").addEventListener("click", schliesseScanner);
$("scanner").addEventListener("close", schliesseScanner);

// Nummer eintippen: steht unter jedem Strichcode, falls die Kamera streikt.
$("scanner-nummer").addEventListener("click", () => {
  const code = (prompt("Barcode-Nummer (die Ziffern unter dem Strichcode):") ?? "").replace(/\D/g, "");
  if (code.length >= 8) gefunden(code);
  else if (code) meldung("Das sind zu wenige Ziffern – meist sind es 13.");
});

// Foto als Notloesung (z. B. wenn die Kamera nicht erlaubt ist).
$("barcode-foto").addEventListener("change", async (ev) => {
  const datei = ev.target.files[0];
  ev.target.value = "";
  if (!datei) return;
  schliesseScanner();
  laden("Lese Barcode …");
  try {
    const c = await aufLeinwand(datei, 2400);
    const code = await liesBarcode(c.getContext("2d").getImageData(0, 0, c.width, c.height));
    laden();
    if (!code) return meldung("Kein Barcode erkannt – näher ran, scharf, gut beleuchtet.");
    gefunden(code);
  } catch (e) {
    laden();
    meldung(e.message);
  }
});
