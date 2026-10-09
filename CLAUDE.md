# Kalorien-Tracker

Web-App fürs iPhone: Essen per Text, Foto oder Barcode eintragen, Kalorien
und Makros pro Tag sehen. Erst für mich, später eventuell für andere.

## Aufbau

Die App ist eine **statische Seite** in `web/` und läuft auf GitHub Pages —
ohne Server. Suche, Mengen und Barcode passieren im Browser.

| Datei | Rolle |
|---|---|
| `web/naehrwerte.js` | Suche (deutsche Liste + USDA), Stückgewichte, Barcode lesen + Open Food Facts |
| `web/app.js` | Oberfläche, Mengen-Parser `zerlege()`, Speichern im localStorage |
| `web/sw.js` | Service Worker: offline nutzbar, „Netz zuerst" damit Updates ankommen |
| `web/daten/*.json` | Nährwerte, erzeugt von `daten/baue_daten.py` — nicht von Hand ändern |
| `daten/deutsch.txt` | ~160 deutsche Namen → USDA-Eintrag, von Hand gepflegt |
| `server.py`, `ki.py` | nur zu Hause: Foto/Freitext über Claude, braucht `.env` mit Schlüssel |

Veröffentlichen: `veroeffentlichen.bat` schiebt `web/` auf den Zweig
`gh-pages`, GitHub Pages liefert ihn aus. Kein Actions-Workflow, weil der
gh-Login keine `workflow`-Berechtigung hat und das Hochladen sonst scheitert.

Der API-Schlüssel darf nie nach `web/` — alles dort ist öffentlich.
Ohne `/api/status` (also auf GitHub Pages) blendet die App den Foto-Knopf aus.

## Grundregel: Claude zählt nicht, Claude erkennt

Claude liefert nur **was** und **wie viel Gramm** und den Namen aus der
deutschen Liste. Die Nährwerte setzt `kiZuKandidaten()` im Browser ein,
damit dasselbe Lebensmittel immer dieselben Werte hat. Nur was nicht in
`deutsch.txt` steht, behält Claudes Schätzung — die App markiert es als
„geschätzt". Diese Trennung nicht aufweichen.

Lieber ein Lebensmittel weglassen als falsch zuordnen: Quark, Gummibärchen,
Laugenbrezel fehlen bewusst, weil die USDA kein echtes Gegenstück hat.

## Mengen ohne KI

`zerlege()` versteht „2 Bananen", „200 g Reis", „eine kleine Banane",
„2 EL Olivenöl", „ein Glas Milch". Das Gewicht eines Stücks kommt aus
`stueckGewicht()` (bevorzugt Etiketten, die mit „1 mittel" *anfangen*).

Fallen, die schon einmal zugeschnappt sind:
- Fehlt eine Portionsangabe, darf nie stillschweigend 100 g herauskommen —
  „1 EL Öl" waren so 884 statt 124 kcal.
- „Reis" traf „Reis roh" statt des Alias von „Reis gekocht" (fast 3× kcal).
  Exakte Alias-Treffer ranken deshalb vor allem anderen.

## Konventionen

Wie im Etsy-Projekt: deutsch benennen, Kommentare erklären das Warum,
Kommentare ohne Umlaute, Texte für den Nutzer mit Umlauten.

## Stand / Nächste Schritte

- Daten liegen im localStorage des iPhones. Als Home-Bildschirm-App bleiben
  sie erhalten; im normalen Safari-Tab kann iOS sie nach 7 Tagen löschen.
- KI unterwegs bräuchte einen kleinen Server für den Schlüssel
  (z. B. Cloudflare Worker), GitHub Pages kann das nicht.
- Für andere Nutzer: Konten + Datenbank, Gesundheitsdaten → Datenschutz.
