"""Baut web/daten/gerichte.json: Gerichte und Klassiker, die der USDA fehlen.

Warum: Doener, Currywurst, Quark, Gummibaerchen, Laugenbrezel ... gab es
nicht - die USDA kennt deutsche Imbiss- und Supermarktkost kaum, und der
Nutzer stand beim Eintragen oft mit leeren Haenden da.

Woher die Werte kommen, je Eintrag:
- "OFF": Median ueber viele Produkte aus Open Food Facts (Suchbegriff unten).
  Nur fuer Dinge, die es dort sauber als verpackte Ware gibt; der Median
  haelt einzelne Ausreisser (Light-Variante, Tippfehler in der Datenbank) raus.
- sonst der Richtwert in der Tabelle: uebliche Durchschnittswerte aus
  Naehrwerttabellen fuer frisch Zubereitetes (Doener im Brot, Schnitzel),
  das es nicht verpackt gibt. In der App als "Ø-Wert" gekennzeichnet.
Ein OFF-Median wird nur genommen, wenn er auf mindestens 8 Produkten beruht
und hoechstens 30 % vom Richtwert abweicht - sonst traf die Suche vermutlich
etwas anderes (bei "Laugenbrezel" z. B. trockene Knabberbrezeln).

Aufruf aus dem Projektordner:  python daten/baue_gerichte.py   (~2 Minuten)
"""

import json
import statistics
import time
import urllib.parse
import urllib.request
from pathlib import Path

ZIEL = Path(__file__).resolve().parent.parent / "web" / "daten" / "gerichte.json"
AGENT = "KalorienTracker/0.1 (privates Projekt)"

# Name | Suchwoerter | kcal, Protein, KH, Fett je 100 g | Portion (Etikett, g) | OFF-Suche oder None
GERICHTE = [
    # --- Imbiss ---
    ("Döner Kebab", "Döner, Doener, Kebab", (215, 11, 20, 10), ("1 Döner", 400), None),
    ("Dürüm Döner", "Dürüm, Yufka, Durum", (210, 11, 21, 9), ("1 Dürüm", 400), None),
    ("Döner-Box mit Pommes", "Dönerbox, Döner Box", (230, 9, 20, 12), ("1 Box", 450), None),
    ("Dönerfleisch", "Kebabfleisch, Gyrosfleisch", (240, 12, 4, 13), ("1 Portion", 150), "Dönerfleisch"),
    ("Lahmacun", "türkische Pizza", (220, 9, 30, 7), ("1 Stück", 200), None),
    # Kuehlregal-Falafel (~230 kcal) sind ungebraten - gemeint ist die vom Imbiss.
    ("Falafel (frittiert)", "Falafel, Falafelbällchen", (333, 13, 32, 18), ("1 Bällchen", 17), None),
    ("Falafel im Brot", "Falafel Dürüm, Falafel Wrap", (200, 6, 26, 8), ("1 Stück", 350), None),
    ("Currywurst", "Curry Wurst", (250, 10, 8, 20), ("1 Portion", 200), None),
    ("Currywurst mit Pommes", "Currywurst Pommes", (240, 7, 22, 14), ("1 Portion", 400), None),
    ("Bratwurst im Brötchen", "Rostbratwurst Brötchen, Bratwurstbrötchen", (280, 11, 22, 16), ("1 Stück", 150), None),
    ("Pommes rot-weiß", "Pommes mit Ketchup und Mayo, Pommes Schranke", (260, 3, 30, 14), ("1 Portion", 250), None),
    ("Schnitzel paniert", "Wiener Schnitzel, Schweineschnitzel, Schnitzel", (230, 22, 9, 12), ("1 Schnitzel", 180), None),
    ("Leberkäse", "Leberkäs, Fleischkäse", (300, 12, 1, 28), ("1 Scheibe", 100), "Leberkäse"),
    ("Leberkässemmel", "Leberkäsebrötchen, Fleischkäsebrötchen", (280, 11, 20, 17), ("1 Stück", 180), None),
    ("Frikadelle", "Bulette, Fleischpflanzerl, Hackbällchen", (250, 15, 8, 17), ("1 Stück", 80), "Frikadellen"),
    ("Gyros", "Gyros Fleisch", (210, 20, 2, 14), ("1 Portion", 200), None),
    ("Gyros mit Pommes", "Gyrosteller, Gyros Teller", (200, 10, 15, 11), ("1 Teller", 500), None),
    ("Pizza Margherita (Restaurant)", "Pizza Restaurant, Pizzeria", (250, 10, 31, 9), ("1 Pizza", 400), None),
    ("Pizza Salami (Restaurant)", "Salamipizza Restaurant", (270, 11, 29, 12), ("1 Pizza", 420), None),
    ("Big Mac", "McDonalds Burger", (251, 12, 20, 13), ("1 Burger", 219), None),
    ("Chicken Nuggets", "Nuggets, Hähnchen Nuggets", (270, 15, 17, 16), ("6 Stück", 100), "Chicken Nuggets"),
    ("Burger (Restaurant)", "Rindfleischburger, Smash Burger", (250, 13, 20, 13), ("1 Burger", 250), None),
    ("Hotdog", "Hot Dog", (260, 10, 24, 14), ("1 Stück", 120), None),
    ("Sushi", "Maki, Nigiri, Sushi gemischt", (150, 6, 28, 2), ("1 Stück", 30), None),
    ("Wrap mit Hähnchen", "Chicken Wrap, Hähnchenwrap", (190, 12, 20, 7), ("1 Wrap", 250), None),
    ("Frühlingsrolle", "Frühlingsrollen", (230, 5, 25, 12), ("1 Stück", 60), "Frühlingsrollen"),
    ("Gebratene Nudeln", "Asia Nudeln, Mie Nudeln gebraten", (160, 5, 22, 6), ("1 Portion", 350), None),
    ("Gebratener Reis", "Asia Reis, Nasi Goreng", (165, 5, 25, 5), ("1 Portion", 350), None),
    # --- Gerichte ---
    ("Spaghetti Bolognese", "Bolognese, Nudeln mit Hackfleischsoße", (140, 6, 18, 5), ("1 Teller", 400), None),
    ("Lasagne", "Lasagna", (150, 8, 13, 7), ("1 Portion", 350), "Lasagne"),
    ("Käsespätzle", "Kässpätzle, Spätzle mit Käse", (210, 9, 22, 10), ("1 Portion", 350), None),
    ("Spätzle gekocht", "Spätzle", (150, 5.5, 27, 2.5), ("1 Portion", 200), None),
    ("Kartoffelsalat (Mayo)", "Kartoffelsalat", (150, 2, 13, 10), ("1 Portion", 200), "Kartoffelsalat"),
    ("Kartoffelsalat (Essig & Öl)", "Kartoffelsalat schwäbisch", (100, 2, 14, 4), ("1 Portion", 200), None),
    ("Bratkartoffeln", "Röstkartoffeln", (150, 3, 20, 7), ("1 Portion", 250), None),
    ("Kartoffelpüree", "Kartoffelbrei, Stampf", (90, 2, 13, 3), ("1 Portion", 200), None),
    ("Gulasch", "Rindergulasch", (120, 14, 4, 5), ("1 Portion", 300), None),
    ("Chili con Carne", "Chili", (110, 8, 9, 4.5), ("1 Teller", 400), None),
    ("Schweinebraten", "Krustenbraten", (200, 26, 0, 11), ("1 Portion", 200), None),
    ("Kaiserschmarrn", "Kaiserschmarren", (230, 7, 30, 9), ("1 Portion", 300), None),
    ("Milchreis", "Milchreis mit Zimt", (110, 3.5, 19, 2.5), ("1 Schüssel", 250), "Milchreis"),
    ("Kartoffelsuppe", "Kartoffeleintopf", (70, 2, 8, 3), ("1 Teller", 350), None),
    ("Tomatensuppe", "Tomatencremesuppe", (50, 1, 7, 2), ("1 Teller", 300), None),
    ("Linsensuppe", "Linseneintopf", (90, 5, 10, 3), ("1 Teller", 350), None),
    ("Fischstäbchen", "Fischstäbchen", (190, 13, 16, 8), ("1 Stück", 30), "Fischstäbchen"),
    ("Salat mit Dressing", "gemischter Salat, Beilagensalat", (70, 1.5, 4, 5), ("1 Schüssel", 250), None),
    # --- Bäcker ---
    ("Laugenbrezel", "Brezel, Breze, Brezn", (270, 9, 54, 2), ("1 Brezel", 80), None),
    ("Laugenbrötchen", "Laugensemmel, Laugenstange", (270, 9, 53, 2.5), ("1 Stück", 70), None),
    ("Butterbrezel", "Butterbreze", (330, 8, 45, 13), ("1 Stück", 100), None),
    ("Berliner", "Krapfen, Pfannkuchen (Gebäck)", (370, 6, 48, 17), ("1 Stück", 80), None),
    ("Franzbrötchen", "Zimtschnecke", (380, 6, 50, 17), ("1 Stück", 90), None),
    ("Apfelstrudel", "Strudel", (220, 3, 30, 10), ("1 Stück", 150), None),
    ("Käsekuchen", "Quarkkuchen, Cheesecake", (230, 7, 25, 11), ("1 Stück", 130), None),
    ("Apfelkuchen", "gedeckter Apfelkuchen", (250, 3, 35, 11), ("1 Stück", 120), "Apfelkuchen"),
    ("Bananenbrot", "Banana Bread", (300, 5, 45, 11), ("1 Scheibe", 70), "Bananenbrot"),
    ("Zwiebelkuchen", "", (230, 7, 20, 14), ("1 Stück", 200), "Zwiebelkuchen"),
    ("Schokocroissant", "Pain au Chocolat, Schokoladencroissant", (420, 7, 45, 23), ("1 Stück", 75), None),
    ("Belegtes Brötchen (Käse)", "Käsebrötchen, Käsesemmel", (260, 11, 30, 10), ("1 Stück", 120), None),
    # --- Milchprodukte ---
    ("Magerquark", "Quark", (67, 12, 4, 0.3), ("1 Becher", 250), "Magerquark"),
    ("Speisequark 20 %", "Quark 20%", (109, 12.5, 3, 5), ("1 Becher", 250), "Speisequark 20%"),
    ("Speisequark 40 %", "Quark 40%, Sahnequark", (160, 11, 3, 11.5), ("1 Becher", 250), "Speisequark 40%"),
    ("Proteinpudding", "High Protein Pudding", (75, 10, 6, 1.5), ("1 Becher", 200), "Protein Pudding"),
    ("Schokopudding", "Pudding, Schokoladenpudding", (110, 3.2, 17, 3), ("1 Becher", 125), "Schokopudding"),
    ("Fruchtjoghurt", "Joghurt mit Frucht, Erdbeerjoghurt", (100, 3.5, 15, 2.8), ("1 Becher", 150), "Fruchtjoghurt"),
    ("Buttermilch", "Buttermilch", (37, 3.4, 4, 0.5), ("1 Glas", 200), "Buttermilch"),
    ("Kakao", "Schokomilch, Kakaomilch", (80, 3.3, 11, 2.5), ("1 Glas", 250), "Kakao Milchgetränk"),
    ("Cappuccino", "Kaffee mit Milch", (40, 2.2, 3.2, 2), ("1 Tasse", 200), None),
    ("Latte Macchiato", "Milchkaffee, Latte", (50, 2.8, 4, 2.6), ("1 Glas", 300), None),
    ("Tzatziki", "Zaziki", (160, 4, 4, 14), ("1 Portion", 50), "Tzatziki"),
    ("Hafermilch", "Haferdrink, Oatly", (46, 1, 6.6, 1.5), ("1 Glas", 200), "Haferdrink"),
    ("Mascarpone", "Mascarpone", (435, 4.6, 3.5, 44), ("1 EL", 15), "Mascarpone"),
    ("Halloumi", "Grillkäse", (320, 22, 2, 25), ("1 Portion", 100), "Halloumi"),
    ("Gnocchi", "Kartoffelgnocchi", (150, 3.5, 33, 0.3), ("1 Portion", 200), "Gnocchi"),
    ("Proteinshake mit Milch", "Shake, Whey Shake", (94, 10, 5, 3.5), ("1 Shake", 330), None),
    # --- Süßes und Snacks ---
    ("Gummibärchen", "Gummibären, Fruchtgummi, Haribo", (343, 6.9, 77, 0.5), ("1 Handvoll", 30), "Gummibärchen"),
    ("Erdnussflips", "Flips", (520, 13, 50, 30), ("1 Handvoll", 30), "Erdnussflips"),
    ("Müsliriegel", "Müsli Riegel, Haferriegel", (400, 6, 65, 12), ("1 Riegel", 25), "Müsliriegel"),
    ("Proteinriegel", "Protein Riegel, Eiweißriegel", (360, 32, 33, 11), ("1 Riegel", 55), "Proteinriegel"),
    ("Schokoriegel", "Snickers, Mars, Twix", (480, 8.6, 60, 23), ("1 Riegel", 50), None),
    ("Butterkeks", "Leibniz Keks", (440, 8, 72, 12), ("1 Keks", 8), "Butterkeks"),
    ("Studentenfutter", "Nussmischung mit Rosinen", (480, 13, 37, 30), ("1 Handvoll", 30), "Studentenfutter"),
    # Ohne OFF: Dort dominieren Schoko-Reiswaffeln (~490 kcal) den Median.
    ("Reiswaffel", "Reiswaffeln", (387, 8, 81, 3), ("1 Stück", 8), None),
    ("Cornflakes", "Corn Flakes", (375, 7, 84, 0.9), ("1 Portion", 40), "Cornflakes"),
    ("Müsli", "Früchtemüsli, Müsli ungesüßt", (360, 10, 60, 7), ("1 Portion", 60), None),
    ("Porridge mit Milch", "Haferbrei, Porridge", (100, 4, 13, 3), ("1 Schüssel", 300), None),
    # --- Getränke ---
    ("Energy Drink", "Red Bull, Monster", (46, 0, 11, 0), ("1 Dose", 250), "Energy Drink"),
    ("Eistee", "Ice Tea, Pfirsich Eistee", (30, 0, 7, 0), ("1 Glas", 250), "Eistee"),
    ("Apfelschorle", "Apfelsaftschorle, Schorle", (24, 0, 5.5, 0), ("1 Glas", 300), "Apfelschorle"),
    ("Cola Zero", "Coke Zero, Cola light", (0.3, 0, 0, 0), ("1 Dose", 330), None),
    ("Radler", "Alster, Bier mit Limo", (40, 0.3, 9, 0), ("1 Flasche", 500), None),
    ("Weizenbier", "Hefeweizen, Weißbier", (45, 0.5, 3.5, 0), ("1 Glas", 500), None),
    ("Spezi", "Cola-Mix, Mezzo Mix", (40, 0, 10, 0), ("1 Glas", 330), None),
    ("Smoothie", "Fruchtsmoothie", (55, 0.7, 12, 0.3), ("1 Flasche", 250), "Smoothie"),
]


def off_median(suche):
    """Median der Naehrwerte je 100 g ueber alle brauchbaren Treffer."""
    url = "https://search.openfoodfacts.org/search?" + urllib.parse.urlencode(
        {"q": suche, "langs": "de", "page_size": 60, "fields": "nutriments"})
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENT}), timeout=40) as r:
        treffer = json.load(r).get("hits", [])
    werte = []
    for t in treffer:
        n = t.get("nutriments") or {}
        k = n.get("energy-kcal_100g")
        felder = [n.get(x) for x in ("proteins_100g", "carbohydrates_100g", "fat_100g")]
        if isinstance(k, (int, float)) and 0 < k < 900 and all(isinstance(f, (int, float)) and f >= 0 for f in felder):
            werte.append((k, *felder))
    if not werte:
        return None, 0
    return [round(statistics.median(w[i] for w in werte), 1) for i in range(4)], len(werte)


def main():
    liste = []
    print(f"{'Gericht':32} {'Richtwert':>9} {'OFF':>9}  n  Quelle")
    for name, aliase, (kcal, p, kh, f), (etikett, gramm), suche in GERICHTE:
        quelle, werte = "Ø-Wert", (kcal, p, kh, f)
        off, n = (None, 0)
        if suche:
            try:
                off, n = off_median(suche)
            except Exception as e:  # Netz weg: Richtwert reicht
                print(f"  {name}: OFF nicht erreichbar ({e})")
            time.sleep(1.2)  # Open Food Facts bittet um Zurueckhaltung
            if off and n >= 8 and abs(off[0] - kcal) <= 0.3 * max(kcal, 1):
                quelle, werte = f"Ø aus {n} Produkten", tuple(off)
        print(f"{name:32} {kcal:9} {off[0] if off else '-':>9} {n:3}  {quelle}")
        liste.append({
            "name": name,
            "aliase": [a.strip() for a in aliase.split(",") if a.strip()],
            "kcal": werte[0], "protein": werte[1], "kh": werte[2], "fett": werte[3],
            "portionen": [[f"{etikett}", gramm]],
            "quelle": quelle,
        })
    ZIEL.write_text(json.dumps(liste, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(liste)} Gerichte -> {ZIEL}")


if __name__ == "__main__":
    main()
