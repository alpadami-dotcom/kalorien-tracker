"""Kleiner Webserver fuer zu Hause: liefert die App aus und fragt Claude.

Suche und Barcode laufen inzwischen im Browser; die App laeuft deshalb auch
ohne diesen Server auf GitHub Pages. Gebraucht wird er nur fuer Foto- und
Freitext-Erkennung, weil der API-Schluessel nicht ins Netz darf.

Start:  python server.py   (oder starten.bat doppelklicken)
Dann am iPhone im selben WLAN die angezeigte Adresse in Safari oeffnen.

Der Server haelt den API-Schluessel. Er darf nie in den Browser, sonst
koennte ihn jeder auslesen, der die Seite oeffnet.
"""

import base64
import json
import os
import socket
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ORDNER = Path(__file__).resolve().parent
PORT = 8000
MAX_UPLOAD = 15 * 1024 * 1024  # ein iPhone-Foto in voller Groesse passt rein


def _lade_env():
    """KEY=wert aus .env in die Umgebung - ohne Zusatzpaket."""
    # Der Windows-Editor speichert gern als ".env.txt" (Endung versteckt)
    # und manchmal mit BOM - beides soll trotzdem funktionieren.
    pfad = next((p for p in (ORDNER / ".env", ORDNER / ".env.txt") if p.exists()), None)
    if pfad is None:
        return
    for zeile in pfad.read_text(encoding="utf-8-sig").splitlines():
        zeile = zeile.strip()
        if zeile and not zeile.startswith("#") and "=" in zeile:
            k, v = zeile.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


_lade_env()

import ki  # noqa: E402  - erst nach .env, sonst fehlt der Schluessel


def _bild_aus_data_url(data_url: str) -> tuple[bytes, str]:
    kopf, _, daten = data_url.partition(",")
    mime = kopf.removeprefix("data:").split(";")[0] or "image/jpeg"
    return base64.b64decode(daten), mime


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ORDNER / "web"), **kwargs)

    def end_headers(self):
        # Die App aendert sich gerade staendig - Safari soll nichts Altes zeigen.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, daten, status=200):
        body = json.dumps(daten, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _koerper(self) -> dict:
        laenge = int(self.headers.get("Content-Length", 0))
        if laenge > MAX_UPLOAD:
            raise ValueError("Datei zu groß")
        return json.loads(self.rfile.read(laenge) or b"{}")

    def do_GET(self):
        url = urlparse(self.path)

        if url.path == "/api/status":
            # Schluessel nachladen, falls .env erst nach dem Start angelegt
            # wurde - sonst muesste man dafuer extra den Server neu starten.
            if not ki.verfuegbar():
                _lade_env()
            return self._json({"ki": ki.verfuegbar()})
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if not ki.verfuegbar():
            _lade_env()
        try:
            daten = self._koerper()

            if url.path == "/api/text":
                return self._json(ki.verstehe_text(daten.get("text", "")))

            if url.path == "/api/foto":
                bild, mime = _bild_aus_data_url(daten["bild"])
                return self._json(ki.erkenne_foto(bild, mime, daten.get("hinweis", "")))

            self._json({"fehler": "Unbekannte Adresse."}, 404)
        except ki.KIFehler as e:
            self._json({"fehler": str(e)}, 503)
        except Exception as e:
            traceback.print_exc()
            self._json({"fehler": f"Serverfehler: {e}"}, 500)

    def log_message(self, fmt, *args):
        # Nur API-Aufrufe protokollieren, nicht jede CSS-Datei.
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def _lan_adresse() -> str:
    """Die Adresse, unter der das iPhone den PC im WLAN erreicht."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("192.168.0.1", 1))  # sendet nichts, waehlt nur die Netzwerkkarte
            return s.getsockname()[0]
        except OSError:
            return "localhost"


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Kalorien-Tracker läuft.")
    print(f"  Am PC:      http://localhost:{PORT}")
    print(f"  Am iPhone:  http://{_lan_adresse()}:{PORT}   (selbes WLAN)")
    print(f"  KI: {'bereit' if ki.verfuegbar() else 'aus - API-Schlüssel fehlt in .env'}")
    print("Beenden mit Strg+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
