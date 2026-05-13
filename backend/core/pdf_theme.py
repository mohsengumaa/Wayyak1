from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from core.pdf_arabic import pdf_text, register_arabic_font
from core.pdf_settings import effective_logo_path, load_pdf_config


@dataclass(frozen=True)
class PdfTheme:
    page_padding: float = 1.2 * cm
    card_radius: float = 10
    border: colors.Color = colors.HexColor("#E5E7EB")
    muted: colors.Color = colors.HexColor("#6B7280")
    text: colors.Color = colors.HexColor("#111827")
    header_bg: colors.Color = colors.white
    card_bg: colors.Color = colors.white
    accent: colors.Color = colors.HexColor("#2563EB")


def theme_for(doc_key: str) -> tuple[PdfTheme, dict]:
    cfg = load_pdf_config(doc_key)
    return PdfTheme(), cfg


def _safe_draw_image(pdf: Canvas, path: str | None, *, x: float, y: float, w: float, h: float) -> None:
    if not path:
        return
    try:
        pdf.drawImage(ImageReader(path), x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
    except Exception:
        return


def set_font(pdf: Canvas, size: int, *, bold: bool = False) -> str:
    base = register_arabic_font()
    # ReportLab doesn't have bold for custom fonts unless registered; keep simple.
    pdf.setFont(base, size)
    return base


def draw_header(
    pdf: Canvas,
    *,
    doc_key: str,
    title_en: str,
    title_ar: str,
    meta_left: Iterable[tuple[str, str]],
    meta_right: Iterable[tuple[str, str]],
    page_w: float,
    page_h: float,
    logo_subline: str | None = None,
    logo_subline_changed: bool = False,
    booking_type_above_company: str | None = None,
    changed_below_company: bool = False,
    changed_text: str = "CHANGED",
    rtl: bool = False,
) -> float:
    theme, cfg = theme_for(doc_key)
    pad = theme.page_padding
    top = page_h - pad
    # Taller header: centered logo -> company name under logo -> divider -> optional type/CHANGED -> meta cards
    header_h = 4.35 * cm

    # Logo (centered, higher)
    logo_path = effective_logo_path(cfg)
    logo_w = 3.2 * cm
    logo_h = 1.85 * cm
    logo_img_y = top - logo_h + 0.55 * cm
    _safe_draw_image(
        pdf,
        logo_path,
        x=(page_w - logo_w) / 2,
        y=logo_img_y,
        w=logo_w,
        h=logo_h,
    )

    # Title (top-right, like the reference)
    set_font(pdf, 14)
    pdf.setFillColor(theme.text)
    pdf.drawRightString(page_w - pad, top - 0.35 * cm, pdf_text(title_en))
    set_font(pdf, 9)
    pdf.setFillColor(theme.muted)
    pdf.drawRightString(page_w - pad, top - 0.9 * cm, pdf_text(title_ar))

    # Company name directly under the logo (centered), then optional legacy headline, then divider.
    company_name = str(cfg.get("company_name") or "MB GROUP TURIZM")
    company_baseline_y = logo_img_y - 0.34 * cm
    set_font(pdf, 12)
    pdf.setFillColor(theme.text)
    pdf.drawCentredString(page_w / 2, company_baseline_y, pdf_text(company_name))

    zone_below_company = company_baseline_y - 0.40 * cm
    line_y = zone_below_company - 0.28 * cm
    sub_draw = bool(logo_subline and str(logo_subline).strip())
    if sub_draw:
        line_y -= 0.55 * cm

    # Large headline between company row and divider (legacy callers only)
    if sub_draw:
        mid_y = (zone_below_company + line_y) / 2 + 0.06 * cm
        if logo_subline_changed:
            pdf.saveState()
            pdf.setFont("Helvetica-Bold", 28)
            pdf.setFillColor(theme.accent)
            pdf.drawCentredString(page_w / 2, mid_y, str(logo_subline).strip())
            pdf.restoreState()
        else:
            set_font(pdf, 22)
            pdf.setFillColor(theme.text)
            pdf.drawCentredString(page_w / 2, mid_y, pdf_text(str(logo_subline).strip()))

    pdf.saveState()
    pdf.setStrokeColor(theme.border)
    pdf.setLineWidth(0.8)
    pdf.line(pad, line_y, page_w - pad, line_y)
    pdf.restoreState()

    # Meta cards below company block (height computed after text stack)
    meta_right_list = list(meta_right)
    has_right = len(meta_right_list) > 0
    meta_left_list = list(meta_left)[:4]
    trimmed_right = meta_right_list[:4]
    if has_right:
        n_rows = max(len(meta_left_list), len(trimmed_right), 2)
    else:
        n_rows = max(len(meta_left_list), 2)
    is_voucher_header = str(doc_key).startswith("voucher_")
    meta_row_gap = (0.44 if is_voucher_header else 0.38) * cm
    card_h = max(1.55 * cm, 0.52 * cm + n_rows * meta_row_gap)

    # Below divider: booking type (optional) → CHANGED (optional); company stays under logo only.
    type_str = (str(booking_type_above_company).strip() if booking_type_above_company else "")
    if type_str or changed_below_company:
        cursor_y = line_y - 0.34 * cm
    else:
        cursor_y = line_y - 0.48 * cm
    if type_str:
        # Avoid duplicate headline: blue CHANGED badge replaces black NEW/CHANGED when amended.
        skip_type_line = changed_below_company and type_str.strip().casefold() in ("changed", "new")
        if not skip_type_line:
            set_font(pdf, 14)
            pdf.setFillColor(theme.text)
            pdf.drawCentredString(page_w / 2, cursor_y, pdf_text(type_str))
            cursor_y -= 0.52 * cm
    if changed_below_company:
        pdf.saveState()
        set_font(pdf, 17)
        pdf.setFillColor(theme.accent)
        changed_y = cursor_y - 0.33 * cm  # ~3.3 mm below type line (was 2 mm)
        pdf.drawCentredString(page_w / 2, changed_y, pdf_text(str(changed_text or "CHANGED")))
        pdf.restoreState()
        cursor_y = changed_y - 0.50 * cm
    gap_before_cards = 0.30 * cm
    y0 = cursor_y - gap_before_cards - card_h

    if has_right:
        card_w = (page_w - (pad * 2) - 0.8 * cm) / 2
        draw_card(pdf, x=pad, y=y0, w=card_w, h=card_h, doc_key=doc_key)
        draw_card(pdf, x=pad + card_w + 0.8 * cm, y=y0, w=card_w, h=card_h, doc_key=doc_key)
    else:
        card_w = page_w - (pad * 2)
        draw_card(pdf, x=pad, y=y0, w=card_w, h=card_h, doc_key=doc_key)

    def _draw_kv(items: Iterable[tuple[str, str]], *, x: float) -> None:
        tx = x + 0.35 * cm
        ty = y0 + card_h - (0.42 if is_voucher_header else 0.45) * cm
        key_right = x + card_w - 0.35 * cm
        value_right = key_right - 3.0 * cm
        for k, v in list(items)[:4]:
            set_font(pdf, 8)
            pdf.setFillColor(theme.muted)
            if rtl:
                pdf.drawRightString(key_right, ty, pdf_text(k))
            else:
                pdf.drawString(tx, ty, pdf_text(k))
            set_font(pdf, 9)
            pdf.setFillColor(theme.text)
            if rtl:
                pdf.drawRightString(value_right, ty, pdf_text(v))
            else:
                pdf.drawString(tx + 3.0 * cm, ty, pdf_text(v))
            ty -= meta_row_gap

    _draw_kv(meta_left_list, x=pad)
    if has_right:
        _draw_kv(trimmed_right, x=pad + card_w + 0.8 * cm)

    return y0 - 0.6 * cm


def draw_footer(pdf: Canvas, *, doc_key: str, page_w: float, page_h: float) -> float:
    """
    Bottom line + company info (centered). Returns the top y of the footer area
    (useful as a safe "do not draw below" boundary).
    """
    theme, cfg = theme_for(doc_key)
    pad = theme.page_padding
    bottom = pad

    # Divider line
    line_y = bottom + 1.05 * cm
    pdf.saveState()
    pdf.setStrokeColor(theme.border)
    pdf.setLineWidth(0.8)
    pdf.line(pad, line_y, page_w - pad, line_y)
    pdf.restoreState()

    # Footer info
    footer_center_1 = str(
        cfg.get("footer_center_1")
        or "FATIH AKSEMSETTIN BALIPASA CAD NO:67/1 KAT:4 D:4 TURKEY 34080 ISTANBUL"
    ).strip()
    footer_center_2 = str(
        cfg.get("footer_center_2")
        or "+90 212 586 72 60 - +90 536 586 72 60  |  https://www.mbtourism.net"
    ).strip()
    footer_center_3 = str(
        cfg.get("footer_center_3")
        or "reservation@mbtourism.net / muhasabe@mbtourism.net / mohamad@mbtourism.ne"
    ).strip()

    fy = line_y - 0.45 * cm
    set_font(pdf, 7)
    pdf.setFillColor(theme.muted)
    if footer_center_1:
        pdf.drawCentredString(page_w / 2, fy, pdf_text(footer_center_1))
        fy -= 0.32 * cm
    if footer_center_2:
        pdf.drawCentredString(page_w / 2, fy, pdf_text(footer_center_2))
        fy -= 0.32 * cm
    if footer_center_3:
        pdf.drawCentredString(page_w / 2, fy, pdf_text(footer_center_3))
        fy -= 0.32 * cm

    return line_y + 0.25 * cm


def draw_card(
    pdf: Canvas,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    doc_key: str,
    fill_color: colors.Color | None = None,
) -> None:
    theme, _cfg = theme_for(doc_key)
    pdf.saveState()
    pdf.setFillColor(fill_color if fill_color is not None else theme.card_bg)
    pdf.setStrokeColor(theme.border)
    pdf.roundRect(x, y, w, h, theme.card_radius, fill=1, stroke=1)
    pdf.restoreState()


def draw_section_title(pdf: Canvas, *, doc_key: str, title: str, x: float, y: float, rtl: bool = False) -> None:
    theme, _cfg = theme_for(doc_key)
    set_font(pdf, 10)
    pdf.setFillColor(theme.text)
    if rtl:
        pdf.drawRightString(x, y, pdf_text(title))
    else:
        pdf.drawString(x, y, pdf_text(title))


def draw_kv_grid(
    pdf: Canvas,
    *,
    doc_key: str,
    items: list[tuple[str, str]],
    x: float,
    y: float,
    w: float,
    row_h: float = 0.55 * cm,
    key_w: float = 3.2 * cm,
    rtl: bool = False,
) -> float:
    theme, _cfg = theme_for(doc_key)
    ty = y
    key_right = x + w
    value_right = x + w - key_w - 0.2 * cm
    for k, v in items:
        set_font(pdf, 8)
        pdf.setFillColor(theme.muted)
        if rtl:
            pdf.drawRightString(key_right, ty, pdf_text(k))
        else:
            pdf.drawString(x, ty, pdf_text(k))
        set_font(pdf, 9)
        pdf.setFillColor(theme.text)
        if rtl:
            pdf.drawRightString(value_right, ty, pdf_text(v))
        else:
            pdf.drawString(x + key_w, ty, pdf_text(v))
        ty -= row_h
    return ty


def draw_kv_grid_with_snapshots(
    pdf: Canvas,
    *,
    doc_key: str,
    items: list[tuple[str, str, str | None]],
    x: float,
    y: float,
    w: float,
    row_h: float = 0.55 * cm,
    key_w: float = 3.2 * cm,
    rtl: bool = False,
) -> float:
    """Like draw_kv_grid; optional third item is previous value (small «كان / Was» under current)."""
    theme, _cfg = theme_for(doc_key)
    ty = y
    hint_dy = 0.36 * cm
    key_right = x + w
    value_right = x + w - key_w - 0.2 * cm
    for k, v, old in items:
        set_font(pdf, 8)
        pdf.setFillColor(theme.muted)
        if rtl:
            pdf.drawRightString(key_right, ty, pdf_text(k))
        else:
            pdf.drawString(x, ty, pdf_text(k))
        set_font(pdf, 9)
        pdf.setFillColor(theme.text)
        if rtl:
            pdf.drawRightString(value_right, ty, pdf_text(v))
        else:
            pdf.drawString(x + key_w, ty, pdf_text(v))
        if old and str(old).strip() and str(old).strip() != str(v).strip():
            set_font(pdf, 7)
            pdf.setFillColor(theme.muted)
            old_text = pdf_text(f"كان / Was: {old}")
            if rtl:
                pdf.drawRightString(value_right, ty - hint_dy, old_text)
            else:
                pdf.drawString(x + key_w, ty - hint_dy, old_text)
            ty -= row_h + 0.28 * cm
        else:
            ty -= row_h
    return ty


def draw_body_card(pdf: Canvas, *, doc_key: str, page_w: float, page_h: float, x: float, y: float, w: float, h: float) -> None:
    """
    Draw a big rounded card behind the main content area (tables).
    Use inside Platypus onFirstPage/onLaterPages to get the same "cards" look.
    """
    draw_card(pdf, x=x, y=y, w=w, h=h, doc_key=doc_key)


def draw_body_card_for_platypus(pdf: Canvas, *, doc_key: str, doc_obj) -> None:
    # doc_obj is a SimpleDocTemplate instance in callbacks
    page_w, page_h = doc_obj.pagesize
    x = float(getattr(doc_obj, "leftMargin", 0) or 0)
    y = float(getattr(doc_obj, "bottomMargin", 0) or 0)
    w = float(page_w - (getattr(doc_obj, "leftMargin", 0) or 0) - (getattr(doc_obj, "rightMargin", 0) or 0))
    h = float(page_h - (getattr(doc_obj, "topMargin", 0) or 0) - (getattr(doc_obj, "bottomMargin", 0) or 0))
    # Keep a little breathing room.
    pad = 8
    draw_body_card(pdf, doc_key=doc_key, page_w=page_w, page_h=page_h, x=x, y=y, w=max(0, w), h=max(0, h))

