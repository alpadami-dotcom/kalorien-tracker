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
| `web/gewicht.js` | Gewichtsverlauf: Kurve (SVG, ohne Bibliothek), Eintragen, Liste |
| `web/kalender.js` | Kalender (#kalender): Monat, Tagesdetail, eigene Einträge (Training/Termin/Notiz, `kalorien:kalender`), Wochenstreifen + nächster Eintrag in der Kachel |
| `web/sw.js` | Service Worker: offline nutzbar, „Netz zuerst" damit Updates ankommen |
| `web/daten/*.json` | Nährwerte, erzeugt von `daten/baue_daten.py` — nicht von Hand ändern |
| `daten/deutsch.txt` | ~160 deutsche Namen → USDA-Eintrag, von Hand gepflegt |
| `server.py`, `ki.py` | nur zu Hause: Foto/Freitext über Claude, braucht `.env` mit Schlüssel |

Veröffentlichen: `veroeffentlichen.bat` schiebt `web/` auf den Zweig
`gh-pages`, GitHub Pages liefert ihn aus. Kein Actions-Workflow, weil der
gh-Login keine `workflow`-Berechtigung hat und das Hochladen sonst scheitert.

**Ansichten:** Beim Öffnen die Übersicht mit Kacheln (Kalorien, Wasser,
Gewicht, Kalender); jede Kachel öffnet eine Unterseite. Gewählt wird über
die Adresse (`#essen`, `#wasser`, `#gewicht`, `#kalender`, leer = Übersicht)
in `zeigeAnsicht()` — kein eigener Router. Plus-Knöpfe auf Kacheln liegen
*neben* dem Link, nie darin. Nach >10 Min. im Hintergrund zurück zur Übersicht.

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

## Profil, Wasser, Mahlzeiten

- Kalorienbedarf nach Mifflin-St Jeor × Aktivitätsfaktor ± Ziel. Die
  Empfehlung geht **nie unter den Grundumsatz**; unter 18 zeigt die App
  einen Hinweis. Diese Untergrenze nicht entfernen.
- Wasser: `kalorien:wasser` je Tag in ml, ein Glas = 250 ml.
- Kalender-Einträge dürfen in der Zukunft liegen (planen), Essen nicht.
- Gewicht: `kalorien:gewicht` je Tag in kg. Linie = 7-Tage-Schnitt (nach
  Zeit, nicht Anzahl), Punkte = Messungen. Der neueste Wert wird ins Profil
  übernommen, damit der Kalorienrechner aktuell bleibt. Kurvenfarben sind
  mit dem dataviz-Validator geprüft — beim Ändern neu prüfen.
- Jeder Eintrag hat `mahlzeit` (fruehstueck/mittag/abend/snack); alte
  Einträge ohne das Feld werden über ihre Uhrzeit einsortiert.
- Speichern beim **Antippen** der Knöpfe, nicht im `close`-Ereignis des
  Dialogs — das kommt im Hintergrund verzögert, Einträge gingen verloren.

## iPhone-Fallen

- Die Zahlentastatur (`inputmode="decimal"`) hat **keinen Fertig-Knopf** und
  legt sich über unten verankerte Blätter. `--tastatur` (aus visualViewport)
  hebt die Blätter an; Tippen auf eine leere Stelle schließt die Tastatur.
  Gewicht konnte deshalb nicht gespeichert werden.
- Datumsfelder sind auf iOS breiter als ihr Platz → nie neben ein anderes
  Feld setzen, `appearance: none`.
- In `<form method="dialog">` ist der **erste** Submit-Knopf der Standard für
  Enter — „Abbrechen" daher `type="button"`.
- Zoom ist gesperrt (viewport-Meta + gesture-Ereignisse in app.js), weil
  iOS `user-scalable=no` allein ignoriert. Eingabefelder brauchen ≥ 16 px
  Schrift, sonst zoomt Safari beim Antippen trotzdem.

## Konventionen

Wie im Etsy-Projekt: deutsch benennen, Kommentare erklären das Warum,
Kommentare ohne Umlaute, Texte für den Nutzer mit Umlauten.

## Stand / Nächste Schritte

- Daten liegen im localStorage des iPhones. Als Home-Bildschirm-App bleiben
  sie erhalten; im normalen Safari-Tab kann iOS sie nach 7 Tagen löschen.
- KI unterwegs bräuchte einen kleinen Server für den Schlüssel
  (z. B. Cloudflare Worker), GitHub Pages kann das nicht.
- Für andere Nutzer: Konten + Datenbank, Gesundheitsdaten → Datenschutz.
