"""Claude erkennt Essen in Freitext und auf Fotos.

Arbeitsteilung: Claude sagt nur, WAS gegessen wurde und WIE VIEL Gramm,
und nennt den passenden Namen aus der deutschen Liste. Die Naehrwerte setzt
der Browser ein (kiZuKandidaten in web/app.js) - damit eine Banane heute
dieselben Kalorien hat wie morgen. Nur was in der Liste fehlt, behaelt
Claudes Schaetzung und wird in der App als "geschätzt" markiert.
"""

import base64
import json
import os
from pathlib import Path

import anthropic

DATEN = Path(__file__).resolve().parent / "web" / "daten"
USDA = json.loads((DATEN / "usda.json").read_text(encoding="utf-8"))
DEUTSCH = json.loads((DATEN / "lebensmittel.json").read_text(encoding="utf-8"))

MODELL = "claude-opus-5"

# Text zerlegen ist leicht, Portionen auf einem Foto schaetzen nicht -
# deshalb dort mehr Nachdenken, auch wenn es ein paar Sekunden kostet.
AUFWAND_TEXT = "low"
AUFWAND_FOTO = "medium"


class KIFehler(Exception):
    """Fehler mit einer Meldung, die man dem Nutzer zeigen kann."""


def verfuegbar() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _tabellenzeile(d: dict) -> str:
    portionen = USDA[d["fdc"]]["portionen"][:4]
    teile = "; ".join(f"{e} = {g:g} g" for e, g in portionen)
    return f"- {d['name']}" + (f"  ({teile})" if teile else "")


SYSTEM = f"""Du bist die Erkennung in einer Kalorien-Tracker-App. Du bekommst eine
Beschreibung oder ein Foto von Essen und zerlegst es in einzelne Lebensmittel.

Für jedes Lebensmittel:
- name: kurzer deutscher Name.
- tabelle: der exakte Name aus der Liste unten, wenn er passt - achte auf roh
  vs. gegart (gekochte Nudeln sind nicht "Nudeln roh"). Passt nichts, "".
- menge: die Menge in Worten, z. B. "2 mittelgroße" oder "1 Teller".
- gramm: Gesamtgewicht des essbaren Anteils (ohne Schale, Knochen, Kerne).
  Nutze die Portionsgrößen aus der Liste, wo es sie gibt.
- schaetzung_pro100: deine Nährwerte je 100 g. Immer ausfüllen - sie werden
  nur benutzt, wenn tabelle leer ist.
- sicherheit: "hoch", wenn Menge und Lebensmittel klar sind; "mittel" bei
  geschätzter Menge; "niedrig", wenn du raten musst.
- hinweis: kurz, was der Nutzer prüfen sollte - oder "".

Bei Fotos: Schätze die Menge über Tellergröße, Besteck und Hände im Bild.
Ist etwas sichtbar gebraten, frittiert oder in Soße, führe Öl oder Soße als
eigenes Lebensmittel auf - versteckte Fette sind der größte Fehler beim
Kalorienzählen. Erkennst du kein Essen, gib eine leere Liste zurück und
schreib in rueckfrage, was du siehst.

rueckfrage: eine kurze Frage an den Nutzer, wenn etwas Wichtiges unklar ist
(z. B. "Waren die Nudeln mit Soße?"), sonst "".

Liste (Nährwerte aus der USDA-Datenbank, Portionen in Gramm):
{chr(10).join(_tabellenzeile(d) for d in DEUTSCH)}
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "lebensmittel": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "tabelle": {"type": "string",
                                "enum": [""] + [d["name"] for d in DEUTSCH]},
                    "menge": {"type": "string"},
                    "gramm": {"type": "number"},
                    "schaetzung_pro100": {
                        "type": "object",
                        "properties": {k: {"type": "number"}
                                       for k in ("kcal", "protein", "fett", "kh")},
                        "required": ["kcal", "protein", "fett", "kh"],
                        "additionalProperties": False,
                    },
                    "sicherheit": {"type": "string",
                                   "enum": ["hoch", "mittel", "niedrig"]},
                    "hinweis": {"type": "string"},
                },
                "required": ["name", "tabelle", "menge", "gramm",
                             "schaetzung_pro100", "sicherheit", "hinweis"],
                "additionalProperties": False,
            },
        },
        "rueckfrage": {"type": "string"},
    },
    "required": ["lebensmittel", "rueckfrage"],
    "additionalProperties": False,
}

_client = None


def _frage(inhalt: list, aufwand: str) -> dict:
    global _client
    if not verfuegbar():
        raise KIFehler("Kein API-Schlüssel eingerichtet (.env).")
    if _client is None:
        _client = anthropic.Anthropic()

    try:
        antwort = _client.beta.messages.create(
            model=MODELL,
            max_tokens=16000,
            # fallbacks: lehnt ein Sicherheitsfilter eine harmlose Anfrage
            # irrtuemlich ab, versucht es die API selbst mit einem anderen
            # Modell, statt der App einen Fehler zu liefern.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": aufwand,
                           "format": {"type": "json_schema", "schema": SCHEMA}},
            system=[{"type": "text", "text": SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": inhalt}],
        )
    except anthropic.AuthenticationError:
        raise KIFehler("API-Schlüssel ungültig - in .env prüfen.")
    except anthropic.PermissionDeniedError:
        raise KIFehler("Der API-Schlüssel darf dieses Modell nicht nutzen.")
    except anthropic.RateLimitError:
        raise KIFehler("Zu viele Anfragen oder kein Guthaben - kurz warten bzw. aufladen.")
    except anthropic.BadRequestError as e:
        if "credit" in str(e).lower():
            raise KIFehler("Kein API-Guthaben mehr - in der Anthropic-Konsole aufladen.")
        raise KIFehler(f"Anfrage abgelehnt: {e.message}")
    except anthropic.APIStatusError as e:
        raise KIFehler(f"Claude ist gerade nicht erreichbar ({e.status_code}).")
    except anthropic.APIConnectionError:
        raise KIFehler("Keine Verbindung zu Claude - Internet prüfen.")

    if antwort.stop_reason == "refusal":
        raise KIFehler("Claude hat die Anfrage abgelehnt.")
    if antwort.stop_reason == "max_tokens":
        raise KIFehler("Antwort zu lang - bitte weniger auf einmal eintragen.")
    text = next(b.text for b in antwort.content if b.type == "text")
    return json.loads(text)


def verstehe_text(text: str) -> dict:
    """ "2 mittelgroße Bananen und ein Kaffee" -> Lebensmittel mit Gramm."""
    return _frage([{"type": "text", "text": text}], AUFWAND_TEXT)


def erkenne_foto(bild: bytes, mime: str, hinweis: str = "") -> dict:
    """Foto vom Teller -> Lebensmittel mit Gramm. hinweis z. B. "ohne Soße"."""
    inhalt = [
        {"type": "image", "source": {"type": "base64", "media_type": mime,
                                     "data": base64.standard_b64encode(bild).decode()}},
        {"type": "text", "text": hinweis or "Was ist auf dem Foto und wie viel?"},
    ]
    return _frage(inhalt, AUFWAND_FOTO)
