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
| `web/mahlzeit.js` | Mahlzeit-Seite (#mahlzeit-fruehstueck …): eintragen + Gedächtnis „Letztes Mal“ / „Oft gegessen“ aus `kalorien:tage` |
| `web/gewicht.js` | Gewichtsverlauf: Kurve (SVG, ohne Bibliothek), Eintragen, Liste |
| `web/kalender.js` | Kalender (#kalender): Monat, Tagesdetail, eigene Einträge (Training/Termin/Notiz, `kalorien:kalender`), Wochenstreifen + nächster Eintrag in der Kachel |
| `web/schritte.js` | Schritte (#schritte): Ring bis zum Ziel, per Kurzbefehl → Zwischenablage → „Einfügen“ oder von Hand; `kalorien:schritte` |
| `web/woche.js` | Wochenübersicht (#woche): Säulen je Tag + Ziel-Linie, Kennzahlen, Tagesliste; Woche-Kachel mit Mini-Balken |
| `web/sicherung.js` | Datensicherung: alle `kalorien:*`-Werte als JSON (Teilen-Menü → iCloud), Wiederherstellen mit Vorschau + Rückgängig, Erinnerung nach 14 Tagen |
| `web/sw.js` | Service Worker: offline nutzbar, „Netz zuerst" damit Updates ankommen |
| `web/daten/*.json` | Nährwerte, erzeugt von `daten/baue_daten.py` — nicht von Hand ändern |
| `daten/deutsch.txt` | ~160 deutsche Namen → USDA-Eintrag, von Hand gepflegt |
| `werkzeuge/baue_hintergrund.py` | rechnet den lila Marmor-Hintergrund (hell + dunkel) nach `web/` |
| `werkzeuge/baue_symbol.py` | App-Symbol: Flamme auf Marmor; neues Symbol = neuer Dateiname (iOS cacht pro Adresse) |
| `server.py`, `ki.py` | nur zu Hause: Foto/Freitext über Claude, braucht `.env` mit Schlüssel |

Veröffentlichen: `veroeffentlichen.bat` schiebt `web/` auf den Zweig
`gh-pages`, GitHub Pages liefert ihn aus. Kein Actions-Workflow, weil der
gh-Login keine `workflow`-Berechtigung hat und das Hochladen sonst scheitert.

**Ansichten:** Beim Öffnen die Übersicht mit Kacheln (Kalorien, Wasser,
Gewicht, Kalender, Woche); jede Kachel öffnet eine Unterseite. Gewählt wird über
die Adresse (`#essen`, `#mahlzeit-<schlüssel>`, `#wasser`, `#gewicht`, `#kalender`, `#woche`, leer = Übersicht)
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

Tippfehler: Findet die deutsche Liste nichts, sucht `suche()` unscharf
(Damerau-Levenshtein, auch gegen Wortanfänge, 1 Fehler ab 4, 2 ab 6
Buchstaben). Solche Treffer tragen `aehnlich` und zeigen „Meintest du …“.
Nur als Rückfall — sonst mischen sich bei richtigen Wörtern ähnliche
darunter („eier“ → „Bier“).

Fallen, die schon einmal zugeschnappt sind:
- Datumsrechnung über Millisekunden: Wegen der Zeitumstellung hat ein Tag
  im Jahr 23 Stunden — Tagesdifferenzen immer runden (KW war um 1 falsch).
- Fehlt eine Portionsangabe, darf nie stillschweigend 100 g herauskommen —
  „1 EL Öl" waren so 884 statt 124 kcal.
- „Reis" traf „Reis roh" statt des Alias von „Reis gekocht" (fast 3× kcal).
  Exakte Alias-Treffer ranken deshalb vor allem anderen.

## Eintragen und Gedächtnis

Eingetragen wird nur auf der Seite einer Mahlzeit — die Essen-Seite zeigt
den Tag, ein Tipp auf die Mahlzeit-Karte öffnet sie. Dort ist die Mahlzeit
im Prüfen-Dialog vorausgewählt (`aktuelleMahlzeit`), egal welche Uhrzeit.
Das Gedächtnis hat **keinen eigenen Speicher**: Es zählt in `kalorien:tage`,
an wie vielen Tagen (nicht wie oft) etwas zu dieser Mahlzeit gegessen wurde
(ab 2 Tagen = „oft“) und schlägt die zuletzt gegessene Menge vor. Eigene
Lebensmittel anlegen wollte der Nutzer ausdrücklich noch nicht.
Reihenfolge auf der Mahlzeit-Seite: ⭐ Favoriten (selbst per Stern,
`kalorien:favoriten`, mit Menge) → Letztes Mal (diese Mahlzeit) →
Zuletzt gegessen (alle Mahlzeiten) → Oft. Was weiter oben steht, wird
weiter unten nicht wiederholt.

## Schritte

Web-Apps dürfen Health nicht lesen. Umweg (vom Nutzer so gewählt): Der
iPhone-Kurzbefehl **„Schritte kopieren“** (Name muss exakt stimmen; bei ihm
heißt die Aktion „Health-Messungen suchen“) summiert die Schritte von heute
und kopiert sie. „Holen“ startet ihn über `shortcuts://run-shortcut`, zurück
über „◀ Kalorien“, dann „Einfügen“ — die Zwischenablage gibt iOS erst nach
einem Tipp frei. Der Nutzer will **nur Schritte**, keine kcal (Bewegen-Ring
gab es kurz, wieder entfernt; er hat keine Apple Watch). Ring mit
Lila-Pink-Verlauf, voll bei 10.000; geschafft = gleiche Farbe, aber Leuchten,
🏆 und einmalige Feier beim Überschreiten — **nicht die Farbe wechseln**,
so gewünscht.

## Profil, Wasser, Mahlzeiten

- Kalorienbedarf nach Mifflin-St Jeor × Aktivitätsfaktor ± Ziel. Die
  Empfehlung geht **nie unter den Grundumsatz**; unter 18 zeigt die App
  einen Hinweis. Diese Untergrenze nicht entfernen.
- Wasser: `kalorien:wasser` je Tag in ml, ein Glas = 250 ml.
- Kalender-Einträge dürfen in der Zukunft liegen (planen), Essen nicht.
  Wiederholungen (Woche/Monat/Jahr; Geburtstag = automatisch jährlich)
  liegen **einmal** am Ursprungstag; `eintraegeAm()` rechnet die Termine aus.
  Ändern/Löschen gilt für die ganze Reihe. 31. und 29.2. rutschen auf den
  letzten Tag des Monats.
- Makro-Ziele: automatisch 1,8 g Protein/kg, 30 % kcal aus Fett, Rest KH;
  gespeichert (`kalorien:makroziele`) wird nur, was davon abweicht.
  „Geschafft" = Protein ≥ 90 %, KH und Fett ≤ 110 % (`makroGeschafft()`),
  im Kalender als grüne Fläche.
- Wischen (Übersicht = Tag, Kalender = Monat): **Finger nach rechts =
  zurück**, nach links = vor, wie bei Fotos. Erst andersherum gebaut, der
  Nutzer wollte es so — nicht wieder umdrehen.
- Gewicht: `kalorien:gewicht` je Tag in kg. Eintragen nur für heute und
  die 3 Tage davor (Knöpfe statt Datumsfeld, so gewünscht); ältere Werte
  nur über „Alle Einträge“, dann kommt ihr Tag als Knopf dazu. Linie = 7-Tage-Schnitt (nach
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

## Design

Lila Marmor (Vorbild: Foto von flüssigem Marmor). Hintergrund über
`body::before` (iOS kann kein `background-attachment: fixed`), Karten als
Milchglas (`--karte` halbtransparent + `backdrop-filter`), Dialoge deckend
(`--blatt`). Auf Unterseiten liegt ein Schleier (`--schleier`) über dem
Marmor, sonst wäre Text direkt auf dem Bild unlesbar.

## Datenverlust – was wir wissen

Am 2026-10-20 war ein Kalendereintrag weg, auch in Safari nicht zu finden.
Wahrscheinlichste Ursache: Das App-Symbol wurde (fürs neue Icon) gelöscht
und neu hinzugefügt — iOS löscht dabei vermutlich den Speicher der alten
Home-Bildschirm-App. **Vor jedem Symbol-Wechsel den Nutzer erst sichern
lassen** und nie wieder behaupten, die Daten blieben erhalten.

## Konventionen

Wie im Etsy-Projekt: deutsch benennen, Kommentare erklären das Warum,
Kommentare ohne Umlaute, Texte für den Nutzer mit Umlauten.

## Stand / Nächste Schritte

- Daten liegen im localStorage des iPhones. Als Home-Bildschirm-App bleiben
  sie erhalten; im normalen Safari-Tab kann iOS sie nach 7 Tagen löschen.
  Deshalb die Datensicherung — neue Speicher-Schlüssel immer mit Präfix
  `kalorien:`, sonst fehlen sie in der Sicherung.
- KI unterwegs bräuchte einen kleinen Server für den Schlüssel
  (z. B. Cloudflare Worker), GitHub Pages kann das nicht.
- Für andere Nutzer: Konten + Datenbank, Gesundheitsdaten → Datenschutz.
