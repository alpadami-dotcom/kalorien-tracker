"""Erzeugt das App-Symbol: leuchtende Flamme auf lila Marmor.

Flamme, weil Kalorien Energie sind - ein Motiv, das man auf dem
Home-Bildschirm in einem Blick erkennt, ohne Text lesen zu muessen.
Der Marmor stammt aus marmor-hell.jpg (baue_hintergrund.py), damit Symbol
und App aus demselben Material sind.

Neuer Dateiname bei jedem neuen Symbol (hier "icon-flamme-*"): iOS merkt
sich Symbole pro Adresse und zeigt sonst das alte weiter.

Aufruf aus dem Projektordner:  python werkzeuge/baue_symbol.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

WEB = Path(__file__).resolve().parent.parent / "web"
N = 1024  # Mastergroesse; kleinere Symbole werden daraus heruntergerechnet


def bezier(p0, p1, p2, p3, schritte=60):
    t = np.linspace(0, 1, schritte)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3).tolist()


def flamme(skala=1.0, mitte=(0.5, 0.88)):
    """Umriss einer Flamme in 0..1-Koordinaten.

    Die seitliche Zunge links und die geschwungene Spitze machen den
    Unterschied zum Tropfen - ohne sie las sich das Symbol als Wasser.
    """
    teile = [
        ((0.50, 0.88), (0.34, 0.88), (0.21, 0.77), (0.21, 0.61)),  # unten links herum
        ((0.21, 0.61), (0.21, 0.48), (0.25, 0.38), (0.31, 0.28)),  # hinauf zur Zunge
        ((0.31, 0.28), (0.34, 0.37), (0.37, 0.42), (0.42, 0.45)),  # Zunge zurueck zur Kerbe
        ((0.42, 0.45), (0.41, 0.30), (0.48, 0.17), (0.58, 0.05)),  # hinauf zur Spitze
        ((0.58, 0.05), (0.62, 0.20), (0.81, 0.36), (0.80, 0.59)),  # rechte Seite
        ((0.80, 0.59), (0.79, 0.78), (0.65, 0.88), (0.50, 0.88)),  # zurueck nach unten
    ]
    punkte = [p for t in teile for p in bezier(*t)]
    mx, my = mitte
    return [((mx + (x - 0.5) * skala) * N, (my + (y - 0.88) * skala) * N) for x, y in punkte]


def maske(umriss):
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).polygon(umriss, fill=255)
    return m


def verlauf(oben, unten):
    """Senkrechter Farbverlauf ueber das ganze Bild."""
    t = np.linspace(0, 1, N)[:, None, None]
    farbe = np.array(oben) * (1 - t) + np.array(unten) * t
    return Image.fromarray(np.repeat(farbe, N, axis=1).astype(np.uint8))


# Hintergrund: ein Wirbel-Ausschnitt aus dem App-Marmor, zur Mitte hin
# abgedunkelt - die weisse Flamme braucht dunklen Grund, um zu leuchten.
marmor = Image.open(WEB / "marmor-hell.jpg").convert("RGB")
grund = marmor.crop((0, 260, 900, 1160)).resize((N, N), Image.LANCZOS)
y, x = np.mgrid[0:N, 0:N] / N
abstand = np.hypot(x - 0.5, y - 0.52)
dunkel = np.clip(0.18 + abstand * 1.3, 0.18, 0.95)[..., None]  # Mitte dunkler, Rand heller
lila = np.array([46, 16, 82], dtype=float)
grund = Image.fromarray((np.asarray(grund, dtype=float) * dunkel + lila * (1 - dunkel)).astype(np.uint8))

aussen = maske(flamme())
innen = maske(flamme(skala=0.46, mitte=(0.51, 0.84)))

# Glow hinter der Flamme
# Eng und kraeftig statt breit: Ein breiter Glow hellte den ganzen Grund auf
# und die Flamme verschwamm mit ihm.
glow = aussen.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(38))
grund = Image.composite(Image.new("RGB", (N, N), (196, 120, 255)), grund, glow.point(lambda v: int(v * 0.7)))

# Aeussere Flamme: weiss unten, zart lavendel an der Spitze
grund = Image.composite(verlauf((228, 206, 255), (255, 252, 255)), grund, aussen)
# Kern: Pink oben, Violett unten - die "heisse Mitte" gibt Tiefe und Neon-Look
kern_farbe = verlauf((255, 92, 200), (124, 58, 237))
grund = Image.composite(kern_farbe, grund, innen.filter(ImageFilter.GaussianBlur(2)))
# Hauchduenner heller Rand um den Kern, damit er nicht wie ein Loch wirkt
rand = ImageChops.subtract(innen.filter(ImageFilter.MaxFilter(9)), innen)
grund = Image.composite(Image.new("RGB", (N, N), (240, 228, 255)), grund, rand.filter(ImageFilter.GaussianBlur(3)))

for groesse in (512, 192, 180):
    grund.resize((groesse, groesse), Image.LANCZOS).save(WEB / f"icon-flamme-{groesse}.png", optimize=True)
grund.resize((256, 256), Image.LANCZOS).save(Path(__file__).with_name("symbol-vorschau.png"))
print("ok")
