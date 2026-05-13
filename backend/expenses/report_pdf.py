"""PDF export: سجل المصاريف / expenses register."""
from __future__ import annotations

import datetime
import io

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.pdf_arabic import pdf_rows, pdf_text, register_arabic_font
from core.pdf_settings import effective_logo_path, load_pdf_config
from reportlab.lib.utils import ImageReader
from core.pdf_theme import draw_body_card_for_platypus, draw_header

from .models import Expense

_MAX_ROWS = 5000


def _parse_range(request) -> tuple[datetime.date | None, datetime.date | None]:
    start_raw = request.query_params.get("start")
    end_raw = request.query_params.get("end")
    if not start_raw and not end_raw:
        return None, None
    if not start_raw or not end_raw:
        return None, None
    try:
        start = datetime.datetime.strptime(start_raw, "%Y-%m-%d").date()
        end = datetime.datetime.strptime(end_raw, "%Y-%m-%d").date()
    except ValueError:
        return None, None
    if start > end:
        return None, None
    return start, end


def _pdf_response(filename: str, buffer: io.BytesIO) -> HttpResponse:
    buffer.seek(0)
    resp = HttpResponse(buffer.read(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


def render_expenses_register_pdf(request) -> HttpResponse:
    font_name = register_arabic_font()
    cfg = load_pdf_config("expenses_register")
    logo_path = effective_logo_path(cfg)
    start, end = _parse_range(request)
    qs = Expense.objects.select_related(
        "category", "account", "branch", "cost_center", "linked_invoice"
    ).order_by("-date", "-id")
    range_note = ""
    if start is not None and end is not None:
        qs = qs.filter(date__range=(start, end))
        range_note = f"{start} — {end}"
    else:
        range_note = "جميع التواريخ"

    total = qs.count()
    truncated = total > _MAX_ROWS
    rows_qs = list(qs[:_MAX_ROWS])

    styles = getSampleStyleSheet()
    title = styles["Title"]
    normal = styles["Normal"]
    title.fontName = font_name
    normal.fontName = font_name

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        rightMargin=28,
        leftMargin=28,
        topMargin=165,
        bottomMargin=36,
    )
    def _on_page(c, doc_obj):
        # watermark + unified header
        from core.pdf_settings import draw_watermark
        draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
        draw_header(
            c,
            doc_key="expenses_register",
            title_en="Expense register",
            title_ar="سجل المصاريف",
            meta_left=[("Range", range_note), ("Rows", str(total))],
            meta_right=[("Issued", datetime.date.today().isoformat())],
            page_w=doc_obj.pagesize[0],
            page_h=doc_obj.pagesize[1],
        )
        draw_body_card_for_platypus(c, doc_key="expenses_register", doc_obj=doc_obj)

    elements: list = []
    if truncated:
        elements.append(Paragraph(pdf_text(f"يُظهر أول {_MAX_ROWS} سطراً فقط."), normal))
        elements.append(Spacer(1, 8))

    head = [
        [
            "#",
            "التاريخ",
            "النوع",
            "الفئة",
            "المورد / الجهة",
            "المرجع",
            "المبلغ",
            "الضريبة",
            "المدفوع",
            "الحالة",
        ]
    ]
    table_rows = []
    for e in rows_qs:
        cat = getattr(e.category, "label", "") if e.category_id else ""
        table_rows.append(
            [
                str(e.id),
                e.date.isoformat() if e.date else "",
                e.get_expense_type_display(),
                cat,
                (e.vendor_name or e.company_name or "")[:40],
                (e.reference_no or "")[:24],
                f"{e.amount:.2f}",
                f"{e.tax_amount:.2f}",
                f"{e.paid_amount:.2f}",
                e.get_payment_status_display(),
            ]
        )
    data = pdf_rows(head + table_rows)
    col_widths = [36, 68, 72, 100, 130, 72, 52, 52, 58, 58]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ]
        )
    )
    elements.append(t)

    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    safe_range = f"{start}_{end}" if start and end else "all"
    return _pdf_response(f"expenses-register-{safe_range}.pdf", buf)
