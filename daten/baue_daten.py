"""Baut die Naehrwert-Dateien der App aus dem USDA-Datensatz.

Quelle: USDA FoodData Central, SR Legacy (gemeinfrei). Der Datensatz liegt
als ZIP in daten/roh/ und wird nicht ins Git gelegt - dieses Skript laedt
ihn bei Bedarf selbst.

Erzeugt (in web/daten/, weil die App sie direkt im Browser laedt):
    usda.json          alle ~7800 Lebensmittel, englisch, je 100 g
    lebensmittel.json  die deutsche Liste aus deutsch.txt

Aufruf aus dem Projektordner:  python daten/baue_daten.py
"""

import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ORDNER = Path(__file__).resolve().parent
ZIEL = ORDNER.parent / "web" / "daten"
ZIP = ORDNER / "roh" / "sr_legacy.zip"
ZIP_URL = ("https://fdc.nal.usda.gov/fdc-datasets/"
           "FoodData_Central_sr_legacy_food_csv_2018-04.zip")

# USDA-Naehrstoffnummern. Energie ist 1008 (kcal), nicht 1062 (kJ).
NAEHRSTOFFE = {"1008": "kcal", "1003": "protein", "1004": "fett",
               "1005": "kh", "1079": "ballast", "2000": "zucker"}

# Portionsangaben kommen englisch ("1 medium (7" to 7-7/8" long)"). Nur die
# Kernwoerter am Anfang uebersetzen - der Klammerteil bleibt, weil er die
# eigentliche Groessenangabe traegt und sich nicht sinnvoll kuerzen laesst.
WOERTER = {
    "cup": "Tasse", "cups": "Tassen", "tbsp": "EL", "tsp": "TL",
    "tablespoon": "EL", "tablespoons": "EL", "teaspoon": "TL", "teaspoons": "TL",
    "slice": "Scheibe", "slices": "Scheiben", "piece": "Stück",
    "pieces": "Stücke", "medium": "mittel", "large": "groß",
    "small": "klein", "extra large": "sehr groß", "extra small": "sehr klein",
    "fruit": "Frucht", "serving": "Portion", "breast": "Brust",
    "bottle": "Flasche", "can": "Dose", "fl oz": "fl oz", "oz": "oz",
    "lb": "lb", "stick": "Stück", "link": "Wurst", "patty": "Patty",
    "sandwich": "Stück", "item": "Stück", "egg": "Ei", "whole": "ganz",
    "chopped": "gehackt", "sliced": "geschnitten", "pat": "Stück",
    "leaf": "Blatt", "leaves": "Blätter", "head": "Kopf", "clove": "Zehe",
    "roll": "Stück", "container": "Becher", "package": "Packung",
    "mashed": "zerdrückt", "diced": "gewürfelt", "unit": "Stück",
}


def _hole_zip() -> zipfile.ZipFile:
    """Laedt den Datensatz einmalig herunter (~6 MB)."""
    if not ZIP.exists():
        ZIP.parent.mkdir(parents=True, exist_ok=True)
        print(f"Lade USDA-Datensatz ... ({ZIP_URL})")
        urllib.request.urlretrieve(ZIP_URL, ZIP)
    return zipfile.ZipFile(ZIP)


def _lies(z: zipfile.ZipFile, name: str):
    pfad = next(n for n in z.namelist() if n.endswith("/" + name))
    with z.open(pfad) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))


def _uebersetze(text: str) -> str:
    """Uebersetzt die bekannten Woerter vor der Klammer, Wort fuer Wort.

    Laengere Schluessel zuerst, sonst wird aus "extra large" erst
    "extra groß" und "slices" zu "Scheibes".
    """
    kopf, _, rest = text.partition(" (")
    for en, de in sorted(WOERTER.items(), key=lambda x: -len(x[0])):
        kopf = re.sub(rf"\b{re.escape(en)}\b", de, kopf, flags=re.IGNORECASE)
    return f"{kopf} ({rest}" if rest else kopf


def _zahl(x: float) -> str:
    return f"{x:g}"


def baue_usda(z: zipfile.ZipFile) -> dict:
    """Alle SR-Legacy-Lebensmittel mit Makros je 100 g und Portionen."""
    namen = {r["fdc_id"]: r["description"] for r in _lies(z, "food.csv")}

    werte: dict[str, dict] = {}
    for r in _lies(z, "food_nutrient.csv"):
        schluessel = NAEHRSTOFFE.get(r["nutrient_id"])
        if schluessel and r["fdc_id"] in namen:
            werte.setdefault(r["fdc_id"], {})[schluessel] = float(r["amount"])

    portionen: dict[str, list] = {}
    for r in _lies(z, "food_portion.csv"):
        g = float(r["gram_weight"] or 0)
        if g <= 0:
            continue
        menge = float(r["amount"] or 1)
        text = (r["modifier"] or r["portion_description"] or "").strip()
        etikett = f"{_zahl(menge)} {_uebersetze(text)}".strip()
        portionen.setdefault(r["fdc_id"], []).append([etikett, round(g, 1)])

    daten = {}
    for fdc, name in namen.items():
        w = werte.get(fdc, {})
        # Ohne Energieangabe ist ein Eintrag fuer einen Kalorienzaehler wertlos.
        if "kcal" not in w:
            continue
        daten[fdc] = {
            "name": name,
            "kcal": round(w["kcal"], 1),
            "protein": round(w.get("protein", 0), 1),
            "fett": round(w.get("fett", 0), 1),
            "kh": round(w.get("kh", 0), 1),
            "ballast": round(w.get("ballast", 0), 1),
            "zucker": round(w.get("zucker", 0), 1),
            "portionen": portionen.get(fdc, []),
        }
    return daten


def baue_deutsch(usda: dict) -> list:
    """Ordnet die Zeilen aus deutsch.txt ihren USDA-Eintraegen zu."""
    nach_name = {d["name"]: fdc for fdc, d in usda.items()}
    liste, fehler = [], []

    for zeile in (ORDNER / "deutsch.txt").read_text(encoding="utf-8").splitlines():
        zeile = zeile.strip()
        if not zeile or zeile.startswith("#"):
            continue
        teile = [t.strip() for t in zeile.split("|")]
        deutsch, englisch = teile[0], teile[1]
        aliase = [a.strip() for a in teile[2].split(",")] if len(teile) > 2 else []

        fdc = nach_name.get(englisch)
        if not fdc:
            # Viele USDA-Namen tragen Anhaengsel wie "(Includes foods for
            # USDA's Food Distribution Program)" - ein eindeutiger Anfang reicht.
            treffer = sorted(n for n in nach_name if n.startswith(englisch))
            if len(treffer) >= 1:
                fdc = nach_name[treffer[0]]
                if len(treffer) > 1:
                    print(f"  Hinweis: '{deutsch}' -> mehrdeutig, nehme '{treffer[0]}'")
        if not fdc:
            fehler.append(f"{deutsch}: '{englisch}' nicht gefunden")
            continue
        liste.append({"name": deutsch, "aliase": aliase, "fdc": fdc})

    if fehler:
        print("FEHLER in deutsch.txt:\n  " + "\n  ".join(fehler))
        sys.exit(1)
    return liste


def main():
    z = _hole_zip()
    usda = baue_usda(z)
    deutsch = baue_deutsch(usda)

    ZIEL.mkdir(parents=True, exist_ok=True)
    (ZIEL / "usda.json").write_text(
        json.dumps(usda, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ZIEL / "lebensmittel.json").write_text(
        json.dumps(deutsch, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"usda.json: {len(usda)} Lebensmittel, lebensmittel.json: {len(deutsch)} deutsch")


if __name__ == "__main__":
    main()
