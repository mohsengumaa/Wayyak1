from __future__ import annotations

import io

from django.http import FileResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from core.pdf_theme import draw_card, draw_header, draw_section_title, set_font, theme_for
from core.pdf_settings import draw_watermark, effective_logo_path, load_pdf_config
from core.pdf_arabic import pdf_text

from .voucher_pdf import _first_reservation, _guests_for_voucher_pdf

_GUEST_SALUTATION_LABEL = {
    "ar": {"mr": "السيد", "ms": "السيدة", "chd": "طفل", "inf": "رضيع"},
    "en": {"mr": "Mr", "ms": "Ms", "chd": "Child", "inf": "Infant"},
    "tr": {"mr": "Bay", "ms": "Bayan", "chd": "Cocuk", "inf": "Bebek"},
}

_GL_LANGS = {"ar", "en", "tr"}
_GL_TEXT = {
    "ar": {"voucher_no": "رقم القسيمة", "guests": "الضيوف", "title": "قائمة أسماء الضيوف"},
    "en": {"voucher_no": "Voucher No.", "guests": "Guests", "title": "Customer name list"},
    "tr": {"voucher_no": "Voucher No", "guests": "Misafirler", "title": "Müşteri isim listesi"},
}


def _lang(lang: str | None) -> str:
    s = (lang or "ar").strip().lower()
    return s if s in _GL_LANGS else "ar"


def _tx(lang: str, key: str) -> str:
    return _GL_TEXT.get(lang, _GL_TEXT["ar"]).get(key, key)


def _guest_display_line(g, lang: str) -> str:
    name = (getattr(g, "full_name", "") or "").strip()
    if not name:
        return "—"
    sal = (getattr(g, "salutation", "") or "").strip().lower()
    prefix = _GUEST_SALUTATION_LABEL.get(lang, _GUEST_SALUTATION_LABEL["ar"]).get(sal, "")
    base = f"{prefix} {name}".strip() if prefix else name
    if sal == "chd":
        age = getattr(g, "child_age", None)
        if age is not None and int(age) >= 0:
            age_label = "عمر" if lang == "ar" else "Yas" if lang == "tr" else "Age"
            return f"{base} — {age_label} {int(age)}"
    return base


def render_guest_list_pdf(*, voucher, inline: bool = False, lang: str | None = None) -> FileResponse:
    buff = io.BytesIO()
    pdf = canvas.Canvas(buff, pagesize=A4)
    page_w, page_h = A4
    lang = _lang(lang)
    rtl = lang == "ar"

    theme, cfg = theme_for("voucher_guests")
    logo_path = effective_logo_path(cfg)
    try:
        draw_watermark(pdf, cfg, page_w=page_w, page_h=page_h, logo_path=logo_path)
    except Exception:
        pass

    meta_left = [
        (_tx(lang, "voucher_no"), str(getattr(voucher, "voucher_nr", "—"))),
    ]
    res_header = _first_reservation(voucher)
    guest_rows = _guests_for_voucher_pdf(voucher, res_header)
    meta_right = [(_tx(lang, "guests"), str(len(guest_rows)))]
    y = draw_header(
        pdf,
        doc_key="voucher_guests",
        title_en=_tx(lang, "title"),
        title_ar=_tx(lang, "title"),
        meta_left=meta_left,
        meta_right=meta_right,
        page_w=page_w,
        page_h=page_h,
        rtl=rtl,
    )

    pad = theme.page_padding
    card_h = page_h - (theme.page_padding * 2) - 4.0 * 28.35 / 10
    draw_card(pdf, x=pad, y=pad + 1.2 * 28.35 / 10, w=page_w - 2 * pad, h=card_h, doc_key="voucher_guests")
    draw_section_title(
        pdf,
        doc_key="voucher_guests",
        title=_tx(lang, "title"),
        x=(page_w - pad - 12) if rtl else (pad + 12),
        y=y - 18,
        rtl=rtl,
    )

    guests = guest_rows
    set_font(pdf, 10)
    pdf.setFillColor(theme.text)
    tx = pad + 16
    ty = y - 44
    line_h = 16
    for i, g in enumerate(guests, start=1):
        name = _guest_display_line(g, lang)
        if rtl:
            pdf.drawRightString(page_w - pad - 16, ty, pdf_text(f"{i:02d}. {name}"))
        else:
            pdf.drawString(tx, ty, pdf_text(f"{i:02d}. {name}"))
        ty -= line_h
        if ty < pad + 2.2 * 28.35 / 10:
            pdf.showPage()
            ty = page_h - pad - 1.4 * 28.35 / 10
            draw_card(pdf, x=pad, y=pad + 1.2 * 28.35 / 10, w=page_w - 2 * pad, h=card_h, doc_key="voucher_guests")

    pdf.showPage()
    pdf.save()
    buff.seek(0)
    filename = f"guests_{getattr(voucher, 'voucher_nr', 'voucher')}.pdf"
    resp = FileResponse(
        buff,
        as_attachment=not inline,
        filename=filename,
        content_type="application/pdf",
    )
    resp["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp["Pragma"] = "no-cache"
    resp["Expires"] = "0"
    return resp

