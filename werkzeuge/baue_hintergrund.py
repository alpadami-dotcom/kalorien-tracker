"""Erzeugt den lila Marmor-Hintergrund der App (hell + dunkel).

Vorbild war ein Foto von fluessigem Marmor in Lila/Weiss. Das Foto selbst
war mit ~250 px zu klein - am iPhone (3-fache Pixeldichte) waere es matschig.
Deshalb rechnet dieses Skript ein eigenes Bild im selben Stil:
Zufallsrauschen, ein paar Wirbel und Sinus-Schlieren darueber.

Aufruf aus dem Projektordner:  python werkzeuge/baue_hintergrund.py
Braucht numpy und Pillow.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ZIEL = Path(__file__).resolve().parent.parent / "web"
B, H = 900, 1950  # Hochformat; per CSS "cover" auf jedes Handy gezogen
rng = np.random.default_rng(7)  # fester Startwert: jedes Mal dasselbe Bild


def rauschen(zellen):
    """Glattes Zufallsfeld: grobes Raster, bikubisch hochgezogen."""
    klein = rng.random((zellen, max(2, int(zellen * B / H)))) * 255
    return np.asarray(Image.fromarray(klein.astype(np.uint8)).resize((B, H), Image.BICUBIC), dtype=float) / 255


fbm = sum(rauschen(z) * a for z, a in [(6, 1.0), (12, .5), (24, .25), (48, .12)]) / 1.87
fbm2 = sum(rauschen(z) * a for z, a in [(5, 1.0), (10, .5), (20, .25)]) / 1.75

y, x = np.mgrid[0:H, 0:B].astype(float)
# Wirbel: um einige Mittelpunkte wird das Muster verdreht - das macht die Schlieren.
for cx, cy, staerke, radius in [(0.25, 0.22, 3.2, 0.32), (0.8, 0.55, -3.6, 0.36), (0.3, 0.85, 2.8, 0.3)]:
    cx, cy, radius = cx * B, cy * H, radius * B * 1.6
    dx, dy = x - cx, y - cy
    w = staerke * np.exp(-(np.hypot(dx, dy) / radius) ** 2)
    c, s = np.cos(w), np.sin(w)
    x, y = cx + dx * c - dy * s, cy + dx * s + dy * c

# Grobe Baender plus feine Linien - die feinen geben den "fluessigen" Eindruck.
welle = np.sin((x * 0.006 + y * 0.0035) * 2.6 + fbm * 7.0 + fbm2 * 3.0)
feine = np.sin((x * 0.006 + y * 0.0035) * 9.0 + fbm * 16.0)
t = np.clip((0.72 * (welle + 1) / 2 + 0.28 * (feine + 1) / 2) ** 1.35, 0, 1)

# Farben aus dem Vorbild abgegriffen: tiefes Lila -> Violett -> Lavendel -> Weiss
STUFEN = [(0.0, (52, 20, 84)), (0.3, (88, 46, 132)), (0.55, (128, 86, 172)),
          (0.75, (190, 172, 216)), (0.9, (226, 218, 236)), (1.0, (246, 242, 250))]
pos = np.array([p for p, _ in STUFEN])
farben = np.array([c for _, c in STUFEN], dtype=float)
bild = np.stack([np.interp(t, pos, farben[:, k]) for k in range(3)], axis=-1)


def speichere(daten, name):
    img = Image.fromarray(np.clip(daten, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    img.save(ZIEL / name, quality=82, optimize=True, progressive=True)
    print(f"{name}: {(ZIEL / name).stat().st_size // 1024} KB")


speichere(bild, "marmor-hell.jpg")
# Dunkelmodus: dasselbe Muster, stark abgedunkelt - sonst blendet es nachts.
speichere(bild * 0.42, "marmor-dunkel.jpg")
