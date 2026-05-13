"""PDF exports for financial reports (trial balance, VAT, GL, aging)."""
from __future__ import annotations

import datetime
import io
from typing import Any

from django.db.models import Sum
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.pdf_arabic import pdf_rows, pdf_text, register_arabic_font
from core.pdf_settings import effective_logo_path, load_pdf_config
from core.pdf_theme import draw_header

from .models import Invoice, InvoiceLine, JournalLine


def _parse_range(request) -> tuple[datetime.date, datetime.date] | None:
    start_raw = request.query_params.get("start")
    end_raw = request.query_params.get("end")
    if not start_raw or not end_raw:
        return None
    try:
        start = datetime.datetime.strptime(start_raw, "%Y-%m-%d").date()
        end = datetime.datetime.strptime(end_raw, "%Y-%m-%d").date()
    except ValueError:
        return None
    if start > end:
        return None
    return start, end


def _pdf_response(filename: str, buffer: io.BytesIO) -> HttpResponse:
    buffer.seek(0)
    resp = HttpResponse(buffer.read(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


def render_trial_balance_pdf(request) -> HttpResponse:
    rng = _parse_range(request)
    if rng is None:
        return HttpResponse("start and end required (YYYY-MM-DD).", status=400, content_type="text/plain")
    start, end = rng

    qs = JournalLine.objects.filter(entry__entry_date__gte=start, entry__entry_date__lte=end).select_related("account")
    rows_data: list[list[Any]] = []
    for row in (
        qs.values("account__code", "account__name", "account__account_type")
        .annotate(debit=Sum("debit"), credit=Sum("credit"))
        .order_by("account__code")
    ):
        debit = float(row["debit"] or 0)
        credit = float(row["credit"] or 0)
        rows_data.append(
            [
                row["account__code"],
                row["account__name"],
                row["account__account_type"] or "—",
                f"{debit:.2f}",
                f"{credit:.2f}",
                f"{debit - credit:.2f}",
            ]
        )

    totals = qs.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    td = float(totals.get("debit") or 0)
    tc = float(totals.get("credit") or 0)
    rows_data.append(["", "", "إجمالي / Total", f"{td:.2f}", f"{tc:.2f}", f"{td - tc:.2f}"])

    font_name = register_arabic_font()
    buf = io.BytesIO()
    cfg = load_pdf_config("trial_balance")
    logo_path = effective_logo_path(cfg)
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=165, bottomMargin=36)
    def _on_page(c, doc_obj):
        from core.pdf_settings import draw_watermark
        draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
        draw_header(
            c,
            doc_key="trial_balance",
            title_en="Trial Balance",
            title_ar="ميزان المراجعة",
            meta_left=[("Range", f"{start} → {end}")],
            meta_right=[("Issued", datetime.date.today().isoformat())],
            page_w=doc_obj.pagesize[0],
            page_h=doc_obj.pagesize[1],
        )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.fontName = font_name
    normal = styles["BodyText"]
    normal.fontName = font_name
    elements = [Spacer(1, 6)]
    head = [["الرمز", "الحساب", "النوع", "مدين", "دائن", "الرصيد"]]
    t = Table(pdf_rows(head + rows_data), colWidths=[70, 200, 70, 90, 90, 90])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4e4e7")),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#fafafa")]),
            ]
        )
    )
    elements.append(t)
    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    return _pdf_response(f"trial-balance_{start}_{end}.pdf", buf)


def render_vat_summary_pdf(request) -> HttpResponse:
    rng = _parse_range(request)
    if rng is None:
        return HttpResponse("start and end required (YYYY-MM-DD).", status=400, content_type="text/plain")
    start, end = rng
    doc_type = request.query_params.get("doc_type")

    inv_qs = Invoice.objects.filter(issue_date__gte=start, issue_date__lte=end)
    if doc_type:
        inv_qs = inv_qs.filter(doc_type=doc_type)

    line_qs = InvoiceLine.objects.filter(invoice__in=inv_qs).select_related("tax_code")
    by_rows: list[list[Any]] = []
    for row in (
        line_qs.values("tax_code__code", "tax_code__rate", "tax_code__is_inclusive")
        .annotate(tax=Sum("tax_amount"), net=Sum("line_total"))
        .order_by("tax_code__code")
    ):
        code = row["tax_code__code"] or "NO_TAX"
        by_rows.append(
            [
                code,
                f"{float(row['tax_code__rate'] or 0):.2f}",
                "شامل" if row["tax_code__is_inclusive"] else "غير شامل",
                f"{float(row['net'] or 0):.2f}",
                f"{float(row['tax'] or 0):.2f}",
            ]
        )
    totals = line_qs.aggregate(net=Sum("line_total"), tax=Sum("tax_amount"))

    cfg = load_pdf_config("vat_summary")
    logo_path = effective_logo_path(cfg)
    font_name = register_arabic_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=165, bottomMargin=36)
    def _on_page(c, doc_obj):
        from core.pdf_settings import draw_watermark
        draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
        draw_header(
            c,
            doc_key="vat_summary",
            title_en="VAT Summary",
            title_ar="ملخص الضريبة",
            meta_left=[("Range", f"{start} → {end}"), ("Doc type", dt_label)],
            meta_right=[("Issued", datetime.date.today().isoformat())],
            page_w=doc_obj.pagesize[0],
            page_h=doc_obj.pagesize[1],
        )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.fontName = font_name
    normal = styles["BodyText"]
    normal.fontName = font_name
    dt_label = doc_type or "الكل"
    elements = [Spacer(1, 6)]
    head = [["كود الضريبة", "النسبة", "شمول", "صافي", "ضريبة"]]
    if not by_rows:
        by_rows = [["—", "—", "—", "0.00", "0.00"]]
    by_rows.append(
        [
            "إجمالي",
            "",
            "",
            f"{float(totals.get('net') or 0):.2f}",
            f"{float(totals.get('tax') or 0):.2f}",
        ]
    )
    t = Table(pdf_rows(head + by_rows), colWidths=[80, 60, 70, 100, 100])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4e4e7")),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    elements.append(t)
    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    return _pdf_response(f"vat-summary_{start}_{end}.pdf", buf)


def render_general_ledger_pdf(request) -> HttpResponse:
    rng = _parse_range(request)
    if rng is None:
        return HttpResponse("start and end required (YYYY-MM-DD).", status=400, content_type="text/plain")
    start, end = rng
    account_id = request.query_params.get("account")

    qs = JournalLine.objects.filter(entry__entry_date__gte=start, entry__entry_date__lte=end).select_related("entry", "account").order_by("entry__entry_date", "id")
    if account_id:
        qs = qs.filter(account_id=account_id)

    cfg = load_pdf_config("general_ledger")
    logo_path = effective_logo_path(cfg)
    font_name = register_arabic_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=20, leftMargin=20, topMargin=165, bottomMargin=36)
    def _on_page(c, doc_obj):
        from core.pdf_settings import draw_watermark
        draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
        draw_header(
            c,
            doc_key="general_ledger",
            title_en="General Ledger",
            title_ar="دفتر الأستاذ العام",
            meta_left=[("Range", f"{start} → {end}"), ("Account", str(account_id or "All"))],
            meta_right=[("Issued", datetime.date.today().isoformat())],
            page_w=doc_obj.pagesize[0],
            page_h=doc_obj.pagesize[1],
        )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.fontName = font_name
    normal = styles["BodyText"]
    normal.fontName = font_name
    elements = [Spacer(1, 6)]
    head = [["التاريخ", "الحساب", "الرمز", "بيان", "مدين", "دائن", "ع"]]
    lines = list(qs[:8000])
    rows_gl: list[list[Any]] = []
    for l in lines:
        rows_gl.append(
            [
                str(l.entry.entry_date),
                (l.account.name or "")[:40],
                l.account.code,
                (l.description or l.entry.description or "")[:50],
                f"{float(l.debit):.2f}",
                f"{float(l.credit):.2f}",
                l.currency or "",
            ]
        )
    if not rows_gl:
        rows_gl = [["—", "—", "—", "لا قيود", "0", "0", ""]]
    t = Table(pdf_rows(head + rows_gl), colWidths=[72, 130, 52, 180, 72, 72, 36])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4e4e7")),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.grey),
            ]
        )
    )
    elements.append(t)
    if len(lines) >= 8000:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(pdf_text("… مقطوع عند 8000 سطر — عند الحاجة صفِّ الحساب في التقرير"), normal))
    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    return _pdf_response(f"general-ledger_{start}_{end}.pdf", buf)


def render_aging_pdf(request) -> HttpResponse:
    import datetime
    from django.db.models import Sum
    from django.utils import timezone

    doc_type = request.query_params.get("doc_type") or "ar_invoice"
    as_of_raw = request.query_params.get("as_of")
    as_of = timezone.now().date()
    if as_of_raw:
        try:
            as_of = datetime.datetime.strptime(as_of_raw, "%Y-%m-%d").date()
        except ValueError:
            return HttpResponse("Invalid as_of (YYYY-MM-DD).", status=400, content_type="text/plain")

    qs = Invoice.objects.filter(doc_type=doc_type).exclude(status__in=["paid"])
    party_client = request.query_params.get("client")
    party_hotel = request.query_params.get("hotel")
    if party_client and str(party_client).isdigit():
        qs = qs.filter(client_id=int(party_client))
    if party_hotel and str(party_hotel).isdigit():
        qs = qs.filter(hotel_id=int(party_hotel))

    summary = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "91_plus": 0.0}
    for inv in qs:
        allocated = inv.allocations.aggregate(s=Sum("amount")).get("s") or 0
        outstanding = max(float(inv.total_amount) - float(allocated), 0)
        due = inv.due_date or inv.issue_date
        days = (as_of - due).days
        bucket = "current"
        if days > 0 and days <= 30:
            bucket = "1_30"
        elif 30 < days <= 60:
            bucket = "31_60"
        elif 60 < days <= 90:
            bucket = "61_90"
        elif days > 90:
            bucket = "91_plus"
        summary[bucket] = summary.get(bucket, 0) + outstanding

    cfg = load_pdf_config("aging")
    logo_path = effective_logo_path(cfg)
    font_name = register_arabic_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=165, bottomMargin=36)
    def _on_page(c, doc_obj):
        from core.pdf_settings import draw_watermark
        draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
        draw_header(
            c,
            doc_key="aging",
            title_en="Aging",
            title_ar="أعمار الذمم",
            meta_left=[("As of", str(as_of)), ("Type", kind)],
            meta_right=[("Issued", datetime.date.today().isoformat())],
            page_w=doc_obj.pagesize[0],
            page_h=doc_obj.pagesize[1],
        )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.fontName = font_name
    normal = styles["BodyText"]
    normal.fontName = font_name
    kind = "ذمم عملاء AR" if doc_type == "ar_invoice" else "ذمم موردين AP"
    elements = [Spacer(1, 6)]
    labels = [
        ("current", "حالي"),
        ("1_30", "1–30 يوم"),
        ("31_60", "31–60"),
        ("61_90", "61–90"),
        ("91_plus", "+90 يوم"),
    ]
    rows_a = [[la, f"{summary[k]:.2f}"] for k, la in labels]
    t = Table(pdf_rows([["الفترة", "المبلغ"]] + rows_a), colWidths=[200, 120])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4e4e7")),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    elements.append(t)
    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    return _pdf_response(f"aging-{doc_type}-{as_of}.pdf", buf)
