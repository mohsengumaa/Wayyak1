import datetime
import io
from xml.sax.saxutils import escape as xml_escape
from decimal import Decimal

from django.db.models import Sum
from django.http import FileResponse
from django.utils.text import slugify
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from core.pdf_arabic import pdf_text, register_arabic_font
from core.models import Reminder
from core.mixins import ImportExportModelViewSetMixin
from .invoice_pdf import render_invoice_pdf
from .report_pdf import (
    render_aging_pdf,
    render_general_ledger_pdf,
    render_trial_balance_pdf,
    render_vat_summary_pdf,
)
from .models import (
    AccountEntry,
    AccountingPeriod,
    Branch,
    ChartAccount,
    CostCenter,
    Invoice,
    InvoiceLine,
    JournalEntry,
    JournalLine,
    LedgerEntry,
    Payment,
    PaymentAllocation,
    TaxCode,
)
from .statement_service import statement_from_request_params
from .serializers import (
    AccountEntrySerializer,
    AccountingPeriodSerializer,
    BranchSerializer,
    ChartAccountSerializer,
    CostCenterSerializer,
    InvoiceLineSerializer,
    InvoiceSerializer,
    JournalEntrySerializer,
    JournalLineSerializer,
    LedgerEntrySerializer,
    PaymentAllocationSerializer,
    PaymentSerializer,
    TaxCodeSerializer,
)


class LedgerEntryViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = LedgerEntry.objects.all()
    serializer_class = LedgerEntrySerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "date", "description", "debit", "credit", "reference_type"]


class AccountEntryViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = AccountEntry.objects.all()
    serializer_class = AccountEntrySerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "entry_type", "amount", "due_date", "status", "reference_type"]


class InvoiceViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("client")
    serializer_class = InvoiceSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "number", "client", "issue_date", "due_date", "total_amount", "status"]

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        invoice = (
            Invoice.objects.select_related("client", "supplier", "hotel")
            .prefetch_related("lines")
            .get(id=invoice.id)
        )
        return render_invoice_pdf(invoice=invoice, lang=request.query_params.get("lang") or "ar")

    def _parse_date_range(self, request):
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        if not start_raw or not end_raw:
            return None, Response({"detail": "start and end required (YYYY-MM-DD)."}, status=400)
        try:
            start = datetime.datetime.strptime(start_raw, "%Y-%m-%d").date()
            end = datetime.datetime.strptime(end_raw, "%Y-%m-%d").date()
        except ValueError:
            return None, Response({"detail": "Invalid start or end date (YYYY-MM-DD)."}, status=400)
        if start > end:
            return None, Response({"detail": "start must be on or before end."}, status=400)
        return (start, end), None

    @action(detail=False, methods=["get"], url_path="statement")
    def statement(self, request):
        payload = statement_from_request_params(request)
        if isinstance(payload, dict) and payload.get("error"):
            return Response(
                {"detail": payload.get("detail", "Invalid statement request.")},
                status=400,
            )
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="aging")
    def aging(self, request):
        doc_type = request.query_params.get("doc_type") or "ar_invoice"
        as_of_raw = request.query_params.get("as_of")
        as_of = timezone.now().date()
        if as_of_raw:
            try:
                as_of = datetime.datetime.strptime(as_of_raw, "%Y-%m-%d").date()
            except ValueError:
                return Response({"detail": "Invalid as_of (YYYY-MM-DD)."}, status=400)

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

        return Response({"as_of": str(as_of), "summary": summary})

    @action(detail=False, methods=["get"], url_path="vat_summary")
    def vat_summary(self, request):
        rng, err = self._parse_date_range(request)
        if err:
            return err
        start, end = rng
        doc_type = request.query_params.get("doc_type") or None
        inv_qs = Invoice.objects.filter(issue_date__gte=start, issue_date__lte=end)
        if doc_type:
            inv_qs = inv_qs.filter(doc_type=doc_type)
        line_qs = InvoiceLine.objects.filter(invoice__in=inv_qs).select_related("tax_code")
        by_tax_code = {}
        for row in (
            line_qs.values("tax_code__code", "tax_code__rate", "tax_code__is_inclusive")
            .annotate(tax=Sum("tax_amount"), net=Sum("line_total"))
            .order_by("tax_code__code")
        ):
            code = row["tax_code__code"] or "NO_TAX"
            by_tax_code[code] = {
                "rate": float(row["tax_code__rate"] or 0),
                "is_inclusive": bool(row["tax_code__is_inclusive"]),
                "net_total": float(row["net"] or 0),
                "tax_total": float(row["tax"] or 0),
            }
        totals = line_qs.aggregate(net=Sum("line_total"), tax=Sum("tax_amount"))
        return Response(
            {
                "start": str(start),
                "end": str(end),
                "doc_type": doc_type,
                "totals": {
                    "net_total": float(totals.get("net") or 0),
                    "tax_total": float(totals.get("tax") or 0),
                },
                "by_tax_code": by_tax_code,
            }
        )

    @action(detail=False, methods=["get"], url_path="vat-summary/pdf")
    def vat_summary_pdf(self, request):
        return render_vat_summary_pdf(request)

    @action(detail=False, methods=["get"], url_path="aging/pdf")
    def aging_pdf(self, request):
        return render_aging_pdf(request)

    @action(detail=False, methods=["post"], url_path="table-export/pdf")
    def table_export_pdf(self, request):
        payload = request.data or {}
        title = str(payload.get("title") or "Accounting Table")
        headers = payload.get("headers") if isinstance(payload.get("headers"), list) else []
        rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []

        arabic_font = register_arabic_font()
        safe_headers = [pdf_text(str(h)[:120]) for h in headers[:24]]
        max_cols = len(safe_headers) if safe_headers else 12
        safe_rows = []
        for row in rows[:2000]:
            if not isinstance(row, list):
                continue
            cells = [pdf_text(str(cell)[:250]) for cell in row[:max_cols]]
            if len(cells) < max_cols:
                cells.extend([""] * (max_cols - len(cells)))
            safe_rows.append(cells)

        table_data = [safe_headers] if safe_headers else []
        table_data.extend(safe_rows)
        if not table_data:
            table_data = [["No data"]]

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=22,
            rightMargin=22,
            topMargin=22,
            bottomMargin=22,
        )
        styles = getSampleStyleSheet()
        title_style = styles["Heading2"].clone("heading2_ar")
        title_style.fontName = arabic_font
        story = [Paragraph(pdf_text(title), title_style), Spacer(1, 10)]

        page_w, _ = landscape(A4)
        available_width = page_w - doc.leftMargin - doc.rightMargin
        cols = max(len(table_data[0]), 1)
        col_widths = [available_width / cols] * cols

        cell_style = ParagraphStyle(
            "accounting_table_cell_ar",
            fontName=arabic_font,
            fontSize=7.2,
            leading=9.0,
            alignment=2,  # RIGHT
            wordWrap="RTL",
        )
        header_style = ParagraphStyle(
            "accounting_table_header_ar",
            parent=cell_style,
            fontSize=7.5,
            leading=9.5,
        )

        formatted_rows = []
        for row_idx, row in enumerate(table_data):
            style = header_style if safe_headers and row_idx == 0 else cell_style
            formatted_rows.append(
                [
                    Paragraph(xml_escape(str(cell or "")).replace("\n", "<br/>"), style)
                    for cell in row
                ]
            )

        table = Table(formatted_rows, colWidths=col_widths, repeatRows=1 if safe_headers else 0)
        table_style = [
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        if safe_headers:
            table_style.extend(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ]
            )
        table.setStyle(TableStyle(table_style))
        story.append(table)

        doc.build(story)
        buffer.seek(0)

        file_stub = slugify(str(payload.get("filename") or title)) or "accounting-table"
        return FileResponse(buffer, as_attachment=True, filename=f"{file_stub}.pdf")

    @action(detail=False, methods=["post"], url_path="sync-hotel-payment-reminders")
    def sync_hotel_payment_reminders(self, request):
        """
        Keep hotel AP bill due reminders in sync for current user:
        - create/reactivate reminders for near-due unpaid hotel AP bills
        - mark reminders done when bill is fully paid or no longer near due
        """
        raw_horizon = (request.data or {}).get("horizon_days") if hasattr(request, "data") else None
        try:
            horizon_days = int(raw_horizon) if raw_horizon is not None else 3
        except (TypeError, ValueError):
            horizon_days = 3
        horizon_days = max(0, min(horizon_days, 30))

        user = request.user
        today = timezone.now().date()
        horizon_date = today + datetime.timedelta(days=horizon_days)
        reminder_key = {
            "owner": user,
            "reminder_type": "payment_hotel",
            "module": "accounting",
            "related_model": "accounting.invoice",
        }

        active_invoice_ids: set[int] = set()
        created_count = 0
        reopened_count = 0

        invoices = (
            Invoice.objects.filter(
                doc_type="ap_bill",
                business_sector="hotels",
                due_date__isnull=False,
                due_date__lte=horizon_date,
            )
            .exclude(status="paid")
            .select_related("hotel")
            .prefetch_related("allocations")
            .order_by("due_date")
        )

        for inv in invoices:
            allocated = inv.allocations.aggregate(s=Sum("amount")).get("s") or Decimal("0")
            outstanding = max(Decimal(inv.total_amount) - Decimal(allocated), Decimal("0"))
            if outstanding <= Decimal("0.01"):
                continue
            active_invoice_ids.add(inv.id)
            reminder, created = Reminder.objects.get_or_create(
                **reminder_key,
                related_object_id=inv.id,
                defaults={
                    "created_by": user,
                    "title": f"استحقاق فاتورة فندق قريب: {inv.number}",
                    "description": f"الفندق: {inv.hotel.name if inv.hotel else 'غير محدد'} · المتبقي: {outstanding} {inv.currency}",
                    "target_date": inv.due_date,
                    "remind_days_before": min(horizon_days, 7),
                    "priority": "high" if (inv.due_date - today).days <= 1 else "medium",
                    "status": "pending",
                    "is_read": False,
                },
            )
            if created:
                created_count += 1
                continue
            should_reopen = reminder.status != "pending"
            reminder.title = f"استحقاق فاتورة فندق قريب: {inv.number}"
            reminder.description = f"الفندق: {inv.hotel.name if inv.hotel else 'غير محدد'} · المتبقي: {outstanding} {inv.currency}"
            reminder.target_date = inv.due_date
            reminder.remind_days_before = min(horizon_days, 7)
            reminder.priority = "high" if (inv.due_date - today).days <= 1 else "medium"
            reminder.status = "pending"
            reminder.is_read = False
            reminder.save()
            if should_reopen:
                reopened_count += 1

        resolved_count = 0
        pending_rows = Reminder.objects.filter(**reminder_key, status="pending")
        for row in pending_rows:
            if row.related_object_id in active_invoice_ids:
                continue
            row.status = "done"
            row.is_read = True
            row.save(update_fields=["status", "is_read", "updated_at"])
            resolved_count += 1

        return Response(
            {
                "created": created_count,
                "reopened": reopened_count,
                "resolved": resolved_count,
                "active_invoice_count": len(active_invoice_ids),
                "horizon_days": horizon_days,
            }
        )


class InvoiceLineViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = InvoiceLine.objects.select_related("invoice", "tax_code")
    serializer_class = InvoiceLineSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "invoice", "description", "quantity", "unit_price", "line_total", "tax_amount"]


class PaymentViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Payment.objects.select_related("client", "supplier", "hotel").prefetch_related("allocations")
    serializer_class = PaymentSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "direction", "payment_date", "currency", "amount", "status", "reference"]


class PaymentAllocationViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = PaymentAllocation.objects.select_related("payment", "invoice")
    serializer_class = PaymentAllocationSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "payment", "invoice", "amount"]


class BranchViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "code", "name", "is_active"]


class CostCenterViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "code", "name", "is_active"]


class ChartAccountViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = ChartAccount.objects.select_related("parent")
    serializer_class = ChartAccountSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "code", "name", "account_type", "parent", "is_active"]


class AccountingPeriodViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = AccountingPeriod.objects.all()
    serializer_class = AccountingPeriodSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "name", "start_date", "end_date", "status"]


class TaxCodeViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = TaxCode.objects.all()
    serializer_class = TaxCodeSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "code", "name", "rate", "is_inclusive", "is_active"]


class JournalEntryViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.select_related("period", "branch").prefetch_related("lines")
    serializer_class = JournalEntrySerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "entry_date", "period", "description", "status", "branch"]

    def _parse_date_range(self, request):
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        if not start_raw or not end_raw:
            return None, Response({"detail": "start and end required (YYYY-MM-DD)."}, status=400)
        try:
            start = datetime.datetime.strptime(start_raw, "%Y-%m-%d").date()
            end = datetime.datetime.strptime(end_raw, "%Y-%m-%d").date()
        except ValueError:
            return None, Response({"detail": "Invalid start or end date (YYYY-MM-DD)."}, status=400)
        if start > end:
            return None, Response({"detail": "start must be on or before end."}, status=400)
        return (start, end), None

    @action(detail=False, methods=["get"], url_path="trial_balance")
    def trial_balance(self, request):
        rng, err = self._parse_date_range(request)
        if err:
            return err
        start, end = rng
        qs = JournalLine.objects.filter(entry__entry_date__gte=start, entry__entry_date__lte=end)
        rows = []
        for row in (
            qs.values("account__code", "account__name", "account__account_type")
            .annotate(debit=Sum("debit"), credit=Sum("credit"))
            .order_by("account__code")
        ):
            debit = float(row["debit"] or 0)
            credit = float(row["credit"] or 0)
            rows.append(
                {
                    "account_code": row["account__code"] or "",
                    "account_name": row["account__name"] or "",
                    "account_type": row["account__account_type"] or "",
                    "debit": debit,
                    "credit": credit,
                    "balance": debit - credit,
                }
            )
        totals = qs.aggregate(debit=Sum("debit"), credit=Sum("credit"))
        td = float(totals.get("debit") or 0)
        tc = float(totals.get("credit") or 0)
        return Response(
            {
                "start": str(start),
                "end": str(end),
                "rows": rows,
                "totals": {"debit": td, "credit": tc},
            }
        )

    @action(detail=False, methods=["get"], url_path="general_ledger")
    def general_ledger(self, request):
        rng, err = self._parse_date_range(request)
        if err:
            return err
        start, end = rng
        account_id = request.query_params.get("account")
        qs = (
            JournalLine.objects.filter(entry__entry_date__gte=start, entry__entry_date__lte=end)
            .select_related("entry", "account")
            .order_by("entry__entry_date", "id")
        )
        if account_id and str(account_id).isdigit():
            qs = qs.filter(account_id=int(account_id))
        rows_out = []
        for line in qs:
            entry = line.entry
            rows_out.append(
                {
                    "entry_id": entry.id,
                    "entry_date": str(entry.entry_date),
                    "description": (line.description or entry.description or ""),
                    "account_code": line.account.code,
                    "account_name": line.account.name,
                    "debit": float(line.debit),
                    "credit": float(line.credit),
                    "currency": line.currency or "",
                    "reference_type": entry.reference_type or "",
                    "reference_id": entry.reference_id,
                }
            )
        return Response(
            {
                "start": str(start),
                "end": str(end),
                "count": len(rows_out),
                "rows": rows_out,
            }
        )

    @action(detail=False, methods=["get"], url_path="trial-balance/pdf")
    def trial_balance_pdf(self, request):
        return render_trial_balance_pdf(request)

    @action(detail=False, methods=["get"], url_path="general-ledger/pdf")
    def general_ledger_pdf(self, request):
        return render_general_ledger_pdf(request)


class JournalLineViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = JournalLine.objects.select_related("entry", "account", "client", "cost_center", "tax_code")
    serializer_class = JournalLineSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "entry", "account", "description", "debit", "credit", "currency"]
