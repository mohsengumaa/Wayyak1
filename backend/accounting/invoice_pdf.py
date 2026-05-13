from __future__ import annotations

import io

from django.http import FileResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from core.pdf_settings import draw_watermark, effective_logo_path, load_pdf_config
from core.pdf_theme import draw_card, draw_footer, draw_header, draw_kv_grid, draw_section_title, theme_for

_INV_LANGS = {"ar", "en", "tr"}
_INV_TEXT = {
    "ar": {
        "invoice_no": "رقم الفاتورة",
        "issue_date": "تاريخ الإصدار",
        "due_date": "تاريخ الاستحقاق",
        "bill_to": "العميل",
        "status": "الحالة",
        "currency": "العملة",
        "invoice": "فاتورة",
        "payment_details": "تفاصيل الدفع",
        "method": "الطريقة",
        "type": "النوع",
        "name": "الاسم",
        "phone": "الهاتف",
        "email": "البريد الإلكتروني",
        "lines": "البنود",
        "notes": "ملاحظات",
        "extras_fees": "إضافات ورسوم",
        "fx_rate": "سعر الصرف",
        "sector": "القطاع",
        "details": "التفاصيل",
        "summary": "الملخص",
        "total": "الإجمالي",
        "issue": "الإصدار",
        "due": "الاستحقاق",
    },
    "en": {
        "invoice_no": "Invoice No.",
        "issue_date": "Issue date",
        "due_date": "Due date",
        "bill_to": "Bill To",
        "status": "Status",
        "currency": "Currency",
        "invoice": "Invoice",
        "payment_details": "Payment details",
        "method": "Method",
        "type": "Type",
        "name": "Name",
        "phone": "Phone",
        "email": "Email",
        "lines": "Lines",
        "notes": "Notes",
        "extras_fees": "Extras & fees",
        "fx_rate": "FX Rate",
        "sector": "Sector",
        "details": "Details",
        "summary": "Summary",
        "total": "Total",
        "issue": "Issue",
        "due": "Due",
    },
    "tr": {
        "invoice_no": "Fatura No",
        "issue_date": "Duzenleme tarihi",
        "due_date": "Vade tarihi",
        "bill_to": "Alici",
        "status": "Durum",
        "currency": "Para birimi",
        "invoice": "Fatura",
        "payment_details": "Odeme detaylari",
        "method": "Yontem",
        "type": "Tur",
        "name": "Ad",
        "phone": "Telefon",
        "email": "E-posta",
        "lines": "Kalemler",
        "notes": "Notlar",
        "extras_fees": "Ekstra ve ucretler",
        "fx_rate": "Kur",
        "sector": "Sektor",
        "details": "Detaylar",
        "summary": "Ozet",
        "total": "Toplam",
        "issue": "Duzenleme",
        "due": "Vade",
    },
}


def _inv_lang(lang: str | None) -> str:
    s = (lang or "ar").strip().lower()
    return s if s in _INV_LANGS else "ar"


def _tx(lang: str, key: str) -> str:
    return _INV_TEXT.get(lang, _INV_TEXT["ar"]).get(key, key)


def render_invoice_pdf(*, invoice, inline: bool = False, lang: str | None = None) -> FileResponse:
    buff = io.BytesIO()
    pdf = canvas.Canvas(buff, pagesize=A4)
    page_w, page_h = A4
    lang = _inv_lang(lang)
    rtl = lang == "ar"

    theme, cfg = theme_for("invoice")
    logo_path = effective_logo_path(cfg)
    try:
        draw_watermark(pdf, cfg, page_w=page_w, page_h=page_h, logo_path=logo_path)
    except Exception:
        pass

    meta_left = [
        (_tx(lang, "invoice_no"), getattr(invoice, "number", "—")),
        (_tx(lang, "issue_date"), str(getattr(invoice, "issue_date", "") or "")[:10] or "—"),
        (_tx(lang, "due_date"), str(getattr(invoice, "due_date", "") or "")[:10] if getattr(invoice, "due_date", None) else "—"),
    ]
    bill_to = (
        getattr(getattr(invoice, "client", None), "name", None)
        or getattr(getattr(invoice, "supplier", None), "name", None)
        or getattr(getattr(invoice, "hotel", None), "name", None)
        or "—"
    )
    meta_right = [
        (_tx(lang, "bill_to"), bill_to),
        (_tx(lang, "status"), getattr(invoice, "status", "—")),
        (_tx(lang, "currency"), getattr(invoice, "currency", "—")),
    ]
    y = draw_header(
        pdf,
        doc_key="invoice",
        title_en=_tx(lang, "invoice"),
        title_ar=_tx(lang, "invoice"),
        meta_left=meta_left,
        meta_right=meta_right,
        page_w=page_w,
        page_h=page_h,
        rtl=rtl,
    )

    pad = theme.page_padding
    footer_top = draw_footer(pdf, doc_key="invoice", page_w=page_w, page_h=page_h)
    gap = 0.55 * cm
    full_w = page_w - 2 * pad
    col_w = (full_w - gap) / 2
    left_x = pad
    right_x = pad + col_w + gap

    # Row 1: Payment details / Bill to (same as voucher style)
    row1_h = 2.6 * cm
    draw_card(pdf, x=left_x, y=y - row1_h, w=col_w, h=row1_h, doc_key="invoice")
    draw_card(pdf, x=right_x, y=y - row1_h, w=col_w, h=row1_h, doc_key="invoice")
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "payment_details"),
        x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "bill_to"),
        x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_kv_grid(
        pdf,
        doc_key="invoice",
        items=[(_tx(lang, "method"), "—"), (_tx(lang, "type"), getattr(invoice, "doc_type", "—")), (_tx(lang, "status"), getattr(invoice, "status", "—"))],
        x=left_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.48 * cm,
        key_w=2.4 * cm,
        rtl=rtl,
    )
    draw_kv_grid(
        pdf,
        doc_key="invoice",
        items=[(_tx(lang, "name"), bill_to), (_tx(lang, "phone"), "—"), (_tx(lang, "email"), "—")],
        x=right_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.48 * cm,
        key_w=2.4 * cm,
        rtl=rtl,
    )

    y = y - row1_h - gap

    # Row 2: Lines (full width)
    row2_h = 6.0 * cm
    draw_card(pdf, x=pad, y=y - row2_h, w=full_w, h=row2_h, doc_key="invoice")
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=f"01 - {_tx(lang, 'lines')}",
        x=(pad + full_w - 0.45 * cm) if rtl else (pad + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )

    lines = list(getattr(invoice, "lines", []).all()) if hasattr(invoice, "lines") else []
    rows = []
    for i, ln in enumerate(lines[:10], start=1):
        rows.append((f"{i:02d}. {getattr(ln, 'description', '') or '—'}", f"{float(getattr(ln, 'line_total', 0) or 0):.2f}"))
    if not rows:
        rows = [("—", f"{float(getattr(invoice, 'total_amount', 0) or 0):.2f}")]

    draw_kv_grid(pdf, doc_key="invoice", items=rows, x=pad + 0.55 * cm, y=y - 1.25 * cm, w=full_w - 1.1 * cm, row_h=0.60 * cm, key_w=12.0 * cm, rtl=rtl)

    y = y - row2_h - gap

    # Row 3: Notes / Extras
    row3_h = 3.1 * cm
    draw_card(pdf, x=left_x, y=y - row3_h, w=col_w, h=row3_h, doc_key="invoice")
    draw_card(pdf, x=right_x, y=y - row3_h, w=col_w, h=row3_h, doc_key="invoice")
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "notes"),
        x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "extras_fees"),
        x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    note = (getattr(invoice, "notes", "") or "").strip() or "—"
    pdf.setFillColor(theme.muted)
    pdf.setFont(pdf._fontname, 8)
    if rtl:
        pdf.drawRightString(left_x + col_w - 0.55 * cm, y - 1.25 * cm, note[:160])
    else:
        pdf.drawString(left_x + 0.55 * cm, y - 1.25 * cm, note[:160])
    draw_kv_grid(
        pdf,
        doc_key="invoice",
        items=[(_tx(lang, "fx_rate"), str(getattr(invoice, "fx_rate", "—"))), (_tx(lang, "sector"), getattr(invoice, "business_sector", "—") or "—")],
        x=right_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.45 * cm,
        key_w=3.2 * cm,
        rtl=rtl,
    )

    y = y - row3_h - gap

    # Row 4: Details / Summary
    row4_h = 4.2 * cm
    draw_card(pdf, x=left_x, y=y - row4_h, w=col_w, h=row4_h, doc_key="invoice")
    draw_card(pdf, x=right_x, y=y - row4_h, w=col_w, h=row4_h, doc_key="invoice")
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "details"),
        x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_section_title(
        pdf,
        doc_key="invoice",
        title=_tx(lang, "summary"),
        x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_kv_grid(
        pdf,
        doc_key="invoice",
        items=[(_tx(lang, "invoice"), getattr(invoice, "number", "—")), (_tx(lang, "issue"), str(getattr(invoice, "issue_date", "") or "")[:10] or "—"), (_tx(lang, "due"), str(getattr(invoice, "due_date", "") or "")[:10] if getattr(invoice, "due_date", None) else "—")],
        x=left_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.56 * cm,
        key_w=2.4 * cm,
        rtl=rtl,
    )
    total_amount = float(getattr(invoice, "total_amount", 0) or 0)
    cur = getattr(invoice, "currency", "") or ""
    draw_kv_grid(
        pdf,
        doc_key="invoice",
        items=[(_tx(lang, "total"), f"{total_amount:.2f} {cur}"), (_tx(lang, "status"), getattr(invoice, "status", "—")), (_tx(lang, "type"), getattr(invoice, "doc_type", "—"))],
        x=right_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.56 * cm,
        key_w=2.4 * cm,
        rtl=rtl,
    )

    # Payment info box (Settings -> PDF) is rendered only on customer voucher PDF, not on invoices.

    # Keep last row above footer if sizes change
    content_bottom = (y - row4_h)
    min_bottom = footer_top + 0.25 * cm
    if content_bottom < min_bottom:
        delta = min_bottom - content_bottom
        y_adj = y + delta
        draw_card(pdf, x=left_x, y=y_adj - row4_h, w=col_w, h=row4_h, doc_key="invoice")
        draw_card(pdf, x=right_x, y=y_adj - row4_h, w=col_w, h=row4_h, doc_key="invoice")
        draw_section_title(
            pdf,
            doc_key="invoice",
            title=_tx(lang, "details"),
            x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
            y=y_adj - 0.55 * cm,
            rtl=rtl,
        )
        draw_section_title(
            pdf,
            doc_key="invoice",
            title=_tx(lang, "summary"),
            x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
            y=y_adj - 0.55 * cm,
            rtl=rtl,
        )
        draw_kv_grid(
            pdf,
            doc_key="invoice",
            items=[(_tx(lang, "invoice"), getattr(invoice, "number", "—")), (_tx(lang, "issue"), str(getattr(invoice, "issue_date", "") or "")[:10] or "—"), (_tx(lang, "due"), str(getattr(invoice, "due_date", "") or "")[:10] if getattr(invoice, "due_date", None) else "—")],
            x=left_x + 0.55 * cm,
            y=y_adj - 1.25 * cm,
            w=col_w - 1.1 * cm,
            row_h=0.56 * cm,
            key_w=2.4 * cm,
            rtl=rtl,
        )
        draw_kv_grid(
            pdf,
            doc_key="invoice",
            items=[(_tx(lang, "total"), f"{total_amount:.2f} {cur}"), (_tx(lang, "status"), getattr(invoice, "status", "—")), (_tx(lang, "type"), getattr(invoice, "doc_type", "—"))],
            x=right_x + 0.55 * cm,
            y=y_adj - 1.25 * cm,
            w=col_w - 1.1 * cm,
            row_h=0.56 * cm,
            key_w=2.4 * cm,
            rtl=rtl,
        )

    pdf.showPage()
    pdf.save()
    buff.seek(0)
    filename = f"invoice-{getattr(invoice, 'number', 'invoice')}.pdf"
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

