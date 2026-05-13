"""Arabic text for ReportLab: register a TTF font, reshape, and RTL display."""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ARABIC_FONT_NAME = "MBArabic"


def register_arabic_font() -> str:
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/tahoma.ttf"),
        Path(settings.BASE_DIR).parent / "assets" / "arial.ttf",
        Path(settings.BASE_DIR).parent / "assets" / "NotoNaskhArabic-Regular.ttf",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            if ARABIC_FONT_NAME not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(ARABIC_FONT_NAME, str(path)))
            return ARABIC_FONT_NAME
        except Exception:
            continue
    return "Helvetica"


def pdf_text(value) -> str:
    text = "" if value is None else str(value)
    if any("\u0600" <= c <= "\u06ff" for c in text):
        return get_display(arabic_reshaper.reshape(text))
    return text


def pdf_rows(rows):
    return [[pdf_text(cell) for cell in row] for row in rows]
